# S3 (sancionados): cobertura, instituciones y, solo fuera del repositorio, el registro normalizado.
# Seguridad: se descartan textos libres que pueden traer nombres de terceros (origenProcedimiento.valor,
# descripcionHechos, observaciones) y los domicilios. Nombres y RFC solo van a la base privada.
import json
import os
import sqlite3
import time
import zipfile
from collections import Counter
from dataclasses import dataclass, field

from .common import parse_date
from .entities import resolve_provider_state, resolve_state_value
from .json_stream import get_path, get_text
from .normalize import institution_name_key, text_key
from .tally import Tally

SERVANTS = 'S3S'
PRIVATE_PARTIES = 'S3P'

_KINDS = {
    'items_faltas_administrativas_no_graves': (SERVANTS, 'no_grave'),
    'items_faltas_administrativas_graves': (SERVANTS, 'grave'),
    'items_faltas_graves_personas_fisicas': (PRIVATE_PARTIES, 'persona_fisica'),
    'items_faltas_graves_personas_morales': (PRIVATE_PARTIES, 'persona_moral'),
}

# Claves cortas y largas mezcladas por los proveedores (inventario, sección 5).
_SANCTION_ALIASES = {
    'A': 'AMONESTACION',
    'AMONESTACION': 'AMONESTACION',
    'AMONESTACION PUBLICA': 'AMONESTACION',
    'AMONESTACION PRIVADA': 'AMONESTACION',
    'I': 'INHABILITACION',
    'INHABILITACION': 'INHABILITACION',
    'S': 'SUSPENSION',
    'SUSPENSION': 'SUSPENSION',
    'SUSPENSION EMPLEO': 'SUSPENSION',
    'SUSPENSION ACTIVIDADES': 'SUSPENSION_ACTIVIDADES',
    'D': 'DESTITUCION',
    'DESTITUCION': 'DESTITUCION',
    'DESTITUCION EMPLEO': 'DESTITUCION',
    'SE': 'SANCION_ECONOMICA',
    'SANCION ECONOMICA': 'SANCION_ECONOMICA',
    'IND': 'INDEMNIZACION',
    'INDEMNIZACION': 'INDEMNIZACION',
    'DS': 'DISOLUCION_SOCIEDAD',
    'DISOLUCION SOCIEDAD': 'DISOLUCION_SOCIEDAD',
    'O': 'OTRO',
    'OTRO': 'OTRO',
}

_SCHEMA = """
CREATE TABLE s3_servidores (
  id TEXT, entidad TEXT, proveedor TEXT, gravedad TEXT, expediente TEXT, fecha TEXT,
  nombres TEXT, primer_apellido TEXT, segundo_apellido TEXT, sexo TEXT,
  ente TEXT, ente_clave TEXT, siglas_ente TEXT, nivel_orden_gobierno TEXT, ambito_publico TEXT,
  puesto TEXT, area_adscripcion TEXT, faltas TEXT, sanciones TEXT, sanciones_detalle TEXT,
  fecha_resolucion TEXT, fecha_resolucion_firme TEXT, autoridad_resolutora TEXT, origen_clave TEXT
);
CREATE TABLE s3_particulares (
  id TEXT, entidad TEXT, proveedor TEXT, tipo_persona TEXT, expediente TEXT, fecha TEXT,
  nombre TEXT, rfc TEXT, ente TEXT, ente_clave TEXT, faltas TEXT, sanciones TEXT, sanciones_detalle TEXT,
  fecha_resolucion TEXT, fecha_resolucion_firme TEXT, autoridad_resolutora TEXT, origen_clave TEXT
);
CREATE TABLE metadatos (clave TEXT PRIMARY KEY, valor TEXT);
CREATE INDEX s3_servidores_ente ON s3_servidores (ente_clave);
CREATE INDEX s3_servidores_expediente ON s3_servidores (expediente);
CREATE INDEX s3_particulares_ente ON s3_particulares (ente_clave);
"""


@dataclass
class S3Result:
    # (sistema, entidad, nombre normalizado) -> escrituras
    institutions: dict[tuple[str, str, str], Counter[str]] = field(default_factory=dict)
    # (entidad, carpeta) -> (leídos, total declarado por meta.total_count)
    completeness: dict[tuple[str, str], tuple[int, int]] = field(default_factory=dict)
    records: int = 0
    json_errors: int = 0
    tally: Tally = field(default_factory=Tally)
    seconds: float = 0.0


def sanction_key(value: object) -> str:
    text = text_key(str(value or '').replace('_', ' '))
    return _SANCTION_ALIASES.get(text, text.replace(' ', '_'))


def _sanctions(record: object) -> tuple[list[str], list[dict[str, object]]]:
    keys: list[str] = []
    details: list[dict[str, object]] = []
    for item in get_path(record, 'tipoSancion') or []:
        if not isinstance(item, dict):
            continue
        key = sanction_key(item.get('clave'))
        keys.append(key)
        detail: dict[str, object] = {'clave': key}
        disqualification = item.get('inhabilitacion')
        if isinstance(disqualification, dict):
            for name in ('plazoAnios', 'plazoMeses', 'plazoDias'):
                if disqualification.get(name) is not None:
                    detail[name] = disqualification.get(name)
            for name in ('fechaInicial', 'fechaFinal'):
                if parse_date(disqualification.get(name)):
                    detail[name] = parse_date(disqualification.get(name))
        fine = item.get('sancionEconomica')
        if isinstance(fine, dict) and fine.get('monto') is not None:
            detail['monto'] = fine.get('monto')
            detail['moneda'] = get_text(fine, 'moneda', 'clave') or get_text(fine, 'moneda')
        details.append(detail)
    return keys, details


def _faults(record: object) -> list[str]:
    faults = []
    for item in get_path(record, 'faltaCometida') or []:
        if isinstance(item, dict):
            faults.append(text_key(str(item.get('clave') or item.get('valor') or '')).replace(' ', '_'))
    return faults


def process(zip_path: str, reference: str, private_dir: str | None) -> S3Result:
    """Recorre el ZIP de S3. Si hay carpeta privada, escribe s3.sqlite (se recrea en cada ejecución)."""
    started = time.monotonic()
    result = S3Result()
    database = None
    if private_dir:
        path = os.path.join(private_dir, 's3.sqlite')
        if os.path.exists(path):
            os.remove(path)
        database = sqlite3.connect(path)
        database.executescript(_SCHEMA)
    with zipfile.ZipFile(zip_path) as archive:
        members = sorted(
            info.filename
            for info in archive.infolist()
            if not info.is_dir() and info.filename.endswith('.json') and info.filename.count('/') >= 2
        )
        for member in members:
            provider, folder = member.split('/')[0], member.split('/')[1]
            state = resolve_provider_state(provider)
            kind = _KINDS.get(folder)
            if state is None or kind is None:
                result.json_errors += 1
                continue
            try:
                payload = json.loads(archive.read(member))
            except (ValueError, UnicodeDecodeError):
                result.json_errors += 1
                continue
            items = payload.get('data') if isinstance(payload, dict) else payload
            if not isinstance(items, list):
                result.json_errors += 1
                continue
            declared = get_path(payload, 'meta', 'total_count')
            read, total = result.completeness.get((state, folder), (0, 0))
            result.completeness[(state, folder)] = (
                read + len(items),
                max(total, declared if isinstance(declared, int) else 0),
            )
            for record in items:
                result.records += 1
                _handle_record(result, database, record, provider, state, kind, reference)
    if database is not None:
        database.executemany(
            'INSERT INTO metadatos VALUES (?, ?)',
            [('fuente', os.path.basename(zip_path)), ('fecha_referencia', reference)],
        )
        database.commit()
        database.close()
    result.seconds = round(time.monotonic() - started, 1)
    return result


def _handle_record(
    result: S3Result,
    database: sqlite3.Connection | None,
    record: object,
    provider: str,
    folder_state: str,
    kind: tuple[str, str],
    reference: str,
) -> None:
    system, subtype = kind
    where = ('empleoCargoComision',) if system == SERVANTS else ('dondeCometioLaFalta',)
    ente = get_text(record, *where, 'nombreEntePublico') or get_text(record, 'entePublico', 'nombre')
    # La carpeta define la entidad del proveedor; el campo entidadFederativa es heterogéneo.
    state = folder_state
    declared_state = resolve_state_value(get_text(record, *where, 'entidadFederativa'))
    if declared_state and declared_state != folder_state:
        result.tally.note(system, state, 'entidad_declarada_distinta')
    resolution = parse_date(get_path(record, 'resolucion', 'fechaResolucion'))
    date = resolution or parse_date(get_path(record, 'fecha'))
    result.tally.add(system, state, provider, date, reference)
    name_key = institution_name_key(ente, state) if ente else ''
    if ente:
        result.institutions.setdefault((system, state, name_key), Counter())[ente] += 1
    else:
        result.tally.note(system, state, 'sin_institucion')
    if database is None:
        return
    sanctions, details = _sanctions(record)
    common = (
        get_text(record, 'id'),
        state,
        provider,
        subtype,
        get_text(record, 'expediente'),
        parse_date(get_path(record, 'fecha')),
    )
    tail = (
        json.dumps(_faults(record), ensure_ascii=False),
        json.dumps(sanctions, ensure_ascii=False),
        json.dumps(details, ensure_ascii=False),
        resolution,
        parse_date(get_path(record, 'resolucion', 'fechaResolucionFirme')),
        get_text(record, 'resolucion', 'autoridadResolutora'),
        # Seguridad: solo la clave del origen; el valor puede traer nombres de personas.
        get_text(record, 'origenProcedimiento', 'clave'),
    )
    if system == SERVANTS:
        database.execute(
            'INSERT INTO s3_servidores VALUES (' + ','.join('?' * 24) + ')',
            (
                *common,
                get_text(record, 'datosGenerales', 'nombres'),
                get_text(record, 'datosGenerales', 'primerApellido'),
                get_text(record, 'datosGenerales', 'segundoApellido'),
                get_text(record, 'datosGenerales', 'sexo'),
                ente,
                f'{state}|{name_key}' if ente else '',
                get_text(record, 'empleoCargoComision', 'siglasEntePublico'),
                get_text(record, 'empleoCargoComision', 'nivelOrdenGobierno'),
                get_text(record, 'empleoCargoComision', 'ambitoPublico'),
                get_text(record, 'empleoCargoComision', 'denominacion'),
                get_text(record, 'empleoCargoComision', 'areaAdscripcion'),
                *tail,
            ),
        )
        return
    if subtype == 'persona_moral':
        name = get_text(record, 'datosGenerales', 'nombreRazonSocial')
        rfc = get_text(record, 'datosGenerales', 'rfc')
    else:
        name = ' '.join(
            part
            for part in (
                get_text(record, 'datosGenerales', 'nombres'),
                get_text(record, 'datosGenerales', 'primerApellido'),
                get_text(record, 'datosGenerales', 'segundoApellido'),
            )
            if part
        )
        rfc = ''
    database.execute(
        'INSERT INTO s3_particulares VALUES (' + ','.join('?' * 17) + ')',
        (*common, name, rfc, ente, f'{state}|{name_key}' if ente else '', *tail),
    )

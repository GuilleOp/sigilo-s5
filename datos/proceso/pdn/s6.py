# S6 (contrataciones abiertas, OCDS): cobertura por archivo y subconjunto APF con la última release por ocid.
# El subconjunto se guarda en SQLite: en la carpeta privada si se indica, o en un temporal que se borra.
# Seguridad: se descartan los puntos de contacto de parties (nombre, correo y teléfono de personas).
import json
import os
import sqlite3
import time
import zipfile
from dataclasses import dataclass, field

from .common import parse_date
from .entities import FEDERAL, resolve_provider_state
from .json_stream import get_path, get_text, iter_array
from .tally import Tally

SYSTEM = 'S6'
APF_MEMBER = 'apf_releases.json'
SUBSET_YEARS = ('2018', '2022')
# 144 864 releases de la APF traen el ocid sin prefijo ("-2559792"). Verificado en la descarga del
# 2026-11-05: 111 014 tienen un gemelo "ocds-07smqs-2559792" con el mismo comprador, fecha y método,
# así que se trata del mismo procedimiento y se canoniza antes de quedarse con la última release.
APF_OCID_PREFIX = 'ocds-07smqs'

_SCHEMA = """
CREATE TABLE releases (
  ocid TEXT PRIMARY KEY, fecha_release TEXT, fecha_inicio TEXT, anio_inicio TEXT,
  comprador_id TEXT, comprador TEXT, entidad_convocante TEXT,
  metodo TEXT, fundamento TEXT, estado TEXT, licitantes INTEGER,
  monto_licitacion REAL, monto_adjudicado_mxn REAL, adjudicaciones_otra_moneda INTEGER,
  adjudicaciones TEXT, proveedores TEXT, ocid_con_prefijo INTEGER, ocid_original TEXT
);
"""

_UPSERT = """
INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(ocid) DO UPDATE SET
  fecha_release=excluded.fecha_release, fecha_inicio=excluded.fecha_inicio,
  anio_inicio=excluded.anio_inicio, comprador_id=excluded.comprador_id, comprador=excluded.comprador,
  entidad_convocante=excluded.entidad_convocante, metodo=excluded.metodo,
  fundamento=excluded.fundamento, estado=excluded.estado, licitantes=excluded.licitantes,
  monto_licitacion=excluded.monto_licitacion, monto_adjudicado_mxn=excluded.monto_adjudicado_mxn,
  adjudicaciones_otra_moneda=excluded.adjudicaciones_otra_moneda,
  adjudicaciones=excluded.adjudicaciones, proveedores=excluded.proveedores,
  ocid_con_prefijo=excluded.ocid_con_prefijo, ocid_original=excluded.ocid_original
WHERE excluded.fecha_release >= releases.fecha_release
"""


@dataclass
class S6Result:
    member: str
    state: str
    releases: int = 0
    distinct_ocid: int = 0
    subset_rows: int = 0
    database: str | None = None
    tally: Tally = field(default_factory=Tally)
    seconds: float = 0.0


def _number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def canonical_ocid(ocid: str) -> str:
    return f'{APF_OCID_PREFIX}{ocid}' if ocid.startswith('-') else ocid


def release_row(release: dict[str, object]) -> tuple[object, ...]:
    """Fila compacta de una release OCDS de la APF, sin datos de contacto."""
    awards_out: list[dict[str, object]] = []
    awarded_mxn = 0.0
    other_currency = 0
    for award in release.get('awards') or []:
        if not isinstance(award, dict):
            continue
        amount = _number(get_path(award, 'value', 'amount'))
        currency = get_text(award, 'value', 'currency') or 'MXN'
        if amount is not None:
            if currency == 'MXN':
                awarded_mxn += amount
            else:
                other_currency += 1
        awards_out.append(
            {
                'id': get_text(award, 'id'),
                'estado': get_text(award, 'status'),
                'monto': amount,
                'moneda': currency,
                'proveedores': [
                    {'id': get_text(supplier, 'id'), 'nombre': get_text(supplier, 'name')}
                    for supplier in award.get('suppliers') or []
                    if isinstance(supplier, dict)
                ],
            }
        )
    suppliers = sorted(
        {
            (get_text(party, 'identifier', 'id'), get_text(party, 'name'))
            for party in release.get('parties') or []
            if isinstance(party, dict) and 'supplier' in (party.get('roles') or [])
        }
    )
    original = get_text(release, 'ocid')
    ocid = canonical_ocid(original)
    start = parse_date(get_path(release, 'tender', 'tenderPeriod', 'startDate'))
    tenderers = get_path(release, 'tender', 'numberOfTenderers')
    return (
        ocid,
        get_text(release, 'date'),
        start,
        start[:4] if start else None,
        get_text(release, 'buyer', 'id'),
        get_text(release, 'buyer', 'name'),
        get_text(release, 'tender', 'procuringEntity', 'name'),
        get_text(release, 'tender', 'procurementMethod') or None,
        get_text(release, 'tender', 'procurementMethodRationale') or None,
        get_text(release, 'tender', 'status') or None,
        tenderers if isinstance(tenderers, int) else None,
        _number(get_path(release, 'tender', 'value', 'amount')),
        awarded_mxn if awards_out else None,
        other_currency,
        json.dumps(awards_out, ensure_ascii=False),
        json.dumps([{'rfc': rfc, 'nombre': name} for rfc, name in suppliers], ensure_ascii=False),
        1 if original.startswith('ocds-') else 0,
        original,
    )


def process_member(zip_path: str, member: str, reference: str, database_path: str | None) -> S6Result:
    """Recorre un archivo de releases. Si es la APF y hay ruta de base, guarda el subconjunto."""
    started = time.monotonic()
    state = resolve_provider_state(member.replace('_releases.json', '')) or '??'
    if member == APF_MEMBER:
        state = FEDERAL
    result = S6Result(member=member, state=state)
    provider = member.replace('_releases.json', '')
    database = None
    if member == APF_MEMBER and database_path:
        if os.path.exists(database_path):
            os.remove(database_path)
        database = sqlite3.connect(database_path)
        database.executescript(_SCHEMA)
        result.database = database_path
    with zipfile.ZipFile(zip_path) as archive, archive.open(member) as handle:
        batch: list[tuple[object, ...]] = []
        for release in iter_array(handle):
            if not isinstance(release, dict):
                continue
            result.releases += 1
            start = parse_date(get_path(release, 'tender', 'tenderPeriod', 'startDate'))
            date = start or parse_date(get_path(release, 'date'))
            result.tally.add(SYSTEM, state, provider, date, reference)
            if database is not None:
                batch.append(release_row(release))
                if len(batch) >= 5000:
                    database.executemany(_UPSERT, batch)
                    batch.clear()
        if database is not None and batch:
            database.executemany(_UPSERT, batch)
    if database is not None:
        result.distinct_ocid = database.execute('SELECT COUNT(*) FROM releases').fetchone()[0]
        low, high = SUBSET_YEARS
        database.execute(
            'DELETE FROM releases WHERE anio_inicio IS NULL OR anio_inicio < ? OR anio_inicio > ?',
            (low, high),
        )
        database.execute('CREATE INDEX releases_comprador ON releases (comprador_id)')
        database.commit()
        result.subset_rows = database.execute('SELECT COUNT(*) FROM releases').fetchone()[0]
        database.execute('VACUUM')
        database.close()
    result.seconds = round(time.monotonic() - started, 1)
    return result


def list_members(zip_path: str) -> list[str]:
    with zipfile.ZipFile(zip_path) as archive:
        return sorted(info.filename for info in archive.infolist() if info.filename.endswith('.json'))

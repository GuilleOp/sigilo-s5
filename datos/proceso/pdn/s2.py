# S2 (servidores que intervienen en contrataciones): instituciones, puestos y roles en la contratación.
# Hay dos esquemas: SABG federal (snake_case, persona por ejercicio) y el estándar de los estados.
# Seguridad: no se leen nombres de personas ni del superior inmediato; solo institución, puesto y rol.
import json
import re
import time
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .common import parse_date
from .entities import resolve_provider_state
from .json_stream import get_path, get_text
from .normalize import area_key, institution_name_key, text_key
from .tally import Tally

SYSTEM = 'S2'
VALID_ROLES = ('R', 'T', 'C', 'RC', 'RE', 'O')
_ROLE_WORDS = {
    'REQUIRENTE': 'R',
    'REQUIRENTES': 'R',
    'TECNICA': 'T',
    'CONTRATANTE': 'C',
    'RESPONSABLE CONTRATACION': 'RC',
    'RESPONSABLE EJECUCION': 'RE',
    'OTRA': 'O',
    'OTRO': 'O',
}
_YEAR = re.compile(r'(?<!\d)(20\d{2})(?!\d)')


def normalize_roles(values: object) -> set[str]:
    """Interpreta tipoArea / tipo_area: claves sueltas, compuestas ("RE,RC"), con valor o con texto."""
    roles: set[str] = set()
    items = values if isinstance(values, list) else [values]
    for item in items:
        if isinstance(item, dict):
            raw = str(item.get('clave') or item.get('valor') or '')
        else:
            raw = '' if item is None else str(item)
        for piece in raw.split(','):
            token = text_key(piece.split(':')[0])
            if token in VALID_ROLES:
                roles.add(token)
            elif token in _ROLE_WORDS:
                roles.add(_ROLE_WORDS[token])
    return roles


@dataclass
class S2Institution:
    display: Counter[str] = field(default_factory=Counter)
    records: int = 0
    roles: set[str] = field(default_factory=set)
    # puesto o unidad normalizada -> roles (solo del ejercicio más reciente del proveedor).
    units: dict[str, set[str]] = field(default_factory=dict)


@dataclass
class S2Result:
    # (entidad, nombre normalizado) -> institución
    institutions: dict[tuple[str, str], S2Institution] = field(default_factory=dict)
    providers: dict[str, dict[str, object]] = field(default_factory=dict)
    json_errors: int = 0
    tally: Tally = field(default_factory=Tally)
    seconds: float = 0.0


def _fiscal_year(value: object, fallback: str | None) -> str | None:
    match = _YEAR.search(str(value or ''))
    if match:
        return match.group(1)
    return fallback[:4] if fallback else None


def _read_member(archive: zipfile.ZipFile, name: str) -> list[object] | None:
    try:
        data = json.loads(archive.read(name))
    except (ValueError, UnicodeDecodeError):
        return None
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get('results'), list):
        return data['results']
    return None


def process(zip_path: str, reference: str) -> S2Result:
    """Recorre el ZIP de S2 completo (19 MB) y acumula instituciones, unidades, roles y cobertura."""
    started = time.monotonic()
    result = S2Result()
    by_provider: dict[str, list[str]] = defaultdict(list)
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            parts = info.filename.split('/')
            if not info.is_dir() and len(parts) >= 3 and parts[-1].endswith('.json'):
                by_provider[parts[1]].append(info.filename)
        for provider in sorted(by_provider):
            state = resolve_provider_state(provider)
            if state is None:
                result.tally.note(SYSTEM, '??', 'proveedor_sin_entidad')
                continue
            rows: list[tuple[str, str | None, str | None, str, set[str]]] = []
            for member in sorted(by_provider[provider]):
                records = _read_member(archive, member)
                if records is None:
                    result.json_errors += 1
                    continue
                for record in records:
                    rows.append(_extract(record))
            latest_year = max((year for _, year, _, _, _ in rows if year), default=None)
            for institution, year, date, unit, roles in rows:
                result.tally.add(SYSTEM, state, provider, date, reference, period=year)
                if not institution:
                    result.tally.note(SYSTEM, state, 'sin_institucion')
                    continue
                key = (state, institution_name_key(institution, state))
                entry = result.institutions.setdefault(key, S2Institution())
                entry.display[institution] += 1
                entry.records += 1
                entry.roles.update(roles)
                if unit and (year == latest_year or latest_year is None):
                    entry.units.setdefault(unit, set()).update(roles)
            result.providers[provider] = {'entidad': state, 'registros': len(rows), 'ejercicio_reciente': latest_year}
    result.seconds = round(time.monotonic() - started, 1)
    return result


def _extract(record: object) -> tuple[str, str | None, str | None, str, set[str]]:
    """Devuelve (institución, ejercicio, fecha, unidad normalizada, roles) de cualquiera de los dos esquemas."""
    if isinstance(record, dict) and 'dependencia' in record:
        institution = get_text(record, 'dependencia', 'nombre')
        date = parse_date(get_text(record, 'periodo_ejercicio', 'fecha_inicial').replace('/', '-'))
        year = _fiscal_year(get_path(record, 'ejercicio_fiscal'), date)
        roles = normalize_roles(get_path(record, 'tipo_area'))
    else:
        institution = get_text(record, 'institucionDependencia', 'nombre')
        date = parse_date(get_text(record, 'fechaCaptura'))
        year = _fiscal_year(get_path(record, 'ejercicioFiscal'), date)
        roles = normalize_roles(get_path(record, 'tipoArea'))
    unit = area_key(get_text(record, 'puesto', 'nombre'))
    return institution, year, date, unit, roles

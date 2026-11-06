# S1 (declaraciones): una pasada en streaming por proveedor que cuenta personas distintas por ente y área.
# Seguridad: de datosGenerales solo se leen nombre y apellidos para un hash efímero con sal aleatoria
# por ejecución; nunca se extraen CURP, RFC, teléfono, correo ni estado civil, y ningún hash se guarda.
import hashlib
import json
import time
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .common import is_plausible, months_before, parse_date
from .entities import resolve_provider_state
from .json_stream import get_path, get_text
from .normalize import area_key, institution_name_key, person_name_key, text_key
from .tally import Tally

SYSTEM = 'S1'
WINDOW_MONTHS = 24
_JOB = ('declaracion', 'situacionPatrimonial', 'datosEmpleoCargoComision')
_GENERAL = ('declaracion', 'situacionPatrimonial', 'datosGenerales')


def government_level(value: str) -> str:
    """Código de orden de gobierno: F federal, E estatal, M municipal, O otro o desconocido."""
    text = text_key(value)
    if text.startswith('FEDERAL'):
        return 'F'
    if text.startswith('ESTATAL'):
        return 'E'
    if text.startswith('MUNICIPAL'):
        return 'M'
    return 'O'


@dataclass
class S1ProviderResult:
    """Agregados de un proveedor. No contiene nombres ni hashes de personas."""

    provider: str
    state: str
    declarations: int = 0
    json_errors: int = 0
    window_start: str | None = None
    window_end: str | None = None
    persons_total: int = 0
    persons_window: int = 0
    excluded_conclusion: int = 0
    without_name: int = 0
    # ente -> área -> personas distintas en la ventana (área '' = sin área).
    groups: dict[str, dict[str, int]] = field(default_factory=dict)
    ente_display: dict[str, str] = field(default_factory=dict)
    ente_level: dict[str, str] = field(default_factory=dict)
    ente_declarations: dict[str, int] = field(default_factory=dict)
    area_display: dict[tuple[str, str], str] = field(default_factory=dict)
    # Léxicos efímeros para detectar nombres propios en áreas; viven solo en memoria.
    given_names: Counter[str] = field(default_factory=Counter)
    surnames: Counter[str] = field(default_factory=Counter)
    tally: Tally = field(default_factory=Tally)
    seconds: float = 0.0


def _is_conclusion(kind: str) -> bool:
    return text_key(kind).startswith('CONCLUSION')


def process_provider(
    zip_path: str, provider: str, members: list[str], salt: bytes, reference: str
) -> S1ProviderResult:
    """Procesa todos los archivos de un proveedor de S1 y devuelve solo agregados."""
    started = time.monotonic()
    state = resolve_provider_state(provider)
    if state is None:
        raise ValueError(f'Proveedor de S1 sin entidad conocida: {provider}')
    result = S1ProviderResult(provider=provider, state=state)
    # hash efímero -> (fecha, no_es_conclusión, ente, área) de su declaración más reciente.
    latest: dict[bytes, tuple[str, int, str, str]] = {}
    ente_raw: dict[str, Counter[str]] = defaultdict(Counter)
    ente_levels: dict[str, Counter[str]] = defaultdict(Counter)
    area_raw: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    interned: dict[str, str] = {}
    max_date = ''
    with zipfile.ZipFile(zip_path) as archive:
        for member in sorted(members):
            try:
                records = json.loads(archive.read(member))
            except (ValueError, UnicodeDecodeError):
                result.json_errors += 1
                continue
            if not isinstance(records, list):
                result.json_errors += 1
                continue
            for record in records:
                result.declarations += 1
                date = parse_date(get_path(record, 'metadata', 'actualizacion'))
                result.tally.add(SYSTEM, state, provider, date, reference)
                raw_ente = get_text(record, *_JOB, 'nombreEntePublico')
                raw_area = get_text(record, *_JOB, 'areaAdscripcion')
                ente = interned.setdefault(key := institution_name_key(raw_ente, state), key)
                area = interned.setdefault(key := area_key(raw_area), key)
                if raw_ente:
                    ente_raw[ente][raw_ente] += 1
                    ente_levels[ente][government_level(get_text(record, *_JOB, 'nivelOrdenGobierno'))] += 1
                if raw_area:
                    area_raw[(ente, area)][raw_area] += 1
                given = get_text(record, *_GENERAL, 'nombre')
                first = get_text(record, *_GENERAL, 'primerApellido')
                second = get_text(record, *_GENERAL, 'segundoApellido')
                if not (given or first or second):
                    result.without_name += 1
                    continue
                result.given_names.update(text_key(given).split())
                result.surnames.update(text_key(f'{first} {second}').split())
                if not is_plausible(date, reference) or not ente:
                    continue
                assert date is not None
                max_date = max(max_date, date)
                person = hashlib.blake2b(
                    salt + person_name_key(given, first, second).encode(), digest_size=8
                ).digest()
                candidate = (date, 0 if _is_conclusion(get_text(record, 'metadata', 'tipo')) else 1, ente, area)
                current = latest.get(person)
                if current is None or candidate[:2] > current[:2]:
                    latest[person] = candidate
    result.persons_total = len(latest)
    if max_date:
        result.window_end = max_date
        result.window_start = months_before(max_date, WINDOW_MONTHS)
        groups: dict[str, Counter[str]] = defaultdict(Counter)
        for date, not_conclusion, ente, area in latest.values():
            if date <= result.window_start:
                continue
            if not not_conclusion:
                result.excluded_conclusion += 1
                continue
            groups[ente][area] += 1
            result.persons_window += 1
        result.groups = {ente: dict(areas) for ente, areas in groups.items()}
    latest.clear()
    for ente, spellings in ente_raw.items():
        result.ente_display[ente] = _most_common(spellings)
        result.ente_declarations[ente] = sum(spellings.values())
        result.ente_level[ente] = _most_common(ente_levels[ente])
    for ente, areas in result.groups.items():
        for area in areas:
            spellings = area_raw.get((ente, area))
            if spellings:
                result.area_display[(ente, area)] = _most_common(spellings)
    result.seconds = round(time.monotonic() - started, 1)
    return result


def _most_common(counter: Counter[str]) -> str:
    """La escritura más frecuente; en empate, la menor alfabéticamente (resultado determinista)."""
    return min(counter.items(), key=lambda item: (-item[1], item[0]))[0]


def list_providers(zip_path: str) -> dict[str, list[str]]:
    """Agrupa los archivos del ZIP de S1 por carpeta de proveedor (S1/<Proveedor>/data-*.json)."""
    providers: dict[str, list[str]] = defaultdict(list)
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            parts = info.filename.split('/')
            if info.is_dir() or len(parts) < 3 or not parts[-1].endswith('.json'):
                continue
            providers[parts[1]].append(info.filename)
    return dict(providers)

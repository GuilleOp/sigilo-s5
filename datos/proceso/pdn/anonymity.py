# Grupos de anonimato: personas distintas por (entidad, ente, área) con generalización jerárquica
# entidad -> ente -> área hasta k >= K. Publica cubetas, nunca conteos exactos, fragmentadas por entidad.
from collections import Counter
from dataclasses import dataclass, field

from .common import BUCKETS, K_ANONYMITY, bucket_index, published_percentage, rounded_count
from .entities import STATE_NAMES
from .normalize import NAME_ABBREVIATIONS, NameFilter, lexicon
from .s1 import S1ProviderResult

LEVEL_NAMES = {'F': 'federales', 'E': 'estatales', 'M': 'municipales', 'O': 'de otro orden o sin dato'}
PROTECTION_LEVELS = ('area', 'ente', 'grupo', 'entidad', 'insuficiente')
FRAGMENT_VERSION = 1
# Un token es nombre de pila o apellido si aparece al menos tantas veces en S1 (léxico efímero).
# Léxico estricto para el patrón nombre + apellido en cualquier posición; léxico amplio (casi todo
# nombre visto) para claves cortas que empiezan con un nombre de pila y no tienen palabra institucional.
# Preferimos suprimir de más (el área o el ente se generaliza) que publicar el nombre de una persona.
LEXICON_MIN_COUNT = 20
LEXICON_BROAD_MIN_COUNT = 3


@dataclass
class EnteGroups:
    display: str
    level: str
    areas: Counter[str] = field(default_factory=Counter)
    area_display: dict[str, str] = field(default_factory=dict)
    in_s2: bool = False
    s2_units: set[str] = field(default_factory=set)

    @property
    def persons(self) -> int:
        return sum(self.areas.values())


@dataclass
class StateGroups:
    state: str
    entes: dict[str, EnteGroups] = field(default_factory=dict)
    windows: list[dict[str, object]] = field(default_factory=list)


@dataclass
class StateStats:
    """Conteos exactos solo en memoria; lo publicado se deriva de aquí en cubetas o porcentajes."""

    persons: int = 0
    entes: int = 0
    area_groups: int = 0
    persons_small_area: int = 0
    persons_small_ente: int = 0
    protection: Counter[str] = field(default_factory=Counter)
    # (nivel, cubeta) -> [grupos, personas]
    buckets: dict[tuple[str, int], list[int]] = field(default_factory=dict)
    listed_areas: int = 0
    suppressed_area_names: int = 0
    suppressed_ente_names: int = 0
    s2_entes: int = 0
    s2_areas: int = 0

    def add_bucket(self, level: str, count: int) -> None:
        index = bucket_index(count)
        if index is None:
            return
        cell = self.buckets.setdefault((level, index), [0, 0])
        cell[0] += 1
        cell[1] += count

    def merge(self, other: 'StateStats') -> None:
        for name in (
            'persons',
            'entes',
            'area_groups',
            'persons_small_area',
            'persons_small_ente',
            'listed_areas',
            'suppressed_area_names',
            'suppressed_ente_names',
            's2_entes',
            's2_areas',
        ):
            setattr(self, name, getattr(self, name) + getattr(other, name))
        self.protection.update(other.protection)
        for key, (groups, persons) in other.buckets.items():
            cell = self.buckets.setdefault(key, [0, 0])
            cell[0] += groups
            cell[1] += persons


def build_name_filter(results: list[S1ProviderResult]) -> NameFilter:
    """Filtro de nombres con léxicos de nombres de pila y apellidos. Seguridad: viven solo en memoria."""
    given: Counter[str] = Counter()
    surnames: Counter[str] = Counter()
    for result in results:
        given.update(result.given_names)
        surnames.update(result.surnames)
    return NameFilter(
        given=lexicon(given, LEXICON_MIN_COUNT, NAME_ABBREVIATIONS),
        surnames=lexicon(surnames, LEXICON_MIN_COUNT),
        given_broad=lexicon(given, LEXICON_BROAD_MIN_COUNT, NAME_ABBREVIATIONS),
        surnames_broad=lexicon(surnames, LEXICON_BROAD_MIN_COUNT),
    )


def merge_providers(results: list[S1ProviderResult]) -> dict[str, StateGroups]:
    """Une los proveedores de una misma entidad (por ejemplo, SFP, BANXICO y CNDH en la federal)."""
    states: dict[str, StateGroups] = {}
    for result in sorted(results, key=lambda item: item.provider):
        state = states.setdefault(result.state, StateGroups(state=result.state))
        state.windows.append(
            {
                'proveedor': result.provider,
                'desde': result.window_start,
                'hasta': result.window_end,
            }
        )
        for ente, areas in result.groups.items():
            entry = state.entes.get(ente)
            if entry is None:
                entry = EnteGroups(
                    display=result.ente_display.get(ente, ente),
                    level=result.ente_level.get(ente, 'O'),
                )
                state.entes[ente] = entry
            entry.areas.update(areas)
            for area in areas:
                display = result.area_display.get((ente, area))
                if display and area not in entry.area_display:
                    entry.area_display[area] = display
    return states


def mark_contracting(
    states: dict[str, StateGroups], s2_links: dict[tuple[str, str], tuple[str, set[str]]]
) -> None:
    """Marca entes y áreas con personas en S2. s2_links: (entidad, ente S1) -> (roles, unidades).

    S2 no tiene área de adscripción; el puesto suele nombrar la unidad ("DEPARTAMENTO DE COMPRAS").
    Un área se marca si su nombre normalizado es igual al puesto, o uno es prefijo del otro con al
    menos dos palabras ("DIRECCION RECURSOS MATERIALES" y "DIRECCION RECURSOS MATERIALES SERVICIOS").
    """
    for (state, ente), (_, units) in s2_links.items():
        group = states.get(state)
        if group is None or ente not in group.entes:
            continue
        entry = group.entes[ente]
        entry.in_s2 = True
        prefixes = {unit for unit in units if len(unit.split()) >= 2}
        for area in entry.areas:
            long_area = len(area.split()) >= 2
            if area in units or any(
                area.startswith(unit + ' ') or (long_area and unit.startswith(area + ' ')) for unit in prefixes
            ):
                entry.s2_units.add(area)


def build_fragment(
    group: StateGroups, names: NameFilter
) -> tuple[dict[str, object], StateStats]:
    """Construye el fragmento publicable de una entidad y sus estadísticas exactas (no publicadas)."""
    stats = StateStats()
    total = sum(entry.persons for entry in group.entes.values())
    stats.persons = total
    stats.entes = len(group.entes)
    pools: Counter[str] = Counter()
    listed: dict[str, bool] = {}
    for ente, entry in group.entes.items():
        persons = entry.persons
        stats.add_bucket('ente', persons)
        if persons < K_ANONYMITY:
            stats.persons_small_ente += persons
        for area, count in entry.areas.items():
            stats.area_groups += 1
            stats.add_bucket('area', count)
            if count < K_ANONYMITY:
                stats.persons_small_area += count
        # Seguridad: entes y áreas pasan por el mismo filtro (nombres propios y datos de contacto).
        name_ok = names.allows_institution(ente, entry.display)
        if not name_ok:
            stats.suppressed_ente_names += 1
        listed[ente] = name_ok
        if persons < K_ANONYMITY or not name_ok:
            pools[entry.level] += persons
    pool_levels = sorted(pools)
    pool_index = {level: index for index, level in enumerate(pool_levels)}
    entes_out: list[list[object]] = []
    for ente in sorted(group.entes, key=lambda key: (key, group.entes[key].display)):
        entry = group.entes[ente]
        persons = entry.persons
        if entry.in_s2:
            stats.s2_entes += 1
        protective_ente = listed[ente] and persons >= K_ANONYMITY
        areas_out: list[list[object]] = []
        for area in sorted(entry.areas):
            count = entry.areas[area]
            in_area = False
            if area and count >= K_ANONYMITY and listed[ente]:
                if names.allows(area, entry.area_display.get(area, area)):
                    in_area = True
                    stats.listed_areas += 1
                    flag = 1 if area in entry.s2_units else 0
                    stats.s2_areas += flag
                    areas_out.append([entry.area_display.get(area, area), bucket_index(count), flag])
                else:
                    stats.suppressed_area_names += 1
            if in_area:
                stats.protection['area'] += count
            elif protective_ente:
                stats.protection['ente'] += count
            elif pools[entry.level] >= K_ANONYMITY:
                stats.protection['grupo'] += count
            elif total >= K_ANONYMITY:
                stats.protection['entidad'] += count
            else:
                stats.protection['insuficiente'] += count
        if not listed[ente]:
            continue
        entes_out.append(
            [
                entry.display,
                bucket_index(persons),
                entry.level,
                1 if entry.in_s2 else 0,
                -1 if protective_ente else pool_index[entry.level],
                areas_out,
            ]
        )
    fragment = {
        'version': FRAGMENT_VERSION,
        'entidad': {'clave': group.state, 'nombre': STATE_NAMES[group.state]},
        'k': K_ANONYMITY,
        'cubetas': list(BUCKETS),
        'ventanas': group.windows,
        'cubetaEntidad': bucket_index(total),
        'formato': {
            'ente': ['nombre', 'cubeta', 'ordenGobierno', 'contratacion', 'grupo', 'areas'],
            'area': ['nombre', 'cubeta', 'contratacion'],
            'grupo': ['ordenGobierno', 'nombre', 'cubeta', 'protege'],
            'ordenGobierno': {'F': 'federal', 'E': 'estatal', 'M': 'municipal', 'O': 'otro o sin dato'},
        },
        'grupos': [
            [
                level,
                f'Otros entes {LEVEL_NAMES[level]} de {STATE_NAMES[group.state]}',
                bucket_index(pools[level]),
                1 if pools[level] >= K_ANONYMITY else 0,
            ]
            for level in pool_levels
        ],
        'entes': entes_out,
    }
    return fragment, stats


def summary(stats: StateStats) -> dict[str, object]:
    """Cifras publicables de una entidad o del agregado nacional.

    Seguridad: personas redondeadas a 10; porcentajes con un decimal y suprimidos (None) cuando el
    numerador es de 1 a 4. Como los porcentajes de protección suman 100, si alguno se suprime se
    suprime también el menor de los publicados distintos de cero (supresión complementaria).
    """
    persons = stats.persons
    protected = {level: published_percentage(stats.protection[level], persons) for level in PROTECTION_LEVELS}
    if any(value is None for value in protected.values()):
        candidates = [
            level for level in PROTECTION_LEVELS if protected[level] is not None and stats.protection[level] > 0
        ]
        if candidates:
            protected[min(candidates, key=lambda level: (stats.protection[level], level))] = None
    return {
        'personas': rounded_count(persons),
        'entes': stats.entes,
        'gruposArea': stats.area_groups,
        'pctPersonasKMenor10Area': published_percentage(stats.persons_small_area, persons),
        'pctPersonasKMenor10Ente': published_percentage(stats.persons_small_ente, persons),
        'pctProtegidasPor': protected,
        'areasPublicadas': stats.listed_areas,
        'areasConNombreSuprimido': stats.suppressed_area_names,
        'entesConNombreSuprimido': stats.suppressed_ente_names,
        'entesConS2': stats.s2_entes,
        'areasConS2': stats.s2_areas,
    }

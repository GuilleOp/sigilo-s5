# Escritura de los productos agregados del repositorio: grupos de anonimato, cobertura, equivalencias
# y datos abiertos. Ninguna función de este módulo recibe nombres de personas ni registros individuales.
import hashlib
import os
import sqlite3
from collections import Counter, defaultdict
from collections.abc import Callable

from . import anonymity
from .common import BUCKETS, K_ANONYMITY, SMALL_CELL, percentage, rounded_count, write_csv, write_json
from .coverage import CSV_HEADER, SYSTEMS, build_rows, csv_rows
from .entities import FEDERAL, STATE_NAMES
from .matching import METHODS, Match
from .normalize import NameFilter, has_contact_data
from .tally import Tally

MAX_FRAGMENT_BYTES = 2 * 1024 * 1024
NATIONAL = 'NAC'
SUPPRESSED_NAME = '(nombre suprimido)'


def write_anonymity(
    out_dir: str,
    states: dict[str, anonymity.StateGroups],
    names: NameFilter,
) -> dict[str, object]:
    """Escribe un fragmento JSON compacto por entidad y el índice. Devuelve el resumen nacional."""
    target = os.path.join(out_dir, 'grupos-anonimato')
    national = anonymity.StateStats()
    entries: list[dict[str, object]] = []
    per_state: dict[str, anonymity.StateStats] = {}
    cuts: dict[str, str] = {}
    cut = ''
    for state in sorted(STATE_NAMES):
        group = states.get(state)
        if group is None or not group.entes:
            entries.append({'clave': state, 'nombre': STATE_NAMES[state], 'archivo': None, 'hayDatos': False})
            continue
        fragment, stats = anonymity.build_fragment(group, names)
        per_state[state] = stats
        national.merge(stats)
        name = f'{state}.json'
        path = os.path.join(target, name)
        size = write_json(path, fragment, compact=True)
        with open(path, 'rb') as handle:
            digest = hashlib.sha256(handle.read()).hexdigest()
        if size > MAX_FRAGMENT_BYTES:
            raise ValueError(f'El fragmento {name} pesa {size} bytes (más de 2 MB)')
        ends = [str(window['hasta']) for window in group.windows if window['hasta']]
        cuts[state] = max(ends, default='')
        cut = max(cut, cuts[state])
        entries.append(
            {
                'clave': state,
                'nombre': STATE_NAMES[state],
                'archivo': name,
                'hayDatos': True,
                'bytes': size,
                'sha256': digest,
                'entesPublicados': len(published) if isinstance(published := fragment['entes'], list) else 0,
                'areasPublicadas': stats.listed_areas,
                'ventanas': group.windows,
            }
        )
    index = {
        'version': anonymity.FRAGMENT_VERSION,
        'k': K_ANONYMITY,
        'cubetas': list(BUCKETS),
        'fechaCorte': cut,
        'descripcion': (
            'Tamaño del grupo de anonimato por entidad, ente y área (personas distintas con declaración '
            'en S1 en los últimos 24 meses de cada proveedor), en cubetas. Un fragmento por entidad.'
        ),
        'entidades': entries,
        'resumenNacional': anonymity.summary(national),
    }
    write_json(os.path.join(target, 'indice.json'), index)
    cuts[NATIONAL] = cut
    write_anonymity_open_data(out_dir, national, per_state, cuts)
    return {'nacional': anonymity.summary(national), 'fragmentos': entries}


# Con 1 o 2 grupos en una celda, el conteo de personas más la cubeta de cada ente o área del
# fragmento da el tamaño exacto de un grupo nombrado.
MIN_GROUPS_FOR_COUNT = 3


def _suppress(persons: int, groups: int) -> tuple[object, int]:
    """Personas de una celda: suprimidas si son de 1 a 4 o si hay menos de 3 grupos; si no, redondeadas."""
    if 0 < persons < SMALL_CELL or 0 < groups < MIN_GROUPS_FOR_COUNT:
        return None, 1
    return rounded_count(persons), 0


def write_anonymity_open_data(
    out_dir: str,
    national: anonymity.StateStats,
    per_state: dict[str, anonymity.StateStats],
    cuts: dict[str, str],
) -> None:
    target = os.path.join(out_dir, 'abiertos', 'grupos-anonimato')
    scopes = [(NATIONAL, 'Nacional', national)] + [
        (state, STATE_NAMES[state], stats) for state, stats in sorted(per_state.items())
    ]
    bucket_rows = []
    summary_rows = []
    for code, name, stats in scopes:
        for level in ('area', 'ente'):
            for index, label in enumerate(BUCKETS):
                groups, persons = stats.buckets.get((level, index), [0, 0])
                value, flag = _suppress(persons, groups)
                bucket_rows.append([code, name, level, label, groups, value, flag])
        info = anonymity.summary(stats)
        protected = info['pctProtegidasPor']
        assert isinstance(protected, dict)
        summary_rows.append(
            [
                code,
                name,
                info['personas'],
                info['entes'],
                info['gruposArea'],
                info['pctPersonasKMenor10Area'],
                info['pctPersonasKMenor10Ente'],
                *(protected[level] for level in anonymity.PROTECTION_LEVELS),
                cuts.get(code, ''),
            ]
        )
    write_csv(
        os.path.join(target, 'cubetas.csv'),
        ('ambito_clave', 'ambito', 'nivel', 'cubeta', 'grupos', 'personas', 'personas_suprimido'),
        bucket_rows,
    )
    write_csv(
        os.path.join(target, 'resumen.csv'),
        (
            'ambito_clave',
            'ambito',
            'personas',
            'entes',
            'grupos_area',
            'pct_personas_k_menor_10_area',
            'pct_personas_k_menor_10_ente',
            'pct_protegidas_area',
            'pct_protegidas_ente',
            'pct_protegidas_grupo_entes',
            'pct_protegidas_entidad',
            'pct_sin_proteccion',
            'fecha_corte',
        ),
        summary_rows,
    )


def write_coverage(out_dir: str, tally: Tally, completeness: dict[tuple[str, str], tuple[int, int]]) -> list[dict[str, object]]:
    rows = build_rows(tally, completeness)
    write_json(
        os.path.join(out_dir, 'cobertura', 'matriz.json'),
        {
            'version': 1,
            'sistemas': SYSTEMS,
            'supresion': f'Conteos de 1 a {SMALL_CELL - 1} registros se publican como rango y sin fechas.',
            'filas': rows,
        },
    )
    table = csv_rows(rows)
    write_csv(os.path.join(out_dir, 'cobertura', 'matriz.csv'), CSV_HEADER, table)
    write_csv(os.path.join(out_dir, 'abiertos', 'cobertura', 'matriz-cobertura.csv'), CSV_HEADER, table)
    return rows


def _most_common(counter: Counter[str]) -> str:
    return min(counter.items(), key=lambda item: (-item[1], item[0]))[0]


def write_equivalences(
    out_dir: str,
    sources: dict[str, dict[tuple[str, str], tuple[Counter[str], int]]],
    matches: dict[str, dict[tuple[str, str], Match]],
    s1_display: dict[tuple[str, str], str],
    s1_states: set[str],
    is_publishable: Callable[[str, str], bool],
) -> dict[str, object]:
    """Tabla de equivalencias (S2, S3 servidores, S3 particulares, S6 -> S1) y tasas de coincidencia.

    Las tasas se dan por entidad, para lo federal, para lo estatal y para lo estatal solo en entidades
    que sí tienen S1 (sin S1 la coincidencia es imposible y no dice nada de la normalización).
    Seguridad: si un nombre (de origen o de S1) parece de persona, se suprimen el nombre y la clave.
    """

    def shown(state: str, key: str, name: str) -> tuple[str, str]:
        if is_publishable(key, name):
            return f'{state}|{key}', name
        return f'{state}|{SUPPRESSED_NAME}', SUPPRESSED_NAME

    rows = []
    rates: dict[str, object] = {}
    for system in sorted(sources):
        per_state: dict[str, Counter[str]] = defaultdict(Counter)
        for (state, key), (names, records) in sorted(sources[system].items()):
            match = matches[system][(state, key)]
            origin_key, origin_name = shown(state, key, _most_common(names))
            target_key, target_name = (
                shown(state, match.target, s1_display.get((state, match.target), '')) if match.target else ('', '')
            )
            rows.append(
                [
                    system,
                    state,
                    STATE_NAMES.get(state, state),
                    origin_name,
                    origin_key,
                    records,
                    target_key,
                    target_name,
                    match.method,
                    match.similarity,
                ]
            )
            scopes = [state, 'federal' if state == FEDERAL else 'estatal', 'total']
            if state != FEDERAL and state in s1_states:
                scopes.append('estatal_con_s1')
            for bucket in scopes:
                per_state[bucket][match.method] += 1
                per_state[bucket]['instituciones'] += 1
                per_state[bucket]['registros'] += records
                if match.target:
                    per_state[bucket]['registros_con_coincidencia'] += records
        rates[system] = {
            scope: {
                'instituciones': counts['instituciones'],
                **{method: counts[method] for method in METHODS},
                'tasaInstituciones': percentage(counts['instituciones'] - counts['sin_coincidencia'], counts['instituciones']),
                'tasaRegistros': percentage(counts['registros_con_coincidencia'], counts['registros']),
            }
            for scope, counts in sorted(per_state.items())
        }
    write_csv(
        os.path.join(out_dir, 'normalizacion', 'equivalencias.csv'),
        (
            'sistema',
            'entidad_clave',
            'entidad',
            'nombre_origen',
            'clave_origen',
            'registros_origen',
            'clave_s1',
            'nombre_s1',
            'metodo',
            'similitud',
        ),
        rows,
    )
    write_json(os.path.join(out_dir, 'normalizacion', 'tasas.json'), rates)
    return rates


METHOD_COLUMNS = (('open', 'licitacion_publica'), ('selective', 'invitacion_restringida'), ('direct', 'adjudicacion_directa'))


def contract_indicators(database: str) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Indicadores por comprador federal (y por año) desde el subconjunto APF 2018-2022."""
    connection = sqlite3.connect(database)
    names: dict[str, Counter[str]] = defaultdict(Counter)
    for buyer, name, count in connection.execute(
        'SELECT comprador_id, comprador, COUNT(*) FROM releases GROUP BY comprador_id, comprador'
    ):
        names[buyer or ''][name or ''] += count
    totals: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    query = """
      SELECT comprador_id, anio_inicio, metodo, COUNT(*), SUM(COALESCE(monto_adjudicado_mxn, 0)),
             SUM(adjudicaciones_otra_moneda), SUM(1 - ocid_con_prefijo)
      FROM releases GROUP BY comprador_id, anio_inicio, metodo
    """
    for buyer, year, method, count, amount, other, unprefixed in connection.execute(query):
        for scope in ((buyer or '', 'todos'), (buyer or '', year)):
            cell = totals[scope]
            cell['procedimientos'] += count
            cell[f'metodo:{method or ""}'] += count
            cell['monto'] += amount
            cell['otra_moneda'] += other
            cell['sin_prefijo'] += unprefixed
    connection.close()
    by_buyer: list[dict[str, object]] = []
    by_year: list[dict[str, object]] = []
    for (buyer, scope), cell in sorted(totals.items()):
        count = int(cell['procedimientos'])
        row: dict[str, object] = {
            'comprador_id': buyer,
            'comprador': _most_common(names[buyer]),
            'procedimientos': count,
        }
        for method, column in METHOD_COLUMNS:
            row[f'pct_{column}'] = percentage(int(cell[f'metodo:{method}']), count)
        known = sum(int(cell[f'metodo:{method}']) for method, _ in METHOD_COLUMNS)
        row['pct_sin_metodo'] = percentage(count - known, count)
        row['monto_adjudicado_mxn'] = round(cell['monto'])
        row['adjudicaciones_otra_moneda'] = int(cell['otra_moneda'])
        row['procedimientos_ocid_sin_prefijo'] = int(cell['sin_prefijo'])
        if scope == 'todos':
            by_buyer.append(row)
        else:
            by_year.append({'anio': scope, **row})
    return by_buyer, by_year


def write_contract_indicators(
    out_dir: str,
    by_buyer: list[dict[str, object]],
    by_year: list[dict[str, object]],
    links: dict[str, tuple[str, bool, bool]],
) -> None:
    """links: comprador_id -> (clave normalizada, coincide con S1, coincide con S2)."""
    target = os.path.join(out_dir, 'abiertos', 'contratacion-federal')
    base = [
        'comprador_id',
        'comprador',
        'clave_ente',
        'en_s1',
        'en_s2',
        'procedimientos',
        'pct_licitacion_publica',
        'pct_invitacion_restringida',
        'pct_adjudicacion_directa',
        'pct_sin_metodo',
        'monto_adjudicado_mxn',
        'adjudicaciones_otra_moneda',
        'procedimientos_ocid_sin_prefijo',
    ]

    def as_row(row: dict[str, object], extra: list[str]) -> list[object]:
        key, in_s1, in_s2 = links.get(str(row['comprador_id']), ('', False, False))
        # Seguridad: mismo filtro de contacto que en fragmentos y equivalencias. «@prende.mx» es una
        # marca institucional sin usuario, no un correo, así que se conserva.
        buyer = str(row['comprador'])
        if has_contact_data(buyer):
            buyer, key = SUPPRESSED_NAME, f'{FEDERAL}|{SUPPRESSED_NAME}'
        enriched = {
            **row,
            'comprador': buyer,
            'clave_ente': key,
            'en_s1': str(in_s1).lower(),
            'en_s2': str(in_s2).lower(),
        }
        return [enriched[column] for column in extra + base]

    write_csv(os.path.join(target, 'indicadores-comprador.csv'), base, [as_row(row, []) for row in by_buyer])
    write_csv(
        os.path.join(target, 'indicadores-comprador-anio.csv'),
        ['anio', *base],
        [as_row(row, ['anio']) for row in by_year],
    )

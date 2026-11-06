# Matriz de cobertura: entidad federativa x sistema x periodo, con proveedores, fechas y notas de calidad.
# Los conteos de 1 a 4 registros se publican como rango y sin fechas (supresión de celdas pequeñas).
from .common import SMALL_CELL
from .entities import STATE_NAMES
from .tally import Tally

SYSTEMS: dict[str, str] = {
    'S1': 'S1 Declaraciones patrimoniales y de intereses',
    'S2': 'S2 Servidores públicos que intervienen en contrataciones',
    'S3S': 'S3 Servidores públicos sancionados',
    'S3P': 'S3 Particulares sancionados',
    'S6': 'S6 Contrataciones públicas (OCDS)',
}
TOTAL = 'total'

# Notas verificadas en el inventario de la Etapa 0 (INVENTARIO.md, secciones 3 a 7) que no se pueden
# deducir de los datos mismos.
STATIC_NOTES: dict[tuple[str, str], tuple[str, ...]] = {
    ('S1', '00'): (
        'SFP solo trae declaraciones con fecha de 2022 (una foto de un año).',
        'La API lista INAI e INE como proveedores, pero la descarga masiva no los trae.',
    ),
    ('S1', '15'): ('Solo 7 entes (autónomos, judicial, legislativo y UAEM): sin Poder Ejecutivo ni municipios.',),
    ('S1', '06'): ('La API lista el proveedor, pero la descarga masiva no lo trae.',),
    ('S1', '11'): ('La API lista el proveedor, pero la descarga masiva no lo trae.',),
    ('S1', '22'): ('La API lista el proveedor, pero la descarga masiva no lo trae.',),
    ('S1', '31'): ('La API lista el proveedor, pero la descarga masiva no lo trae.',),
    ('S1', '07'): ('El campo de ente suele nombrar un plantel, una escuela o un código.',),
    ('S1', '14'): ('El campo de ente suele nombrar un plantel, una escuela o un código.',),
    ('S1', '21'): ('El campo de ente suele nombrar un plantel, una escuela o un código.',),
    ('S2', '00'): ('SABG usa un esquema propio (snake_case); cada fila es persona por ejercicio fiscal.',),
    ('S2', '20'): ('Aparece en el reporte de cobertura de la PDN, pero no en la descarga masiva.',),
    ('S3S', '00'): ('La descarga masiva no trae sanciones federales.',),
    ('S6', '00'): ('Solo la APF; la última release por ocid se usa en los indicadores.',),
    ('S6', '08'): ('Solo ejemplos de la Secretaría Ejecutiva estatal.',),
    ('S6', '15'): ('Solo un órgano autónomo (INFOEM).',),
}

_QUALITY_TEXT = {
    'fechas_implausibles': 'registros con fecha implausible (de relleno o futura), contados en «sin_fecha»',
    'sin_institucion': 'registros sin nombre de institución',
    'entidad_declarada_distinta': 'registros cuya entidad declarada difiere de la del proveedor',
}


def _incomplete_notes(completeness: dict[tuple[str, str], tuple[int, int]]) -> dict[tuple[str, str], list[str]]:
    notes: dict[tuple[str, str], list[str]] = {}
    for (state, folder), (read, declared) in sorted(completeness.items()):
        if declared and read < declared:
            system = 'S3P' if 'personas' in folder else 'S3S'
            notes.setdefault((system, state), []).append(
                f'Descarga incompleta en {folder}: {read} de {declared} registros declarados '
                f'({round(100 * read / declared, 1)} %).'
            )
    return notes


def build_rows(
    tally: Tally,
    completeness: dict[tuple[str, str], tuple[int, int]],
) -> list[dict[str, object]]:
    """Filas de la matriz: una por (entidad, sistema, periodo) con datos y una 'total' por par."""
    dynamic = _incomplete_notes(completeness)
    rows: list[dict[str, object]] = []
    for state in sorted(STATE_NAMES):
        for system in SYSTEMS:
            periods = sorted(
                period for (cell_system, cell_state, period) in tally.cells if (cell_system, cell_state) == (system, state)
            )
            notes = list(STATIC_NOTES.get((system, state), ())) + dynamic.get((system, state), [])
            for name, amount in sorted(tally.quality.get((system, state), {}).items()):
                notes.append(f'{amount} {_QUALITY_TEXT.get(name, name)}.')
            published = 0
            suppressed = 0
            total_providers: set[str] = set()
            dates: list[str] = []
            for period in periods:
                cell = tally.cells[(system, state, period)]
                total_providers.update(cell.providers)
                if is_small(cell.records):
                    suppressed += 1
                else:
                    published += cell.records
                    # Seguridad: las fechas del total salen solo de periodos publicados; si no, la
                    # fecha mínima o máxima delataría la de un registro de una celda suprimida.
                    dates += [date for date in (cell.date_min, cell.date_max) if date]
                rows.append(_row(state, system, period, cell.records, cell.providers, cell.date_min, cell.date_max, []))
            total = _row(
                state,
                system,
                TOTAL,
                published,
                total_providers,
                min(dates) if dates else None,
                max(dates) if dates else None,
                notes,
            )
            if suppressed:
                # Seguridad: con el total exacto, total menos periodos publicados reconstruiría la
                # celda suprimida. Se publica el rango que ya se deduce de las celdas: cada periodo
                # suprimido aporta de 1 a 4 registros.
                total['hayDatos'] = True
                total['registros'] = None
                low, high = published + suppressed, published + (SMALL_CELL - 1) * suppressed
                total['registrosRango'] = f'{low}-{high}'
            rows.append(total)
    return rows


def is_small(records: int) -> bool:
    return 0 < records < SMALL_CELL


def _row(
    state: str,
    system: str,
    period: str,
    records: int,
    providers: set[str],
    date_min: str | None,
    date_max: str | None,
    notes: list[str],
) -> dict[str, object]:
    suppressed = is_small(records)
    return {
        'entidadClave': state,
        'entidad': STATE_NAMES[state],
        'sistema': system,
        'periodo': period,
        'hayDatos': records > 0,
        'registros': None if suppressed else records,
        'registrosRango': f'1-{SMALL_CELL - 1}' if suppressed else None,
        'proveedores': len(providers),
        'listaProveedores': sorted(providers),
        'fechaMin': None if suppressed else date_min,
        'fechaMax': None if suppressed else date_max,
        'notas': notes,
    }


CSV_HEADER = (
    'entidad_clave',
    'entidad',
    'sistema',
    'periodo',
    'hay_datos',
    'registros',
    'registros_rango',
    'proveedores',
    'lista_proveedores',
    'fecha_min',
    'fecha_max',
    'notas',
)


def csv_rows(rows: list[dict[str, object]]) -> list[list[object]]:
    return [
        [
            row['entidadClave'],
            row['entidad'],
            row['sistema'],
            row['periodo'],
            'true' if row['hayDatos'] else 'false',
            row['registros'],
            row['registrosRango'],
            row['proveedores'],
            ';'.join(str(provider) for provider in row['listaProveedores']),
            row['fechaMin'],
            row['fechaMax'],
            ' | '.join(str(note) for note in row['notas']),
        ]
        for row in rows
    ]


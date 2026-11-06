# Utilidades compartidas: fechas, cubetas de tamaño, escritura determinista de JSON y CSV, y sha256.
import csv
import datetime
import hashlib
import io
import json
import os
import re
from collections.abc import Iterable, Sequence

# Umbral de anonimato: un grupo protege si tiene al menos K personas distintas.
K_ANONYMITY = 10

# Cubetas publicadas en lugar de conteos exactos.
BUCKETS: tuple[str, ...] = ('1-4', '5-9', '10-49', '50+')

# Conteos por debajo de este valor se suprimen en los datos abiertos cuando la unidad es una persona.
SMALL_CELL = 5

_ISO = re.compile(r'^(\d{4})-(\d{2})-(\d{2})')
_SLASH_YMD = re.compile(r'^(\d{4})/(\d{2})/(\d{2})')
_SLASH_DMY = re.compile(r'^(\d{2})/(\d{2})/(\d{4})')

MIN_VALID_YEAR = 1990


def bucket_index(count: int) -> int | None:
    """Índice de cubeta para un conteo de personas (None si es 0)."""
    if count <= 0:
        return None
    if count < 5:
        return 0
    if count < 10:
        return 1
    if count < 50:
        return 2
    return 3


def bucket_label(count: int) -> str:
    index = bucket_index(count)
    return '' if index is None else BUCKETS[index]


def parse_date(value: object) -> str | None:
    """Convierte una fecha de la PDN a 'AAAA-MM-DD'. Devuelve None si falta o no es válida."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    for pattern, order in ((_ISO, 'ymd'), (_SLASH_YMD, 'ymd'), (_SLASH_DMY, 'dmy')):
        match = pattern.match(text)
        if not match:
            continue
        first, second, third = match.groups()
        year, month, day = (first, second, third) if order == 'ymd' else (third, second, first)
        try:
            datetime.date(int(year), int(month), int(day))
        except ValueError:
            return None
        return f'{year}-{month}-{day}'
    return None


def is_plausible(date: str | None, reference: str) -> bool:
    """Fecha entre 1990 y la fecha de referencia (descarga): descarta fechas de relleno como 1900."""
    return date is not None and int(date[:4]) >= MIN_VALID_YEAR and date <= reference


def months_before(date: str, months: int) -> str:
    """Resta meses a una fecha ISO, ajustando el día al último del mes si hace falta."""
    year, month, day = int(date[:4]), int(date[5:7]), int(date[8:10])
    total = year * 12 + (month - 1) - months
    new_year, new_month = divmod(total, 12)
    new_month += 1
    for candidate in (day, 30, 29, 28):
        try:
            return datetime.date(new_year, new_month, candidate).isoformat()
        except ValueError:
            continue
    raise ValueError('Fecha inválida')


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def write_json(path: str, data: object, compact: bool = False) -> int:
    """Escribe JSON en UTF-8 con orden estable; devuelve los bytes escritos."""
    ensure_dir(os.path.dirname(path))
    if compact:
        text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    payload = (text + '\n').encode('utf-8')
    with open(path, 'wb') as handle:
        handle.write(payload)
    return len(payload)


def write_csv(path: str, header: Sequence[str], rows: Iterable[Sequence[object]]) -> int:
    """Escribe CSV en UTF-8 con fin de línea LF; devuelve el número de filas de datos."""
    ensure_dir(os.path.dirname(path))
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator='\n')
    writer.writerow(header)
    count = 0
    for row in rows:
        writer.writerow(['' if value is None else value for value in row])
        count += 1
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(buffer.getvalue())
    return count


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def percentage(part: int, total: int) -> float:
    return round(100 * part / total, 2) if total else 0.0


# Base de redondeo de los conteos de personas publicados en los datos abiertos de grupos.
COUNT_ROUNDING = 10


def rounded_count(count: int) -> int:
    """Redondea al múltiplo de 10 más cercano (mitades hacia arriba).

    Seguridad: con conteos y totales exactos, total menos celdas publicadas reconstruye una celda
    suprimida; con todos redondeados, la diferencia tiene un error de varias decenas.
    """
    return (count + COUNT_ROUNDING // 2) // COUNT_ROUNDING * COUNT_ROUNDING


def published_percentage(part: int, total: int) -> float | None:
    """Porcentaje con un decimal; None (suprimido) si el numerador es de 1 a 4.

    Seguridad: con dos decimales sobre un total pequeño, el porcentaje revela el conteo exacto.
    """
    if 0 < part < SMALL_CELL:
        return None
    return round(100 * part / total, 1) if total else 0.0

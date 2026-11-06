# Lectura incremental de arreglos JSON gigantes dentro de un ZIP, sin cargarlos ni descomprimirlos a disco.
# Basado en scripts/stream_json.py del inventario de la Etapa 0.
import io
import json
from typing import BinaryIO, Iterator

_DECODER = json.JSONDecoder()
_WHITESPACE = ' \t\r\n,'


def iter_array(binary: BinaryIO, chunk_size: int = 1 << 22) -> Iterator[object]:
    """Itera los elementos de un arreglo JSON de nivel superior leyendo por bloques.

    Mantiene en memoria solo el bloque actual y el objeto en curso. Lanza ValueError si el
    contenido no empieza con un arreglo.
    """
    text = io.TextIOWrapper(binary, encoding='utf-8', errors='replace')
    buffer = text.read(chunk_size)
    start = buffer.find('[')
    if start < 0:
        raise ValueError('El contenido no es un arreglo JSON')
    position = start + 1
    while True:
        while True:
            while position < len(buffer) and buffer[position] in _WHITESPACE:
                position += 1
            if position < len(buffer):
                break
            more = text.read(chunk_size)
            if not more:
                return
            buffer = buffer[position:] + more
            position = 0
        if buffer[position] == ']':
            return
        while True:
            try:
                item, end = _DECODER.raw_decode(buffer, position)
                break
            except json.JSONDecodeError:
                more = text.read(chunk_size)
                if not more:
                    raise
                buffer = buffer[position:] + more
                position = 0
        yield item
        position = end
        if position > (1 << 23):
            buffer = buffer[position:]
            position = 0


def get_path(value: object, *keys: str) -> object:
    """Recorre diccionarios anidados; devuelve None si algún nivel falta o no es diccionario."""
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def get_text(value: object, *keys: str) -> str:
    """Como get_path, pero devuelve texto sin espacios sobrantes ('' si falta)."""
    found = get_path(value, *keys)
    if found is None or isinstance(found, (dict, list)):
        return ''
    return ' '.join(str(found).split())

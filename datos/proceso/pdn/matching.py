# Equivalencias de instituciones entre sistemas: cada nombre de S2, S3 o S6 se liga a un ente de S1
# de la misma entidad, con una cascada determinista (exacto, prefijo municipal, similitud >= 0.9).
import difflib
from collections import defaultdict
from dataclasses import dataclass

SIMILARITY_THRESHOLD = 0.9
METHODS = ('exacto', 'municipio', 'similitud', 'sin_coincidencia')


@dataclass(frozen=True)
class Match:
    target: str | None
    method: str
    similarity: float


class Catalog:
    """Claves normalizadas de S1 de una entidad, con índice por palabra para acotar la similitud."""

    def __init__(self, keys: set[str]) -> None:
        self.keys = keys
        self.by_token: dict[str, set[str]] = defaultdict(set)
        for key in keys:
            for token in set(key.split()):
                self.by_token[token].add(key)

    def find(self, key: str) -> Match:
        if key in self.keys:
            return Match(key, 'exacto', 1.0)
        # S3 nombra municipios sin prefijo ("Toluca"); S1 los escribe como ayuntamiento o municipio.
        prefixed = f'MUNICIPIO {key}'
        if prefixed in self.keys:
            return Match(prefixed, 'municipio', 1.0)
        if key.startswith('MUNICIPIO ') and key[len('MUNICIPIO ') :] in self.keys:
            return Match(key[len('MUNICIPIO ') :], 'municipio', 1.0)
        tokens = key.split()
        if not tokens:
            return Match(None, 'sin_coincidencia', 0.0)
        # Candidatos: claves que comparten la palabra menos frecuente de la clave buscada.
        known = [token for token in tokens if token in self.by_token]
        if not known:
            return Match(None, 'sin_coincidencia', 0.0)
        rarest = min(known, key=lambda token: (len(self.by_token[token]), token))
        best: tuple[float, str] | None = None
        for candidate in sorted(self.by_token[rarest]):
            score = difflib.SequenceMatcher(None, key, candidate).ratio()
            if best is None or score > best[0]:
                best = (score, candidate)
        if best and best[0] >= SIMILARITY_THRESHOLD:
            return Match(best[1], 'similitud', round(best[0], 3))
        return Match(None, 'sin_coincidencia', round(best[0], 3) if best else 0.0)


def build_catalogs(s1_keys: dict[str, set[str]]) -> dict[str, Catalog]:
    return {state: Catalog(keys) for state, keys in s1_keys.items()}


def match_all(
    catalogs: dict[str, Catalog], items: list[tuple[str, str]]
) -> dict[tuple[str, str], Match]:
    """Liga cada (entidad, clave) a una clave de S1 de la misma entidad."""
    empty = Catalog(set())
    return {(state, key): catalogs.get(state, empty).find(key) for state, key in items}

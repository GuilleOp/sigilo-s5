# Acumulador de cobertura por sistema, entidad, periodo y proveedor; se combina entre procesos.
from collections import Counter
from dataclasses import dataclass, field

from .common import MIN_VALID_YEAR, is_plausible

NO_DATE = 'sin_fecha'


@dataclass
class Cell:
    records: int = 0
    providers: set[str] = field(default_factory=set)
    date_min: str | None = None
    date_max: str | None = None

    def merge(self, other: 'Cell') -> None:
        self.records += other.records
        self.providers.update(other.providers)
        for value in (other.date_min, other.date_max):
            self.widen(value)

    def widen(self, date: str | None) -> None:
        if date is None:
            return
        if self.date_min is None or date < self.date_min:
            self.date_min = date
        if self.date_max is None or date > self.date_max:
            self.date_max = date


@dataclass
class Tally:
    """Celdas por (sistema, entidad, periodo) y contadores de calidad por (sistema, entidad)."""

    cells: dict[tuple[str, str, str], Cell] = field(default_factory=dict)
    quality: dict[tuple[str, str], Counter[str]] = field(default_factory=dict)

    def add(
        self,
        system: str,
        state: str,
        provider: str,
        date: str | None,
        reference: str,
        period: str | None = None,
    ) -> None:
        """Suma un registro al año de su fecha, o al periodo indicado (por ejemplo, el ejercicio fiscal).

        Las fechas ausentes o implausibles (como la fecha de relleno 1900) van al periodo 'sin_fecha'.
        """
        valid = is_plausible(date, reference)
        if period is None or not (MIN_VALID_YEAR <= int(period) <= int(reference[:4])):
            period = date[:4] if valid and date else NO_DATE
        cell = self.cells.setdefault((system, state, period), Cell())
        cell.records += 1
        cell.providers.add(provider)
        if valid:
            cell.widen(date)
        elif date is not None:
            self.note(system, state, 'fechas_implausibles')

    def note(self, system: str, state: str, name: str, amount: int = 1) -> None:
        self.quality.setdefault((system, state), Counter())[name] += amount

    def merge(self, other: 'Tally') -> None:
        for key, cell in other.cells.items():
            self.cells.setdefault(key, Cell()).merge(cell)
        for key, counter in other.quality.items():
            self.quality.setdefault(key, Counter()).update(counter)

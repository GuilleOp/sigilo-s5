# Orquestación del proceso completo: lee los cuatro ZIP en paralelo y escribe los productos.
# Las salidas a nivel de registro solo se escriben en la carpeta privada, que debe estar fuera del repositorio.
import datetime
import json
import os
import shutil
import sys
import tempfile
import time
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field

from . import anonymity, matching, products, s1, s2, s3, s6
from .common import parse_date, sha256_file, write_json
from .entities import FEDERAL
from .normalize import institution_name_key
from .tally import Tally

# Fuentes verificadas en el inventario de la Etapa 0 (INVENTARIO.md, sección 1).
SOURCES = {
    'S1': {
        'archivo': 'PDN_S1.zip',
        'url': 'https://drive.google.com/file/d/1RSYOwWabsWqtxt7VNHIjf-yt1P5bPSbE',
        'sha256': '105d8711f2f3487c17aa355b0d6146f3b8c59b55418ee333b6402a0184506181',
    },
    'S2': {
        'archivo': 'PDN_S2.zip',
        'url': 'https://drive.google.com/file/d/1KWcst_YLI5YVlKnzmd3Xm5prAP4NVhAD',
        'sha256': '3f100b9ec27e0572cb27d2ed8dd8736eeba6e101eee92c9d32d74b5268cd1562',
    },
    'S3': {
        'archivo': 'PDN_S3v2.zip',
        'url': 'https://drive.google.com/file/d/1i-HjNju04xdKThHgGDAzHb97GdF_cqS8',
        'sha256': '2f65931a81389fb7a776deea4b1be6e41ba5983b58ab33ee8b164f1be86ef0e8',
    },
    'S6': {
        'archivo': 'PDN_S6.zip',
        'url': 'https://drive.google.com/file/d/1OM-P1JAp7PKeGL_InRYOQ1UO5Vpcs9Oi',
        'sha256': 'fc7fc9c6340aefb0141294e3f70d65940443d0dfc653fe51aed62b678ce62b7a',
    },
}


@dataclass
class Options:
    input_dir: str
    output_dir: str
    private_dir: str | None = None
    processes: int = 4
    reference: str | None = None
    verify_sha: bool = True
    quiet: bool = False
    expected_sha: dict[str, str] = field(default_factory=lambda: {key: value['sha256'] for key, value in SOURCES.items()})


def _logger(quiet: bool) -> Callable[[str], None]:
    def log(message: str) -> None:
        if not quiet:
            print(message, file=sys.stderr, flush=True)

    return log


def repository_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


def check_private_dir(private_dir: str) -> str:
    """Seguridad: la carpeta privada no puede estar dentro del repositorio (evita versionar registros)."""
    resolved = os.path.realpath(private_dir)
    root = os.path.realpath(repository_root())
    if resolved == root or resolved.startswith(root + os.sep):
        raise ValueError('La carpeta privada debe estar fuera del repositorio')
    os.makedirs(resolved, exist_ok=True)
    return resolved


def published_reference(output_dir: str) -> str | None:
    """Fecha de referencia de la corrida publicada (fuentes.json), si existe.

    Por omisión se reutiliza para que otra persona obtenga los mismos productos aunque sus ZIP
    tengan otra fecha de modificación: la fecha decide qué fechas son implausibles y la ventana.
    """
    try:
        with open(os.path.join(output_dir, 'fuentes.json'), encoding='utf-8') as handle:
            value = json.load(handle).get('fechaReferencia')
    except (OSError, ValueError, AttributeError):
        return None
    return value if isinstance(value, str) and parse_date(value) == value else None


def _reference_date(paths: list[str]) -> str:
    """Fecha de descarga: la modificación más reciente de los ZIP (determinista para los mismos archivos)."""
    newest = max(os.path.getmtime(path) for path in paths)
    return datetime.date.fromtimestamp(newest).isoformat()


def run(options: Options) -> dict[str, object]:
    started = time.monotonic()
    log = _logger(options.quiet)
    timings: dict[str, float] = {}
    paths = {system: os.path.join(options.input_dir, info['archivo']) for system, info in SOURCES.items()}
    missing = [path for path in paths.values() if not os.path.exists(path)]
    if missing:
        raise FileNotFoundError('Faltan descargas: ' + ', '.join(missing))
    private_dir = check_private_dir(options.private_dir) if options.private_dir else None
    reference = options.reference or published_reference(options.output_dir) or _reference_date(list(paths.values()))
    salt = os.urandom(16)
    scratch = tempfile.mkdtemp(prefix='sigilo-pdn-')
    s6_database = os.path.join(private_dir or scratch, 's6_apf.sqlite')
    try:
        s1_providers = s1.list_providers(paths['S1'])
        s6_members = s6.list_members(paths['S6'])
        log(f'Fecha de referencia {reference}; {len(s1_providers)} proveedores de S1; {options.processes} procesos')
        with ProcessPoolExecutor(max_workers=options.processes) as pool:
            apf = pool.submit(
                s6.process_member,
                paths['S6'],
                s6.APF_MEMBER,
                reference,
                s6_database if s6.APF_MEMBER in s6_members else None,
            )
            s1_jobs = [
                pool.submit(s1.process_provider, paths['S1'], provider, members, salt, reference)
                for provider, members in sorted(s1_providers.items(), key=lambda item: -len(item[1]))
            ]
            s2_job = pool.submit(s2.process, paths['S2'], reference)
            s3_job = pool.submit(s3.process, paths['S3'], reference, private_dir)
            s6_jobs = [
                pool.submit(s6.process_member, paths['S6'], member, reference, None)
                for member in s6_members
                if member != s6.APF_MEMBER
            ]
            sha_jobs = (
                {system: pool.submit(sha256_file, path) for system, path in paths.items()}
                if options.verify_sha
                else {}
            )
            s1_results = [job.result() for job in s1_jobs]
            for result in s1_results:
                log(f'  S1 {result.provider}: {result.declarations} declaraciones, {result.seconds} s')
            s2_result = s2_job.result()
            s3_result = s3_job.result()
            s6_results = [job.result() for job in s6_jobs]
            apf_result = apf.result()
            log(f'  S6 APF: {apf_result.releases} releases, {apf_result.seconds} s')
            sha = {system: job.result() for system, job in sha_jobs.items()}
        timings['lectura_paralela_s'] = round(time.monotonic() - started, 1)
        timings['s1_max_proveedor_s'] = max(result.seconds for result in s1_results)
        timings['s1_suma_proveedores_s'] = round(sum(result.seconds for result in s1_results), 1)
        timings['s2_s'] = s2_result.seconds
        timings['s3_s'] = s3_result.seconds
        timings['s6_apf_s'] = apf_result.seconds

        assemble_started = time.monotonic()
        report = assemble(options.output_dir, s1_results, s2_result, s3_result, [apf_result, *s6_results], s6_database)
        timings['productos_s'] = round(time.monotonic() - assemble_started, 1)
        write_sources(options.output_dir, paths, sha, reference, options.expected_sha)
        report['sha256'] = sha
        report['shaCoincide'] = {system: sha[system] == options.expected_sha.get(system) for system in sha}
        report['privado'] = (
            {
                's3': os.path.join(private_dir, 's3.sqlite'),
                's6': s6_database,
                's6_releases_apf': apf_result.releases,
                's6_ocid_distintos': apf_result.distinct_ocid,
                's6_subconjunto_2018_2022': apf_result.subset_rows,
            }
            if private_dir
            else None
        )
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    timings['total_s'] = round(time.monotonic() - started, 1)
    report['tiempos'] = timings
    return report


def assemble(
    output_dir: str,
    s1_results: list[s1.S1ProviderResult],
    s2_result: s2.S2Result,
    s3_result: s3.S3Result,
    s6_results: list[s6.S6Result],
    s6_database: str,
) -> dict[str, object]:
    tally = Tally()
    for partial in [*(result.tally for result in s1_results), s2_result.tally, s3_result.tally]:
        tally.merge(partial)
    for result in s6_results:
        tally.merge(result.tally)

    # Catálogo de entes de S1 (todas las fechas) por entidad, para las equivalencias.
    s1_keys: dict[str, set[str]] = {}
    s1_display: dict[tuple[str, str], str] = {}
    s1_weight: dict[tuple[str, str], int] = {}
    for result in s1_results:
        keys = s1_keys.setdefault(result.state, set())
        for ente, display in result.ente_display.items():
            keys.add(ente)
            weight = result.ente_declarations.get(ente, 0)
            if weight > s1_weight.get((result.state, ente), -1):
                s1_weight[(result.state, ente)] = weight
                s1_display[(result.state, ente)] = display
    catalogs = matching.build_catalogs(s1_keys)

    sources: dict[str, dict[tuple[str, str], tuple[Counter[str], int]]] = {'S2': {}, 'S3S': {}, 'S3P': {}, 'S6': {}}
    for (state, key), institution in s2_result.institutions.items():
        sources['S2'][(state, key)] = (institution.display, institution.records)
    for (system, state, key), names in s3_result.institutions.items():
        sources[system][(state, key)] = (names, sum(names.values()))

    by_buyer: list[dict[str, object]] = []
    by_year: list[dict[str, object]] = []
    if os.path.exists(s6_database):
        by_buyer, by_year = products.contract_indicators(s6_database)
    buyer_keys: dict[str, str] = {}
    for row in by_buyer:
        key = institution_name_key(str(row['comprador']), FEDERAL)
        buyer_keys[str(row['comprador_id'])] = key
        names, records = sources['S6'].get((FEDERAL, key), (Counter(), 0))
        names[str(row['comprador'])] += int(str(row['procedimientos']))
        sources['S6'][(FEDERAL, key)] = (names, records + int(str(row['procedimientos'])))

    matches = {system: matching.match_all(catalogs, list(items)) for system, items in sources.items()}
    names = anonymity.build_name_filter(s1_results)
    rates = products.write_equivalences(
        output_dir,
        sources,
        matches,
        s1_display,
        set(s1_keys),
        names.allows_institution,
    )

    # S2 -> S1: marca entes y áreas que intervienen en contrataciones.
    s2_links: dict[tuple[str, str], tuple[str, set[str]]] = {}
    for (state, key), institution in s2_result.institutions.items():
        match = matches['S2'][(state, key)]
        if not match.target:
            continue
        roles, units = s2_links.get((state, match.target), ('', set()))
        units = units | set(institution.units)
        s2_links[(state, match.target)] = (''.join(sorted(set(roles) | institution.roles)), units)

    states = anonymity.merge_providers(s1_results)
    anonymity.mark_contracting(states, s2_links)
    groups = products.write_anonymity(output_dir, states, names)
    del names

    coverage_rows = products.write_coverage(output_dir, tally, s3_result.completeness)

    s2_federal_targets = {match.target for (state, _), match in matches['S2'].items() if state == FEDERAL and match.target}
    links: dict[str, tuple[str, bool, bool]] = {}
    for buyer, key in buyer_keys.items():
        match = matches['S6'][(FEDERAL, key)]
        links[buyer] = (f'{FEDERAL}|{match.target or key}', bool(match.target), bool(match.target and match.target in s2_federal_targets))
    products.write_contract_indicators(output_dir, by_buyer, by_year, links)

    return {
        's1': {
            'declaraciones': sum(result.declarations for result in s1_results),
            'erroresJson': sum(result.json_errors for result in s1_results),
            'personasUltimaDeclaracion': sum(result.persons_total for result in s1_results),
            'personasEnVentana': sum(result.persons_window for result in s1_results),
            'excluidasPorConclusion': sum(result.excluded_conclusion for result in s1_results),
            'sinNombre': sum(result.without_name for result in s1_results),
        },
        's2': {'instituciones': len(s2_result.institutions), 'proveedores': s2_result.providers},
        's3': {'registros': s3_result.records, 'erroresJson': s3_result.json_errors},
        's6': {result.member: result.releases for result in s6_results},
        'gruposAnonimato': groups,
        'equivalencias': rates,
        'cobertura': {'filas': len(coverage_rows)},
        'contratacion': {'compradores': len(by_buyer)},
    }


def write_sources(
    output_dir: str,
    paths: dict[str, str],
    sha: dict[str, str],
    reference: str,
    expected: dict[str, str],
) -> None:
    """Manifiesto de fuentes: archivo, URL, tamaño, fecha de descarga y sha256 contra el inventario."""
    entries = []
    for system, info in SOURCES.items():
        path = paths[system]
        entries.append(
            {
                'sistema': system,
                'archivo': info['archivo'],
                'url': info['url'],
                'bytes': os.path.getsize(path),
                'fechaDescarga': datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat(),
                'sha256Inventario': expected.get(system),
                'sha256Calculado': sha.get(system),
                'coincide': sha.get(system) == expected.get(system) if system in sha else None,
            }
        )
    write_json(os.path.join(output_dir, 'fuentes.json'), {'fechaReferencia': reference, 'fuentes': entries})

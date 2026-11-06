# Normalización determinista de nombres de institución y de área, y filtros de nombres de persona.
# La clave de institución siempre incluye la entidad: "Secretaría de Turismo" existe en muchos estados.
import re
import unicodedata

from .entities import FEDERAL, STATE_SUFFIXES

STOPWORDS = frozenset({'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'EN', 'PARA', 'A', 'AL'})

# Abreviaturas frecuentes en S1, S2 y S3 (inventario, sección 8.2).
ABBREVIATIONS = {
    'INST': 'INSTITUTO',
    'SERVS': 'SERVICIOS',
    'SERV': 'SERVICIOS',
    'SRIA': 'SECRETARIA',
    'SECR': 'SECRETARIA',
    'DIR': 'DIRECCION',
    'DIRECC': 'DIRECCION',
    'SUBDIR': 'SUBDIRECCION',
    'GRAL': 'GENERAL',
    'DEPTO': 'DEPARTAMENTO',
    'DPTO': 'DEPARTAMENTO',
    'COORD': 'COORDINACION',
    'ADMON': 'ADMINISTRACION',
    'ADMVA': 'ADMINISTRATIVA',
    'ADMIVA': 'ADMINISTRATIVA',
    'MPAL': 'MUNICIPAL',
    'NAL': 'NACIONAL',
    'EDO': 'ESTADO',
    'GOB': 'GOBIERNO',
    'UNIV': 'UNIVERSIDAD',
    'SIST': 'SISTEMA',
    'UNID': 'UNIDAD',
    'OFNA': 'OFICINA',
    'JUR': 'JURIDICO',
}

# Caracteres que str.strip() de Python y String.trim() de JavaScript tratan distinto (U+FEFF solo
# lo quita JavaScript; U+001C a U+001F y U+0085 solo Python). Se cambian por espacio antes de
# recortar para que la clave sea idéntica en ambos lenguajes (packages/anonimato/src/normalize.ts).
_EDGE_DIFFERENCES = str.maketrans({char: ' ' for char in '\ufeff\x1c\x1d\x1e\x1f\x85'})


def clean_edges(raw: str) -> str:
    """Recorta espacios con el mismo resultado que String.trim() de JavaScript."""
    return (raw or '').translate(_EDGE_DIFFERENCES).strip()


# Sufijos que algunos proveedores agregan al nombre: " - ecatepec", " S1".
_SYSTEM_SUFFIX = re.compile(r'\s+-\s+[a-z0-9_]+$')
_SYSTEM_TAGS = frozenset({'S1', 'S2', 'S3', 'S6'})

# Prefijos que designan al gobierno municipal; se unifican como "MUNICIPIO".
_MUNICIPAL_PREFIXES: tuple[tuple[str, ...], ...] = (
    ('AYUNTAMIENTO', 'CONSTITUCIONAL'),
    ('AYUNTAMIENTO', 'MUNICIPAL'),
    ('AYUNTAMIENTO',),
    ('GOBIERNO', 'MUNICIPAL'),
    ('PRESIDENCIA', 'MUNICIPAL'),
    ('MUNICIPIO', 'LIBRE'),
    ('MUNICIPIO',),
)

# Tratamientos que suelen anteceder al nombre de una persona titular ("Ponencia del Magistrado ...").
# Un área o ente que los contiene no se publica por nombre y se generaliza al nivel superior.
# "C." (ciudadano) no se incluye: choca con "S.A. de C.V."; los nombres los detecta el léxico.
HONORIFICS = frozenset(
    {
        'LIC',
        'LICENCIADO',
        'LICENCIADA',
        'ING',
        'DR',
        'DRA',
        'MTRO',
        'MTRA',
        'PROFR',
        'PROFRA',
        'ARQ',
        'MAGISTRADO',
        'MAGISTRADA',
        'PONENCIA',
        'DIPUTADO',
        'DIPUTADA',
        'REGIDOR',
        'REGIDORA',
        'SINDICO',
        'SINDICA',
        'CONSEJERO',
        'CONSEJERA',
        'COMISIONADO',
        'COMISIONADA',
        'SENADOR',
        'SENADORA',
    }
)


def text_key(text: str) -> str:
    """Quita acentos y signos, pasa a mayúsculas y elimina palabras vacías."""
    plain = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode().upper()
    plain = re.sub(r'[^A-Z0-9 ]', ' ', plain)
    return ' '.join(token for token in plain.split() if token not in STOPWORDS)


def _expand(tokens: list[str]) -> list[str]:
    return [ABBREVIATIONS.get(token, token) for token in tokens]


def _strip_state_suffix(tokens: list[str], state: str) -> list[str]:
    suffixes = [suffix.split() for suffix in STATE_SUFFIXES.get(state, ())]
    changed = True
    while changed:
        changed = False
        for suffix in suffixes:
            size = len(suffix)
            if len(tokens) <= size or tokens[-size:] != suffix:
                continue
            head = tokens[:-size]
            # "MUNICIPIO AGUASCALIENTES" es el municipio homónimo de la capital: se conserva.
            if head and head[-1] in ('MUNICIPIO', 'AYUNTAMIENTO'):
                continue
            while head and head[-1] in ('ESTADO', 'GOBIERNO', 'LIBRE', 'SOBERANO'):
                head = head[:-1]
            if head:
                tokens = head
                changed = True
                break
    return tokens


def institution_name_key(raw: str, state: str) -> str:
    """Normaliza el nombre de una institución dentro de su entidad (sin la clave de entidad).

    Pasos: quitar sufijos de sistema, acentos, signos y palabras vacías; expandir abreviaturas;
    quitar "H."/"HONORABLE"; unificar el gobierno municipal como "MUNICIPIO <nombre>"; quitar el
    nombre de la propia entidad al final ("... DEL ESTADO DE PUEBLA"). Si el resultado queda vacío,
    devuelve la forma básica para no perder el ente.
    """
    cleaned = _SYSTEM_SUFFIX.sub('', clean_edges(raw)).replace('*', ' ')
    basic = text_key(cleaned)
    tokens = _expand(basic.split())
    while tokens and tokens[-1] in _SYSTEM_TAGS:
        tokens = tokens[:-1]
    while tokens and tokens[0] in ('H', 'HONORABLE'):
        tokens = tokens[1:]
    for prefix in _MUNICIPAL_PREFIXES:
        size = len(prefix)
        if tuple(tokens[:size]) == prefix and len(tokens) > size:
            tokens = ['MUNICIPIO', *tokens[size:]]
            break
    if state != FEDERAL:
        tokens = _strip_state_suffix(tokens, state)
    return ' '.join(tokens) or basic


def institution_key(raw: str, state: str) -> str:
    """Clave completa de institución: '<clave INEGI>|<nombre normalizado>'."""
    return f'{state}|{institution_name_key(raw, state)}'


def area_key(raw: str) -> str:
    """Normaliza un área de adscripción o un puesto que nombra a una unidad.

    Quita códigos de plaza al inicio ("070 ATENCION CIUDADANA") y expande abreviaturas. No trunca
    ni agrupa áreas parecidas: unir áreas distintas inflaría k y daría una falsa sensación de
    protección; preferimos subestimar el tamaño del grupo.
    """
    cleaned = _SYSTEM_SUFFIX.sub('', clean_edges(raw))
    tokens = text_key(cleaned).split()
    while tokens and any(char.isdigit() for char in tokens[0]):
        tokens = tokens[1:]
    return ' '.join(_expand(tokens))


def has_honorific(key: str) -> bool:
    """Indica si una clave normalizada contiene un tratamiento que suele preceder a un nombre propio."""
    return any(token in HONORIFICS for token in key.split())


def looks_like_person_name(key: str, given_names: frozenset[str], surnames: frozenset[str]) -> bool:
    """Detecta un patrón "nombre de pila + apellido" dentro de una clave normalizada.

    Los léxicos se construyen en memoria a partir de S1 y nunca se guardan. Es conservador: puede
    marcar escuelas con nombre de personajes históricos; esas áreas solo se generalizan al ente.
    """
    tokens = key.split()
    return any(
        tokens[index] in given_names and tokens[index + 1] in surnames
        for index in range(len(tokens) - 1)
    )


def is_only_person_name(key: str, given_names: frozenset[str], surnames: frozenset[str]) -> bool:
    """Detecta claves formadas solo por nombres de pila y apellidos ("LUIS PEREZ LOPEZ").

    Ocurre cuando alguien captura su propio nombre en el campo del ente. Se aplica a entes y áreas;
    no marca "MUNICIPIO BENITO JUAREZ" porque MUNICIPIO no es nombre ni apellido.
    """
    tokens = key.split()
    if len(tokens) < 2 or not all(token in given_names or token in surnames for token in tokens):
        return False
    only_given = all(token in given_names for token in tokens)
    return only_given or looks_like_person_name(key, given_names, surnames)


# Teléfono: 7 o más dígitos aun separados por espacios, puntos, guiones o paréntesis. Correo: una
# arroba entre texto y un dominio. Una marca institucional como "@prende.mx" (sin usuario) no es correo.
_CONTACT = re.compile(r'(?:\d[\s.\-()]*){7,}|[\w.+-]+@[\w-]+\.\w')
# Los periodos de gobierno ("2024-2027") no son teléfonos.
_YEAR_RANGE = re.compile(r'\b(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2}\b')


def has_contact_data(raw: str) -> bool:
    """Detecta teléfonos (7 o más dígitos, aun separados por espacios o guiones) y correos.

    Seguridad: en S1 hay entes capturados con un número telefónico; esos nombres no se publican.
    """
    return bool(_CONTACT.search(_YEAR_RANGE.sub(' ', raw or '')))


# Abreviaturas de nombres de pila que el léxico no capta por su longitud ("MA" de María).
NAME_ABBREVIATIONS = frozenset({'MA', 'FCO', 'FCA', 'GPE', 'JSE', 'FDO', 'GMO'})

# Palabras que indican una institución, un lugar o una unidad. Una clave corta que empieza con un
# nombre de pila y no trae ninguna de estas palabras se trata como nombre de persona.
INSTITUTIONAL_WORDS = frozenset(
    """
    MUNICIPIO AYUNTAMIENTO MUNICIPAL ESCUELA PRIMARIA SECUNDARIA TELESECUNDARIA PREESCOLAR JARDIN NINOS
    COLEGIO INSTITUTO UNIVERSIDAD BACHILLERATO PREPARATORIA PLANTEL NORMAL TECNOLOGICO CONALEP CECYTE
    CBTIS CBTA CETIS DGETI HOSPITAL CLINICA CENTRO SALUD CASA JUNTA AUXILIAR PRESIDENCIA SECRETARIA
    SUBSECRETARIA DIRECCION SUBDIRECCION UNIDAD COORDINACION DEPARTAMENTO OFICINA SISTEMA ORGANISMO
    BIBLIOTECA GENERAL COMISION TRIBUNAL JUZGADO SALA CONSEJO REGIDURIA SINDICATURA INSPECTORIA AGENCIA
    COMITE ZONA SUPERVISION JEFATURA AREA MODULO ESTANCIA ALBERGUE PARQUE MUSEO TEATRO DELEGACION
    REGIONAL FISCALIA AUDITORIA PODER CONGRESO GOBIERNO ESTADO ESTATAL FEDERAL NACIONAL DIF SAN SANTA
    SANTO VILLA CIUDAD PUEBLO COLONIA BARRIO RANCHO EJIDO LOCALIDAD COMUNIDAD SERVICIOS SERVICIO
    PROGRAMA FIDEICOMISO EMPRESA SOCIEDAD ASOCIACION SINDICATO CANAL RADIO TELEVISION SEGURIDAD POLICIA
    PROTECCION TESORERIA CONTRALORIA ORGANO INTERNO CONTROL ADMINISTRACION FINANZAS OBRAS AGUA
    POTABLE ALCANTARILLADO SANEAMIENTO OPERADOR COMISARIA SINDICO PROCURADURIA DEFENSORIA REGISTRO
    ARCHIVO ACADEMIA CENTRAL HOGAR GUARDERIA INTERNADO CAPILLA MERCADO PANTEON RASTRO DEPORTIVO
    PEMEX DESARROLLO INTEGRAL FAMILIA AEROPUERTO CORPORACION FOMENTO BOSQUE BANCO FINANCIERA LOTERIA
    TRANSPORTE ESTUDIOS EXPLORACION PRODUCCION LOGISTICA INDUSTRIAL INTERNACIONAL METROPOLITANO
    """.split()
)

_LEXICON_MIN_LENGTH = 3


def starts_like_person_name(key: str, given_names: frozenset[str], surnames: frozenset[str]) -> bool:
    """Clave de 2 a 5 palabras que empieza con un nombre de pila, trae algún apellido y ninguna
    palabra institucional ("MA GUADALUPE APELLIDO", "LUIS APELLIDORARO APELLIDO")."""
    tokens = key.split()
    if not 2 <= len(tokens) <= 5 or tokens[0] not in given_names:
        return False
    if any(token in INSTITUTIONAL_WORDS for token in tokens):
        return False
    return any(token in surnames for token in tokens[1:])


def lexicon(counts: dict[str, int], min_count: int, abbreviations: frozenset[str] = frozenset()) -> frozenset[str]:
    """Tokens con al menos min_count apariciones (y 3 letras), más abreviaturas conocidas."""
    frequent = {token for token, count in counts.items() if count >= min_count and len(token) >= _LEXICON_MIN_LENGTH}
    return frozenset(frequent | abbreviations)


class NameFilter:
    """Decide si un nombre de ente, área o institución se puede publicar.

    Seguridad: rechaza tratamientos ("Lic.", "Magistrado"), datos de contacto, claves formadas solo
    por nombres, claves cortas que empiezan con un nombre de pila sin palabra institucional (léxico
    amplio) y el patrón nombre de pila + apellido (léxico estricto). En las áreas ese patrón se
    rechaza siempre; en los entes (instituciones) solo si no hay palabra institucional, porque
    los institutos nacionales o "Municipio de Benito Juárez" suelen llevar el nombre de un
    personaje y aplicar la regla sin excepción sacaba del catálogo a 256 000 personas (IMSS incluido).
    Los léxicos se construyen en memoria desde S1 y nunca se guardan.
    """

    def __init__(
        self,
        given: frozenset[str],
        surnames: frozenset[str],
        given_broad: frozenset[str] | None = None,
        surnames_broad: frozenset[str] | None = None,
    ) -> None:
        self.given = given
        self.surnames = surnames
        self.given_broad = given_broad if given_broad is not None else given
        self.surnames_broad = surnames_broad if surnames_broad is not None else surnames

    def allows(self, key: str, raw: str = '') -> bool:
        """Nombre de área: el patrón nombre + apellido se rechaza siempre."""
        return self._allows_common(key, raw) and not looks_like_person_name(key, self.given, self.surnames)

    def allows_institution(self, key: str, raw: str = '') -> bool:
        """Nombre de ente o institución: el patrón nombre + apellido se rechaza sin palabra institucional."""
        if not self._allows_common(key, raw):
            return False
        institutional = any(token in INSTITUTIONAL_WORDS for token in key.split())
        return institutional or not looks_like_person_name(key, self.given, self.surnames)

    def _allows_common(self, key: str, raw: str) -> bool:
        return (
            bool(key)
            and not has_honorific(key)
            and not has_contact_data(raw or key)
            and not is_only_person_name(key, self.given, self.surnames)
            and not starts_like_person_name(key, self.given_broad, self.surnames_broad)
        )


def person_name_key(*parts: str) -> str:
    """Forma canónica del nombre completo de una persona para contarla con un hash efímero."""
    return '|'.join(text_key(part) for part in parts)

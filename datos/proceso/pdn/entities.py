# Catálogo de entidades federativas (claves INEGI, información pública) y resolución de carpetas de proveedor.
# La clave '00' agrupa lo federal: Administración Pública Federal y órganos autónomos nacionales.
import unicodedata

FEDERAL = '00'

# Clave INEGI, nombre oficial, nombres alternos normalizados que aparecen al final de los nombres de
# entes y abreviaturas usuales. Las abreviaturas solo se quitan en entes de su propia entidad.
STATES: tuple[tuple[str, str, tuple[str, ...], tuple[str, ...]], ...] = (
    ('00', 'Federación', (), ()),
    ('01', 'Aguascalientes', ('AGUASCALIENTES',), ('AGS',)),
    ('02', 'Baja California', ('BAJA CALIFORNIA',), ('BC',)),
    ('03', 'Baja California Sur', ('BAJA CALIFORNIA SUR',), ('BCS',)),
    ('04', 'Campeche', ('CAMPECHE',), ('CAMP',)),
    ('05', 'Coahuila de Zaragoza', ('COAHUILA ZARAGOZA', 'COAHUILA'), ('COAH',)),
    ('06', 'Colima', ('COLIMA',), ('COL',)),
    ('07', 'Chiapas', ('CHIAPAS',), ('CHIS',)),
    ('08', 'Chihuahua', ('CHIHUAHUA',), ('CHIH',)),
    ('09', 'Ciudad de México', ('CIUDAD MEXICO',), ('CDMX',)),
    ('10', 'Durango', ('DURANGO',), ('DGO',)),
    ('11', 'Guanajuato', ('GUANAJUATO',), ('GTO',)),
    ('12', 'Guerrero', ('GUERRERO',), ('GRO',)),
    ('13', 'Hidalgo', ('HIDALGO',), ('HGO',)),
    ('14', 'Jalisco', ('JALISCO',), ('JAL',)),
    ('15', 'México', ('MEXICO',), ('MEX', 'EDOMEX')),
    ('16', 'Michoacán de Ocampo', ('MICHOACAN OCAMPO', 'MICHOACAN'), ('MICH',)),
    ('17', 'Morelos', ('MORELOS',), ('MOR',)),
    ('18', 'Nayarit', ('NAYARIT',), ('NAY',)),
    ('19', 'Nuevo León', ('NUEVO LEON',), ('NL',)),
    ('20', 'Oaxaca', ('OAXACA',), ('OAX',)),
    ('21', 'Puebla', ('PUEBLA',), ('PUE',)),
    ('22', 'Querétaro', ('QUERETARO ARTEAGA', 'QUERETARO'), ('QRO',)),
    ('23', 'Quintana Roo', ('QUINTANA ROO',), ('QROO', 'Q ROO')),
    ('24', 'San Luis Potosí', ('SAN LUIS POTOSI',), ('SLP',)),
    ('25', 'Sinaloa', ('SINALOA',), ()),
    ('26', 'Sonora', ('SONORA',), ('SON',)),
    ('27', 'Tabasco', ('TABASCO',), ('TAB',)),
    ('28', 'Tamaulipas', ('TAMAULIPAS',), ('TAMPS',)),
    ('29', 'Tlaxcala', ('TLAXCALA',), ('TLAX',)),
    ('30', 'Veracruz de Ignacio de la Llave', ('VERACRUZ IGNACIO LLAVE', 'VERACRUZ'), ('VER',)),
    ('31', 'Yucatán', ('YUCATAN',), ('YUC',)),
    ('32', 'Zacatecas', ('ZACATECAS',), ('ZAC',)),
)

STATE_NAMES: dict[str, str] = {code: name for code, name, _, _ in STATES}
STATE_SUFFIXES: dict[str, tuple[str, ...]] = {
    code: tuple(sorted(names + abbreviations, key=lambda text: -len(text.split())))
    for code, _, names, abbreviations in STATES
}

# Carpetas o archivos de proveedor que no son una entidad federativa: van a la clave federal.
_FEDERAL_PROVIDERS = {'SFP', 'SABG', 'BANXICO', 'CNDH', 'INEGI', 'COFECE', 'APF', 'INAI', 'INE'}

# Nombres de carpeta que no se deducen del nombre oficial.
_FOLDER_ALIASES = {
    'BCS': '03',
    'BAJACALIFORNIASUR': '03',
    'BAJACALIFORNIA': '02',
    'EDOMEX': '15',
    'MEXICO': '15',
    'SLP': '24',
    'SANLUISPOTOSI': '24',
    'QUINTANAROO': '23',
    'NUEVOLEON': '19',
    'CDMX': '09',
}


def _compact(text: str) -> str:
    plain = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().upper()
    return ''.join(char for char in plain if char.isalnum())


_BY_COMPACT_NAME: dict[str, str] = {}
for _code, _name, _names, _ in STATES:
    _BY_COMPACT_NAME[_compact(_name)] = _code
    for _alias in _names:
        _BY_COMPACT_NAME[_compact(_alias)] = _code


def resolve_provider_state(provider: str) -> str | None:
    """Devuelve la clave INEGI de la carpeta o archivo de un proveedor ('00' si es federal).

    Acepta variantes como 'Quintana_Roo', 'quintanaroo', 'Michoacán' o 'BajaCaliforniaSur'.
    Devuelve None si no se reconoce, para que el llamador lo registre como error de calidad.
    """
    compact = _compact(provider.replace('_releases.json', ''))
    if compact in _FEDERAL_PROVIDERS:
        return FEDERAL
    if compact in _FOLDER_ALIASES:
        return _FOLDER_ALIASES[compact]
    return _BY_COMPACT_NAME.get(compact)


def resolve_state_value(value: str) -> str | None:
    """Interpreta una entidad federativa escrita como clave INEGI ('15', '7') o como nombre."""
    text = value.strip()
    if not text:
        return None
    if text.isdigit():
        code = text.zfill(2)
        return code if code in STATE_NAMES and code != FEDERAL else None
    return resolve_provider_state(text)

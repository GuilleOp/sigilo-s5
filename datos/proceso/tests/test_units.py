# Pruebas unitarias de normalización, fechas, cubetas, lectura en streaming y equivalencias.
import io
import json
import unittest

from pdn.common import bucket_index, bucket_label, is_plausible, months_before, parse_date
from pdn.entities import resolve_provider_state, resolve_state_value
from pdn.json_stream import iter_array
from pdn.matching import Catalog
from pdn.normalize import (
    NameFilter,
    area_key,
    has_contact_data,
    has_honorific,
    institution_key,
    institution_name_key,
    is_only_person_name,
    looks_like_person_name,
    text_key,
)
from pdn.s2 import normalize_roles
from pdn.s3 import sanction_key


class NormalizeTest(unittest.TestCase):
    def test_text_key_quita_acentos_signos_y_palabras_vacias(self) -> None:
        self.assertEqual(text_key('Secretaría de Turismo*'), 'SECRETARIA TURISMO')

    def test_la_clave_de_institucion_incluye_la_entidad(self) -> None:
        self.assertEqual(institution_key('Secretaría de Turismo', '14'), '14|SECRETARIA TURISMO')
        self.assertNotEqual(institution_key('Secretaría de Turismo', '14'), institution_key('Secretaría de Turismo', '21'))

    def test_quita_el_nombre_de_la_propia_entidad(self) -> None:
        self.assertEqual(institution_name_key('Poder Judicial del Estado de Puebla', '21'), 'PODER JUDICIAL')
        self.assertEqual(
            institution_name_key('INST SERVS SALUD ESTADO AGUASCALIENTES GOBIERNO DEL ESTADO DE AGUASCALIENTES', '01'),
            'INSTITUTO SERVICIOS SALUD',
        )
        # El nombre de otra entidad no se quita.
        self.assertEqual(institution_name_key('Universidad de Puebla', '14'), 'UNIVERSIDAD PUEBLA')

    def test_conserva_el_municipio_homonimo_de_la_capital(self) -> None:
        self.assertEqual(institution_name_key('Municipio de Aguascalientes', '01'), 'MUNICIPIO AGUASCALIENTES')

    def test_unifica_el_gobierno_municipal(self) -> None:
        for raw in ('H. Ayuntamiento de Villa Ejemplo', 'Honorable Ayuntamiento Municipal de Villa Ejemplo, Chiapas', 'Gobierno Municipal de Villa Ejemplo'):
            self.assertEqual(institution_name_key(raw, '07'), 'MUNICIPIO VILLA EJEMPLO', raw)

    def test_quita_sufijos_de_sistema(self) -> None:
        self.assertEqual(institution_name_key('Villa Ejemplo - villaejemplo', '15'), 'VILLA EJEMPLO')
        self.assertEqual(institution_name_key('Instituto Electoral del Estado de México S1', '15'), 'INSTITUTO ELECTORAL')

    def test_area_quita_codigos_y_expande_abreviaturas(self) -> None:
        self.assertEqual(area_key('070 Dir. de Recursos Materiales'), 'DIRECCION RECURSOS MATERIALES')
        self.assertEqual(area_key('Depto. Compras'), 'DEPARTAMENTO COMPRAS')
        self.assertEqual(area_key('1015'), '')

    def test_area_no_agrupa_areas_parecidas(self) -> None:
        self.assertNotEqual(area_key('Dirección de Recursos Materiales'), area_key('Dirección de Recursos Materiales y Servicios'))

    def test_detecta_tratamientos_y_nombres(self) -> None:
        self.assertTrue(has_honorific(area_key('Ponencia del Magistrado Ficticio')))
        self.assertTrue(has_honorific(area_key('Oficina del C. Regidor')))
        self.assertFalse(has_honorific(area_key('Dirección de Compras')))
        given, surnames = frozenset({'PERSONA'}), frozenset({'FICTICIA'})
        self.assertTrue(looks_like_person_name('OFICINA PERSONA FICTICIA', given, surnames))
        self.assertFalse(looks_like_person_name('OFICINA FICTICIA PERSONA', given, surnames))

    def test_filtro_de_nombres_para_entes_y_areas(self) -> None:
        # Léxicos SINTÉTICOS: el amplio incluye nombres poco frecuentes que el estricto no tiene.
        names = NameFilter(
            given=frozenset({'PERSONA', 'MA'}),
            surnames=frozenset({'FICTICIA'}),
            given_broad=frozenset({'PERSONA', 'MA', 'RARONOMBRE'}),
            surnames_broad=frozenset({'FICTICIA', 'RAROAPELLIDO'}),
        )
        blocked_everywhere = (
            'MA RAROAPELLIDO FICTICIA',  # abreviatura de dos letras más apellidos
            'PERSONA FICTICIA RAROAPELLIDO',  # nombre y apellido contiguos aunque el último sea raro
            'RARONOMBRE RAROAPELLIDO',  # nombre y apellido poco frecuentes
            'LIC RAROAPELLIDO',
        )
        for key in blocked_everywhere:
            self.assertFalse(names.allows(key), key)
            self.assertFalse(names.allows_institution(key), key)
        # En un área, nombre y apellido se rechazan siempre; en un ente con palabra institucional,
        # el nombre de un personaje se conserva («Escuela Benito Juárez»).
        self.assertFalse(names.allows('OFICINA PERSONA FICTICIA'))
        self.assertTrue(names.allows_institution('ESCUELA PERSONA FICTICIA'))
        self.assertTrue(names.allows_institution('MUNICIPIO PERSONA FICTICIA'))
        for key in ('MUNICIPIO RARONOMBRE RAROAPELLIDO', 'DIRECCION COMPRAS', 'SECRETARIA OBRAS VILLA EJEMPLO'):
            self.assertTrue(names.allows(key), key)
        self.assertFalse(names.allows('OFICINA', 'Oficina 55 0000 0001'))
        self.assertFalse(names.allows(''))

    def test_detecta_datos_de_contacto(self) -> None:
        self.assertTrue(has_contact_data('Ayuntamiento de Villa Ejemplo 2024-2027 55 0000 0001'))
        self.assertTrue(has_contact_data('5500000001'))
        self.assertTrue(has_contact_data('nadie@example.org'))
        # Una marca institucional con arroba y sin usuario no es un correo.
        self.assertFalse(has_contact_data('Coordinación Ficticia @prende.mx'))
        self.assertFalse(has_contact_data('Ayuntamiento de Villa Ejemplo 2024-2027'))
        self.assertFalse(has_contact_data('23DPR0587Y Escuela Ficticia'))

    def test_detecta_entes_capturados_con_nombre_de_persona(self) -> None:
        given, surnames = frozenset({'PERSONA', 'BENITO'}), frozenset({'FICTICIA', 'EJEMPLO', 'JUAREZ'})
        self.assertTrue(is_only_person_name('PERSONA FICTICIA EJEMPLO', given, surnames))
        self.assertFalse(is_only_person_name('MUNICIPIO BENITO JUAREZ', given, surnames))
        self.assertFalse(is_only_person_name('FICTICIA', given, surnames))
        self.assertTrue(is_only_person_name('PERSONA BENITO', given, surnames), 'solo nombres de pila')


class EntitiesTest(unittest.TestCase):
    def test_resuelve_carpetas_de_proveedor(self) -> None:
        cases = {
            'Quintana_Roo': '23',
            'quintanaroo': '23',
            'Michoacán': '16',
            'BajaCaliforniaSur': '03',
            'BajaCalifornia': '02',
            'EdoMex': '15',
            'Mexico': '15',
            'slp': '24',
            'SABG': '00',
            'SFP': '00',
            'nuevo_leon_releases.json': '19',
            'apf': '00',
        }
        for folder, code in cases.items():
            self.assertEqual(resolve_provider_state(folder), code, folder)
        self.assertIsNone(resolve_provider_state('Atlantida'))

    def test_resuelve_valores_de_entidad(self) -> None:
        self.assertEqual(resolve_state_value('7'), '07')
        self.assertEqual(resolve_state_value('Sinaloa'), '25')
        self.assertIsNone(resolve_state_value(''))


class CommonTest(unittest.TestCase):
    def test_cubetas(self) -> None:
        self.assertEqual([bucket_index(value) for value in (0, 1, 4, 5, 9, 10, 49, 50)], [None, 0, 0, 1, 1, 2, 2, 3])
        self.assertEqual(bucket_label(12), '10-49')

    def test_fechas(self) -> None:
        self.assertEqual(parse_date('2024-02-15T10:00:00Z'), '2024-02-15')
        self.assertEqual(parse_date('2025/01/31'), '2025-01-31')
        self.assertEqual(parse_date('31/01/2025'), '2025-01-31')
        self.assertIsNone(parse_date('22-0'))
        self.assertIsNone(parse_date('2024-02-30'))
        self.assertFalse(is_plausible('1900-01-01', '2026-11-05'))
        self.assertFalse(is_plausible('2027-01-01', '2026-11-05'))
        self.assertTrue(is_plausible('2026-01-01', '2026-11-05'))

    def test_meses_antes(self) -> None:
        self.assertEqual(months_before('2026-07-01', 24), '2024-07-01')
        self.assertEqual(months_before('2026-03-31', 1), '2026-02-28')

    def test_lectura_en_streaming_con_bloques_pequenos(self) -> None:
        items = [{'id': index, 'texto': 'á' * index} for index in range(50)]
        stream = io.BytesIO(json.dumps(items, ensure_ascii=False).encode('utf-8'))
        self.assertEqual(list(iter_array(stream, chunk_size=7)), items)
        self.assertEqual(list(iter_array(io.BytesIO(b' [ ] '))), [])


class MatchingTest(unittest.TestCase):
    def test_cascada(self) -> None:
        catalog = Catalog({'MUNICIPIO TOLUCA', 'SECRETARIA SALUD', 'INSTITUTO ELECTORAL'})
        self.assertEqual(catalog.find('SECRETARIA SALUD').method, 'exacto')
        self.assertEqual(catalog.find('TOLUCA').target, 'MUNICIPIO TOLUCA')
        self.assertEqual(catalog.find('TOLUCA').method, 'municipio')
        self.assertEqual(catalog.find('INSTITUTO ELECTORALL').method, 'similitud')
        self.assertEqual(catalog.find('TRIBUNAL JUSTICIA').method, 'sin_coincidencia')


class CatalogKeysTest(unittest.TestCase):
    def test_roles_de_s2(self) -> None:
        self.assertEqual(normalize_roles([{'clave': 'RE,RC', 'valor': ''}]), {'RE', 'RC'})
        self.assertEqual(normalize_roles(['r', 'R:Técnica', 'REQUIRENTES']), {'R'})
        self.assertEqual(normalize_roles(None), set())

    def test_claves_de_sancion(self) -> None:
        self.assertEqual(sanction_key('I'), 'INHABILITACION')
        self.assertEqual(sanction_key('SANCION_ECONOMICA'), 'SANCION_ECONOMICA')
        self.assertEqual(sanction_key('Amonestación pública'), 'AMONESTACION')


if __name__ == '__main__':
    unittest.main()

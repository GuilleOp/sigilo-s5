# Prueba de extremo a extremo con ZIP sintéticos: productos, privacidad, idempotencia y salidas privadas.
import csv
import json
import os
import sqlite3
import tempfile
import unittest

from pdn.pipeline import Options, check_private_dir, repository_root, run

from . import fixtures

REFERENCE = '2026-11-05'


def _read_tree(directory: str) -> dict[str, bytes]:
    contents = {}
    for base, _, files in os.walk(directory):
        for name in files:
            path = os.path.join(base, name)
            with open(path, 'rb') as handle:
                contents[os.path.relpath(path, directory)] = handle.read()
    return contents


class PipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workspace = tempfile.TemporaryDirectory()
        root = cls.workspace.name
        cls.input_dir = fixtures.build(os.path.join(root, 'entrada'))
        cls.output_dir = os.path.join(root, 'salida')
        cls.private_dir = os.path.join(root, 'privado')
        cls.report = run(
            Options(
                input_dir=cls.input_dir,
                output_dir=cls.output_dir,
                private_dir=cls.private_dir,
                processes=2,
                reference=REFERENCE,
                quiet=True,
            )
        )
        cls.tree = _read_tree(cls.output_dir)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.workspace.cleanup()

    def _json(self, relative: str) -> dict[str, object]:
        return json.loads(self.tree[relative])

    def _csv(self, relative: str) -> list[dict[str, str]]:
        return list(csv.DictReader(self.tree[relative].decode('utf-8').splitlines()))

    def test_escribe_los_productos_esperados(self) -> None:
        expected = {
            'fuentes.json',
            'grupos-anonimato/indice.json',
            'grupos-anonimato/00.json',
            'grupos-anonimato/14.json',
            'cobertura/matriz.json',
            'cobertura/matriz.csv',
            'normalizacion/equivalencias.csv',
            'normalizacion/tasas.json',
            'abiertos/grupos-anonimato/cubetas.csv',
            'abiertos/grupos-anonimato/resumen.csv',
            'abiertos/cobertura/matriz-cobertura.csv',
            'abiertos/contratacion-federal/indicadores-comprador.csv',
            'abiertos/contratacion-federal/indicadores-comprador-anio.csv',
        }
        self.assertEqual(set(self.tree), expected)

    def test_salidas_publicas_sin_datos_personales(self) -> None:
        forbidden = fixtures.PERSON_NAMES + fixtures.SECRET_VALUES + fixtures.PRIVATE_ONLY_FORBIDDEN
        forbidden += ('XAXX260101EJ1', 'Comercializadora Ficticia', 'Magistrado', 'Raroapellido')
        forbidden += fixtures.PERSON_NAME_ENTES
        for name, content in self.tree.items():
            text = content.decode('utf-8')
            for value in forbidden:
                self.assertNotIn(value, text, f'{value} apareció en {name}')

    def test_fragmento_con_generalizacion_jerarquica(self) -> None:
        fragment = self._json('grupos-anonimato/14.json')
        self.assertEqual(fragment['entidad'], {'clave': '14', 'nombre': 'Jalisco'})
        entes = {ente[0]: ente for ente in fragment['entes']}
        works = entes[fixtures.JALISCO_ENTE]
        # 26 personas: 12 en compras (una persona con dos declaraciones cuenta una vez), 11 en la
        # ponencia y 3 en la oficina pequeña; quedan fuera la de 2023 y la que concluyó.
        self.assertEqual(works[1], 2)
        self.assertEqual(works[3], 1, 'el ente aparece en S2')
        self.assertEqual(works[4], -1, 'el ente protege por sí mismo')
        self.assertEqual(works[5], [['Dirección de Compras', 2, 1]], 'solo se publica el área con k >= 10 sin nombre propio')
        town = entes['H. Ayuntamiento de Villa Ejemplo']
        self.assertEqual(town[1], 0)
        group = fragment['grupos'][town[4]]
        self.assertEqual(group[0], 'M')
        self.assertEqual(group[3], 1, 'con el ente de nombre suprimido, el grupo municipal llega a k = 12')
        self.assertNotIn('Ayuntamiento Ficticio 55 0000 0002', entes)

    def test_fragmento_federal_marca_area_de_contratacion(self) -> None:
        fragment = self._json('grupos-anonimato/00.json')
        (ente,) = fragment['entes']
        self.assertEqual(ente[5], [['Departamento de Compras', 2, 1]])

    def test_indice_y_resumen_nacional(self) -> None:
        index = self._json('grupos-anonimato/indice.json')
        self.assertEqual(len(index['entidades']), 33)
        with_data = [entry['clave'] for entry in index['entidades'] if entry['hayDatos']]
        self.assertEqual(with_data, ['00', '14'])
        national = index['resumenNacional']
        # 56 personas, publicadas redondeadas a 10.
        self.assertEqual(national['personas'], 60)
        # k < 10 por área: oficina (3), tesorería (2) y las tres oficinas de 1 = 8 de 56, con un decimal.
        self.assertEqual(national['pctPersonasKMenor10Area'], 14.3)
        self.assertEqual(national['pctPersonasKMenor10Ente'], 8.9)
        # El ente con teléfono y los tres con nombre de persona.
        self.assertEqual(national['entesConNombreSuprimido'], 4)
        self.assertEqual(national['areasConNombreSuprimido'], 1)
        protected = national['pctProtegidasPor']
        self.assertEqual(protected['area'], 48.2)
        self.assertEqual(protected['ente'], 25.0)
        # Tres personas solo protegidas por la entidad: se suprime y, como los porcentajes suman 100,
        # también el menor de los demás (supresión complementaria).
        self.assertIsNone(protected['entidad'])
        self.assertIsNone(protected['grupo'])
        self.assertEqual(protected['insuficiente'], 0.0)

    def test_datos_abiertos_de_grupos_suprimen_celdas_pequenas(self) -> None:
        rows = self._csv('abiertos/grupos-anonimato/cubetas.csv')
        def cell(scope: str, level: str, bucket: str) -> tuple[str, str, str]:
            row = next(row for row in rows if (row['ambito_clave'], row['nivel'], row['cubeta']) == (scope, level, bucket))
            return row['grupos'], row['personas'], row['personas_suprimido']

        # Cinco áreas pequeñas con 8 personas: se publica redondeado a 10.
        self.assertEqual(cell('14', 'area', '1-4'), ('5', '10', '0'))
        # Dos entes de 10 a 49 (26 y 10 personas): con menos de 3 grupos se suprime.
        self.assertEqual(cell('14', 'ente', '10-49'), ('2', '', '1'))
        # Un solo ente federal de 15 personas: se suprime aunque no sea pequeño.
        self.assertEqual(cell('00', 'ente', '10-49'), ('1', '', '1'))
        resumen = {row['ambito_clave']: row for row in self._csv('abiertos/grupos-anonimato/resumen.csv')}
        self.assertEqual(resumen['00']['personas'], '20', '15 personas se publican redondeadas a 10')

    def test_matriz_de_cobertura(self) -> None:
        rows = self._json('cobertura/matriz.json')['filas']
        self.assertEqual(len({(row['entidadClave'], row['sistema']) for row in rows}), 33 * 5)
        sinaloa = next(row for row in rows if (row['entidadClave'], row['sistema'], row['periodo']) == ('25', 'S3S', 'total'))
        self.assertTrue(any('Descarga incompleta' in note and '2 de 5' in note for note in sinaloa['notas']))
        self.assertIsNone(sinaloa['registros'], 'dos registros se suprimen')
        self.assertEqual(sinaloa['registrosRango'], '1-4')
        bcs = next(row for row in rows if (row['entidadClave'], row['sistema'], row['periodo']) == ('03', 'S6', 'sin_fecha'))
        self.assertTrue(bcs['hayDatos'])
        oaxaca = next(row for row in rows if (row['entidadClave'], row['sistema'], row['periodo']) == ('20', 'S1', 'total'))
        self.assertFalse(oaxaca['hayDatos'])
        total = next(row for row in rows if (row['entidadClave'], row['sistema'], row['periodo']) == ('14', 'S1', 'total'))
        # 2023 y 2025 tienen un registro cada uno (suprimidos): el total exacto los reconstruiría, así
        # que se publica como rango (43 + 2 a 43 + 8) y sus fechas salen solo del periodo publicado.
        self.assertIsNone(total['registros'])
        self.assertEqual(total['registrosRango'], '45-51')
        self.assertEqual(total['fechaMin'], '2026-02-01')
        jalisco = next(row for row in rows if (row['entidadClave'], row['sistema'], row['periodo']) == ('14', 'S1', '2026'))
        self.assertEqual(jalisco['registros'], 43)
        self.assertEqual(jalisco['fechaMax'], '2026-07-01')

    def test_equivalencias(self) -> None:
        rows = self._csv('normalizacion/equivalencias.csv')
        s2 = {row['clave_origen']: row for row in rows if row['sistema'] == 'S2'}
        self.assertEqual(s2['14|SECRETARIA OBRAS VILLA EJEMPLO']['metodo'], 'exacto')
        self.assertEqual(s2['00|INSTITUTO FEDERAL FICTICIO EQUIPAMIENTO']['clave_s1'], '00|INSTITUTO FEDERAL FICTICIO EQUIPAMIENTO')
        s3 = {row['clave_origen']: row for row in rows if row['sistema'] == 'S3S'}
        self.assertEqual(s3['25|VILLA EJEMPLO']['metodo'], 'sin_coincidencia')
        rates = self._json('normalizacion/tasas.json')
        self.assertEqual(rates['S2']['total']['tasaInstituciones'], 100.0)

    def test_indicadores_de_contratacion_con_ultima_release(self) -> None:
        (row,) = self._csv('abiertos/contratacion-federal/indicadores-comprador.csv')
        self.assertEqual(row['procedimientos'], '2', '9000002 (2017) queda fuera y 9000001 cuenta una vez')
        self.assertEqual(row['procedimientos_ocid_sin_prefijo'], '1')
        self.assertEqual(row['pct_adjudicacion_directa'], '50.0')
        self.assertEqual(row['pct_invitacion_restringida'], '50.0')
        self.assertEqual(row['pct_licitacion_publica'], '0.0')
        self.assertEqual(row['monto_adjudicado_mxn'], '370')
        self.assertEqual(row['en_s1'], 'true')
        self.assertEqual(row['en_s2'], 'true')

    def test_salidas_privadas(self) -> None:
        s3 = sqlite3.connect(os.path.join(self.private_dir, 's3.sqlite'))
        self.assertEqual(s3.execute('SELECT COUNT(*) FROM s3_servidores').fetchone()[0], 3)
        self.assertEqual(s3.execute('SELECT COUNT(*) FROM s3_particulares').fetchone()[0], 1)
        self.assertEqual(
            s3.execute("SELECT sanciones FROM s3_servidores WHERE expediente = 'EXP-FICT-0001'").fetchone()[0],
            '["INHABILITACION"]',
        )
        s3.close()
        s6 = sqlite3.connect(os.path.join(self.private_dir, 's6_apf.sqlite'))
        rows = s6.execute('SELECT ocid, ocid_original, metodo, monto_adjudicado_mxn FROM releases ORDER BY ocid').fetchall()
        s6.close()
        self.assertEqual(
            rows,
            [
                ('ocds-07smqs-9000001', '-9000001', 'direct', 300.0),
                ('ocds-07smqs-9000003', 'ocds-07smqs-9000003', 'selective', 70.0),
            ],
        )
        for name in ('s3.sqlite', 's6_apf.sqlite'):
            with open(os.path.join(self.private_dir, name), 'rb') as handle:
                content = handle.read()
            for value in fixtures.PRIVATE_ONLY_FORBIDDEN + fixtures.SECRET_VALUES:
                self.assertNotIn(value.encode('utf-8'), content, f'{value} en {name}')

    def test_es_idempotente(self) -> None:
        second = os.path.join(self.workspace.name, 'salida-2')
        run(Options(input_dir=self.input_dir, output_dir=second, processes=1, reference=REFERENCE, quiet=True))
        self.assertEqual(_read_tree(second), self.tree)

    def test_reutiliza_la_fecha_de_referencia_publicada(self) -> None:
        # ZIP con otra fecha de modificación: sin --fecha-referencia se usa la de fuentes.json.
        later = os.path.join(self.workspace.name, 'entrada-posterior')
        fixtures.build(later)
        for name in os.listdir(later):
            os.utime(os.path.join(later, name), (1893456000, 1893456000))  # 2030-01-01
        third = os.path.join(self.workspace.name, 'salida-3')
        os.makedirs(third)
        with open(os.path.join(third, 'fuentes.json'), 'wb') as handle:
            handle.write(self.tree['fuentes.json'])
        run(Options(input_dir=later, output_dir=third, processes=1, quiet=True))
        with open(os.path.join(third, 'fuentes.json'), encoding='utf-8') as handle:
            self.assertEqual(json.load(handle)['fechaReferencia'], REFERENCE)

    def test_rechaza_carpeta_privada_dentro_del_repositorio(self) -> None:
        with self.assertRaises(ValueError):
            check_private_dir(os.path.join(repository_root(), 'datos', 'privado'))


if __name__ == '__main__':
    unittest.main()

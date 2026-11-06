# Fixtures SINTÉTICOS diminutos con la estructura de las descargas masivas de la PDN (docs/datos-sinteticos.md).
# Se generan al vuelo en una carpeta temporal; no hay datos reales ni archivos binarios versionados.
import json
import os
import zipfile

# Valores que nunca deben aparecer en las salidas públicas (y algunos tampoco en las privadas).
PERSON_NAMES = ('Apellidosintetico', 'Servidora')
SECRET_VALUES = ('XEXX010101HNEXXXA4', 'XEXX010101XX1', '55 0000 0001', 'nadie@example.org')
PRIVATE_ONLY_FORBIDDEN = ('Origen Ficticio Con Nombre', 'Contacto Ficticio', '55 0000 0002', 'Hechos ficticios')

JALISCO_ENTE = 'Secretaría de Obras de Villa Ejemplo del Estado de Jalisco'
# «Entes» capturados con el nombre de una persona (equivalentes SINTÉTICOS de los casos reales): con
# la abreviatura «Ma.» y un apellido raro, con un apellido raro al final y solo con nombres.
PERSON_NAME_ENTES = ('Ma. Raroapellido Ficticia', 'Persona Ficticia Raroapellido', 'Persona Raronombre Ficticia')
JALISCO_ENTE_S2 = 'SECRETARIA DE OBRAS DE VILLA EJEMPLO'
FEDERAL_ENTE = 'Instituto Federal Ficticio de Equipamiento'


def _declaration(
    index: int,
    ente: str,
    area: str,
    date: str,
    kind: str = 'MODIFICACIÓN',
    level: str = 'ESTATAL',
    secrets: bool = False,
) -> dict[str, object]:
    general: dict[str, object] = {
        'nombre': 'Persona',
        'primerApellido': 'Ficticia',
        'segundoApellido': f'Apellidosintetico{index}',
    }
    if secrets:
        general.update(
            {
                'curp': SECRET_VALUES[0],
                'rfc': {'rfc': SECRET_VALUES[1]},
                'telefono': SECRET_VALUES[2],
                'correoElectronico': {'personal': SECRET_VALUES[3]},
            }
        )
    return {
        'id': f'decl-{index}-{date}',
        'metadata': {'actualizacion': f'{date}T10:00:00Z', 'tipo': kind, 'institucion': ente},
        'declaracion': {
            'situacionPatrimonial': {
                'datosGenerales': general,
                'datosEmpleoCargoComision': {
                    'nombreEntePublico': ente,
                    'areaAdscripcion': area,
                    'nivelOrdenGobierno': level,
                    'empleoCargoComision': 'Puesto ficticio',
                },
            }
        },
    }


def s1_records() -> dict[str, list[dict[str, object]]]:
    jalisco: list[dict[str, object]] = []
    index = 0
    # 12 personas en compras (área publicable) con declaración reciente.
    for _ in range(12):
        index += 1
        jalisco.append(_declaration(index, JALISCO_ENTE, 'Dirección de Compras', '2026-06-01', secrets=index == 1))
    # 11 personas en un área con tratamiento de titular: no se publica por nombre.
    for _ in range(11):
        index += 1
        jalisco.append(_declaration(index, JALISCO_ENTE, 'Ponencia del Magistrado Ficticio', '2026-05-01'))
    # 3 personas en un área pequeña.
    for _ in range(3):
        index += 1
        jalisco.append(_declaration(index, JALISCO_ENTE, '070 Oficina Pequeña', '2026-04-01'))
    # Un ente pequeño municipal (2 personas) que va al grupo de "otros entes municipales".
    for _ in range(2):
        index += 1
        jalisco.append(_declaration(index, 'H. Ayuntamiento de Villa Ejemplo', 'Tesorería', '2026-03-01', level='MUNICIPAL'))
    # Un ente capturado con un teléfono: no se publica por nombre.
    for _ in range(10):
        index += 1
        jalisco.append(_declaration(index, 'Ayuntamiento Ficticio 55 0000 0002', 'Tesorería', '2026-03-01', level='MUNICIPAL'))
    # Tres entes con nombre de persona, una persona cada uno: no se publican por nombre.
    for ente in PERSON_NAME_ENTES:
        index += 1
        jalisco.append(_declaration(index, ente, 'Oficina', '2026-03-01'))
    # Persona fuera de la ventana de 24 meses (última declaración en 2023).
    index += 1
    jalisco.append(_declaration(index, JALISCO_ENTE, 'Dirección de Compras', '2023-01-01'))
    # Persona que concluyó: modificación en 2025 y conclusión posterior en 2026.
    index += 1
    jalisco.append(_declaration(index, JALISCO_ENTE, 'Dirección de Compras', '2025-01-01'))
    jalisco.append(_declaration(index, JALISCO_ENTE, 'Dirección de Compras', '2026-02-01', kind='CONCLUSIÓN'))
    # Persona con dos declaraciones: cuenta una sola vez, en su área más reciente.
    jalisco.append(_declaration(1, JALISCO_ENTE, 'Dirección de Compras', '2026-07-01'))
    federal = [
        _declaration(100 + number, FEDERAL_ENTE, 'Departamento de Compras', '2022-05-01', level='FEDERAL')
        for number in range(15)
    ]
    return {'Jalisco': jalisco, 'SFP': federal}


def s2_files() -> dict[str, object]:
    sabg = [
        {
            'id': f'sabg-{number}',
            'ejercicio_fiscal': 2025,
            'periodo_ejercicio': {'fecha_inicial': '2025/01/01', 'fecha_final': '2025/12/31'},
            'nombres': 'Persona',
            'primer_apellido': 'Ficticia',
            'segundo_apellido': f'Apellidosintetico{number}',
            'dependencia': {'nombre': FEDERAL_ENTE.upper(), 'siglas': 'IFFE', 'clave': '99/001'},
            'puesto': {'nombre': 'DEPARTAMENTO DE COMPRAS', 'nivel': 'O11'},
            'tipo_area': ['C'],
            'nivel_responsabilidad': ['A'],
            'tipo_procedimiento': 1,
            'superior_inmediato': {'nombres': 'Servidora', 'primer_apellido': 'Ficticia', 'segundo_apellido': 'Dos'},
        }
        for number in range(3)
    ]
    jalisco = {
        'pagination': {'totalRows': 2},
        'results': [
            {
                'id': f'jal-{number}',
                'ejercicioFiscal': '2025',
                'fechaCaptura': '2025-03-01T00:00:00Z',
                'nombres': 'Persona',
                'primerApellido': 'Ficticia',
                'segundoApellido': f'Apellidosintetico{number}',
                'institucionDependencia': {'nombre': JALISCO_ENTE_S2, 'siglas': 'SOVE', 'clave': 'X1'},
                'puesto': {'nombre': 'Dirección de Compras', 'nivel': 'A'},
                'tipoArea': [{'clave': 'RE,RC', 'valor': 'Responsable'}],
                'tipoProcedimiento': [{'clave': 1, 'valor': 'Contrataciones'}],
            }
            for number in range(2)
        ],
    }
    return {'s2/SABG/data-0000000001.json': sabg, 's2/jalisco/data-0000000001.json': jalisco}


def _sanction(index: int, ente: str, state_value: str, grave: bool) -> dict[str, object]:
    return {
        'id': f's3-{index}',
        'fecha': '2024-01-10',
        'expediente': f'EXP-FICT-{index:04d}',
        'datosGenerales': {'nombres': 'Servidora', 'primerApellido': 'Ficticia', 'segundoApellido': f'Apellidosintetico{index}'},
        'empleoCargoComision': {'entidadFederativa': state_value, 'nombreEntePublico': ente},
        'origenProcedimiento': {'clave': 'DENUNCIA', 'valor': PRIVATE_ONLY_FORBIDDEN[0]},
        'faltaCometida': [{'clave': 'ABUSO_FUNCIONES' if grave else 'A', 'descripcionHechos': PRIVATE_ONLY_FORBIDDEN[3]}],
        'resolucion': {'fechaResolucion': '2024-02-15', 'autoridadResolutora': 'Autoridad Ficticia'},
        'tipoSancion': [{'clave': 'I', 'inhabilitacion': {'plazoAnios': 1, 'fechaInicial': '2024-03-01'}}],
    }


def s3_files() -> dict[str, object]:
    return {
        'Jalisco/items_faltas_administrativas_graves/data-0000000001.json': {
            'data': [_sanction(1, JALISCO_ENTE_S2, '14', True)],
            'meta': {'total_count': 1, 'filter_count': 1},
        },
        # Sinaloa incompleto: declara 5 registros, trae 2.
        'Sinaloa/items_faltas_administrativas_no_graves/data-0000000001.json': {
            'data': [_sanction(2, 'Villa Ejemplo', 'Sinaloa', False), _sanction(3, 'Villa Ejemplo', '25', False)],
            'meta': {'total_count': 5, 'filter_count': 5},
        },
        'Jalisco/items_faltas_graves_personas_morales/data-0000000001.json': {
            'data': [
                {
                    'id': 's3p-1',
                    'fecha': '2025-01-01',
                    'expediente': 'EXP-FICT-P1',
                    'datosGenerales': {'nombreRazonSocial': 'Comercializadora Ficticia Ejemplo, S.A. de C.V.', 'rfc': 'XAXX260101EJ1'},
                    'dondeCometioLaFalta': {'nombreEntePublico': JALISCO_ENTE_S2},
                    'origenProcedimiento': {'clave': None, 'valor': PRIVATE_ONLY_FORBIDDEN[0]},
                    'tipoSancion': [{'clave': 'SANCION_ECONOMICA', 'sancionEconomica': {'monto': 1000, 'moneda': 'MXN'}}],
                    'resolucion': {'fechaResolucion': '2025-02-01'},
                }
            ],
            'meta': {'total_count': 1, 'filter_count': 1},
        },
    }


def _release(ocid: str, date: str, start: str, method: str, amount: float, buyer: str = FEDERAL_ENTE) -> dict[str, object]:
    return {
        'ocid': ocid,
        'date': date,
        'tag': ['tender', 'award'],
        'buyer': {'id': 'IFFE-0001', 'name': buyer},
        'tender': {'procurementMethod': method, 'tenderPeriod': {'startDate': start}, 'status': 'complete'},
        'awards': [
            {
                'id': f'{ocid}-A1',
                'value': {'amount': amount, 'currency': 'MXN'},
                'suppliers': [{'id': 'XAXX260101EJ1', 'name': 'Comercializadora Ficticia Ejemplo, S.A. de C.V.'}],
            }
        ],
        'parties': [
            {
                'id': 'p1',
                'name': 'Comercializadora Ficticia Ejemplo, S.A. de C.V.',
                'roles': ['supplier'],
                'identifier': {'id': 'XAXX260101EJ1', 'scheme': 'MX-RFC'},
                'contactPoint': {'name': PRIVATE_ONLY_FORBIDDEN[1], 'telephone': PRIVATE_ONLY_FORBIDDEN[2]},
            }
        ],
    }


def s6_files() -> dict[str, object]:
    return {
        'apf_releases.json': [
            _release('ocds-07smqs-9000001', '2019-01-01T00:00:00Z', '2019-01-01T00:00:00Z', 'open', 100.0),
            # Release posterior del mismo procedimiento con el ocid sin prefijo: reemplaza a la anterior.
            _release('-9000001', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z', 'direct', 300.0),
            _release('ocds-07smqs-9000002', '2017-06-01T00:00:00Z', '2017-06-01T00:00:00Z', 'open', 50.0),
            _release('ocds-07smqs-9000003', '2021-03-01T00:00:00Z', '2021-03-01T00:00:00Z', 'selective', 70.0),
        ],
        'bcs_releases.json': [_release('ocds-fictbc-1', '1900-01-01T00:00:00Z', '1900-01-01T00:00:00Z', 'open', 1.0)],
    }


def build(directory: str) -> str:
    """Escribe PDN_S1.zip, PDN_S2.zip, PDN_S3v2.zip y PDN_S6.zip sintéticos en la carpeta indicada."""
    os.makedirs(directory, exist_ok=True)
    with zipfile.ZipFile(os.path.join(directory, 'PDN_S1.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('S1/', '')
        for provider, records in s1_records().items():
            archive.writestr(f'S1/{provider}/', '')
            half = len(records) // 2
            archive.writestr(f'S1/{provider}/data-0000000001.json', json.dumps(records[:half]))
            archive.writestr(f'S1/{provider}/data-0000000002.json', json.dumps(records[half:]))
    for name, files in (('PDN_S2.zip', s2_files()), ('PDN_S3v2.zip', s3_files()), ('PDN_S6.zip', s6_files())):
        with zipfile.ZipFile(os.path.join(directory, name), 'w', zipfile.ZIP_DEFLATED) as archive:
            for member, content in files.items():
                archive.writestr(member, json.dumps(content, ensure_ascii=False))
    return directory

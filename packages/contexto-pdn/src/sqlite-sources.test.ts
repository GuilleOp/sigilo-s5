// Pruebas de las fuentes SQLite con bases temporales creadas en la prueba (mismo esquema que
// datos/proceso). Nunca se usan las bases privadas reales.
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyCitedContract } from './contract.ts';
import { parseCoverageMatrix } from './coverage.ts';
import { verifySanction } from './sanction.ts';
import { canonicalOcid, openSqliteSources } from './sqlite-sources.ts';

const dir = mkdtempSync(join(tmpdir(), 'sigilo-contexto-'));
const s3Path = join(dir, 's3.sqlite');
const s6Path = join(dir, 's6_apf.sqlite');

{
  const s3 = new DatabaseSync(s3Path);
  s3.exec(`
    CREATE TABLE s3_servidores (
      id TEXT, entidad TEXT, proveedor TEXT, gravedad TEXT, expediente TEXT, fecha TEXT,
      nombres TEXT, primer_apellido TEXT, segundo_apellido TEXT, sexo TEXT,
      ente TEXT, ente_clave TEXT, siglas_ente TEXT, nivel_orden_gobierno TEXT, ambito_publico TEXT,
      puesto TEXT, area_adscripcion TEXT, faltas TEXT, sanciones TEXT, sanciones_detalle TEXT,
      fecha_resolucion TEXT, fecha_resolucion_firme TEXT, autoridad_resolutora TEXT, origen_clave TEXT);
    CREATE TABLE metadatos (clave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO metadatos VALUES ('fecha_referencia', '2026-11-05');`);
  const insertS3 = s3.prepare(
    'INSERT INTO s3_servidores (id, entidad, expediente, nombres, primer_apellido, segundo_apellido, ente, ente_clave, sanciones, fecha_resolucion, autoridad_resolutora) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  // «12/2022» se repite entre entidades y, dentro de Jalisco, entre dos personas del mismo ente,
  // como en la descarga real.
  const repeated = [
    [
      'r2',
      '14',
      'Persona',
      'Ficticia',
      'Dos',
      'Secretaría de Obras de Villa Ejemplo',
      '14|SECRETARIA OBRAS VILLA EJEMPLO',
    ],
    [
      'r3',
      '14',
      'Persona',
      'Ficticia',
      'Tres',
      'Secretaría de Obras de Villa Ejemplo',
      '14|SECRETARIA OBRAS VILLA EJEMPLO',
    ],
    [
      'r4',
      '14',
      'Persona',
      'Ficticia',
      'Cuatro',
      'Tesorería Municipal de Villa Ejemplo',
      '14|TESORERIA MUNICIPAL VILLA EJEMPLO',
    ],
  ] as const;
  for (const [id, state, name, first, second, ente, key] of repeated) {
    insertS3.run(
      id,
      state,
      '12/2022',
      name,
      first,
      second,
      ente,
      key,
      '["SUSPENSION"]',
      '2024-01-01',
      'Contraloría Ficticia',
    );
  }
  insertS3.run(
    'r5',
    '29',
    'EXP-FICT-0001',
    'Persona',
    'Ficticia',
    'Cinco',
    'Registro Civil de Villa Ejemplo',
    '29|REGISTRO CIVIL VILLA EJEMPLO',
    '["DESTITUCION"]',
    '2024-01-01',
    'Contraloría Ficticia',
  );
  insertS3.run(
    'r1',
    '14',
    'EXP-FICT-0001',
    'Persona',
    'Ficticia',
    'Uno',
    'Secretaría de Obras de Villa Ejemplo',
    '14|SECRETARIA OBRAS VILLA EJEMPLO',
    '["AMONESTACION"]',
    '2025-06-01',
    'Contraloría Ficticia',
  );
  s3.close();
  const s6 = new DatabaseSync(s6Path);
  s6.exec(`CREATE TABLE releases (
    ocid TEXT PRIMARY KEY, fecha_release TEXT, fecha_inicio TEXT, anio_inicio TEXT,
    comprador_id TEXT, comprador TEXT, entidad_convocante TEXT,
    metodo TEXT, fundamento TEXT, estado TEXT, licitantes INTEGER,
    monto_licitacion REAL, monto_adjudicado_mxn REAL, adjudicaciones_otra_moneda INTEGER,
    adjudicaciones TEXT, proveedores TEXT, ocid_con_prefijo INTEGER, ocid_original TEXT)`);
  const insert = s6.prepare(
    'INSERT INTO releases (ocid, fecha_inicio, comprador_id, comprador, metodo, fundamento, licitantes, adjudicaciones, ocid_original) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  insert.run(
    'ocds-07smqs-100',
    '2019-03-01',
    'B-1',
    'Oficina Federal Ficticia de Aduanas',
    'open',
    null,
    3,
    JSON.stringify([
      {
        id: 'A1',
        monto: 500000,
        moneda: 'MXN',
        proveedores: [{ id: 'XAXX010101000', nombre: 'Proveedora Ficticia, S.A.' }],
      },
    ]),
    '-100',
  );
  insert.run(
    'ocds-07smqs-200',
    '2022-11-30',
    'B-1',
    'Oficina Federal Ficticia de Aduanas',
    'direct',
    'Art. 41',
    1,
    '[]',
    'ocds-07smqs-200',
  );
  s6.close();
}

const matrix = parseCoverageMatrix({
  version: 1,
  filas: [
    { entidadClave: '00', entidad: 'Federación', sistema: 'S6', periodo: 'total', hayDatos: true },
    { entidadClave: '14', entidad: 'Jalisco', sistema: 'S3S', periodo: 'total', hayDatos: true },
    { entidadClave: '29', entidad: 'Tlaxcala', sistema: 'S3S', periodo: 'total', hayDatos: true },
  ],
});

const stampsBefore = [statSync(s3Path).mtimeMs, statSync(s6Path).mtimeMs];
const opened = openSqliteSources({ s3Path, s6Path });

afterAll(() => {
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('openSqliteSources', () => {
  it('desactiva las fuentes cuyas rutas no existen', () => {
    const none = openSqliteSources({ s3Path: join(dir, 'no-existe.sqlite') });
    expect(none.s3).toBeNull();
    expect(none.s6).toBeNull();
    expect(none.disabled.map((item) => item.system)).toEqual(['S3S', 'S6']);
    none.close();
    expect(() => statSync(join(dir, 'no-existe.sqlite'))).toThrow();
  });

  it('S3: deduce el alcance de la base y verifica por expediente', () => {
    const s3 = opened.s3;
    if (s3 === null) throw new Error('S3 desactivado');
    expect(s3.info).toMatchObject({
      label: 'S3 de la PDN',
      dataAsOf: '2026-11-05',
      isSynthetic: false,
    });
    expect([...s3.scope.stateCodes].sort()).toEqual(['14', '29']);
    const base = {
      personName: 'Persona Ficticia Uno',
      institution: 'Secretaría de Obras de Villa Ejemplo',
      stateCode: '14',
      declaredOn: '2025-05-01',
    };
    expect(
      verifySanction({
        source: s3,
        matrix,
        claim: { ...base, fileNumber: 'EXP-FICT-0001', sanction: 'amonestación privada' },
      }).outcome,
    ).toBe('confirmed');
    expect(
      verifySanction({
        source: s3,
        matrix,
        claim: { ...base, fileNumber: 'EXP-FICT-0001', sanction: 'destitución' },
      }).outcome,
    ).toBe('contradicted');
    expect(
      verifySanction({
        source: s3,
        matrix,
        claim: { ...base, fileNumber: 'EXP-FICT-0002', sanction: 'amonestación' },
      }),
    ).toMatchObject({
      outcome: 'no_coverage',
      reason: 'record-not-found',
    });
    expect(
      verifySanction({
        source: s3,
        matrix,
        claim: {
          ...base,
          institution: 'Organismo de Agua Potable de Villa Ejemplo',
          fileNumber: 'X',
          sanction: 'amonestación',
        },
      }),
    ).toMatchObject({ outcome: 'no_coverage', reason: 'institution-not-connected' });
  });

  it('S3: un expediente repetido entre entidades o personas nunca se contradice a ciegas', () => {
    const s3 = opened.s3;
    if (s3 === null) throw new Error('S3 desactivado');
    const tlaxcala = {
      personName: 'Persona Sintética',
      sanction: 'amonestación',
      institution: 'Registro Civil de Villa Ejemplo',
      stateCode: '29',
      declaredOn: '2024-01-01',
    };
    // Solo existe en Jalisco: en Tlaxcala es «sin registro», no «otra persona».
    expect(
      verifySanction({ source: s3, matrix, claim: { ...tlaxcala, fileNumber: '12/2022' } }),
    ).toMatchObject({
      outcome: 'no_coverage',
      reason: 'record-not-found',
    });
    expect(s3.findByFileNumber('12/2022', '29')).toEqual([]);
    // EXP-FICT-0001 existe en Jalisco y en Tlaxcala: cada entidad ve solo el suyo.
    expect(s3.findByFileNumber('EXP-FICT-0001', '29').map((item) => item.recordId)).toEqual(['r5']);
    const jalisco = {
      ...tlaxcala,
      institution: 'Secretaría de Obras de Villa Ejemplo',
      stateCode: '14',
    };
    // Dos registros del mismo ente con otras personas: ambiguo, no se elige uno.
    const ambiguous = verifySanction({
      source: s3,
      matrix,
      claim: { ...jalisco, fileNumber: '12/2022' },
    });
    expect(ambiguous).toMatchObject({ outcome: 'no_coverage', reason: 'ambiguous-record' });
    expect(ambiguous.explanation).toMatch(/2 registros/u);
    // La persona correcta entre varios registros sí se confirma o se contradice con su propio registro.
    const two = { ...jalisco, fileNumber: '12/2022', personName: 'Persona Ficticia Dos' };
    expect(
      verifySanction({ source: s3, matrix, claim: { ...two, sanction: 'suspensión de 15 días' } })
        .outcome,
    ).toBe('confirmed');
    expect(
      verifySanction({ source: s3, matrix, claim: { ...two, sanction: 'destitución' } }).outcome,
    ).toBe('contradicted');
    // El mismo número en otro ente de la misma entidad tampoco cuenta.
    const treasury = {
      ...jalisco,
      fileNumber: '12/2022',
      institution: 'Secretaría de Salud Estatal Ficticia',
    };
    expect(
      verifySanction({
        source: { ...s3, scope: { stateCodes: s3.scope.stateCodes } },
        matrix,
        claim: treasury,
      }),
    ).toMatchObject({
      outcome: 'no_coverage',
      reason: 'record-not-found',
    });
  });

  it('S6: busca por ocid con o sin prefijo y cita «S6 federal, datos a enero de 2023»', () => {
    const s6 = opened.s6;
    if (s6 === null) throw new Error('S6 desactivado');
    expect(s6.scope).toMatchObject({
      stateCodes: ['00'],
      periodFrom: '2019-03-01',
      periodTo: '2022-11-30',
    });
    const record = s6.findContract({ ocid: '-100' });
    expect(record).toMatchObject({ ocid: 'ocds-07smqs-100', method: 'open', tenderers: 3 });
    expect(record?.awards[0]?.suppliers[0]?.id).toBe('XAXX010101000');
    const result = verifyCitedContract({
      source: s6,
      matrix,
      stateCode: '00',
      claim: { ocid: 'ocds-07smqs-100', method: 'direct' },
      date: '2019-03',
    });
    expect(result.outcome).toBe('contradicted');
    expect(result.citations[0]?.text).toBe('S6 federal, datos a enero de 2023');
  });

  it('S6: una fecha fuera del periodo de la base es «sin cobertura»', () => {
    const s6 = opened.s6;
    if (s6 === null) throw new Error('S6 desactivado');
    const result = verifyCitedContract({
      source: s6,
      matrix,
      stateCode: '00',
      claim: { ocid: 'ocds-07smqs-100' },
      date: '2015-05',
    });
    expect(result).toMatchObject({ outcome: 'no_coverage', reason: 'period-out-of-range' });
  });

  it('no modifica las bases (solo lectura)', () => {
    opened.s6?.findContract({ ocid: 'ocds-07smqs-200' });
    opened.s3?.findByFileNumber('EXP-FICT-0001', '14');
    expect([statSync(s3Path).mtimeMs, statSync(s6Path).mtimeMs]).toEqual(stampsBefore);
  });

  it('canoniza el ocid igual que datos/proceso', () => {
    expect(canonicalOcid('-2559792')).toBe('ocds-07smqs-2559792');
    expect(canonicalOcid('ocds-07smqs-1')).toBe('ocds-07smqs-1');
  });
});

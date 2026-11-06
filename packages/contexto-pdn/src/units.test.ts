// Pruebas unitarias de citas, nombres, cobertura, extracción de contratos y clasificación de conductas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays, citeSource, daysBetween, formatAmount, formatDataDate } from './citation.ts';
import { extractContractClaims } from './contract.ts';
import { assessCoverage, parseCoverageMatrix, pickSource } from './coverage.ts';
import { organizationKey, personNameKey, sanctionKindsOf } from './names.ts';
import { classifyOffense, PRIORITY_CONFIG } from './priority.ts';
import type { Source } from './types.ts';

const S3_FEDERAL: Source = {
  info: {
    id: 's3.x',
    system: 'S3S',
    label: 'S3 de prueba',
    dataAsOf: '2026-11-05',
    isSynthetic: true,
  },
  scope: { stateCodes: ['00'] },
};

describe('citas y fechas', () => {
  it('cita la fuente con la fecha en español', () => {
    expect(formatDataDate('2023-01')).toBe('enero de 2023');
    expect(formatDataDate('2026-11-05')).toBe('5 de noviembre de 2026');
    expect(formatDataDate('sin fecha')).toBe('sin fecha');
    expect(
      citeSource({
        id: 's6.apf',
        system: 'S6',
        label: 'S6 federal',
        dataAsOf: '2023-01',
        isSynthetic: false,
      }).text,
    ).toBe('S6 federal, datos a enero de 2023');
  });

  it('suma y resta días naturales', () => {
    expect(addDays('2026-11-09', -1)).toBe('2026-11-08');
    expect(daysBetween('2026-09-20', '2026-11-09')).toBe(50);
    expect(() => daysBetween('ayer', '2026-11-09')).toThrow(/Fecha inválida/u);
  });

  it('formatea montos con separador de miles', () => {
    expect(formatAmount(1_480_000)).toBe('$1,480,000 MXN');
  });
});

describe('nombres', () => {
  it('compara personas sin acentos ni mayúsculas', () => {
    expect(personNameKey('María José Ejemplo')).toBe(personNameKey('MARIA JOSE  ejemplo'));
  });

  it('las organizaciones se comparan sin la forma jurídica', () => {
    expect(organizationKey('Inmobiliaria Ficticia Ejemplo, S.A. de C.V.')).toBe(
      'INMOBILIARIA FICTICIA EJEMPLO',
    );
    expect(organizationKey('Asociación Ficticia de Egresados Ejemplo, A.C.')).toBe(
      organizationKey('ASOCIACION FICTICIA EGRESADOS EJEMPLO AC'),
    );
  });

  it('clasifica sanciones escritas en texto libre', () => {
    expect(sanctionKindsOf('suspensión de 30 días')).toEqual(['SUSPENSION']);
    expect(sanctionKindsOf('Amonestación pública')).toEqual(['AMONESTACION']);
    expect(sanctionKindsOf('Inhabilitación de 1 año y multa')).toEqual([
      'INHABILITACION',
      'SANCION_ECONOMICA',
    ]);
    expect(sanctionKindsOf('Suspensión de actividades')).toEqual(['SUSPENSION_ACTIVIDADES']);
    expect(sanctionKindsOf('otra cosa')).toEqual(['OTRO']);
  });
});

describe('extractContractClaims', () => {
  it('extrae el ocid, el tipo de procedimiento y el monto', () => {
    expect(
      extractContractClaims(
        'Se adjudicó de forma directa el ocds-fict00-IFFE-AD-2026-0042 por 1,480,000 pesos.',
      ),
    ).toEqual([{ ocid: 'ocds-fict00-IFFE-AD-2026-0042', method: 'direct', amount: 1_480_000 }]);
    expect(extractContractClaims('La licitación pública ocds-fict00-X-1.')).toEqual([
      { ocid: 'ocds-fict00-X-1', method: 'open' },
    ]);
    expect(extractContractClaims('Sin contrato citado.')).toEqual([]);
  });
});

describe('cobertura', () => {
  const matrix = parseCoverageMatrix({
    version: 1,
    filas: [
      {
        entidadClave: '00',
        entidad: 'Federación',
        sistema: 'S3S',
        periodo: 'total',
        hayDatos: false,
        notas: ['Sin federales.'],
      },
      {
        entidadClave: '14',
        entidad: 'Jalisco',
        sistema: 'S3S',
        periodo: 'total',
        hayDatos: true,
        notas: [],
      },
    ],
  });

  it('consulta la matriz antes que la fuente e incluye sus notas', () => {
    const decision = assessCoverage({ matrix, source: S3_FEDERAL, stateCode: '00' });
    expect(decision).toMatchObject({ isCovered: false, reason: 'state-without-system' });
    if (!decision.isCovered) expect(decision.detail).toMatch(/Sin federales/u);
  });

  it('una entidad con datos en la matriz pero fuera del alcance de la fuente no tiene cobertura', () => {
    expect(assessCoverage({ matrix, source: S3_FEDERAL, stateCode: '14' })).toMatchObject({
      reason: 'state-without-system',
    });
    expect(
      assessCoverage({
        matrix,
        source: { ...S3_FEDERAL, scope: { stateCodes: ['14'] } },
        stateCode: '14',
      }),
    ).toEqual({ isCovered: true });
  });

  it('revisa el periodo de la fuente', () => {
    const source: Source = {
      ...S3_FEDERAL,
      scope: { stateCodes: ['14'], periodFrom: '2018-01-01', periodTo: '2022-12-31' },
    };
    expect(assessCoverage({ matrix, source, stateCode: '14', date: '2017-12' })).toMatchObject({
      reason: 'period-out-of-range',
    });
    expect(assessCoverage({ matrix, source, stateCode: '14', date: '2023-01-02' })).toMatchObject({
      reason: 'period-out-of-range',
    });
    expect(assessCoverage({ matrix, source, stateCode: '14', date: '2018-01' })).toEqual({
      isCovered: true,
    });
  });

  it('rechaza una matriz con otro formato', () => {
    expect(() => parseCoverageMatrix({ version: 2 })).toThrow(/formato/u);
    expect(() => parseCoverageMatrix({ version: 1, filas: [{ sistema: 'S9' }] })).toThrow(
      /fila inválida/u,
    );
  });

  it('elige la fuente que cubre la entidad', () => {
    const other: Source = {
      ...S3_FEDERAL,
      info: { ...S3_FEDERAL.info, id: 's3.y' },
      scope: { stateCodes: ['14'] },
    };
    expect(pickSource([S3_FEDERAL, other], '14')?.info.id).toBe('s3.y');
    expect(pickSource([S3_FEDERAL, other], '05')?.info.id).toBe('s3.x');
    expect(pickSource([], '05')).toBeNull();
  });

  it('la matriz real del repositorio tiene el formato esperado (sin asertar nombres)', () => {
    const real = parseCoverageMatrix(
      JSON.parse(
        readFileSync(new URL('../../../datos/cobertura/matriz.json', import.meta.url), 'utf8'),
      ),
    );
    expect(real.rows.length).toBeGreaterThan(100);
    // En la descarga real no hay sanciones federales: la regla debe responder «sin cobertura».
    expect(assessCoverage({ matrix: real, source: S3_FEDERAL, stateCode: '00' })).toMatchObject({
      isCovered: false,
      reason: 'state-without-system',
    });
  });
});

describe('clasificación de conductas y configuración publicada', () => {
  it('distingue faltas no graves, graves y delitos', () => {
    expect(classifyOffense('LGRA-49')).toBe('no-grave');
    expect(classifyOffense('LGRA-59')).toBe('grave');
    expect(classifyOffense('LGRA-72')).toBe('grave');
    expect(classifyOffense('CPF-217')).toBe('crime');
    expect(classifyOffense('OTRO')).toBe('unknown');
  });

  it('config/prioridad.json publica exactamente la configuración del código', () => {
    const published: unknown = JSON.parse(
      readFileSync(new URL('../config/prioridad.json', import.meta.url), 'utf8'),
    );
    expect(published).toEqual(PRIORITY_CONFIG);
  });

  it('los pesos son enteros y los umbrales están ordenados', () => {
    for (const factor of Object.values(PRIORITY_CONFIG.factors))
      expect(Number.isInteger(factor.weight)).toBe(true);
    expect(PRIORITY_CONFIG.levels.high).toBeGreaterThan(PRIORITY_CONFIG.levels.medium);
  });
});

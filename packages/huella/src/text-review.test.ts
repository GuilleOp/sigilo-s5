// Pruebas del revisor de reidentificación: casos positivos, negativos y posiciones con acentos.
// Todos los datos son sintéticos (CURP y RFC con estructura válida pero inventados).
import { describe, expect, it } from 'vitest';
import { reviewText } from './text-review.ts';
import type { TextFinding } from './text-review.ts';

const only = (text: string, kind: TextFinding['kind']): TextFinding[] =>
  reviewText(text).filter((finding) => finding.kind === kind);

const excerpts = (text: string, kind: TextFinding['kind']): string[] =>
  only(text, kind).map((finding) => finding.excerpt);

describe('reviewText: datos de contacto y oficiales', () => {
  it('detecta correos', () => {
    const text = 'Escríbeme a persona.prueba+1@correo-ficticio.example.mx por favor.';
    const [finding] = only(text, 'email');
    expect(finding?.excerpt).toBe('persona.prueba+1@correo-ficticio.example.mx');
    expect(finding?.severity).toBe('high');
    expect(finding?.suggestion).toMatch(/buzón anónimo/u);
  });

  it('detecta teléfonos de 10 dígitos con separadores y +52', () => {
    const text =
      'Llama al 55 1234 5678, al (442) 123-4567, al +52 1 33 9876 5432, al 81.2345.6789 o al 5512345678.';
    expect(excerpts(text, 'phone')).toEqual([
      '55 1234 5678',
      '(442) 123-4567',
      '+52 1 33 9876 5432',
      '81.2345.6789',
      '5512345678',
    ]);
    expect(only(text, 'phone').every((finding) => finding.severity === 'high')).toBe(true);
  });

  it('no confunde montos, folios o números cortos con teléfonos', () => {
    expect(only('El contrato fue por 1500000 pesos y el folio 123-456.', 'phone')).toEqual([]);
    expect(only('Número 123456789012345 de expediente.', 'phone')).toEqual([]);
  });

  it('detecta CURP sin reportarla también como RFC', () => {
    const text = 'Mi CURP es GOMA850315HQTRRN09, por si acaso.';
    const findings = reviewText(text);
    const curp = findings.filter((finding) => finding.kind === 'curp');
    expect(curp.map((finding) => finding.excerpt)).toEqual(['GOMA850315HQTRRN09']);
    expect(findings.some((finding) => finding.kind === 'rfc')).toBe(false);
  });

  it('detecta RFC de persona física y moral, en mayúsculas o minúsculas', () => {
    expect(excerpts('RFC: GOMA850315AB1 y la empresa ABC010203XY9.', 'rfc')).toEqual([
      'GOMA850315AB1',
      'ABC010203XY9',
    ]);
    expect(excerpts('rfc goma850315ab1', 'rfc')).toEqual(['goma850315ab1']);
  });

  it('no reporta palabras normales como RFC o CURP', () => {
    const text = 'La auditoría de 2026 revisó 15 contratos.';
    expect(only(text, 'rfc')).toEqual([]);
    expect(only(text, 'curp')).toEqual([]);
  });
});

describe('reviewText: fechas y horas', () => {
  it('detecta dd/mm/aaaa y sugiere solo el mes', () => {
    const [finding] = only('Ocurrió el 03/10/2026 en la mañana.', 'exact_date');
    expect(finding?.excerpt).toBe('03/10/2026');
    expect(finding?.severity).toBe('medium');
    expect(finding?.suggestion).toBe('Escribe solo el mes: octubre de 2026');
  });

  it('detecta fechas escritas y con día de la semana', () => {
    const text =
      'Fue el 3 de octubre de 2026. Luego, el martes 3 volvió. Y el miércoles 4 de Noviembre.';
    const findings = only(text, 'exact_date');
    expect(findings.map((finding) => finding.excerpt)).toEqual([
      '3 de octubre de 2026',
      'el martes 3',
      'miércoles 4 de Noviembre',
    ]);
    expect(findings[0]?.suggestion).toBe('Escribe solo el mes: octubre de 2026');
    expect(findings[2]?.suggestion).toBe('Escribe solo el mes: noviembre');
  });

  it('detecta horas exactas y sugiere un periodo', () => {
    const text =
      'Llegó a las 10:15 y salió a las 10 de la mañana; otro día a las cuatro de la tarde. Eran las 18:30.';
    const findings = only(text, 'exact_time');
    expect(findings.map((finding) => finding.excerpt)).toEqual([
      'a las 10:15',
      'a las 10 de la mañana',
      'a las cuatro de la tarde',
      '18:30',
    ]);
    expect(findings[1]?.suggestion).toMatch(/por la mañana/u);
    expect(findings[2]?.suggestion).toMatch(/por la tarde/u);
    expect(findings[3]?.suggestion).toMatch(/por la tarde/u);
  });

  it('no reporta meses o años sin día', () => {
    const text = 'Pasó en octubre de 2026, durante la tarde.';
    expect(only(text, 'exact_date')).toEqual([]);
    expect(only(text, 'exact_time')).toEqual([]);
  });
});

describe('reviewText: unicidad y rol propio', () => {
  it('detecta frases de unicidad con o sin acentos', () => {
    const text =
      'Soy el único con llave. Solo yo firmo. UNICAMENTE YO reviso. Es la única persona que entra. Nadie más que yo sabe.';
    expect(excerpts(text, 'uniqueness')).toEqual([
      'Soy el único',
      'Solo yo',
      'UNICAMENTE YO',
      'la única persona que',
      'Nadie más que yo',
    ]);
    expect(only(text, 'uniqueness').every((finding) => finding.severity === 'high')).toBe(true);
  });

  it('detecta el rol propio y las referencias a «mi» lugar de trabajo', () => {
    const text =
      'Soy la jefa de la unidad. Mi jefe lo pidió en mi área, junto a mi escritorio, en mi turno.';
    expect(excerpts(text, 'self_role')).toEqual([
      'Soy la jefa',
      'Mi jefe',
      'mi área',
      'mi escritorio',
      'mi turno',
    ]);
    expect(only(text, 'self_role')[1]?.suggestion).toMatch(/titular del área/u);
    expect(only(text, 'self_role')[1]?.suggestion).toMatch(/^Cambia «mi jefe»/u);
  });

  it('no reporta frases parecidas sin carga identificante', () => {
    const text = 'El director firmó solo. Ella es la jefa del área. Yo solo vi los documentos.';
    expect(only(text, 'uniqueness')).toEqual([]);
    expect(only(text, 'self_role')).toEqual([]);
  });
});

describe('reviewText: nombres propios', () => {
  it('detecta dos o más palabras capitalizadas que no inician oración', () => {
    const text = 'El pago lo autorizó Juan Pérez López con ayuda de María de la Luz Hernández.';
    const findings = only(text, 'proper_name');
    expect(findings.map((finding) => finding.excerpt)).toEqual([
      'Juan Pérez López',
      'María de la Luz Hernández',
    ]);
    expect(findings.every((finding) => finding.severity === 'low')).toBe(true);
  });

  it('ignora nombres institucionales y el inicio de oración', () => {
    const text = 'La Secretaría de Salud y la Fiscalía General revisaron. Ayer Llegó tarde.';
    expect(only(text, 'proper_name')).toEqual([]);
  });

  it('recorta títulos e instituciones alrededor del nombre', () => {
    expect(
      excerpts('Habló con el Licenciado Pedro Ramírez de la Dirección.', 'proper_name'),
    ).toEqual(['Pedro Ramírez']);
  });
});

describe('reviewText: posiciones y orden', () => {
  it('apunta al texto original aunque haya acentos y caracteres combinados', () => {
    const text = 'Ñandú: según él, sólo yo y nadie más que yo.';
    const decomposed = 'Pasó: Solo yo.'.replace('ó', 'ó');
    for (const sample of [text, decomposed]) {
      for (const finding of reviewText(sample)) {
        expect(sample.slice(finding.start, finding.end)).toBe(finding.excerpt);
      }
    }
    expect(excerpts(text, 'uniqueness')).toEqual(['sólo yo', 'nadie más que yo']);
    const [combined] = only(decomposed, 'uniqueness');
    expect(combined?.start).toBe(7);
    expect(combined?.excerpt).toBe('Solo yo');
  });

  it('respeta posiciones con emojis (pares sustitutos)', () => {
    const text = '😀😀 Escribe a ana@ejemplo.mx';
    const [finding] = only(text, 'email');
    expect(finding?.start).toBe(text.indexOf('ana@'));
    expect(finding?.end).toBe(text.length);
  });

  it('ordena por posición y no devuelve hallazgos solapados', () => {
    const text =
      'Soy el único que sabe. El martes 3 de octubre de 2026 a las 10:15 llamé al 55 1234 5678 y escribí a x@y.mx.';
    const findings = reviewText(text);
    for (let i = 1; i < findings.length; i++) {
      const previous = findings[i - 1];
      const current = findings[i];
      expect(previous && current && previous.end <= current.start).toBe(true);
    }
    expect(findings.map((finding) => finding.kind)).toEqual([
      'uniqueness',
      'exact_date',
      'exact_time',
      'phone',
      'email',
    ]);
  });

  it('devuelve una lista vacía para texto sin datos identificantes', () => {
    expect(reviewText('Se observaron pagos irregulares en varias obras públicas.')).toEqual([]);
    expect(reviewText('')).toEqual([]);
  });
});

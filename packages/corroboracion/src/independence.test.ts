// Pruebas de una persona = una corroboración: grupos de origen, ráfagas y posibles campañas.
import { describe, expect, it } from 'vitest';
import { DEMO_CASES, demoCase } from './demo-scenario.ts';
import { assessIndependence, linkSignals } from './independence.ts';
import type { IndexedComplaint } from './independence.ts';
import { similarityDigest } from './similarity.ts';

const KEY = new Uint8Array(32).fill(9);

function indexed(key: string, overrides: Partial<IndexedComplaint> = {}): IndexedComplaint {
  const item = demoCase(key);
  return {
    id: key,
    nodeId: item.nodeId,
    receivedAt: item.receivedAt,
    entry: item.entry,
    similarity: similarityDigest(item.narrative, KEY),
    ...overrides,
  };
}

describe('señales de independencia', () => {
  it('Marta y Luis cuentan como 2 fuentes independientes', () => {
    const result = assessIndependence([indexed('case.marta'), indexed('case.luis')]);
    expect(result.complaints).toBe(2);
    expect(result.independentSources).toBe(2);
    expect(result.byComplaint.get('case.luis')).toEqual({
      origin: 1,
      sameOriginCount: 1,
      flags: [],
      signals: [],
    });
  });

  it('las 3 denuncias del atacante cuentan como 1, marcada como posible campaña', () => {
    const attacks = DEMO_CASES.filter((item) => item.key.startsWith('case.attack')).map((item) =>
      indexed(item.key),
    );
    const result = assessIndependence(attacks);
    expect(result.complaints).toBe(3);
    expect(result.independentSources).toBe(1);
    for (const attack of attacks) {
      const status = result.byComplaint.get(attack.id);
      expect(status?.sameOriginCount).toBe(3);
      expect(status?.flags).toEqual(['possible_same_origin', 'possible_campaign']);
      expect(status?.signals).toContain('burst');
      expect(status?.signals).toContain('similar_text');
    }
  });

  it('dos relatos muy parecidos en días distintos son «posible mismo origen», no campaña', () => {
    const result = assessIndependence([
      indexed('case.attack-1'),
      indexed('case.attack-2', { receivedAt: '2026-11-20T09:00Z', nodeId: 'node.queretaro' }),
    ]);
    expect(result.independentSources).toBe(1);
    expect(result.byComplaint.get('case.attack-2')?.flags).toEqual(['possible_same_origin']);
    expect(result.byComplaint.get('case.attack-2')?.signals).toEqual(['similar_text']);
  });

  it('una ráfaga sin resumen se une solo con el mismo nodo y la misma entrada', () => {
    const base = indexed('case.attack-1', { similarity: null });
    const sameEntry = indexed('case.attack-2', { similarity: null });
    expect(linkSignals(base, sameEntry)).toEqual(['burst', 'same_node', 'same_entry']);
    expect(linkSignals(base, { ...sameEntry, entry: 'direct' })).toBeNull();
    expect(linkSignals(base, { ...sameEntry, receivedAt: '2026-11-11T20:00Z' })).toBeNull();
  });

  it('una ráfaga con relatos distintos no une a personas distintas', () => {
    const marta = indexed('case.marta');
    const luis = indexed('case.luis', { receivedAt: marta.receivedAt, entry: 'relay' });
    expect(linkSignals(marta, luis)).toBeNull();
  });

  it('una campaña lenta (más de 24 horas) queda como mismo origen, sin marca de campaña', () => {
    const result = assessIndependence([
      indexed('case.attack-1'),
      indexed('case.attack-2', { receivedAt: '2026-11-12T17:20Z' }),
      indexed('case.attack-3', { receivedAt: '2026-11-13T17:40Z' }),
    ]);
    const flags = result.byComplaint.get('case.attack-1')?.flags ?? [];
    expect(flags).not.toContain('possible_campaign');
  });

  it('el escenario rechaza una clave de caso desconocida', () => {
    expect(() => demoCase('case.inexistente')).toThrow('desconocido');
  });

  it('rechaza folios repetidos y horas inválidas', () => {
    expect(() => assessIndependence([indexed('case.marta'), indexed('case.marta')])).toThrow(
      'repetidas',
    );
    expect(() =>
      assessIndependence([
        indexed('case.marta', { receivedAt: 'no-es-hora' }),
        indexed('case.luis'),
      ]),
    ).toThrow('Hora');
  });
});

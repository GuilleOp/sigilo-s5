// Generador del mapa de entidades: proyección, simplificación y el módulo que se publica.
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  MAP_ENTITIES,
  MAP_INSET,
  MAP_SIZE,
} from '../apps/web/src/pages/observatory/mapa-entidades.ts';
import { buildMap, lambertInegi, ringArea } from './mapa-entidades.ts';

const ROOT = resolve(import.meta.dirname, '..');

/** Cuadrado de lado `size` grados con esquina en (lon, lat), con muchos vértices en cada lado. */
function square(lon: number, lat: number, size: number): number[][] {
  const steps = 40;
  const ring: number[][] = [];
  for (let i = 0; i < steps; i++) ring.push([lon + (size * i) / steps, lat]);
  for (let i = 0; i < steps; i++) ring.push([lon + size, lat + (size * i) / steps]);
  for (let i = 0; i < steps; i++) ring.push([lon + size - (size * i) / steps, lat + size]);
  for (let i = 0; i < steps; i++) ring.push([lon, lat + size - (size * i) / steps]);
  ring.push([lon, lat]);
  return ring;
}

function sample(): FeatureCollection<MultiPolygon, Record<string, string>> {
  const entity = (code: string, lon: number) => ({
    type: 'Feature' as const,
    properties: { cve_ent: code, nomgeo: `Entidad ${code}`, nom_abrev: code, pob_total: '1000' },
    geometry: { type: 'MultiPolygon' as const, coordinates: [[square(lon, 22, 1)]] },
  });
  return { type: 'FeatureCollection', features: [entity('01', -101), entity('09', -100)] };
}

/** Vértices absolutos de una ruta con «M x y l dx dy … z». */
function absolutePoints(d: string): [number, number][] {
  const points: [number, number][] = [];
  for (const ring of d.split('z').filter(Boolean)) {
    const [move = '', relative = ''] = ring.slice(1).split('l');
    const numbers = (text: string) => (text.match(/-?\d+(?:\.\d+)?/gu) ?? []).map(Number);
    const [x0 = 0, y0 = 0] = numbers(move);
    let x = x0;
    let y = y0;
    points.push([x, y]);
    const deltas = numbers(relative);
    for (let i = 0; i + 1 < deltas.length; i += 2) {
      x += deltas[i] ?? 0;
      y += deltas[i + 1] ?? 0;
      points.push([x, y]);
    }
  }
  return points;
}

describe('proyección cónica conforme de Lambert del INEGI', () => {
  it('el origen (−102°, 12°) cae en (0, 0) y los ejes van al este y al norte', () => {
    const [x0, y0] = lambertInegi(-102, 12);
    expect(Math.abs(x0)).toBeLessThan(1e-6);
    expect(Math.abs(y0)).toBeLessThan(1e-6);
    const [xEast] = lambertInegi(-101, 12);
    const [, yNorth] = lambertInegi(-102, 13);
    expect(xEast).toBeGreaterThan(100_000);
    expect(yNorth).toBeGreaterThan(100_000);
  });

  it('la escala es exacta en los paralelos estándar (un grado de longitud mide lo de siempre)', () => {
    // Sobre 17.5° de latitud, un grado de longitud mide unos 106.2 km en el elipsoide GRS80.
    const [a] = lambertInegi(-102.5, 17.5);
    const [b] = lambertInegi(-101.5, 17.5);
    expect((b - a) / 1000).toBeCloseTo(106.2, 0);
  });
});

describe('simplificación sobre la topología', () => {
  it('reduce vértices sin abrir huecos en el límite compartido', () => {
    const map = buildMap(sample() as never, 1e6);
    expect(map.entities.map((entity) => entity.code)).toEqual(['01', '09']);
    const [left, right] = map.entities.map((entity) => absolutePoints(entity.d));
    // Cada cuadrado tenía 160 vértices; quedan sus esquinas.
    expect(left?.length).toBeLessThan(10);
    // El límite común (borde este de 01, oeste de 09) usa las mismas coordenadas en ambos.
    const rightKeys = new Set((right ?? []).map(([x, y]) => `${x},${y}`));
    const shared = (left ?? []).filter(([x, y]) => rightKeys.has(`${x},${y}`));
    expect(shared.length).toBeGreaterThanOrEqual(2);
    expect(map.width).toBe(1000);
  });

  it('el área con signo de un anillo es la del cordón de zapato', () => {
    expect(
      ringArea([
        [0, 0],
        [2, 0],
        [2, 3],
        [0, 3],
        [0, 0],
      ]),
    ).toBe(6);
  });
});

describe('módulo generado del mapa', () => {
  it('trae las 32 entidades, una vez cada una, con su población', () => {
    const codes = MAP_ENTITIES.map((entity) => entity.code);
    expect(codes).toEqual(Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, '0')));
    for (const entity of MAP_ENTITIES) {
      expect(entity.population).toBeGreaterThan(500_000);
      expect(entity.d).toMatch(/^M[\d.]+ [\d.]+l.*z$/u);
    }
  });

  it('todas las rutas caben en el lienzo y el recuadro cae dentro', () => {
    for (const entity of MAP_ENTITIES) {
      for (const [x, y] of absolutePoints(entity.d)) {
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(MAP_SIZE.width + 0.5);
        expect(y).toBeLessThanOrEqual(MAP_SIZE.height + 0.5);
      }
    }
    const [x, y, width, height] = MAP_INSET;
    expect(x + width).toBeLessThanOrEqual(MAP_SIZE.width);
    expect(y + height).toBeLessThanOrEqual(MAP_SIZE.height);
  });

  it('pesa menos de 80 KB', () => {
    const bytes = statSync(join(ROOT, 'apps/web/src/pages/observatory/mapa-entidades.ts')).size;
    expect(bytes).toBeLessThan(80 * 1024);
  });
});

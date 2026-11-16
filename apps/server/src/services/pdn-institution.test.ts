// Pruebas del contexto público de la dependencia en la PDN: solo campos institucionales, caché con
// vencimiento, copia guardada sin conexión y ninguna petición con datos de la denuncia.
import { describe, expect, it } from 'vitest';
import {
  PDN_ENTES_URL,
  createPdnInstitutionService,
  institutionKey,
  readDirectoryRecord,
} from './pdn-institution.ts';

const DIRECTORY = {
  data: {
    id: 196,
    nombre: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL',
    ambitoGobierno: 'Federal',
    poderGobierno: 'Ejecutivo',
    controlOIC: false,
    controlTribunal: false,
    sistema1: true,
    sistema2: true,
    sistema3: false,
    sistema6: true,
    entidad: '00',
    municipio: null,
    date_updated: '2025-05-02T22:30:53.389Z',
    // Campos que el nodo nunca debe copiar aunque la fuente los trajera.
    nombreServidor: 'Persona Ficticia Uno',
    curp: 'XEXX010101HNEXXXA4',
  },
};
const SUMMARY = { procedimientos: 1060983, amounts: { total: 2191658814304.28 } };
const TOP = [
  { _id: { id: 'IMSS-192', name: 'Instituto Mexicano del Seguro Social' }, total: 512752317381.6 },
];

function fakeFetch(calls: string[], isDown = () => false) {
  return async (url: string) => {
    calls.push(url);
    if (isDown()) throw new TypeError('fetch failed');
    const body = url.startsWith(PDN_ENTES_URL)
      ? DIRECTORY
      : url.endsWith('/summary')
        ? SUMMARY
        : TOP;
    return Response.json(body);
  };
}

describe('contexto PDN de la dependencia', () => {
  it('copia solo campos institucionales y descarta cualquier dato de personas', () => {
    const record = readDirectoryRecord(DIRECTORY);
    expect(record?.name).toBe('INSTITUTO MEXICANO DEL SEGURO SOCIAL');
    const text = JSON.stringify(record);
    expect(text).not.toContain('Persona Ficticia');
    expect(text).not.toContain('XEXX');
  });

  it('consulta solo con el identificador público del ente y ubica al comprador del S6', async () => {
    const calls: string[] = [];
    const service = createPdnInstitutionService({ fetch: fakeFetch(calls) });
    const context = await service.context('PDN-00-196');
    expect(context?.status).toBe('live');
    expect(context?.contracting?.topBuyerRank).toBe(1);
    expect(calls[0]).toBe(`${PDN_ENTES_URL}/196`);
    expect(calls.every((url) => !url.includes('folio'))).toBe(true);
    expect(JSON.stringify(context)).not.toContain('Persona Ficticia');
  });

  it('usa la caché dentro del plazo y la copia guardada si la PDN no responde', async () => {
    const calls: string[] = [];
    let down = false;
    let now = new Date('2026-11-16T12:00:00Z');
    const service = createPdnInstitutionService({
      fetch: fakeFetch(calls, () => down),
      now: () => now,
      ttlMs: 60_000,
    });
    await service.context('PDN-00-196');
    const first = calls.length;
    await service.context('PDN-00-196');
    expect(calls.length).toBe(first);
    down = true;
    now = new Date('2026-11-16T13:00:00Z');
    expect((await service.context('PDN-00-196'))?.status).toBe('cached');
    expect((await service.context('PDN-00-7258'))?.status).toBe('unavailable');
  });

  it('rechaza identificadores que no son de un ente real del catálogo', async () => {
    const service = createPdnInstitutionService({ fetch: fakeFetch([]) });
    expect(await service.context('ente.ficticio')).toBeNull();
  });

  it('compara nombres sin mayúsculas, acentos ni signos', () => {
    expect(institutionKey('Instituto Mexicano del Seguro Social')).toBe(
      institutionKey('INSTITUTO  MEXICANO DEL SEGURO SOCIAL.'),
    );
  });
});

// Pruebas de la limpieza de pruebas en Node, con las funciones de lienzo de Huella Cero simuladas:
// fallo cerrado si la copia conserva metadatos y carreras con una prueba quitada a medio limpiar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Huella from '@sigilo/huella';
import type { ImageMetadataReport } from '@sigilo/huella';
import { removeEvidence, reportDraftStore } from '../../state/report-draft.ts';
import type { EvidenceItem } from '../../state/report-draft.ts';

const huella = vi.hoisted(() => ({
  sanitizeImage: vi.fn<(blob: Blob) => Promise<{ blob: Blob; width: number; height: number }>>(),
  rasterizePdf: vi.fn<(blob: Blob) => Promise<Blob[]>>(),
  inspectImageMetadata: vi.fn<(blob: Blob, options?: unknown) => Promise<ImageMetadataReport>>(),
}));

vi.mock('@sigilo/huella', async (importOriginal) => ({
  ...(await importOriginal<typeof Huella>()),
  ...huella,
}));
vi.mock('../../config/pdf-worker.ts', () => ({ PDF_WORKER_URL: '/pdf.worker.min.mjs' }));

const { cleanEvidence, UNVERIFIED_CLEAN_ERROR } = await import('./evidence-processing.ts');

const NO_METADATA: ImageMetadataReport = { hasAnyMetadata: false, otherFields: [] };
const WITH_GPS: ImageMetadataReport = {
  hasAnyMetadata: true,
  gps: { latitude: 20.5, longitude: -100.25 },
  otherFields: [],
};

function addItem(kind: EvidenceItem['kind'] = 'image'): string {
  const item: EvidenceItem = {
    id: `prueba-${kind}`,
    fileName: kind === 'pdf' ? 'oficio.pdf' : 'foto.jpg',
    kind,
    original: new Blob(['original']),
    status: 'needs-cleaning',
    clean: [],
  };
  reportDraftStore.set((draft) => ({ ...draft, evidence: [...draft.evidence, item] }));
  return item.id;
}

function itemOf(id: string): EvidenceItem | undefined {
  return reportDraftStore.get().evidence.find((item) => item.id === id);
}

/** Promesa que la prueba resuelve cuando quiere, para simular una limpieza lenta. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let createdUrls: string[];

beforeEach(() => {
  reportDraftStore.reset();
  createdUrls = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:prueba-${createdUrls.length}`;
    createdUrls.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  huella.sanitizeImage.mockResolvedValue({ blob: new Blob(['limpia']), width: 1, height: 1 });
  huella.rasterizePdf.mockResolvedValue([new Blob(['p1']), new Blob(['p2'])]);
  huella.inspectImageMetadata.mockResolvedValue(NO_METADATA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cleanEvidence', () => {
  it('guarda la copia limpia verificada, admitiendo solo el perfil sRGB genérico', async () => {
    const id = addItem();
    await cleanEvidence(id);
    expect(itemOf(id)).toMatchObject({ status: 'clean', cleanVerified: true });
    expect(itemOf(id)?.clean).toHaveLength(1);
    expect(huella.inspectImageMetadata).toHaveBeenCalledWith(expect.any(Blob), {
      allowGenericSrgbProfile: true,
    });
  });

  it('falla cerrado: si la copia conserva metadatos queda en error y sin copias', async () => {
    const id = addItem();
    huella.inspectImageMetadata.mockResolvedValue(WITH_GPS);
    await cleanEvidence(id);
    expect(itemOf(id)).toMatchObject({
      status: 'error',
      clean: [],
      cleanVerified: false,
      error: UNVERIFIED_CLEAN_ERROR,
    });
    expect(createdUrls).toEqual([]);
  });

  it('falla cerrado si una sola página de un PDF conserva metadatos', async () => {
    const id = addItem('pdf');
    huella.inspectImageMetadata.mockResolvedValueOnce(NO_METADATA).mockResolvedValueOnce(WITH_GPS);
    await cleanEvidence(id);
    expect(itemOf(id)).toMatchObject({ status: 'error', clean: [] });
    expect(createdUrls).toEqual([]);
  });

  it('no crea URL de objeto si la prueba se quitó mientras se limpiaba', async () => {
    const id = addItem();
    const slow = deferred<{ blob: Blob; width: number; height: number }>();
    huella.sanitizeImage.mockReturnValue(slow.promise);
    const cleaning = cleanEvidence(id);
    removeEvidence(id);
    slow.resolve({ blob: new Blob(['limpia']), width: 1, height: 1 });
    await cleaning;
    expect(itemOf(id)).toBeUndefined();
    expect(createdUrls).toEqual([]);
  });

  it('no deja nada si el borrador se vació (salida rápida) durante la verificación', async () => {
    const id = addItem();
    const slow = deferred<ImageMetadataReport>();
    huella.inspectImageMetadata.mockReturnValue(slow.promise);
    const cleaning = cleanEvidence(id);
    await vi.waitFor(() => expect(huella.inspectImageMetadata).toHaveBeenCalled());
    reportDraftStore.reset();
    slow.resolve(NO_METADATA);
    await cleaning;
    expect(reportDraftStore.get().evidence).toEqual([]);
    expect(createdUrls).toEqual([]);
  });

  it('registra el error de limpieza sin copias', async () => {
    const id = addItem();
    huella.sanitizeImage.mockRejectedValue(new Error('No se pudo leer la imagen.'));
    await cleanEvidence(id);
    expect(itemOf(id)).toMatchObject({
      status: 'error',
      clean: [],
      error: 'No se pudo leer la imagen.',
    });
  });
});

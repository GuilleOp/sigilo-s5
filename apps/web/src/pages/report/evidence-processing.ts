// Procesamiento local de pruebas: clasificación, inspección de metadatos, limpieza y conversión.
// Seguridad: el original nunca sale del navegador; solo se suben las copias limpias.
import { MAX_EVIDENCE_ITEMS } from '@sigilo/contracts';
import {
  classifyFile,
  digestBlob,
  inspectImageMetadata,
  rasterizePdf,
  sanitizeImage,
} from '@sigilo/huella';
import { PDF_WORKER_URL } from '../../config/pdf-worker.ts';
import { localId, reportDraftStore, updateEvidence } from '../../state/report-draft.ts';
import type { CleanImage, EvidenceItem } from '../../state/report-draft.ts';
import { cleanImageCount } from '../../state/report-validation.ts';

function toClean(blob: Blob): CleanImage {
  return { id: localId(), blob, url: URL.createObjectURL(blob) };
}

/** Agrega archivos: rechaza los no admitidos con guía e inspecciona los aceptados. */
export function addFiles(files: readonly File[]): void {
  for (const file of files) {
    const classification = classifyFile(file);
    if (classification.kind === 'rejected') {
      reportDraftStore.set((draft) => ({
        ...draft,
        rejected: [
          ...draft.rejected,
          {
            id: localId(),
            fileName: file.name,
            reason: classification.reason ?? 'Este archivo no se admite.',
            guide: classification.guide ?? '',
          },
        ],
      }));
      continue;
    }
    const item: EvidenceItem = {
      id: localId(),
      fileName: file.name,
      kind: classification.kind,
      original: file,
      ...(classification.kind === 'image' ? { originalUrl: URL.createObjectURL(file) } : {}),
      status: 'inspecting',
      clean: [],
    };
    reportDraftStore.set((draft) => ({ ...draft, evidence: [...draft.evidence, item] }));
    void inspect(item);
  }
}

async function inspect(item: EvidenceItem): Promise<void> {
  try {
    const originalSha256 = await digestBlob(item.original);
    const metadata = item.kind === 'image' ? await inspectImageMetadata(item.original) : undefined;
    updateEvidence(item.id, {
      originalSha256,
      ...(metadata === undefined ? {} : { metadata }),
      status: 'needs-cleaning',
    });
  } catch (error) {
    updateEvidence(item.id, { status: 'error', error: messageOf(error) });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo procesar el archivo.';
}

/** Limpia una imagen o convierte un PDF en imágenes. */
export async function cleanEvidence(id: string): Promise<void> {
  const item = reportDraftStore.get().evidence.find((candidate) => candidate.id === id);
  if (item === undefined || item.status === 'cleaning' || item.status === 'clean') return;
  updateEvidence(id, { status: 'cleaning' });
  try {
    const blobs =
      item.kind === 'image'
        ? [(await sanitizeImage(item.original)).blob]
        : await rasterizePdf(item.original, { workerSrc: PDF_WORKER_URL });
    const available = MAX_EVIDENCE_ITEMS - cleanImageCount(reportDraftStore.get());
    if (blobs.length > available) {
      throw new Error(
        `Solo puedes enviar ${MAX_EVIDENCE_ITEMS} imágenes en total y esta prueba agregaría ${blobs.length}. Quita alguna o divide el PDF.`,
      );
    }
    // Comprobación: la copia limpia no debe conservar metadatos. Se omite el perfil ICC porque lo
    // agrega el propio codificador del lienzo (sRGB genérico); con él nunca se daría por limpia.
    const checks = await Promise.all(
      blobs.map((blob) => inspectImageMetadata(blob, { includeColorProfile: false })),
    );
    updateEvidence(id, {
      status: 'clean',
      clean: blobs.map(toClean),
      cleanVerified: checks.every((report) => !report.hasAnyMetadata),
    });
  } catch (error) {
    updateEvidence(id, { status: 'error', error: messageOf(error) });
  }
}

/** Limpia todas las pruebas pendientes, una tras otra. */
export async function cleanAllEvidence(): Promise<void> {
  for (const item of reportDraftStore.get().evidence) {
    if (item.status === 'needs-cleaning') await cleanEvidence(item.id);
  }
}

/** Quita un archivo rechazado de la lista. */
export function dismissRejected(id: string): void {
  reportDraftStore.set((draft) => ({
    ...draft,
    rejected: draft.rejected.filter((item) => item.id !== id),
  }));
}

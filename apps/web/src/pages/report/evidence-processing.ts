// Procesamiento local de pruebas: clasificación, inspección de metadatos, limpieza y conversión.
// Seguridad: el original nunca sale del navegador; solo se suben las copias limpias y verificadas.
// Cada resultado se anuncia con el anunciador global (las tarjetas cambian sin mover el foco).
import { MAX_EVIDENCE_ITEMS } from '@sigilo/contracts';
import {
  classifyFile,
  digestBlob,
  inspectImageMetadata,
  rasterizePdf,
  sanitizeImage,
} from '@sigilo/huella';
import { PDF_WORKER_URL } from '../../config/pdf-worker.ts';
import { announce } from '../../lib/announce.ts';
import { localId, reportDraftStore, updateEvidence } from '../../state/report-draft.ts';
import type { CleanImage, EvidenceItem } from '../../state/report-draft.ts';
import { cleanImageCount } from '../../state/report-validation.ts';
import { revealedCount } from './metadata-summary.ts';

/** Agrega archivos: rechaza los no admitidos con guía e inspecciona los aceptados. */
export function addFiles(files: readonly File[]): void {
  const rejectedMessages: string[] = [];
  for (const file of files) {
    const classification = classifyFile(file);
    if (classification.kind === 'rejected') {
      rejectedMessages.push(
        `No se puede usar «${file.name}». ${classification.reason ?? 'Este archivo no se admite.'}`,
      );
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
  if (rejectedMessages.length > 0) announce(rejectedMessages.join(' '));
}

/** Frase que se anuncia al terminar de revisar un archivo. */
function inspectionMessage(item: EvidenceItem, metadata: EvidenceItem['metadata']): string {
  if (item.kind === 'pdf') {
    return `Revisamos «${item.fileName}». Pulsa «Convertir a imágenes» para quitarle los datos escondidos.`;
  }
  const count = metadata === undefined || !metadata.hasAnyMetadata ? 0 : revealedCount(metadata);
  if (count === 0) {
    return `Revisamos tu foto «${item.fileName}». No encontramos datos ocultos. De todos modos pulsa «Limpiar foto».`;
  }
  const found = count === 1 ? '1 dato oculto' : `${count} datos ocultos`;
  return `Revisamos tu foto «${item.fileName}». Encontramos ${found}. Revisa la lista «Esta foto revela» y pulsa «Limpiar foto».`;
}

/** Indica si la prueba sigue en el borrador (pudo quitarse mientras se procesaba). */
function exists(id: string): boolean {
  return reportDraftStore.get().evidence.some((item) => item.id === id);
}

async function inspect(item: EvidenceItem): Promise<void> {
  try {
    const originalSha256 = await digestBlob(item.original);
    const metadata = item.kind === 'image' ? await inspectImageMetadata(item.original) : undefined;
    if (!exists(item.id)) return;
    updateEvidence(item.id, {
      originalSha256,
      ...(metadata === undefined ? {} : { metadata }),
      status: 'needs-cleaning',
    });
    announce(inspectionMessage(item, metadata));
  } catch (error) {
    if (!exists(item.id)) return;
    updateEvidence(item.id, { status: 'error', error: messageOf(error) });
    announce(`No pudimos revisar «${item.fileName}». ${messageOf(error)}`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo procesar el archivo.';
}

/** Error que se muestra si la copia limpia todavía tiene metadatos. */
export const UNVERIFIED_CLEAN_ERROR =
  'La copia limpia todavía tenía datos escondidos, así que no la usaremos. Quita esta prueba o prueba con otra foto.';

/**
 * Guarda las copias limpias solo si la prueba sigue en el borrador y caben en el máximo. Es
 * síncrono: entre la comprobación y la actualización nadie puede quitar la prueba, así que cada
 * URL de objeto creada queda en el borrador y se revoca al quitarla o con la salida rápida.
 */
function commitClean(id: string, blobs: readonly Blob[]): boolean {
  if (!exists(id)) return false;
  const available = MAX_EVIDENCE_ITEMS - cleanImageCount(reportDraftStore.get());
  if (blobs.length > available) {
    throw new Error(
      `Solo puedes enviar ${MAX_EVIDENCE_ITEMS} imágenes en total y esta prueba agregaría ${blobs.length}. Quita alguna o divide el PDF.`,
    );
  }
  const clean: CleanImage[] = blobs.map((blob) => ({
    id: localId(),
    blob,
    url: URL.createObjectURL(blob),
  }));
  updateEvidence(id, { status: 'clean', clean, cleanVerified: true });
  return true;
}

/**
 * Limpia una imagen o convierte un PDF en imágenes y vuelve a inspeccionar cada copia.
 * Seguridad: falla cerrado. Si alguna copia conserva metadatos, la prueba queda en `error` sin
 * copias (`clean: []`), así que nada sin verificar puede subirse. El perfil ICC se omite en la
 * comprobación porque lo agrega el propio codificador del lienzo (sRGB genérico).
 */
export async function cleanEvidence(id: string): Promise<void> {
  const item = reportDraftStore.get().evidence.find((candidate) => candidate.id === id);
  if (item === undefined || item.status === 'cleaning' || item.status === 'clean') return;
  updateEvidence(id, { status: 'cleaning' });
  try {
    const blobs =
      item.kind === 'image'
        ? [(await sanitizeImage(item.original)).blob]
        : await rasterizePdf(item.original, { workerSrc: PDF_WORKER_URL });
    if (blobs.length > MAX_EVIDENCE_ITEMS - cleanImageCount(reportDraftStore.get())) {
      throw new Error(
        `Solo puedes enviar ${MAX_EVIDENCE_ITEMS} imágenes en total y esta prueba agregaría ${blobs.length}. Quita alguna o divide el PDF.`,
      );
    }
    const checks = await Promise.all(
      blobs.map((blob) => inspectImageMetadata(blob, { includeColorProfile: false })),
    );
    if (!exists(id)) return;
    if (checks.some((report) => report.hasAnyMetadata)) {
      updateEvidence(id, {
        status: 'error',
        clean: [],
        cleanVerified: false,
        error: UNVERIFIED_CLEAN_ERROR,
      });
      announce(`No pudimos limpiar «${item.fileName}». ${UNVERIFIED_CLEAN_ERROR}`);
      return;
    }
    if (!commitClean(id, blobs)) return;
    announce(
      item.kind === 'pdf'
        ? `Listo: convertimos «${item.fileName}» en ${blobs.length === 1 ? '1 imagen limpia' : `${blobs.length} imágenes limpias`} sin datos escondidos.`
        : `Listo: la copia limpia de «${item.fileName}» ya no tiene datos escondidos.`,
    );
  } catch (error) {
    if (!exists(id)) return;
    updateEvidence(id, { status: 'error', clean: [], error: messageOf(error) });
    announce(`No pudimos limpiar «${item.fileName}». ${messageOf(error)}`);
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

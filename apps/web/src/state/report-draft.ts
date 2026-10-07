// Borrador de la denuncia en memoria: modo, identidad, hechos y pruebas procesadas.
import type { ImageMetadataReport } from '@sigilo/huella';
import { createMemoryStore } from './memory-store.ts';

/** Imagen limpia lista para subir. */
export interface CleanImage {
  id: string;
  blob: Blob;
  url: string;
}

/** Estado de una prueba aceptada. */
export type EvidenceStatus = 'inspecting' | 'needs-cleaning' | 'cleaning' | 'clean' | 'error';

/** Prueba aceptada (imagen o PDF). */
export interface EvidenceItem {
  id: string;
  fileName: string;
  kind: 'image' | 'pdf';
  original: Blob;
  /** Vista previa local del original (solo imágenes). */
  originalUrl?: string;
  originalSha256?: string;
  metadata?: ImageMetadataReport;
  status: EvidenceStatus;
  error?: string;
  clean: CleanImage[];
  /** La copia limpia se volvió a inspeccionar y no tiene metadatos. */
  cleanVerified?: boolean;
}

/** Archivo rechazado con su guía. */
export interface RejectedFile {
  id: string;
  fileName: string;
  reason: string;
  guide: string;
}

/** Hechos tal como los escribe la persona. */
export interface FactsDraft {
  stateCode: string;
  municipalityCode: string;
  entityId: string;
  offenseCode: string;
  periodMonth: string;
  periodYear: string;
  accused: string;
  description: string;
}

/** Borrador completo. */
export interface ReportDraft {
  mode: 'anonymous' | 'sealed' | null;
  identity: { fullName: string; contact: string; witnesses: string };
  protectionRequested: boolean;
  facts: FactsDraft;
  evidence: EvidenceItem[];
  rejected: RejectedFile[];
}

/** Borrador vacío. */
export function emptyDraft(): ReportDraft {
  return {
    mode: null,
    identity: { fullName: '', contact: '', witnesses: '' },
    protectionRequested: false,
    facts: {
      stateCode: '',
      municipalityCode: '',
      entityId: '',
      offenseCode: '',
      periodMonth: '',
      periodYear: '',
      accused: '',
      description: '',
    },
    evidence: [],
    rejected: [],
  };
}

/** Libera las vistas previas (URL de objeto) de una prueba. */
export function revokeEvidenceUrls(item: EvidenceItem): void {
  if (item.originalUrl !== undefined) URL.revokeObjectURL(item.originalUrl);
  item.clean.forEach((image) => URL.revokeObjectURL(image.url));
}

/** Borrador global; sobrevive a la navegación interna, no a una recarga. */
export const reportDraftStore = createMemoryStore(emptyDraft, (previous) =>
  previous.evidence.forEach(revokeEvidenceUrls),
);

/** Identificador local aleatorio (no sale del navegador). */
export function localId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(8)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Actualiza una prueba por identificador. */
export function updateEvidence(id: string, patch: Partial<EvidenceItem>): void {
  reportDraftStore.set((draft) => ({
    ...draft,
    evidence: draft.evidence.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

/** Quita una prueba y libera sus vistas previas. */
export function removeEvidence(id: string): void {
  reportDraftStore.set((draft) => {
    draft.evidence.filter((item) => item.id === id).forEach(revokeEvidenceUrls);
    return { ...draft, evidence: draft.evidence.filter((item) => item.id !== id) };
  });
}

/** Cambia un campo de los hechos. */
export function setFact<K extends keyof FactsDraft>(field: K, value: FactsDraft[K]): void {
  reportDraftStore.set((draft) => ({ ...draft, facts: { ...draft.facts, [field]: value } }));
}

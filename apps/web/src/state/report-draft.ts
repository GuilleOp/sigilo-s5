// Borrador de la denuncia en memoria: modo, identidad, hechos y pruebas procesadas.
import type { ImageMetadataReport } from '@sigilo/huella';
import { resetAnonymityLoader } from '../anonymity/report-anonymity.ts';
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

/**
 * Relación de quien denuncia con el ente, para estimar su grupo de anonimato. Nunca sale del
 * navegador: solo decide qué aviso se muestra.
 */
export interface WorkplaceDraft {
  /** `yes`: trabaja o trabajó ahí; `no`: no; `''`: no respondió. */
  worksThere: 'yes' | 'no' | '';
  /** Área en texto libre (opcional). */
  area: string;
}

/** Tipo de identificador para la corroboración ciega, o `''` si la persona no quiere usarla. */
export type CorroborationKindDraft = '' | 'ocid' | 'rfc' | 'servidor';

/**
 * Corroboración ciega opcional. El identificador nunca viaja: solo una etiqueta que el navegador
 * calcula con el evaluador sin revelárselo.
 */
export interface CorroborationDraft {
  kind: CorroborationKindDraft;
  /** Contrato (ocid) o RFC del proveedor. */
  value: string;
  /** Nombre de la persona servidora pública (con `servidor`; el ente es el de los hechos). */
  personName: string;
}

/** Borrador completo. */
export interface ReportDraft {
  mode: 'anonymous' | 'sealed' | null;
  identity: { fullName: string; contact: string; witnesses: string };
  protectionRequested: boolean;
  facts: FactsDraft;
  evidence: EvidenceItem[];
  rejected: RejectedFile[];
  workplace: WorkplaceDraft;
  corroboration: CorroborationDraft;
  /**
   * Autoridad de la red elegida por la persona; `''` significa «la que propone el sistema».
   * Solo existe con la red; con un solo nodo la denuncia llega al buzón general.
   */
  destinationAuthorityId: string;
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
    workplace: { worksThere: '', area: '' },
    corroboration: { kind: '', value: '', personName: '' },
    destinationAuthorityId: '',
  };
}

/** Libera las vistas previas (URL de objeto) de una prueba. */
export function revokeEvidenceUrls(item: EvidenceItem): void {
  if (item.originalUrl !== undefined) URL.revokeObjectURL(item.originalUrl);
  item.clean.forEach((image) => URL.revokeObjectURL(image.url));
}

/**
 * Borrador global; sobrevive a la navegación interna, no a una recarga. Al reiniciarlo empieza otra
 * denuncia, con su propio cargador del grupo de anonimato.
 */
export const reportDraftStore = createMemoryStore(emptyDraft, (previous) => {
  previous.evidence.forEach(revokeEvidenceUrls);
  resetAnonymityLoader();
});

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

// Tipos de entrada del auditor (acuerdos, casos y actuaciones que la autoridad ya ve) y de salida
// (señales con evidencia lado a lado). Nunca incluyen la identidad sellada ni datos de contacto.
import type {
  AuditRuleId,
  AuditSubjectKind,
  ClosureReason,
  LegalReference,
} from '@sigilo/contracts';
import type { Verification } from '@sigilo/contexto-pdn';

/** Calificación de la falta que hizo la autoridad. */
export type Qualification = 'grave' | 'no-grave';

/** Tipo de acuerdo: de cierre (incluye el archivo) o de calificación de la falta (LGRA, art. 100). */
export type AuthorityActKind = 'closure' | 'qualification';

/**
 * Acuerdo de cierre, de archivo o de calificación emitido por una autoridad. El nombre se conserva
 * por compatibilidad; AUD-01 y AUD-03 se aplican a cualquiera de ellos.
 */
export interface ClosureAct {
  /** Clave estable del acuerdo en el nodo. */
  id: string;
  authorityId: string;
  /** Expediente citado en el acuerdo. */
  fileNumber: string;
  /** Día del acuerdo (AAAA-MM-DD). */
  issuedOn: string;
  /** Motivo de cierre del catálogo, si se registró. */
  reason: ClosureReason | null;
  /** Texto del acuerdo tal como lo emitió la autoridad. */
  text: string;
  /** Calificación de la falta que contiene el acuerdo, si la hay. */
  qualification: Qualification | null;
  /** Caso del nodo al que corresponde, si es una denuncia del sistema (los importados no tienen). */
  caseRef: string | null;
  /**
   * Tipo de acuerdo. Si falta, es de calificación cuando no tiene motivo de cierre y el texto
   * califica la falta; en otro caso, de cierre.
   */
  kind?: AuthorityActKind;
}

/** Sinónimo con el nombre general. */
export type AuthorityAct = ClosureAct;

/** Tipo de actuación registrada en un caso. */
export type CaseActivityKind =
  | 'accepted'
  /** Inicio del procedimiento correspondiente que registra la autoridad (LGRA, art. 64, fr. II). */
  | 'investigation_started'
  /** Admisión del Informe de Presunta Responsabilidad Administrativa: desde aquí aplica la caducidad. */
  | 'report_admitted'
  | 'information_request'
  | 'note'
  | 'qualification'
  | 'archive_notified'
  | 'closure'
  | 'reopened'
  | 'other';

/** Actuación de la autoridad en un caso, tal como queda en la bitácora del nodo. */
export interface CaseActivity {
  on: string;
  kind: CaseActivityKind;
  /** `false` si la actuación no tiene contenido (sin texto, sin documento, sin diligencia). */
  hasContent: boolean;
}

/** Prueba adjunta ya limpiada por Huella Cero; solo su descripción, nunca el archivo. */
export interface AttachmentRef {
  label: string;
}

/** Caso (denuncia) tal como lo ve la autoridad que lo atiende. */
export interface CaseRecord {
  caseRef: string;
  authorityId: string;
  /** Conducta del catálogo que eligió quien denunció. */
  offenseCode: string;
  /** Día en que la autoridad tuvo conocimiento (recepción del turnado). */
  receivedOn: string;
  /** Periodo de los hechos (AAAA-MM). */
  occurredPeriod: string;
  attachments: readonly AttachmentRef[];
  /** Personas independientes que denuncian lo mismo, incluida quien denunció (mínimo 1). */
  independentReporters: number;
  /** Verificaciones de `@sigilo/contexto-pdn` sobre lo que afirma la denuncia. */
  verifications: readonly Verification[];
  /**
   * Clave seudónima de la persona denunciada (por ejemplo, un digesto) para contar concentración;
   * nunca el nombre.
   */
  accusedKey: string | null;
  /** Claves de los proveedores citados (RFC o identificador público). */
  supplierKeys: readonly string[];
  /** Grupo de posible campaña coordinada: las denuncias de un grupo cuentan como una. */
  campaignGroupId: string | null;
  /** Si quien denunció es identificable (el archivo debe notificársele, LGRA art. 100). */
  isReporterIdentifiable: boolean;
  activities: readonly CaseActivity[];
}

/** Un par de la evidencia lado a lado: lo que dice el acuerdo frente a la prueba o el dato. */
export interface EvidencePair {
  label: string;
  /** Texto del acuerdo (o de la actuación) que se compara; `null` si el acuerdo no dice nada. */
  actText: string | null;
  /** La prueba, el dato público o el cálculo con el que se contrasta. */
  counterpart: string;
  /** De dónde sale el contraste: «Catálogo de conductas», «S6 federal…», «Bitácora del nodo». */
  counterpartSource: string;
}

/** Fundamento de la señal. */
export interface SignalBasis {
  references: readonly LegalReference[];
  text: string;
}

/** Señal del auditor. No decide: alguien la revisa. */
export interface AuditSignal {
  ruleId: AuditRuleId;
  key: string;
  /** Nombre corto en español. */
  name: string;
  /** Explicación sencilla de por qué se señaló. */
  explanation: string;
  subject: { kind: AuditSubjectKind; id: string; authorityId: string };
  evidence: readonly EvidencePair[];
  basis: SignalBasis;
  /** Siempre `SIGNAL_NOTE`. */
  note: string;
  /** `rules` para las reglas; `model` solo en sugerencias orientativas. */
  source: 'rules' | 'model';
  /** Medidas de la regla, enteras (proporciones en milésimas) para que se puedan recalcular. */
  metrics: Readonly<Record<string, number>>;
  /** Versión de las reglas que la produjo. */
  rulesVersion: string;
}

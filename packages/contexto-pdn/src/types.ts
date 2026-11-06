// Tipos de las fuentes (S1, S2, S3, S6 y lista tipo 69-B) y de las verificaciones con tres resultados.
// Solo para el nodo y el panel de la autoridad: nunca se usan en el navegador de quien denuncia.

/** Sistema de la PDN (S3 se divide en servidores y particulares) o la lista tipo 69-B. */
export type PdnSystem = 'S1' | 'S2' | 'S3S' | 'S3P' | 'S6' | 'L69B';

/** Identidad y fecha de una fuente, para citarla en cada dato que se muestra. */
export interface SourceInfo {
  /** Clave estable, por ejemplo `s6.federal`. */
  id: string;
  system: PdnSystem;
  /** Nombre corto en español, por ejemplo «S6 federal». */
  label: string;
  /** Fecha de los datos: `AAAA-MM` o `AAAA-MM-DD`. */
  dataAsOf: string;
  isSynthetic: boolean;
}

/** Qué cubre una fuente. */
export interface SourceScope {
  /** Claves INEGI que la fuente cubre (`00` es lo federal). */
  stateCodes: readonly string[];
  /**
   * Claves de institución conectadas (`<entidad>|<nombre normalizado>`, como en datos/proceso).
   * Si falta, se asume que la fuente cubre a todas las instituciones de sus entidades.
   */
  institutionKeys?: readonly string[];
  /** Periodo cubierto (AAAA-MM-DD), si se conoce. */
  periodFrom?: string;
  periodTo?: string;
}

/** Base común de las fuentes. */
export interface Source {
  info: SourceInfo;
  scope: SourceScope;
}

/** Persona servidora pública buscada en una fuente. */
export interface PersonRef {
  fullName: string;
  institution: string;
  stateCode: string;
}

/** Organización declarada en S1 (participación en empresas, sociedades o asociaciones). */
export interface DeclaredOrganization {
  name: string;
  /** Tipo de relación declarada (por ejemplo, `DECLARANTE`). */
  relation: string;
  /** Tipo de participación (por ejemplo, «Socio»). */
  participationType: string;
}

/** Declaración de S1 con los campos que usa la regla de conflicto. */
export interface DeclarationRecord {
  recordId: string;
  fullName: string;
  institution: string;
  area: string;
  position: string;
  organizations: readonly DeclaredOrganization[];
}

/** S1: intereses declarados. */
export interface DeclaredInterestsSource extends Source {
  findDeclaration(person: PersonRef): DeclarationRecord | null;
}

/** Registro de S2 (persona que interviene en contrataciones). */
export interface ProcurementStaffRecord {
  recordId: string;
  fullName: string;
  institution: string;
  position: string;
  areaType: string;
  isContractingArea: boolean;
  supervisor: { fullName: string; position: string } | null;
}

/** S2: cadena de mando y áreas de contratación. */
export interface ProcurementStaffSource extends Source {
  findStaff(person: PersonRef): ProcurementStaffRecord | null;
}

/** Expediente de S3 (servidores o particulares sancionados). */
export interface SanctionRecord {
  recordId: string;
  fileNumber: string;
  fullName: string;
  institution: string;
  stateCode: string;
  /** Claves de sanción normalizadas (`AMONESTACION`, `SUSPENSION`, `INHABILITACION`…). */
  sanctions: readonly string[];
  /** Descripción legible de la sanción, si la fuente la trae. */
  sanctionText: string;
  /**
   * Clave de la institución sancionadora del registro (`<entidad>|<nombre normalizado>`), si la
   * fuente la trae. Sirve para no confundir expedientes con el mismo número de otro ente.
   */
  institutionKey?: string;
  resolutionDate: string | null;
  authority: string;
}

/** S3: sanciones. */
export interface SanctionsSource extends Source {
  /**
   * Expedientes con ese número EN esa entidad. Los números se repiten entre entidades (en la
   * descarga real, «12/2022» aparece en Jalisco, Estado de México y Tlaxcala).
   */
  findByFileNumber(fileNumber: string, stateCode: string): readonly SanctionRecord[];
}

/** Tipo de procedimiento OCDS. */
export type ProcurementMethod = 'direct' | 'limited' | 'open' | 'selective';

/** Proveedor de una adjudicación. */
export interface Supplier {
  id: string | null;
  name: string;
}

/** Procedimiento de S6 (formato OCDS, última release por `ocid`). */
export interface ContractRecord {
  ocid: string;
  contractIds: readonly string[];
  buyer: { id: string | null; name: string };
  method: ProcurementMethod | null;
  methodDetails: string | null;
  rationale: string | null;
  tenderers: number | null;
  awards: readonly {
    id: string | null;
    suppliers: readonly Supplier[];
    amount: number | null;
    currency: string;
  }[];
  /** Fecha de inicio del procedimiento o de firma (AAAA-MM-DD), si existe. */
  date: string | null;
}

/** S6: contrataciones. */
export interface ContractsSource extends Source {
  findContract(reference: { ocid?: string; contractId?: string }): ContractRecord | null;
}

/** Situación en la lista tipo 69-B. */
export type TaxListStatus = 'definitive' | 'presumed' | 'distorted' | 'favorable';

/** Entrada de la lista tipo 69-B. */
export interface TaxListEntry {
  rfc: string;
  name: string;
  status: TaxListStatus;
  publishedOn: string;
}

/** Lista tipo 69-B (contribuyentes con operaciones presuntamente inexistentes). */
export interface TaxListSource extends Source {
  findByRfc(rfc: string): TaxListEntry | null;
}

/** Cita de una fuente: «S6 federal, datos a enero de 2023». */
export interface SourceCitation {
  sourceId: string;
  label: string;
  dataAsOf: string;
  text: string;
}

/** Resultado de una verificación. La ausencia de un registro nunca es evidencia. */
export type VerificationOutcome = 'confirmed' | 'contradicted' | 'no_coverage';

/** Motivo de «sin cobertura». */
export type NoCoverageReason =
  | 'state-without-system'
  | 'institution-not-connected'
  | 'period-out-of-range'
  | 'record-not-found'
  | 'ambiguous-record';

/** Qué se verificó. */
export type CheckKind = 'contract' | 'sanction' | 'tax-list-69b';

/** Un dato de la fuente que sustenta el resultado. */
export interface Evidence {
  label: string;
  value: string;
  citation: SourceCitation;
}

/** Diferencia entre lo afirmado y lo registrado. */
export interface Difference {
  field: string;
  claimed: string;
  recorded: string;
  text: string;
}

interface VerificationBase {
  check: CheckKind;
  /** Frase corta para la interfaz de la autoridad. */
  title: string;
  /** Explicación en lenguaje claro, con fuente y fecha. */
  explanation: string;
  evidence: readonly Evidence[];
  citations: readonly SourceCitation[];
}

/** Verificación con tres resultados (ADR 0008). */
export type Verification =
  | (VerificationBase & { outcome: 'confirmed' })
  | (VerificationBase & { outcome: 'contradicted'; differences: readonly Difference[] })
  | (VerificationBase & {
      outcome: 'no_coverage';
      reason: NoCoverageReason;
      /** Fuentes que la autoridad puede consultar por su cuenta (el sistema no las consulta). */
      alternatives: readonly string[];
    });

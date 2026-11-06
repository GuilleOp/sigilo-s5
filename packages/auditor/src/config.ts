// Umbrales publicados de las reglas del auditor. Son del prototipo: se afinan con datos reales que
// el repositorio no tiene. Se publican idénticos en config/umbrales.json (una prueba lo exige).
import type { ClosureReason } from '@sigilo/contracts';

/** Configuración declarativa de las reglas. Las proporciones van en milésimas (enteros). */
export interface AuditorConfig {
  version: string;
  templateClosure: {
    /** Palabras por shingle. */
    shingleSize: number;
    /** Similitud de Jaccard mínima, en milésimas, para que dos acuerdos «coincidan». */
    similarityPermille: number;
    /** Acuerdos de la misma autoridad que deben coincidir con el evaluado. */
    minMatches: number;
    /** Ventana hacia atrás desde el acuerdo evaluado, en días naturales. */
    windowDays: number;
    /** Motivos de cierre que no se comparan (acumular o canalizar es formulario por naturaleza). */
    excludedReasons: readonly ClosureReason[];
    /** Un shingle es «repetido» si aparece en al menos esta proporción de los acuerdos coincidentes. */
    repeatedSharePermille: number;
  };
  archiveAgainstEvidence: {
    /** Personas independientes a partir de las cuales hay corroboración. */
    minIndependentReporters: number;
  };
  deadlines: {
    /** Meses sin actuaciones con contenido tras los que una actuación vacía se señala (ADR 0007). */
    emptyActivityAfterMonths: number;
    /** Meses sin actuaciones con contenido en la investigación para «inactividad prolongada». */
    prolongedInactivityMonths: number;
    /** Días de anticipación del aviso de inactividad prolongada. */
    inactivityWarningDays: number;
  };
  corroboratedArchiveRate: {
    windowDays: number;
    /** Casos corroborados mínimos para calcular la tasa (con menos, no se opina). */
    minCases: number;
    minRatePermille: number;
  };
  archiveConcentration: {
    windowDays: number;
    /** Archivos mínimos (contando cada campaña como uno) del mismo denunciado o proveedor. */
    minArchives: number;
    /** Proporción mínima de archivos entre los casos de esa clave. */
    minArchiveRatePermille: number;
  };
  prePrescription: {
    /** Días antes de la prescripción que cuentan como «justo antes». */
    windowDays: number;
    /** Meses mínimos sin actuaciones antes del movimiento. */
    minPriorGapMonths: number;
  };
}

/** Configuración publicada del prototipo. */
export const AUDITOR_CONFIG: AuditorConfig = {
  version: '1.1.0',
  templateClosure: {
    shingleSize: 3,
    similarityPermille: 750,
    minMatches: 5,
    windowDays: 365,
    excludedReasons: ['joined', 'channeled'],
    repeatedSharePermille: 500,
  },
  archiveAgainstEvidence: {
    minIndependentReporters: 2,
  },
  deadlines: {
    emptyActivityAfterMonths: 4,
    prolongedInactivityMonths: 6,
    inactivityWarningDays: 30,
  },
  corroboratedArchiveRate: {
    windowDays: 365,
    minCases: 5,
    minRatePermille: 500,
  },
  archiveConcentration: {
    windowDays: 365,
    minArchives: 3,
    minArchiveRatePermille: 800,
  },
  prePrescription: {
    windowDays: 60,
    minPriorGapMonths: 4,
  },
};

/** Versión de las reglas que se registra en cada evento de bitácora. */
export const RULES_VERSION = AUDITOR_CONFIG.version;

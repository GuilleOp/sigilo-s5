// Lecturas para la estadística de la PDN y su tabla congelada `pdn_statistics_months` (de solo
// agregar). Solo se leen columnas de clasificación (fechas, autoridad, entidad, conducta, acción,
// motivo, calificación y estatus): nunca hechos, identidad, mensajes ni pruebas.
import type { DatabaseSync } from 'node:sqlite';
import {
  AuthorityIdSchema,
  ClosureReasonSchema,
  ComplaintStatusSchema,
  MonthPeriodSchema,
  OffenseCodeSchema,
  PublishedCountSchema,
  StateCodeSchema,
} from '@sigilo/contracts';
import type { ClosureReason, ComplaintStatus, ProcedureAction } from '@sigilo/contracts';
import { z } from 'zod';
import { readInteger, readOptionalText, readText } from './database.ts';

/** Denuncia con solo sus columnas de clasificación. */
export interface StatisticsComplaint {
  folio: string;
  receivedOn: string;
  receivedLegalOn: string;
  stateCode: string;
  offenseCode: string;
}

/** Paso del trámite con lo que necesita la estadística. */
export interface StatisticsStep {
  folio: string;
  position: number;
  action: ProcedureAction;
  on: string;
  legalOn: string;
  authorityId: string;
  closureReason: ClosureReason | null;
}

const TimelinessSchema = z
  .object({ aTiempo: PublishedCountSchema, vencidas: PublishedCountSchema })
  .strict();
const MedianDaysSchema = z.number().int().nonnegative().nullable();

/**
 * Fila congelada tal como se guarda en `rows_json`: ya redondeada y suprimida, con las claves
 * internas. Es un formato de almacenamiento, distinto del que se publica a la PDN
 * (`PdnStatisticsRow`, en español y con `{ clave, valor }`), así que el formato publicado puede
 * cambiar sin migrar los meses ya congelados (la tabla no admite cambios).
 */
export const FrozenStatisticsRowSchema = z
  .object({
    mes: MonthPeriodSchema,
    autoridad: z.object({ clave: AuthorityIdSchema, nombre: z.string().min(1).max(300) }).strict(),
    entidad: StateCodeSchema,
    conducta: OffenseCodeSchema,
    recibidas: PublishedCountSchema,
    turnadas: TimelinessSchema,
    aceptadas: TimelinessSchema,
    archivadas: z.record(ClosureReasonSchema, PublishedCountSchema),
    calificadas: z
      .object({ graves: PublishedCountSchema, noGraves: PublishedCountSchema })
      .strict(),
    escalamientos: PublishedCountSchema,
    estatusAlCierre: z.record(ComplaintStatusSchema, PublishedCountSchema),
    tiemposMedianosDiasHabiles: z
      .object({ turno: MedianDaysSchema, aceptacion: MedianDaysSchema, archivo: MedianDaysSchema })
      .strict(),
  })
  .strict();
export type FrozenStatisticsRow = z.infer<typeof FrozenStatisticsRowSchema>;

/** Operaciones de la estadística de la PDN. */
export interface PdnStatisticsRepository {
  /** Meses (`AAAA-MM`) anteriores a `beforeMonth` con denuncias o con actos del trámite. */
  listActiveMonthsBefore(beforeMonth: string): string[];
  /** Meses ya congelados. */
  listFrozenMonths(): string[];
  /** Denuncias recibidas en el mes o con algún paso, calificación o regla en el mes. */
  complaintsTouching(month: string): StatisticsComplaint[];
  /** Todos los pasos de esas denuncias hasta el último día del mes, en orden. */
  stepsUntil(folios: readonly string[], lastDay: string): StatisticsStep[];
  /** Calificaciones del mes: autoridad, folio y gravedad. */
  qualificationsOf(month: string): { folio: string; authorityId: string; isSerious: boolean }[];
  /** Reglas de escalamiento cumplidas en el mes, por folio y autoridad. */
  escalationsOf(month: string): { folio: string; authorityId: string }[];
  /** Último estatus de cada folio recibido en el mes con cambio hasta `lastDay`. */
  statusAt(month: string, lastDay: string): Map<string, ComplaintStatus>;
  insertMonth(month: string, rows: readonly FrozenStatisticsRow[]): void;
  listFrozenRows(): FrozenStatisticsRow[];
}

const RowsSchema = z.array(FrozenStatisticsRowSchema);

/** Crea el repositorio sobre `db`. */
export function createPdnStatisticsRepository(db: DatabaseSync): PdnStatisticsRepository {
  const monthsStatement = db.prepare(
    `SELECT month FROM (
       SELECT substr(received_on, 1, 7) AS month FROM complaints
       UNION SELECT substr(step_on, 1, 7) FROM procedure_steps
       UNION SELECT substr(on_day, 1, 7) FROM qualifications
       UNION SELECT substr(triggered_on, 1, 7) FROM rule_triggers
     ) WHERE month < ? ORDER BY month`,
  );
  const frozenMonthsStatement = db.prepare(
    'SELECT month FROM pdn_statistics_months ORDER BY month',
  );
  const complaintsStatement = db.prepare(
    `SELECT folio, received_on, received_legal_on, state_code, offense_code FROM complaints
     WHERE substr(received_on, 1, 7) = ?
        OR folio IN (SELECT folio FROM procedure_steps WHERE substr(step_on, 1, 7) = ?)
        OR folio IN (SELECT folio FROM qualifications WHERE substr(on_day, 1, 7) = ?)
        OR folio IN (SELECT folio FROM rule_triggers WHERE substr(triggered_on, 1, 7) = ?)
     ORDER BY folio`,
  );
  const stepsStatement = db.prepare(
    `SELECT folio, position, action, step_on, legal_on, authority_id, closure_reason
     FROM procedure_steps WHERE folio = ? AND step_on <= ? ORDER BY position`,
  );
  const qualificationsStatement = db.prepare(
    `SELECT folio, authority_id, severity FROM qualifications WHERE substr(on_day, 1, 7) = ?
     ORDER BY folio, position`,
  );
  const escalationsStatement = db.prepare(
    `SELECT folio, authority_id FROM rule_triggers
     WHERE substr(triggered_on, 1, 7) = ? AND effect = 'escalate' ORDER BY folio`,
  );
  const statusStatement = db.prepare(
    `SELECT s.folio, s.status FROM status_changes s JOIN complaints c ON c.folio = s.folio
     WHERE substr(c.received_on, 1, 7) = ? AND s.changed_on <= ?
     ORDER BY s.folio, s.position`,
  );
  const insertStatement = db.prepare(
    'INSERT INTO pdn_statistics_months (month, rows_json) VALUES (?, ?)',
  );
  const frozenRowsStatement = db.prepare(
    'SELECT rows_json FROM pdn_statistics_months ORDER BY month',
  );
  return {
    listActiveMonthsBefore: (beforeMonth) =>
      monthsStatement.all(beforeMonth).map((row) => readText(row, 'month')),
    listFrozenMonths: () => frozenMonthsStatement.all().map((row) => readText(row, 'month')),
    complaintsTouching: (month) =>
      complaintsStatement.all(month, month, month, month).map((row) => ({
        folio: readText(row, 'folio'),
        receivedOn: readText(row, 'received_on'),
        receivedLegalOn: readOptionalText(row, 'received_legal_on') ?? readText(row, 'received_on'),
        stateCode: readText(row, 'state_code'),
        offenseCode: readText(row, 'offense_code'),
      })),
    stepsUntil: (folios, lastDay) =>
      folios.flatMap((folio) =>
        stepsStatement.all(folio, lastDay).map((row) => ({
          folio: readText(row, 'folio'),
          position: readInteger(row, 'position'),
          action: readText(row, 'action') as ProcedureAction,
          on: readText(row, 'step_on'),
          legalOn: readText(row, 'legal_on'),
          authorityId: readText(row, 'authority_id'),
          closureReason: readOptionalText(row, 'closure_reason') as ClosureReason | null,
        })),
      ),
    qualificationsOf: (month) =>
      qualificationsStatement.all(month).map((row) => ({
        folio: readText(row, 'folio'),
        authorityId: readText(row, 'authority_id'),
        isSerious: readText(row, 'severity') === 'serious',
      })),
    escalationsOf: (month) =>
      escalationsStatement.all(month).map((row) => ({
        folio: readText(row, 'folio'),
        authorityId: readText(row, 'authority_id'),
      })),
    statusAt: (month, lastDay) => {
      const result = new Map<string, ComplaintStatus>();
      for (const row of statusStatement.all(month, lastDay)) {
        result.set(readText(row, 'folio'), readText(row, 'status') as ComplaintStatus);
      }
      return result;
    },
    insertMonth: (month, rows) => {
      insertStatement.run(month, JSON.stringify(rows));
    },
    listFrozenRows: () =>
      frozenRowsStatement
        .all()
        .flatMap((row) => RowsSchema.parse(JSON.parse(readText(row, 'rows_json')))),
  };
}

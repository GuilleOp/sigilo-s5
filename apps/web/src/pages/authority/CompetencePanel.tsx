// «Competencia por dependencia» (cuenta de operación del nodo): cada dependencia de la entidad del
// nodo (o cada ente federal, en el nodo federal), precargada del catálogo de entes de la PDN, con
// quién la investiga y su distintivo; pistas del S1, el S2 y el S3 calculadas sin conexión; asignar
// el OIC de un ente o de un grupo entero, marcar «sin OIC designado → lo atiende…» con fundamento o
// dejarlo pendiente; importar y exportar en CSV; y firmar la versión nueva de la tabla de funciones
// con la llave del nodo, después de revisar los cambios. Esta cuenta nunca ve denuncias.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPETENCE_HINTS_BASE_PATH, entityAssignmentsOf } from '@sigilo/contracts';
import type {
  CompetenceSaveResponse,
  CompetenceView,
  EntityAssignment,
  EntityCompetenceView,
  FunctionHolder,
} from '@sigilo/contracts';
import type { CompetenceHintsFile } from '@sigilo/anonimato';
import {
  COMPETENCE_BADGE_LABELS,
  compareEntityGroups,
  csvToEntities,
  entitiesToCsv,
  percentOf,
} from '@sigilo/red';
import type { CompetenceBadge } from '@sigilo/red';
import { Alert } from '../../components/Alert.tsx';
import { SelectField, TextField } from '../../components/Field.tsx';
import { TableScroll } from '../../components/TableScroll.tsx';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { OperationSession } from './authority-session.ts';

/** Texto de cada estado de la competencia. */
const STATUS_TEXT: Readonly<Record<EntityCompetenceView['status'], string>> = {
  assigned: 'Su OIC',
  without_oic: 'Sin OIC designado, lo atiende',
  general: 'Regla de todo su orden',
  pending: 'Pendiente',
};

/** Qué hace la persona con una dependencia (o con un grupo). */
type Choice = 'authority' | 'institution' | 'without_oic' | 'pending';

/** Formulario de edición: el mismo para una dependencia y para un grupo. */
interface EditorState {
  choice: Choice;
  authorityId: string;
  institutionName: string;
  /** «Sin OIC designado»: quién la atiende (`authority.…` o el nombre de una institución). */
  attendedBy: string;
  legalBasis: string;
  identifiedOnly: boolean;
}

const EMPTY_EDITOR: EditorState = {
  choice: 'authority',
  authorityId: '',
  institutionName: '',
  attendedBy: '',
  legalBasis: '',
  identifiedOnly: false,
};

/** Fila de la pantalla: el ente del servidor con su asignación del borrador, si tiene. */
interface Row {
  entity: EntityCompetenceView;
  draft: EntityAssignment | undefined;
  badge: CompetenceBadge;
  status: EntityCompetenceView['status'];
  holderName: string | null;
  legalBasis: string | null;
}

/** Descarga del mismo origen, sin cookies ni referer (como los fragmentos de entes). */
async function loadHints(code: string): Promise<CompetenceHintsFile> {
  const response = await fetch(`${COMPETENCE_HINTS_BASE_PATH}${code}.json`, {
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    mode: 'same-origin',
  });
  if (!response.ok) throw new Error('Sin pistas.');
  return (await response.json()) as CompetenceHintsFile;
}

/** Pistas de un ente en lenguaje claro. */
export function hintText(hints: CompetenceHintsFile | null, entityId: string): string {
  const row = hints?.entes[entityId];
  const parts: string[] = [];
  if (row?.[0] !== undefined && row[0] !== null) {
    parts.push(`aparece en S1 con ${row[0]} personas (rango)`);
  }
  if (row?.[1] === 1) parts.push('tiene áreas de contratación (S2)');
  return parts.length === 0 ? 'sin datos' : parts.join('; ');
}

function holderOf(
  editor: EditorState,
  authorities: CompetenceView['authorities'],
): FunctionHolder | null {
  if (editor.choice === 'authority') {
    return authorities.some((item) => item.authorityId === editor.authorityId)
      ? { kind: 'authority', authorityId: editor.authorityId }
      : null;
  }
  if (editor.choice === 'institution') {
    const name = editor.institutionName.trim();
    return name === '' ? null : { kind: 'institution', name };
  }
  if (editor.choice === 'without_oic') {
    const value = editor.attendedBy.trim();
    if (value === '') return null;
    return authorities.some((item) => item.authorityId === value)
      ? { kind: 'authority', authorityId: value }
      : { kind: 'institution', name: value };
  }
  return null;
}

/**
 * Asignación que resulta del formulario, o el mensaje de lo que falta. «Sin OIC designado» exige
 * quién la atiende y su fundamento (CPEUM art. 109 fr. III: lo normal es que tenga su propio OIC).
 */
export function assignmentFrom(
  entityId: string,
  editor: EditorState,
  authorities: CompetenceView['authorities'],
): EntityAssignment | string {
  const basis = editor.legalBasis.trim();
  const extra = {
    ...(basis === '' ? {} : { legalBasis: basis }),
    ...(editor.identifiedOnly ? { requiresIdentifiedReporter: true as const } : {}),
  };
  if (editor.choice === 'pending') return { entityId, status: 'pending' };
  const holder = holderOf(editor, authorities);
  if (holder === null) {
    return editor.choice === 'authority'
      ? 'Elige la autoridad registrada que es su órgano interno de control.'
      : editor.choice === 'institution'
        ? 'Escribe el nombre oficial del órgano interno de control.'
        : 'Escribe o elige quién atiende a la dependencia.';
  }
  if (editor.choice === 'without_oic') {
    if (basis === '') return 'Escribe el fundamento legal de que otra autoridad la atienda.';
    return { entityId, status: 'without_oic', holder, ...extra };
  }
  return { entityId, status: 'assigned', holder, ...extra };
}

function editorFrom(row: Row, authorities: CompetenceView['authorities']): EditorState {
  const holder = row.draft?.holder ?? row.entity.holder;
  const isAuthority = (id: string) => authorities.some((item) => item.authorityId === id);
  const base = {
    ...EMPTY_EDITOR,
    legalBasis: row.draft?.legalBasis ?? row.entity.legalBasis ?? '',
    identifiedOnly: row.draft?.requiresIdentifiedReporter === true,
  };
  const status = row.draft?.status ?? row.entity.status;
  if (status === 'pending' || holder === null || holder === undefined) {
    return { ...base, choice: row.draft === undefined ? 'authority' : 'pending' };
  }
  const text =
    holder.kind === 'authority'
      ? holder.authorityId
      : holder.kind === 'institution'
        ? holder.name
        : '';
  if (status === 'without_oic') return { ...base, choice: 'without_oic', attendedBy: text };
  if (holder.kind === 'authority' && isAuthority(holder.authorityId)) {
    return { ...base, choice: 'authority', authorityId: holder.authorityId };
  }
  return { ...base, choice: 'institution', institutionName: text };
}

function badgeFor(
  assignment: EntityAssignment,
  authorities: CompetenceView['authorities'],
): CompetenceBadge {
  const { holder } = assignment;
  if (holder === undefined) return 'pending';
  if (holder.kind !== 'authority') return 'named';
  return authorities.find((item) => item.authorityId === holder.authorityId)?.hasKeys === true
    ? 'keys'
    : 'named';
}

function nameOf(holder: FunctionHolder, authorities: CompetenceView['authorities']): string {
  if (holder.kind === 'institution') return holder.name;
  if (holder.kind === 'observer') return holder.observerId;
  return (
    authorities.find((item) => item.authorityId === holder.authorityId)?.name ?? holder.authorityId
  );
}

/** Distintivo con forma y texto (nunca solo el color, WCAG 1.4.1). */
function Badge({ badge }: { badge: CompetenceBadge }) {
  return (
    <span className="competence-badge" data-badge={badge} data-testid="competence-badge">
      {COMPETENCE_BADGE_LABELS[badge]}
    </span>
  );
}

interface EditorProps {
  idPrefix: string;
  editor: EditorState;
  authorities: CompetenceView['authorities'];
  onChange: (next: EditorState) => void;
  error: string;
}

/** Opciones de asignación: el OIC con llaves, un OIC nombrado, «sin OIC designado» o pendiente. */
function AssignmentEditor({ idPrefix, editor, authorities, onChange, error }: EditorProps) {
  const set = (patch: Partial<EditorState>) => onChange({ ...editor, ...patch });
  const choices: { value: Choice; title: string; text: string }[] = [
    {
      value: 'authority',
      title: 'Asignar su OIC registrado',
      text: 'Una autoridad investigadora del directorio, con llaves: la denuncia le llega cifrada.',
    },
    {
      value: 'institution',
      title: 'Nombrar su OIC (pendiente de alta)',
      text: 'Mientras no tenga llaves, sus denuncias van a la autoridad receptora con la nota de turnarlas a él.',
    },
    {
      value: 'without_oic',
      title: 'Sin OIC designado: lo atiende otra autoridad',
      text: 'Solo con fundamento legal. Todo municipio tiene su OIC (CPEUM, art. 109, fr. III).',
    },
    {
      value: 'pending',
      title: 'Dejar pendiente',
      text: 'Sus denuncias van a la autoridad receptora, que las turna al OIC del ente.',
    },
  ];
  return (
    <div className="competence-editor">
      <fieldset>
        <legend>¿Quién investiga a esta dependencia?</legend>
        {choices.map((choice) => (
          <label key={choice.value} className="choice">
            <input
              type="radio"
              name={`${idPrefix}-choice`}
              value={choice.value}
              checked={editor.choice === choice.value}
              onChange={() => set({ choice: choice.value })}
              data-testid={`${idPrefix}-choice-${choice.value}`}
            />
            <span>
              <span className="choice__title">{choice.title}</span>
              <span className="field__hint">{choice.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {editor.choice === 'authority' && (
        <SelectField
          id={`${idPrefix}-authority`}
          label="Autoridad registrada"
          value={editor.authorityId}
          onChange={(event) => set({ authorityId: event.target.value })}
          data-testid={`${idPrefix}-authority`}
        >
          <option value="">Elige una autoridad</option>
          {authorities.map((item) => (
            <option key={item.authorityId} value={item.authorityId}>
              {item.name}
              {item.hasKeys ? '' : ' (sin llaves vigentes)'}
            </option>
          ))}
        </SelectField>
      )}
      {editor.choice === 'institution' && (
        <TextField
          id={`${idPrefix}-institution`}
          label="Nombre oficial del órgano interno de control"
          value={editor.institutionName}
          onChange={(event) => set({ institutionName: event.target.value })}
          data-testid={`${idPrefix}-institution`}
        />
      )}
      {editor.choice === 'without_oic' && (
        <>
          <TextField
            id={`${idPrefix}-attended`}
            label="Quién la atiende"
            hint="El nombre de la institución, o la clave authority.… de una autoridad registrada."
            value={editor.attendedBy}
            onChange={(event) => set({ attendedBy: event.target.value })}
            list={`${idPrefix}-attended-options`}
            data-testid={`${idPrefix}-attended`}
          />
          <datalist id={`${idPrefix}-attended-options`}>
            {authorities.map((item) => (
              <option key={item.authorityId} value={item.authorityId}>
                {item.name}
              </option>
            ))}
          </datalist>
        </>
      )}
      {editor.choice !== 'pending' && (
        <>
          <TextField
            id={`${idPrefix}-basis`}
            label={
              editor.choice === 'without_oic' ? 'Fundamento legal' : 'Fundamento legal (opcional)'
            }
            hint="Ley y artículo, en lenguaje claro."
            required={editor.choice === 'without_oic'}
            value={editor.legalBasis}
            onChange={(event) => set({ legalBasis: event.target.value })}
            data-testid={`${idPrefix}-basis`}
          />
          <label className="choice">
            <input
              type="checkbox"
              checked={editor.identifiedOnly}
              onChange={(event) => set({ identifiedOnly: event.target.checked })}
            />
            <span>
              <span className="choice__title">Solo admite denuncias con nombre y firma</span>
              <span className="field__hint">
                Una denuncia anónima nunca se le envía (por ejemplo, una entidad de fiscalización
                cuya ley lo exige).
              </span>
            </span>
          </label>
        </>
      )}
      {error !== '' && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface CompetencePanelProps {
  session: OperationSession;
}

/** Pantalla «Competencia por dependencia». */
export function CompetencePanel({ session }: CompetencePanelProps) {
  const [view, setView] = useState<CompetenceView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [hints, setHints] = useState<CompetenceHintsFile | null>(null);
  const [draft, setDraft] = useState<ReadonlyMap<string, EntityAssignment>>(new Map());
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [badgeFilter, setBadgeFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [editorError, setEditorError] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkOnlyPending, setBulkOnlyPending] = useState(true);
  const [bulkEditor, setBulkEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [bulkError, setBulkError] = useState('');
  const [review, setReview] = useState<CompetenceSaveResponse | null>(null);
  const [saveError, setSaveError] = useState('');
  const [isBusy, setBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.getCompetence(session.token).then(
      (loaded) => {
        setView(loaded);
        setDraft(new Map(entityAssignmentsOf(loaded.table).map((item) => [item.entityId, item])));
        setLoadError('');
        loadHints(loaded.stateCode ?? '00').then(setHints, () => setHints(null));
      },
      (failure: unknown) =>
        setLoadError(
          describeError(
            failure,
            'No pudimos cargar la competencia por dependencia. Este nodo debe estar en la red y tener su tabla de funciones.',
          ),
        ),
    );
  }, [session.token]);

  useEffect(() => load(), [load]);

  const original = useMemo(
    () =>
      new Map(
        view === null
          ? []
          : entityAssignmentsOf(view.table).map((item) => [item.entityId, JSON.stringify(item)]),
      ),
    [view],
  );

  const rows: Row[] = useMemo(() => {
    if (view === null) return [];
    return view.entities.map((entity) => {
      const entry = draft.get(entity.entityId);
      if (entry === undefined) {
        return {
          entity,
          draft: undefined,
          badge: entity.badge,
          status: entity.status,
          holderName: entity.holderName,
          legalBasis: entity.legalBasis,
        };
      }
      return {
        entity,
        draft: entry,
        badge: badgeFor(entry, view.authorities),
        status: entry.status,
        holderName: entry.holder === undefined ? null : nameOf(entry.holder, view.authorities),
        legalBasis: entry.legalBasis ?? null,
      };
    });
  }, [view, draft]);

  const groups = useMemo(() => {
    const byKey = new Map<string, EntityCompetenceView['group']>();
    for (const row of rows) byKey.set(row.entity.group.key, row.entity.group);
    return [...byKey.values()].sort(compareEntityGroups);
  }, [rows]);

  const changedCount = useMemo(() => {
    let count = 0;
    for (const [entityId, item] of draft) {
      if (original.get(entityId) !== JSON.stringify(item)) count += 1;
    }
    for (const entityId of original.keys()) if (!draft.has(entityId)) count += 1;
    return count;
  }, [draft, original]);

  if (loadError !== '' || view === null) {
    return (
      <section aria-labelledby="competence-title" data-testid="competence-panel">
        <h2 id="competence-title" tabIndex={-1}>
          Competencia por dependencia
        </h2>
        {loadError !== '' ? (
          <Alert tone="danger" title="Sin competencia por dependencia" role="alert">
            <p>{loadError}</p>
          </Alert>
        ) : (
          <p role="status">Cargando las dependencias…</p>
        )}
      </section>
    );
  }

  const counts = { keys: 0, named: 0, pending: 0 };
  for (const row of rows) counts[row.badge] += 1;
  const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const needle = folded(query.trim());
  const visible = rows.filter(
    (row) =>
      (groupFilter === '' || row.entity.group.key === groupFilter) &&
      (badgeFilter === '' || row.badge === badgeFilter) &&
      (needle === '' ||
        folded(row.entity.name).includes(needle) ||
        row.entity.entityId.toLowerCase().includes(needle)),
  );
  const where = view.stateCode === null ? 'federales' : 'de tu entidad';

  function update(next: ReadonlyMap<string, EntityAssignment>): void {
    setDraft(next);
    setReview(null);
    setSaveError('');
  }

  function startEdit(row: Row): void {
    setEditing(row.entity.entityId);
    setEditor(editorFrom(row, view?.authorities ?? []));
    setEditorError('');
    focusAfterRender(`competence-editor-${row.entity.entityId}-title`);
  }

  function applyEdit(entityId: string): void {
    const result = assignmentFrom(entityId, editor, view?.authorities ?? []);
    if (typeof result === 'string') {
      setEditorError(result);
      return;
    }
    update(new Map(draft).set(entityId, result));
    setEditing(null);
    announce(
      'Asignación guardada en el borrador. Revisa los cambios para firmar la versión nueva.',
    );
    focusAfterRender(`competence-edit-${entityId}`);
  }

  const bulkTargets = rows.filter(
    (row) => row.entity.group.key === bulkGroup && (!bulkOnlyPending || row.badge === 'pending'),
  );

  function applyBulk(): void {
    if (bulkTargets.length === 0) {
      setBulkError('No hay dependencias que cumplan esa condición en el grupo.');
      return;
    }
    const next = new Map(draft);
    for (const row of bulkTargets) {
      const result = assignmentFrom(row.entity.entityId, bulkEditor, view?.authorities ?? []);
      if (typeof result === 'string') {
        setBulkError(result);
        return;
      }
      next.set(row.entity.entityId, result);
    }
    update(next);
    setBulkError('');
    announce(`Asignación aplicada a ${bulkTargets.length} dependencias en el borrador.`);
  }

  async function send(dryRun: boolean): Promise<void> {
    if (view === null) return;
    setBusy(true);
    setSaveError('');
    try {
      const response = await api.saveCompetence(session.token, {
        baseVersion: view.table.version,
        entities: [...draft.values()],
        dryRun,
      });
      setReview(response);
      if (response.proposal !== null) {
        announce(`Versión ${response.proposal.version} firmada con la llave del nodo.`);
        const fresh = await api.getCompetence(session.token);
        setView({ ...fresh });
      }
      focusAfterRender('competence-review-title');
    } catch (failure) {
      setSaveError(
        describeError(
          failure,
          'No se pudo revisar o firmar. Si otra persona firmó una versión, recarga la pantalla.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv(): void {
    const names = new Map(rows.map((row) => [row.entity.entityId, row.entity.name]));
    downloadFile(
      `competencia-por-dependencia-${view?.nodeId.replace('node.', '') ?? 'nodo'}.csv`,
      entitiesToCsv([...draft.values()], (id) => names.get(id) ?? ''),
      'text/csv;charset=utf-8',
    );
  }

  async function importCsv(file: File): Promise<void> {
    const { entities, problems } = csvToEntities(await file.text());
    if (entities === null) {
      setCsvMessage(`No se importó: ${problems.join(' ')}`);
      return;
    }
    const known = new Set(rows.map((row) => row.entity.entityId));
    const unknown = entities.filter((item) => !known.has(item.entityId));
    if (unknown.length > 0) {
      setCsvMessage(
        `No se importó: ${unknown.length} claves no son dependencias ${where} (por ejemplo, ${unknown[0]?.entityId ?? ''}).`,
      );
      return;
    }
    update(new Map(entities.map((item) => [item.entityId, item])));
    setCsvMessage(`Se importaron ${entities.length} dependencias al borrador.`);
  }

  const proposal = review?.proposal ?? null;

  /** Descarga el archivo que entra por `sigilo-sesna aceptar`, como el de `sigilo tabla firmar`. */
  function downloadFile(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-labelledby="competence-title" data-testid="competence-panel">
      <h2 id="competence-title" tabIndex={-1}>
        Competencia por dependencia
      </h2>
      <p>
        Cada dependencia {where} del catálogo de entes de la Plataforma Digital Nacional, con quién
        investiga sus faltas. Lo normal es que cada una tenga su propio órgano interno de control
        (OIC): todo municipio tiene el suyo (CPEUM, art. 109, fr. III; LGRA, arts. 3, 9 y 10). Si
        una dependencia está pendiente o su OIC aún no tiene llaves, sus denuncias van a la
        autoridad receptora, que las turna a su OIC; nunca a otra autoridad.
      </p>
      <p>
        Tabla vigente: versión {view.table.version} (formato {view.table.format}), firmada el{' '}
        {formatDayDate(view.table.issuedOn)}.
      </p>

      <section className="card" aria-labelledby="competence-coverage-title">
        <h3 id="competence-coverage-title">Cobertura</h3>
        <dl className="definition-list" data-testid="competence-coverage">
          <dt>Dependencias</dt>
          <dd>{rows.length}</dd>
          <dt>
            <Badge badge="keys" />
          </dt>
          <dd data-testid="competence-count-keys">
            {counts.keys} ({percentOf(counts.keys, rows.length)} %)
          </dd>
          <dt>
            <Badge badge="named" />
          </dt>
          <dd data-testid="competence-count-named">
            {counts.named} ({percentOf(counts.named, rows.length)} %)
          </dd>
          <dt>
            <Badge badge="pending" />
          </dt>
          <dd data-testid="competence-count-pending">
            {counts.pending} ({percentOf(counts.pending, rows.length)} %)
          </dd>
        </dl>
        {hints !== null && (
          <ul className="plain-list competence-sources">
            <li>
              S1:{' '}
              {hints.fuentes.s1.disponible
                ? `personas con declaración por ente (corte del ${formatDayDate(hints.fuentes.s1.fechaCorte ?? view.today)}), en rangos.`
                : 'esta entidad no está en los fragmentos del S1 del repositorio: no hay conteo por ente.'}
            </li>
            <li>S2: {hints.fuentes.s2.nota}</li>
            <li>S3: {hints.fuentes.s3.nota}</li>
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="competence-bulk-title">
        <h3 id="competence-bulk-title">Asignar en bloque</h3>
        <p>Por ejemplo, todas las paraestatales al mismo órgano interno de control.</p>
        <SelectField
          id="competence-bulk-group"
          label="Grupo"
          value={bulkGroup}
          onChange={(event) => {
            setBulkGroup(event.target.value);
            setBulkError('');
          }}
          data-testid="competence-bulk-group"
        >
          <option value="">Elige un grupo</option>
          {groups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.label}
            </option>
          ))}
        </SelectField>
        <label className="choice">
          <input
            type="checkbox"
            checked={bulkOnlyPending}
            onChange={(event) => setBulkOnlyPending(event.target.checked)}
          />
          <span className="choice__title">Solo las que están pendientes</span>
        </label>
        <AssignmentEditor
          idPrefix="competence-bulk"
          editor={bulkEditor}
          authorities={view.authorities}
          onChange={setBulkEditor}
          error={bulkError}
        />
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={bulkGroup === ''}
            onClick={applyBulk}
            data-testid="competence-bulk-apply"
          >
            Aplicar a {bulkTargets.length} dependencias
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="competence-filter-title">
        <h3 id="competence-filter-title">Buscar y filtrar</h3>
        <TextField
          id="competence-search"
          label="Buscar dependencia"
          hint="Por nombre o clave."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="competence-search"
        />
        <SelectField
          id="competence-group-filter"
          label="Grupo"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
        >
          <option value="">Todos</option>
          {groups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="competence-badge-filter"
          label="Estado"
          value={badgeFilter}
          onChange={(event) => setBadgeFilter(event.target.value)}
        >
          <option value="">Todos</option>
          {(Object.keys(COMPETENCE_BADGE_LABELS) as CompetenceBadge[]).map((badge) => (
            <option key={badge} value={badge}>
              {COMPETENCE_BADGE_LABELS[badge]}
            </option>
          ))}
        </SelectField>
        <p role="status">
          {visible.length} de {rows.length} dependencias.
        </p>
      </section>

      {groups
        .filter((group) => visible.some((row) => row.entity.group.key === group.key))
        .map((group) => {
          const captionId = `competence-group-${group.key.replace(/[^a-z0-9]/gu, '-')}`;
          return (
            <TableScroll key={group.key} labelledBy={captionId}>
              <table className="competence-table">
                <caption id={captionId}>{group.label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Dependencia</th>
                    <th scope="col">Pistas</th>
                    <th scope="col">Quién la investiga</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visible
                    .filter((row) => row.entity.group.key === group.key)
                    .flatMap((row) => {
                      const id = row.entity.entityId;
                      const changed =
                        original.get(id) !==
                        (row.draft === undefined ? undefined : JSON.stringify(row.draft));
                      const main = (
                        <tr key={id} data-testid="competence-row" data-entity-id={id}>
                          <th scope="row">
                            {row.entity.name}
                            {row.entity.isFictitious ? ' (ficticia)' : ''}
                            <br />
                            <span className="mono muted">{id}</span>
                          </th>
                          <td>{hints === null ? 'sin datos' : hintText(hints, id)}</td>
                          <td>
                            {row.status === 'pending' ? (
                              'Nadie todavía: va a la autoridad receptora'
                            ) : (
                              <>
                                {STATUS_TEXT[row.status]}: {row.holderName}
                                {row.legalBasis === null ? '' : ` (${row.legalBasis})`}
                              </>
                            )}
                            {changed && (
                              <>
                                <br />
                                <strong>Cambio sin firmar</strong>
                              </>
                            )}
                          </td>
                          <td>
                            <Badge badge={row.badge} />
                          </td>
                          <td>
                            <button
                              type="button"
                              id={`competence-edit-${id}`}
                              className="button button--secondary"
                              aria-expanded={editing === id}
                              aria-controls={editing === id ? `competence-editor-${id}` : undefined}
                              onClick={() => (editing === id ? setEditing(null) : startEdit(row))}
                              data-testid="competence-edit"
                            >
                              Editar
                              <span className="visually-hidden"> {row.entity.name}</span>
                            </button>
                          </td>
                        </tr>
                      );
                      if (editing !== id) return [main];
                      return [
                        main,
                        <tr key={`${id}-editor`} id={`competence-editor-${id}`}>
                          <td colSpan={5}>
                            <h4 id={`competence-editor-${id}-title`} tabIndex={-1}>
                              {row.entity.name}
                            </h4>
                            <AssignmentEditor
                              idPrefix="competence-row"
                              editor={editor}
                              authorities={view.authorities}
                              onChange={setEditor}
                              error={editorError}
                            />
                            <div className="actions">
                              <button
                                type="button"
                                className="button"
                                onClick={() => applyEdit(id)}
                                data-testid="competence-row-apply"
                              >
                                Guardar en el borrador
                              </button>
                              <button
                                type="button"
                                className="button button--secondary"
                                onClick={() => {
                                  setEditing(null);
                                  focusAfterRender(`competence-edit-${id}`);
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>,
                      ];
                    })}
                </tbody>
              </table>
            </TableScroll>
          );
        })}

      <section className="card" aria-labelledby="competence-csv-title">
        <h3 id="competence-csv-title">Hoja de cálculo</h3>
        <p>
          El mismo archivo que usa <span className="mono">./sigilo tabla revisar</span> (
          <span className="mono">config/competencia-por-dependencia.csv</span>).
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={downloadCsv}
            data-testid="competence-csv-download"
          >
            Descargar el borrador en CSV
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => fileInput.current?.click()}
          >
            Importar un CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Archivo CSV de competencia por dependencia"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void importCsv(file);
              event.target.value = '';
            }}
            data-testid="competence-csv-file"
          />
        </div>
        {csvMessage !== '' && (
          <p role="status" data-testid="competence-csv-message">
            {csvMessage}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="competence-sign-title">
        <h3 id="competence-sign-title">Firmar la versión nueva</h3>
        <p data-testid="competence-changed">
          {changedCount === 0
            ? 'El borrador es igual a la tabla vigente.'
            : `${changedCount} dependencias cambiaron en el borrador.`}
        </p>
        <p>
          Primero revisa los cambios. Al firmar, el nodo firma la versión {view.table.version + 1}{' '}
          con su llave. Después se entrega a la SESNA y entra al directorio cuando los testigos lo
          cofirman.
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            aria-disabled={isBusy ? true : undefined}
            onClick={() => void send(true)}
            data-testid="competence-review"
          >
            Revisar los cambios
          </button>
        </div>
        {saveError !== '' && (
          <Alert tone="danger" title="No se guardó" role="alert">
            <p>{saveError}</p>
          </Alert>
        )}
        {review !== null && (
          <div
            aria-labelledby="competence-review-title"
            role="group"
            data-testid="competence-review-result"
          >
            <h4 id="competence-review-title" tabIndex={-1}>
              {proposal === null
                ? `Cambios de la versión ${review.version}`
                : `Versión ${proposal.version} firmada`}
            </h4>
            {review.changes.length > 0 && (
              <ul data-testid="competence-diff">
                {review.changes.map((change, index) => (
                  <li key={`${change.scope}-${change.entityId ?? ''}-${index}`}>{change.text}</li>
                ))}
              </ul>
            )}
            {review.problems.length > 0 && (
              <Alert tone="warning" title="No se puede firmar todavía" role="alert">
                <ul>
                  {review.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {proposal === null && review.problems.length === 0 && (
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  aria-disabled={isBusy ? true : undefined}
                  onClick={() => void send(false)}
                  data-testid="competence-sign"
                >
                  Firmar la versión {review.version}
                </button>
              </div>
            )}
            {proposal !== null && (
              <>
                <p data-testid="competence-signed">
                  El nodo firmó la versión {proposal.version} el {formatDayDate(proposal.signedOn)}{' '}
                  con su llave. Entrégala a la SESNA (
                  <span className="mono">sigilo-sesna aceptar</span>
                  ); entra al directorio cuando los testigos lo cofirmen. Hasta entonces, la
                  ventanilla sigue usando la versión {view.table.version}.
                </p>
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      downloadFile(
                        `tabla-de-funciones-${view.nodeId.replace('node.', '')}-v${proposal.version}.json`,
                        `${JSON.stringify({ tipo: 'sigilo/tabla-de-funciones', v: 1, tabla: proposal.signedTable }, null, 2)}\n`,
                        'application/json',
                      )
                    }
                    data-testid="competence-download-update"
                  >
                    Descargar la tabla firmada para la SESNA
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {view.proposals.length > 0 && (
        <section className="card" aria-labelledby="competence-history-title">
          <h3 id="competence-history-title">Versiones firmadas desde el panel</h3>
          <ul data-testid="competence-history">
            {view.proposals.map((item) => (
              <li key={`${item.version}-${item.signedOn}-${item.signedTable.signature}`}>
                Versión {item.version}, firmada el {formatDayDate(item.signedOn)} por la cuenta{' '}
                <span className="mono">{item.signedBy}</span>: {item.changes.length} cambios.
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

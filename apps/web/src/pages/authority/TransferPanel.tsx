// Turnado a otro nodo de la red (SEC-19): la denuncia se vuelve a cifrar en este navegador hacia el
// nodo destino; el servidor solo la transporta al enrutador ciego y avisa a quien denunció.
import { useRef, useState } from 'react';
import { hasFunction } from '@sigilo/contracts';
import type { AuthorityDirectory, ComplaintDetail } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { SelectField, TextAreaField } from '../../components/Field.tsx';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import type { AuthoritySession } from './authority-session.ts';
import { transferTargets, transferToOtherNode, TransferBlockedError } from './transfer.ts';
import type { TransferResult } from './transfer.ts';

interface TransferPanelProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  directory: AuthorityDirectory;
}

/** Panel del turnado entre nodos. */
export function TransferPanel({ session, detail, directory }: TransferPanelProps) {
  const assigned = detail.summary.assignedAuthorityId ?? session.account.authorityId;
  const nodeOf = (id: string) =>
    directory.nodes.find(
      (node) => node.id === directory.authorities.find((item) => item.id === id)?.nodeId,
    );
  const targets = transferTargets(directory, [assigned, session.account.authorityId]);
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TransferResult | null>(null);
  const isBusy = useRef(false);

  async function transfer(): Promise<void> {
    if (isBusy.current) return;
    if (target === '' || note.trim() === '') {
      setError('Elige la autoridad destino y escribe la nota pública para la persona.');
      return;
    }
    isBusy.current = true;
    setError('');
    try {
      const done = await transferToOtherNode({
        token: session.token,
        detail,
        directory,
        targetAuthorityId: target,
        note: note.trim(),
        api,
        onProgress: setProgress,
      });
      setResult(done);
      setProgress('');
    } catch (failure) {
      setProgress('');
      setError(
        failure instanceof TransferBlockedError
          ? failure.message
          : describeError(failure, 'No pudimos turnar la denuncia. Inténtalo de nuevo.'),
      );
    } finally {
      isBusy.current = false;
    }
  }

  if (!hasFunction(session.account, 'intake') || detail.summary.managementState === 'closed') {
    return null;
  }
  return (
    <section
      className="card transfer"
      aria-labelledby="transfer-title"
      data-testid="transfer-panel"
    >
      <h3 id="transfer-title">Turnar a otro nodo de la red</h3>
      <p>
        Si la autoridad competente está en otro nodo (por ejemplo, una contraloría estatal), la
        denuncia se vuelve a cerrar con llave en tu navegador hacia ese nodo. Este servidor solo la
        transporta y no puede leerla. La persona conserva sus mismas 8 palabras con el folio nuevo.
      </p>
      {result !== null ? (
        <Alert tone="success" title="Turnada a otro nodo" testId="transfer-done">
          <p>
            Llegó a {result.authorityName} ({result.nodeName}) con el folio{' '}
            <strong className="mono folio">{result.folio}</strong>. La persona ya lo ve en su
            seguimiento.
          </p>
        </Alert>
      ) : (
        <>
          <SelectField
            id="transfer-target"
            label="Autoridad destino"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            data-testid="transfer-target"
          >
            <option value="">Elige la autoridad</option>
            {targets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({nodeOf(item.id)?.name ?? item.nodeId})
              </option>
            ))}
          </SelectField>
          <TextAreaField
            id="transfer-note"
            label="Nota pública para la persona"
            hint="Explica por qué la turnas. La persona la leerá tal cual."
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            data-testid="transfer-note"
          />
          <button
            type="button"
            className="button"
            onClick={() => void transfer()}
            data-testid="transfer-submit"
          >
            Turnar a otro nodo
          </button>
        </>
      )}
      {error !== '' && (
        <p className="field__error" role="alert" data-testid="transfer-error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" data-testid="transfer-progress">
        {progress}
      </p>
    </section>
  );
}

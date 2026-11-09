// Destino de la denuncia según el estado de la red: la autoridad elegida del directorio, el buzón
// general de un solo nodo o un bloqueo con su motivo en lenguaje sencillo.
import type { AuthorityDirectory } from '@sigilo/contracts';
import type { NetworkStatus } from '../../network/use-network-state.ts';
import { routingChoiceFor } from '../../network/routing.ts';
import type { DestinationOption, RoutingChoice } from '../../network/routing.ts';
import type { ReportDraft } from '../../state/report-draft.ts';

/** Destino resuelto para el envío. */
export type ResolvedDestination =
  | { kind: 'loading' }
  | { kind: 'single-node' }
  | {
      kind: 'network';
      directory: AuthorityDirectory;
      choice: RoutingChoice;
      selected: DestinationOption;
    }
  | { kind: 'needs-choice'; directory: AuthorityDirectory; choice: RoutingChoice; reason: string }
  | { kind: 'blocked'; reason: string };

const BLOCKED_INVALID =
  'No pudimos comprobar el directorio de autoridades: su firma no coincide con la que trae esta aplicación. Por seguridad no enviamos nada. Inténtalo desde otra conexión.';
const BLOCKED_UNAVAILABLE =
  'No pudimos descargar el directorio de autoridades. Revisa tu conexión e inténtalo de nuevo; no se ha enviado nada.';
const BLOCKED_NONE =
  'No encontramos en el directorio una autoridad ni un buzón general para esta denuncia. Revisa la oficina o la conducta que elegiste, o elige tú una autoridad de la lista.';

/**
 * Resuelve el destino. La elección de la persona gana sobre la propuesta si está en la lista; sin
 * autoridad competente, la propuesta es el buzón general del nodo.
 */
export function resolveDestination(draft: ReportDraft, state: NetworkStatus): ResolvedDestination {
  if (state.kind === 'loading') return { kind: 'loading' };
  if (state.kind === 'single-node') return { kind: 'single-node' };
  if (state.kind === 'invalid') return { kind: 'blocked', reason: BLOCKED_INVALID };
  if (state.kind === 'unavailable') return { kind: 'blocked', reason: BLOCKED_UNAVAILABLE };
  const choice = routingChoiceFor(state.directory, draft.facts);
  const chosen = choice.options.find((item) => item.authorityId === draft.destinationAuthorityId);
  const proposed = choice.options.find((item) => item.kind === 'proposed' || item.kind === 'inbox');
  const selected = chosen ?? proposed;
  if (selected === undefined) {
    return { kind: 'needs-choice', directory: state.directory, choice, reason: BLOCKED_NONE };
  }
  return { kind: 'network', directory: state.directory, choice, selected };
}

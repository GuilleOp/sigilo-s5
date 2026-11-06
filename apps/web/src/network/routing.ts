// Propuesta de la autoridad competente en el navegador, con el directorio verificado. La persona ve
// a quién va su denuncia y por qué, y puede elegir otra autoridad del directorio.
import { findEntity } from '@sigilo/contracts';
import type { AuthorityDirectory, DirectoryAuthority } from '@sigilo/contracts';
import { toDayDate } from '@sigilo/core';
import { isAuthorityValidOn, proposeCompetentAuthority } from '@sigilo/red';
import type { CompetentAuthorityProposal } from '@sigilo/red';
import type { FactsDraft } from '../state/report-draft.ts';

/** Opción de destino para la persona: autoridad, su nodo y si es la propuesta o una alternativa. */
export interface DestinationOption {
  authorityId: string;
  name: string;
  nodeName: string;
  kind: 'proposed' | 'alternative' | 'other';
  reason: string;
}

/** Propuesta con las opciones para elegir. Nunca usa la narración: solo entidad, ente y conducta. */
export interface RoutingChoice {
  proposal: CompetentAuthorityProposal;
  options: DestinationOption[];
}

function nodeNameOf(directory: AuthorityDirectory, authority: DirectoryAuthority): string {
  return directory.nodes.find((node) => node.id === authority.nodeId)?.name ?? authority.nodeId;
}

/**
 * Calcula la propuesta y la lista de destinos: la propuesta, sus alternativas y, al final, las demás
 * autoridades vigentes que reciben denuncias (nunca las supervisoras, que reciben escalamientos).
 */
export function routingChoiceFor(
  directory: AuthorityDirectory,
  facts: Pick<FactsDraft, 'stateCode' | 'entityId' | 'offenseCode'>,
  today: string = toDayDate(new Date()),
): RoutingChoice {
  const entity = findEntity(facts.entityId);
  const proposal = proposeCompetentAuthority(
    directory,
    {
      stateCode: facts.stateCode,
      entityId: facts.entityId,
      offenseCode: facts.offenseCode,
      ...(entity === undefined ? {} : { entityLevel: entity.level, entityName: entity.name }),
    },
    today,
  );
  const options: DestinationOption[] = [];
  const seen = new Set<string>();
  const push = (authority: DirectoryAuthority, kind: DestinationOption['kind'], reason: string) => {
    if (seen.has(authority.id)) return;
    seen.add(authority.id);
    options.push({
      authorityId: authority.id,
      name: authority.name,
      nodeName: nodeNameOf(directory, authority),
      kind,
      reason,
    });
  };
  if (proposal.proposed !== null) {
    push(proposal.proposed.authority, 'proposed', proposal.proposed.reason);
  }
  for (const alternative of proposal.alternatives) {
    push(alternative.authority, 'alternative', alternative.reason);
  }
  for (const authority of directory.authorities) {
    if (authority.role === 'supervisory' || !isAuthorityValidOn(authority, today)) continue;
    push(authority, 'other', 'La elegiste tú. Si no es competente, puede canalizarla.');
  }
  return { proposal, options };
}

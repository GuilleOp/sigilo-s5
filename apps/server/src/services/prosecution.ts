// Quién es la fiscalía en el nodo: la autoridad con papel `prosecution` en el directorio de red
// o, si el nodo no tiene directorio o este no la lista, en el archivo de cuentas. Solo ella avanza
// la vía penal; no lleva la vía administrativa ni se da vista a sí misma.
import type { AppContext } from '../context.ts';
import { directoryAuthority } from '../network/network-context.ts';

/** Indica si `authorityId` es una fiscalía. */
export function isProsecutionAuthority(ctx: AppContext, authorityId: string): boolean {
  const network = ctx.deps.network;
  const listed = network === undefined ? undefined : directoryAuthority(network, authorityId);
  if (listed !== undefined) return listed.role === 'prosecution';
  return ctx.authorities.isProsecution(authorityId);
}

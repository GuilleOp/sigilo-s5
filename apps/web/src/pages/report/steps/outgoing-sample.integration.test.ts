// La muestra de «Lo que sale de tu equipo» es un sobre real hacia el nodo destino del directorio
// verificado: no contiene el relato legible y cada cierre sale distinto.
import { describe, expect, it } from 'vitest';
import { toBase64Url, utf8Encode } from '@sigilo/core';
import { createTestNetwork } from '../../../../../server/src/test-support/network-harness.ts';
import { loadNetworkState } from '../../../network/directory.ts';
import { routingChoiceFor } from '../../../network/routing.ts';
import { createApiClient } from '../../../services/api-client.ts';
import { emptyDraft } from '../../../state/report-draft.ts';
import { destinationFor } from '../../../network/network-keys.ts';
import { sealSample } from './OutgoingPanel.tsx';

const NARRATIVE = 'El encargado de compras pidió dinero para aprobar la factura del proveedor.';

describe('sealSample', () => {
  it('cierra el relato con la llave del nodo destino sin dejarlo legible', async () => {
    const network = createTestNetwork();
    await network.federal.tasks.run();
    await network.queretaro.tasks.run();
    const client = createApiClient((input, init) =>
      Promise.resolve(network.queretaro.app.request(`http://nodo-queretaro.invalid${input}`, init)),
    );
    const state = await loadNetworkState(network.trust, client);
    if (state.kind !== 'verified') throw new Error(`Directorio no verificado: ${state.kind}`);
    const draft = emptyDraft();
    draft.facts = {
      ...draft.facts,
      stateCode: '22',
      entityId: 'VE-INSTITUTO',
      offenseCode: 'LGRA-59',
      description: NARRATIVE,
    };
    const choice = routingChoiceFor(state.directory, draft.facts, '2026-11-09');
    const selected = choice.options[0];
    if (selected === undefined) throw new Error('El directorio no tiene autoridades.');
    const { node } = destinationFor(state.directory, selected.authorityId);

    const first = await sealSample(NARRATIVE, node);
    const second = await sealSample(NARRATIVE, node);
    expect(first).not.toBe(second);
    for (const sample of [first, second]) {
      expect(sample.length).toBeGreaterThan(NARRATIVE.length);
      expect(sample).not.toMatch(/compras|dinero|factura/iu);
      expect(sample).not.toContain(toBase64Url(utf8Encode(NARRATIVE)).slice(0, 16));
    }
  });
});

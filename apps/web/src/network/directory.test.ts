// Directorio de la red en el navegador (H10): se verifica con el día de hoy y respeta el serial
// mínimo y la antigüedad máxima que fija la raíz de confianza.
import { describe, expect, it } from 'vitest';
import { createNetworkFixture, FIXTURE_DAY } from '../../../../packages/red/src/test-fixtures.ts';
import type { ApiClient } from '../services/api-client.ts';
import { loadNetworkState } from './directory.ts';

function clientWith(signed: unknown): ApiClient {
  return {
    json: async <T>() => signed as T,
    text: async () => '',
    blob: async () => new Blob(),
  };
}

const onDay = (day: string) => () => new Date(`${day}T12:00:00Z`);

describe('loadNetworkState', () => {
  it('acepta el directorio vigente y cofirmado', async () => {
    const { signed, trust } = createNetworkFixture();
    const state = await loadNetworkState(trust, clientWith(signed), onDay(FIXTURE_DAY));
    expect(state.kind).toBe('verified');
  });

  it('rechaza un directorio anterior al serial mínimo de la raíz', async () => {
    const { signed, trust } = createNetworkFixture();
    const state = await loadNetworkState(
      { ...trust, minDirectorySerial: signed.directory.serial + 1 },
      clientWith(signed),
      onDay(FIXTURE_DAY),
    );
    expect(state).toEqual({ kind: 'invalid', reason: 'rollback' });
  });

  it('rechaza un directorio más viejo que la antigüedad máxima de la raíz', async () => {
    const { signed, trust } = createNetworkFixture();
    const state = await loadNetworkState(
      { ...trust, maxDirectoryAgeDays: 30 },
      clientWith(signed),
      onDay('2027-03-01'),
    );
    expect(state).toEqual({ kind: 'invalid', reason: 'stale' });
  });
});

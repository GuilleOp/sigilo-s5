// Pruebas de la etiqueta HMAC del enrutador ante el buzón: la v2 con frescura (marca de tiempo dentro
// de la ventana y nonce de un solo uso) y la v1 solo mientras dure la transición (H13).
import { describe, expect, it } from 'vitest';
import { randomBytes } from '@sigilo/core';
import {
  RELAY_AUTH_WINDOW_MS,
  createRelayNonceCache,
  relayAuthHeaderV2,
  relayAuthTag,
  verifyRelayAuthHeader,
} from './relay-auth.ts';

const BODY = '{"v":2,"node":"node.queretaro"}';
const NOW = Date.parse('2026-11-12T12:00:00Z');

describe('etiqueta del buzón v2', () => {
  it('acepta una etiqueta fresca una sola vez', () => {
    const secret = randomBytes(32);
    const nonces = createRelayNonceCache();
    const header = relayAuthHeaderV2(secret, BODY, NOW);
    expect(header).toMatch(/^v2\.\d+\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/u);
    const check = { now: NOW + 1000, nonces, allowLegacy: false };
    expect(verifyRelayAuthHeader(secret, BODY, header, check)).toBe(true);
    // El mismo sobre reenviado dentro de la ventana: el nonce ya se vio.
    expect(verifyRelayAuthHeader(secret, BODY, header, check)).toBe(false);
  });

  it('rechaza etiquetas fuera de la ventana, de otro cuerpo o de otro secreto', () => {
    const secret = randomBytes(32);
    const header = relayAuthHeaderV2(secret, BODY, NOW);
    const at = (now: number) => ({ now, nonces: createRelayNonceCache(), allowLegacy: false });
    expect(verifyRelayAuthHeader(secret, BODY, header, at(NOW + RELAY_AUTH_WINDOW_MS + 1))).toBe(
      false,
    );
    expect(verifyRelayAuthHeader(secret, BODY, header, at(NOW - RELAY_AUTH_WINDOW_MS - 1))).toBe(
      false,
    );
    expect(verifyRelayAuthHeader(secret, `${BODY} `, header, at(NOW))).toBe(false);
    expect(verifyRelayAuthHeader(randomBytes(32), BODY, header, at(NOW))).toBe(false);
    // Cambiar la marca de tiempo invalida la etiqueta.
    const moved = header.replace(`v2.${NOW}.`, `v2.${NOW + 1}.`);
    expect(verifyRelayAuthHeader(secret, BODY, moved, at(NOW))).toBe(false);
    expect(verifyRelayAuthHeader(secret, BODY, 'v2.basura', at(NOW))).toBe(false);
    expect(verifyRelayAuthHeader(secret, BODY, undefined, at(NOW))).toBe(false);
  });

  it('la v1 vale solo durante la transición', () => {
    const secret = randomBytes(32);
    const legacy = relayAuthTag(secret, BODY);
    const nonces = createRelayNonceCache();
    expect(
      verifyRelayAuthHeader(secret, BODY, legacy, { now: NOW, nonces, allowLegacy: true }),
    ).toBe(true);
    expect(
      verifyRelayAuthHeader(secret, BODY, legacy, { now: NOW, nonces, allowLegacy: false }),
    ).toBe(false);
  });

  it('la caché llena de nonces vigentes rechaza en vez de olvidar', () => {
    const secret = randomBytes(32);
    const nonces = createRelayNonceCache(1);
    const check = { now: NOW, nonces, allowLegacy: false };
    expect(verifyRelayAuthHeader(secret, BODY, relayAuthHeaderV2(secret, BODY, NOW), check)).toBe(
      true,
    );
    expect(verifyRelayAuthHeader(secret, BODY, relayAuthHeaderV2(secret, BODY, NOW), check)).toBe(
      false,
    );
    // Cuando el primero sale de la ventana, hay lugar otra vez.
    const later = NOW + 2 * RELAY_AUTH_WINDOW_MS;
    expect(
      verifyRelayAuthHeader(secret, BODY, relayAuthHeaderV2(secret, BODY, later), {
        ...check,
        now: later,
      }),
    ).toBe(true);
  });
});

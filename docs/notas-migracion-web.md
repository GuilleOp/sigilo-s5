# Notas de migración de la web

Estado: **aplicada** (commit `f90add3`). Este documento queda como registro histórico; la
referencia vigente está en [interfaces.md](interfaces.md) y [criptografia.md](criptografia.md).

## Contexto

Las correcciones de la revisión de seguridad (commit `b411737`) cambiaron la API de
`@sigilo/contracts`, `@sigilo/core` y del servidor. La web dejó de compilar hasta adoptar estos
cambios:

| Cambio                                                                                                              | Dónde se aplicó en la web                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| La identidad se sella con un contexto (`authVerifier`, `reporterKeys`, `contentDigest`), no solo con `authVerifier` | `crypto/submission.ts` (`identityContextFor`) y `crypto/authority.ts` (`identityContextFromDetail`) |
| `ComplaintDetail` trae `version`, `reporterKeys` y `authVerifier`; `OpenIdentityResponse` ya no trae `authVerifier` | Panel de autoridad                                                                                  |
| El buzón lleva `sequence` por remitente, relleno fijo y una nueva firma; `openMailboxMessage` recibe el folio       | `crypto/tracking.ts`, `crypto/authority.ts`, `lib/mailbox-text.ts`                                  |
| `TrackingView` incluye `receivedEvent`; `phraseToEntropy` lanza `ReceiptPhraseError`                                | Página de seguimiento (`verifyReceiptEvent`, posición de la palabra)                                |
| La bitácora pública solo publica días anteriores; nuevo esquema de anclas                                           | `crypto/ledger-verification.ts` y `/verificar`                                                      |
| Datos abiertos de meses cerrados, redondeados, con fila `suprimidas,,,,<n>`                                         | `lib/csv.ts` y `/datos-abiertos`                                                                    |
| Catálogos movidos a `@sigilo/contracts` y validados por el servidor                                                 | Se borró `apps/web/src/catalogs/`; la búsqueda vive en `lib/catalog-search.ts`                      |
| Formato de `authority-demo-key.json` y aserciones de llaves en contracts y core                                     | `crypto/authority.ts`                                                                               |

## Pruebas E2E

`e2e/ledger.spec.ts` y `e2e/open-data.spec.ts` usan el reloj de pruebas `SIGILO_TEST_CLOCK_FILE`
(`e2e/support/clock.ts`) para cerrar el día o el mes. `e2e/transplant.spec.ts` reproduce el ataque de
trasplante y comprueba que se rechaza.

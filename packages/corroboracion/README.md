# @sigilo/corroboracion

Corroboración ciega de SIGILO ([ADR 0006](../../docs/adr/0006-corroboracion-ciega.md)) y una
persona = una corroboración ([ADR 0010](../../docs/adr/0010-integridad-de-las-denuncias.md)).
Funciones puras que corren igual en el navegador y en Node. La especificación del formato está en
[docs/criptografia.md](../../docs/criptografia.md#corroboración-ciega-voprf).

## Qué resuelve

Varias denuncias independientes sobre el mismo contrato, proveedor o persona servidora pública
justifican priorizar, pero nadie en medio debe saber a quién se acusa. El navegador obtiene, con
un VOPRF (RFC 9497, `ristretto255-SHA512`), una **etiqueta** del identificador sin revelárselo al
evaluador; el índice solo compara etiquetas.

## API pública

| Módulo            | Funciones                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identifier.ts`   | `normalizePersonName`, `normalizeEntityId`, `normalizeRfc`, `normalizeOcid`, `normalizeIdentifier`, `corroborationLabel`, `corroborationInput`; tipo `CorroborationIdentifier` (`servidor`, `rfc`, `ocid`)                                                     |
| `oprf.ts`         | Navegador: `blindCorroboration`, `blindInput`, `finalizeEvaluation`, `finalizeCorroboration`, `deriveCorroborationKeys`, `evaluatorKeyFromDirectory`, `assertEvaluatorKey`. Evaluador: `generateEvaluatorKeyPair`, `deriveEvaluatorKeyPair`, `evaluateBlinded` |
| `similarity.ts`   | `similarityDigest` (resumen difuso de 64 bytes), `estimateSimilarity`, `textShingles`                                                                                                                                                                          |
| `independence.ts` | `assessIndependence`, `linkSignals`, `DEFAULT_INDEPENDENCE_POLICY`                                                                                                                                                                                             |
| `signatures.ts`   | `folioDigestFor`, `signIndexRegistration` / `verifyIndexRegistration`, `signNoticesRequest` / `verifyNoticesRequest`, `signEvaluationCount` / `verifyEvaluationCount`, `buildEvaluatorKey`                                                                     |
| `custody.ts`      | `CustodyRecordSchema`, `createCustody`, `advanceCustody`, `custodyDeadline`, `prescriptionSafeLimit`, `sealForCustody`, `openReleasedCustody`, `deriveCustodyReleaseKeys`, `signCustodyRelease`, `newCustodyId`                                                |

`@sigilo/corroboracion/demo` exporta los casos sintéticos de Marta, Luis y el atacante
(`DEMO_CASES`) para pruebas y demostraciones.

## Uso en el navegador

```ts
const key = evaluatorKeyFromDirectory(verifiedDirectory); // nunca la que sirve el evaluador
if (key !== null) {
  const state = blindCorroboration({ kind: 'ocid', ocid }, key);
  // GET reto, resolver la prueba de trabajo y POST state.request con X-Sigilo-Pow
  const keys = finalizeCorroboration(state, response, key); // lanza si la prueba DLEQ falla
  const similarity = similarityDigest(finalNarrative, keys.similarityKey);
  // keys.tag, keys.epoch y similarity viajan dentro de la denuncia cifrada hacia el nodo
}
```

Si el evaluador no responde o su prueba no verifica, la denuncia se envía igual, sin
corroboración: la coincidencia solo suma prioridad.

## Pruebas

- Vectores oficiales de RFC 9497, apéndice A.1.2 (`rfc9497-vectors.ts`): `DeriveKeyPair`,
  A.1.2.1, A.1.2.2 y el lote A.1.2.3 se reproducen byte por byte.
- Manipulación: prueba con un bit cambiado, elemento evaluado cambiado, llave distinta de la
  publicada, época o `keyId` distintos, punto inválido, etiqueta de otro tipo de identificador.
- Independencia sobre el escenario: Marta y Luis dan 2 fuentes; las 3 denuncias del atacante, 1
  con posible campaña.
- Custodia: fecha límite contra la prescripción, liberación por coincidencia, por recibo y por
  fecha, y doble cifrado.

```bash
npx vitest run packages/corroboracion
```

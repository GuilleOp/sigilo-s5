// Hook que evalúa el grupo de anonimato del borrador cuando cambian la entidad, el ente, el área o
// la respuesta sobre el lugar de trabajo.
import { useEffect, useState } from 'react';
import type { ReportDraft } from '../state/report-draft.ts';
import { checkAnonymity } from './report-anonymity.ts';
import type { AnonymityCheck } from './report-anonymity.ts';

/** Estado del grupo de anonimato; `checking` mientras se consulta el catálogo del mismo origen. */
export type AnonymityStatus = AnonymityCheck | { kind: 'checking' };

/** Evalúa el grupo de anonimato del borrador. */
export function useAnonymityCheck(draft: ReportDraft): AnonymityStatus {
  const { worksThere, area } = draft.workplace;
  const { stateCode, entityId } = draft.facts;
  const key = JSON.stringify([worksThere, area, stateCode, entityId]);
  // El resultado se guarda con la consulta que lo produjo: si cambió, aún se está revisando.
  const [result, setResult] = useState<{ key: string; check: AnonymityCheck } | null>(null);
  useEffect(() => {
    let isActive = true;
    void checkAnonymity({ worksThere, area, stateCode, entityId }).then((check) => {
      if (isActive) setResult({ key, check });
    });
    return () => {
      isActive = false;
    };
  }, [key, worksThere, area, stateCode, entityId]);
  return result !== null && result.key === key ? result.check : { kind: 'checking' };
}

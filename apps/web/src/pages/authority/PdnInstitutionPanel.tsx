// Ficha «Contexto PDN de la dependencia»: datos públicos e institucionales de la dependencia real
// (directorio de entes y S6), que el nodo consulta con el identificador público del ente. No muestra
// personas ni envía nada de la denuncia. Los entes ficticios de la demostración no tienen ficha.
import { useEffect, useState } from 'react';
import type { PdnInstitutionContext } from '@sigilo/contracts';
import { api } from '../../services/api.ts';
import type { AuthoritySession } from './authority-session.ts';

interface PdnInstitutionPanelProps {
  session: AuthoritySession;
  entityId: string;
}

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const COUNT = new Intl.NumberFormat('es-MX');

function consulted(at: string | null): string {
  return at === null ? 'sin fecha' : at.slice(0, 10);
}

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

/** Ficha de contexto público; se muestra solo para entes reales del catálogo de la PDN. */
export function PdnInstitutionPanel({ session, entityId }: PdnInstitutionPanelProps) {
  const [context, setContext] = useState<PdnInstitutionContext | null>(null);
  const [failed, setFailed] = useState(false);
  const isRealEntity = /^PDN-\d{2}-\d{1,6}$/.test(entityId);

  useEffect(() => {
    if (!isRealEntity) return;
    let isActive = true;
    api.getPdnInstitution(session.token, entityId).then(
      (value) => {
        if (isActive) setContext(value);
      },
      () => {
        if (isActive) setFailed(true);
      },
    );
    return () => {
      isActive = false;
    };
  }, [session.token, entityId, isRealEntity]);

  if (!isRealEntity) return null;
  const directory = context?.directory ?? null;
  const contracting = context?.contracting ?? null;
  return (
    <section className="card" aria-labelledby="pdn-institution-title" data-testid="pdn-institution">
      <h3 id="pdn-institution-title">Contexto PDN de la dependencia</h3>
      <p className="hint">
        Datos públicos y agregados de la Plataforma Digital Nacional. No identifican a ninguna
        persona y el nodo no envía nada de la denuncia: solo consulta el identificador público del
        ente.
      </p>
      {failed && <p role="status">No pudimos consultar el contexto. Inténtalo más tarde.</p>}
      {context === null && !failed && <p role="status">Consultando la PDN…</p>}
      {context?.status === 'disabled' && (
        <p role="status">Este nodo no consulta la PDN pública (SIGILO_PDN_PUBLIC).</p>
      )}
      {context?.status === 'unavailable' && (
        <p role="status">Sin conexión con la PDN y sin copia guardada.</p>
      )}
      {directory !== null && (
        <dl className="definition-list">
          <dt>Nombre en el directorio</dt>
          <dd>{directory.name}</dd>
          <dt>Ámbito y poder</dt>
          <dd>
            {directory.governmentLevel}
            {directory.branch === null ? '' : ` · ${directory.branch}`}
          </dd>
          <dt>Reporta a la PDN</dt>
          <dd>
            S1 {yesNo(directory.reports.s1)} · S2 {yesNo(directory.reports.s2)} · S3{' '}
            {yesNo(directory.reports.s3)} · S6 {yesNo(directory.reports.s6)}
          </dd>
          <dt>Control de OIC en el directorio</dt>
          <dd>{yesNo(directory.oicControl)}</dd>
        </dl>
      )}
      {contracting !== null && (
        <p>
          {contracting.topBuyerRank === null
            ? 'No está entre los 10 compradores con más monto del S6. '
            : `Es el comprador número ${contracting.topBuyerRank} del S6 por monto${
                contracting.topBuyerAmount === null
                  ? ''
                  : ` (${PESOS.format(contracting.topBuyerAmount)})`
              }. `}
          El S6 reúne {COUNT.format(contracting.nationalProcedures)} procedimientos por{' '}
          {PESOS.format(contracting.nationalAmount)}.
        </p>
      )}
      {context !== null && context.sources.length > 0 && (
        <p className="hint">
          Fuente:{' '}
          {context.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? ' · ' : ''}
              <a href={source.url} rel="noreferrer" target="_blank">
                {source.system}
              </a>
            </span>
          ))}
          , consultado el {consulted(context.consultedAt)}
          {context.status === 'cached' ? ' (copia guardada)' : ''}.
        </p>
      )}
    </section>
  );
}

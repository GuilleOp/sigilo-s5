// Aviso para quien no trabaja en la oficina denunciada (persona ciudadana o usuaria de un trámite).
// Su riesgo es otro: la persona denunciada pudo verla en la ventanilla, y el número del trámite, las
// placas o la dirección de su negocio la identifican. Incluye la información sobre el pago de un
// soborno y sobre las represalias, en lenguaje claro y sin asesoría legal (LGRA, arts. 64, 66, 88
// y 89; ver docs/personas-ciudadanas.md).

/** Consejos para bajar el riesgo cuando la persona denunciada te atendió en persona. */
export const CITIZEN_TIPS: readonly string[] = [
  'Quita números de trámite, placas o tu dirección.',
  'Pon solo el mes, no el día ni la hora.',
  'Si puedes, envíala unos días después de tu visita.',
  'Si a otras personas les pasó lo mismo, pídeles que también denuncien. Así nadie sabe quién habló primero.',
];

/** Aviso del paso de revisión: una frase a la vista; los consejos y la información, a un toque. */
export function CitizenNotice() {
  return (
    <section className="citizen" aria-labelledby="citizen-title" data-testid="citizen-notice">
      <h3 id="citizen-title" className="citizen__title">
        ¿Te atendieron en persona? Esa persona podría reconocerte.
      </h3>
      <details className="more">
        <summary>Cómo protegerte</summary>
        <ul>
          {CITIZEN_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <details className="more more--minor" data-testid="citizen-bribe">
          <summary>¿Te pidieron dinero y lo pagaste?</summary>
          <p>
            Denunciar de forma anónima no te expone: nadie sabe quién eres y la denuncia sirve
            igual.
          </p>
          <p>
            Dar dinero a una persona servidora pública también puede ser una falta (soborno,
            artículo 66 de la Ley General de Responsabilidades Administrativas). Si decides
            identificarte y reconocerlo, la ley puede reducir la sanción a quien confiesa primero y
            colabora (artículos 88 y 89).
          </p>
          <p>
            Es información general, no asesoría legal. Antes de identificarte, busca orientación.
          </p>
        </details>
        <details className="more more--minor" data-testid="citizen-retaliation">
          <summary>¿Y si me niegan el trámite o me amenazan?</summary>
          <p>
            La ley protege a las personas servidoras públicas que denuncian, pero no prevé medidas
            equivalentes para particulares. Guarda tus comprobantes y considera acudir también a la
            fiscalía. Si alguien te amenaza, pide ayuda de inmediato.
          </p>
        </details>
      </details>
    </section>
  );
}

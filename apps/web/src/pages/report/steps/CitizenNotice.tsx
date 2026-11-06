// Aviso para quien no trabaja en la oficina denunciada (persona ciudadana o usuaria de un trámite).
// Su riesgo es otro: la persona denunciada pudo verla en la ventanilla, y el número del trámite, las
// placas o la dirección de su negocio la identifican. Incluye la información sobre el pago de un
// soborno y sobre las represalias, en lenguaje claro y sin asesoría legal (LGRA, arts. 64, 66, 88
// y 89; ver docs/personas-ciudadanas.md).

/** Consejos para bajar el riesgo cuando la persona denunciada te atendió en persona. */
export const CITIZEN_TIPS: readonly string[] = [
  'Quita el número de tu trámite o expediente, tus placas o la dirección de tu casa o tu negocio. El revisor de tu relato te los marca.',
  'No pongas el día ni la hora de tu visita: el mes basta.',
  'Si puedes, envía tu denuncia unos días después de tu visita, para que no coincidan.',
  'Si a otras personas les pasó lo mismo, invítalas a denunciar por separado. En el paso 2, en «¿Otras personas denunciaron lo mismo?», puedes indicar a la persona denunciada: si las denuncias coinciden, la autoridad lo ve y nadie sabe quién habló primero.',
];

/** Aviso del paso de revisión. */
export function CitizenNotice() {
  return (
    <section className="card citizen" aria-labelledby="citizen-title" data-testid="citizen-notice">
      <h3 id="citizen-title">Si la persona que denuncias te atendió en persona</h3>
      <p>
        Aunque no sepa tu nombre, podría imaginar que fuiste tú. El anonimato te protege de todas
        las demás personas, pero no borra lo que esa persona ya vio.
      </p>
      <h4>Cómo bajar ese riesgo</h4>
      <ul>
        {CITIZEN_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <details data-testid="citizen-bribe">
        <summary>¿Te pidieron dinero y lo pagaste?</summary>
        <p>
          Denunciar de forma anónima no te expone: nadie sabe quién eres y la denuncia sirve igual.
        </p>
        <p>
          Debes saber que dar dinero u otro beneficio a una persona servidora pública también puede
          ser una falta de particulares (soborno, artículo 66 de la Ley General de Responsabilidades
          Administrativas). Si decides identificarte y reconocer tu participación, la ley contempla
          reducir la sanción a quien confiese antes de que le notifiquen un procedimiento, sea la
          primera persona en aportar pruebas y colabore con la investigación (artículos 88 y 89).
        </p>
        <p>
          Esto es información general, no asesoría legal. Antes de identificarte, consulta a una
          persona abogada o a una organización de apoyo.
        </p>
      </details>
      <details data-testid="citizen-retaliation">
        <summary>¿Y si me niegan el trámite o me amenazan?</summary>
        <p>
          La ley prevé medidas de protección para las personas servidoras públicas que denuncian,
          pero no prevé medidas equivalentes para particulares. Si temes represalias, guarda tus
          comprobantes y considera denunciar también ante la fiscalía. Si alguien te amenaza, pide
          ayuda de inmediato.
        </p>
      </details>
    </section>
  );
}

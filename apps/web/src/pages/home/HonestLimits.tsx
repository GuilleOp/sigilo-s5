// «Lo que SIGILO no puede hacer por ti»: los límites dichos de frente. Una herramienta que promete
// anonimato total pierde la confianza en cuanto alguien encuentra el primer límite que se calló.
// Deben coincidir con los riesgos residuales de docs/modelo-de-amenazas.md.

/** Límites, en lenguaje claro, con lo que sí puede hacer la persona. */
export const LIMITS: readonly { risk: string; whatHelps: string }[] = [
  {
    risk: 'Si alguien te vio o te pidió dinero cara a cara, esa persona puede imaginar que fuiste tú.',
    whatHelps:
      'Si otras personas denuncian lo mismo por separado, la autoridad ve la coincidencia y no serás la única persona.',
  },
  {
    risk: 'Tus propias palabras pueden delatarte: un detalle que solo tú sabes, una fecha o un número de trámite.',
    whatHelps:
      'Antes de enviar revisamos tu relato y te sugerimos cómo decirlo de forma más general. La decisión es tuya.',
  },
  {
    risk: 'Si tu teléfono o tu computadora tienen un programa espía, o si alguien más los revisa, pueden ver lo que escribes.',
    whatHelps: 'Usa un equipo propio y la Salida rápida si alguien se acerca.',
  },
  {
    risk: 'La red de tu trabajo o de tu escuela puede ver que entraste a esta página, aunque no lo que escribes.',
    whatHelps: 'Usa los datos de tu celular o una red que no sea de tu trabajo.',
  },
  {
    risk: 'Si alguien alterara el código de esta página, también podría alterar sus comprobaciones. Comprobar que la página que recibes es la auditada sigue en desarrollo.',
    whatHelps:
      'El código es abierto y cualquier organización puede revisarlo. Entra siempre por una dirección de confianza.',
  },
  {
    risk: 'Quien robara la llave de la autoridad y una copia de su base podría abrir un nombre sellado sin dejar registro.',
    whatHelps:
      'La llave no vive en el servidor. Y si denuncias de forma anónima, no hay ningún nombre que abrir.',
  },
  {
    risk: 'Hoy las dos aprobaciones para abrir un nombre sellado son una regla del sistema; que además las exija la criptografía sigue en desarrollo.',
    whatHelps:
      'Si no necesitas medidas de protección, denuncia de forma anónima: no habrá ningún nombre que abrir.',
  },
];

/** Sección de la pantalla de inicio. */
export function HonestLimits() {
  return (
    <section className="card limits" aria-labelledby="limits-title" data-testid="honest-limits">
      <h2 id="limits-title">Lo que SIGILO no puede hacer por ti</h2>
      <p>Preferimos decírtelo antes de que denuncies.</p>
      <ul className="limits__list">
        {LIMITS.map((limit) => (
          <li key={limit.risk}>
            <p className="limits__risk">{limit.risk}</p>
            <p className="limits__help">
              <strong>Qué ayuda:</strong> {limit.whatHelps}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

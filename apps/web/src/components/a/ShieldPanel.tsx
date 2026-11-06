// «Tu escudo» (dirección A): las protecciones que están activas ahora, cada una con su glifo, su
// nombre, qué hace y su estado con ícono y texto.
import { StateTag } from './StateTag.tsx';
import type { StateTone } from './StateTag.tsx';
import { SystemBadge } from './SystemBadge.tsx';
import type { IconName } from './icons.tsx';

/** Una protección del escudo. */
export interface ShieldItem {
  glyph: IconName;
  name: string;
  text: string;
  state: { tone: StateTone; text: string };
}

/** Protecciones de SIGILO, en lenguaje claro. */
export const SHIELD_ITEMS: readonly ShieldItem[] = [
  {
    glyph: 'cipher',
    name: 'Cifrado en tu dispositivo',
    text: 'Lo que escribes se guarda bajo llave antes de salir de tu teléfono o computadora. Nadie en medio puede leerlo.',
    state: { tone: 'ok', text: 'Activo' },
  },
  {
    glyph: 'noplug',
    name: 'Cero servicios de terceros',
    text: 'No se carga nada de otras empresas: ni mapas, ni tipos de letra, ni contadores de visitas. No usamos cookies.',
    state: { tone: 'ok', text: '0 conexiones externas' },
  },
  {
    glyph: 'eye',
    name: 'Riesgo de que te reconozcan',
    text: 'Antes de enviar revisamos tu relato, tus fotos y el tamaño de tu grupo de trabajo, y te decimos cómo bajar el riesgo.',
    state: { tone: 'info', text: 'Se revisa antes de enviar' },
  },
  {
    glyph: 'image',
    name: 'Pruebas limpias',
    text: 'Tus fotos y documentos se limpian en tu equipo: quitamos la ubicación, el modelo del celular y otros datos ocultos.',
    state: { tone: 'ok', text: 'En tu equipo' },
  },
  {
    glyph: 'key',
    name: 'Identidad sellada',
    text: 'Si das tu nombre, viaja en un sobre aparte. Solo lo abre la autoridad competente con dos aprobaciones, o tú si decides inconformarte; siempre te avisamos.',
    state: { tone: 'protect', text: 'Sellada' },
  },
  {
    glyph: 'route',
    name: 'Nadie puede borrar lo que pasó',
    text: 'Cada paso queda anotado en un registro público firmado. Nadie puede cambiarlo sin que se note.',
    state: { tone: 'ok', text: 'Registro público' },
  },
];

/** Panel «Tu escudo». */
export function ShieldPanel() {
  return (
    <section className="shield" aria-labelledby="shield-title" data-testid="shield">
      <div className="shield__head">
        <SystemBadge system="S5" tone="protect" />
        <div>
          <h2 id="shield-title">Tu escudo</h2>
          <p>Así te cuidamos desde que abres esta página</p>
        </div>
      </div>
      <ul className="shield__list">
        {SHIELD_ITEMS.map((item) => (
          <li key={item.name}>
            <SystemBadge glyph={item.glyph} tone="protect" size="sm" />
            <span className="shield__name">{item.name}</span>
            <p className="shield__text">{item.text}</p>
            <StateTag tone={item.state.tone}>{item.state.text}</StateTag>
          </li>
        ))}
      </ul>
    </section>
  );
}

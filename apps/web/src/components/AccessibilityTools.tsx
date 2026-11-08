// Herramientas de accesibilidad en la barra fija, con la misma lógica que la versión de pruebas del
// S5: un botón «Accesibilidad» que abre un menú (con cuántos ajustes hay activos), paneles
// flotantes que se apilan para el tamaño del texto, el espaciado, el lector y la guía de teclado,
// y un botón aparte para el tema. Además, los modos de uso de SIGILO. El lector usa solo voces
// instaladas en el equipo: una voz en línea mandaría el texto de la denuncia a otra empresa.
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { focusAfterRender } from '../lib/focus.ts';
import { REPORTER_TOUR } from '../lib/tours.ts';
import { speakText, stopSpeaking } from '../lib/local-speech.ts';
import { useLocalVoice } from '../lib/use-local-voice.ts';
import {
  applyDisplay,
  DEFAULT_DISPLAY,
  displayStore,
  isDefaultDisplay,
  LETTER_SPACING,
  LINE_HEIGHT,
  snap,
  storeDisplay,
  TEXT_SCALE,
} from '../state/display-settings.ts';
import type { DisplaySettings } from '../state/display-settings.ts';
import { createMemoryStore, useMemoryStore } from '../state/memory-store.ts';
import { applyTheme, storeTheme, themeStore } from '../state/theme.ts';
import type { ThemeChoice } from '../state/theme.ts';
import { setUsageMode, usageModesStore } from '../state/usage-modes.ts';
import type { UsageModes } from '../state/usage-modes.ts';
import { Icon } from './a/icons.tsx';
import { startTour } from './GuidedTour.tsx';
import type { IconName } from './a/icons.tsx';

/** Paneles flotantes que se pueden abrir. */
type PanelId = 'text' | 'spacing' | 'reader' | 'keys';

/** Paneles abiertos, en el orden en que se abrieron. */
const panelsStore = createMemoryStore<readonly PanelId[]>(() => []);

const MENU_BUTTON_ID = 'a11y-toggle';
const panelTitleId = (panel: PanelId): string => `a11y-panel-${panel}-title`;

function openPanel(panel: PanelId): void {
  panelsStore.set((open) => (open.includes(panel) ? open : [...open, panel]));
  focusAfterRender(panelTitleId(panel));
}

function closePanel(panel: PanelId): void {
  if (panel === 'reader') stopSpeaking();
  panelsStore.set((open) => open.filter((item) => item !== panel));
  focusAfterRender(MENU_BUTTON_ID);
}

function updateDisplay(patch: Partial<DisplaySettings>): void {
  displayStore.set((current) => ({ ...current, ...patch }));
}

/** Cuántos ajustes están activos: el número del botón «Accesibilidad». */
export function activeAdjustments(
  theme: ThemeChoice,
  display: DisplaySettings,
  modes: UsageModes,
): number {
  return [
    theme === 'contrast',
    display.textScale !== TEXT_SCALE.default,
    display.lineHeight !== null || display.letterSpacing !== LETTER_SPACING.default,
    modes.isEasyReading,
    modes.isAssisted,
    modes.isKiosk,
    modes.isLowConnection,
  ].filter(Boolean).length;
}

const THEME_CYCLE: Readonly<Record<ThemeChoice, ThemeChoice>> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
  contrast: 'system',
};
const THEME_LABELS: Readonly<Record<ThemeChoice, string>> = {
  system: 'como tu sistema',
  light: 'claro',
  dark: 'oscuro',
  contrast: 'alto contraste',
};
const THEME_ICONS: Readonly<Record<ThemeChoice, IconName>> = {
  system: 'monitor',
  light: 'sun',
  dark: 'moon',
  contrast: 'contrast',
};

/** Botón de tema: cambia entre «como tu sistema», claro y oscuro. */
function ThemeToggle() {
  const theme = useMemoryStore(themeStore);
  const next = THEME_CYCLE[theme];
  return (
    <button
      type="button"
      className="a11y-icon-button"
      onClick={() => themeStore.set(() => next)}
      aria-label={`Colores: ${THEME_LABELS[theme]}. Cambiar a ${THEME_LABELS[next]}`}
      title={`Colores: ${THEME_LABELS[theme]}`}
      data-testid="theme-toggle"
    >
      <Icon name={THEME_ICONS[theme]} />
    </button>
  );
}

/** Una opción del menú que activa o desactiva algo. */
function MenuToggle({
  icon,
  label,
  isOn,
  onToggle,
  testId,
}: {
  icon: IconName;
  label: string;
  isOn: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <li>
      <button
        type="button"
        className="a11y-menu__item"
        aria-pressed={isOn}
        onClick={onToggle}
        data-testid={testId}
      >
        <Icon name={icon} />
        <span>{label}</span>
        <span className="a11y-menu__state">{isOn ? 'Activo' : ''}</span>
      </button>
    </li>
  );
}

const MODES: readonly {
  key: Exclude<keyof UsageModes, 'isEasyReading'>;
  label: string;
  hint: string;
}[] = [
  {
    key: 'isAssisted',
    label: 'Me ayuda otra persona',
    hint: 'Te avisamos cuándo pedirle que se aparte, para que solo tú veas tus 8 palabras.',
  },
  {
    key: 'isKiosk',
    label: 'Equipo compartido (quiosco)',
    hint: 'No se puede copiar el recibo y, al terminar, se borra todo de esta pantalla.',
  },
  {
    key: 'isLowConnection',
    label: 'Tengo poca conexión',
    hint: 'Si una consulta falla, la repetimos hasta 4 veces (en lugar de 2), con más espera entre intentos, y te avisamos. Los envíos nunca se repiten solos.',
  },
];

/** Botón «Accesibilidad», su menú y el botón de tema, para la barra fija. */
export function AccessibilityControls() {
  const theme = useMemoryStore(themeStore);
  const display = useMemoryStore(displayStore);
  const modes = useMemoryStore(usageModesStore);
  const panels = useMemoryStore(panelsStore);
  const [isOpen, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = activeAdjustments(theme, display, modes);

  // Tema y ajustes de lectura: se aplican al documento y se recuerdan, salvo en quiosco.
  useEffect(() => {
    applyTheme(theme, document.documentElement);
    storeTheme(theme, modes.isKiosk);
  }, [theme, modes.isKiosk]);
  useEffect(() => {
    applyDisplay(display, document.documentElement);
    storeDisplay(display, modes.isKiosk);
  }, [display, modes.isKiosk]);

  // El menú se cierra con Esc (el foco vuelve al botón) o al pulsar fuera de él.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      setOpen(false);
      focusAfterRender(MENU_BUTTON_ID);
    }
    function onPointer(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [isOpen]);

  function choosePanel(panel: PanelId): void {
    setOpen(false);
    if (panels.includes(panel)) focusAfterRender(panelTitleId(panel));
    else openPanel(panel);
  }

  const panelItem = (panel: PanelId, icon: IconName, label: string) => (
    <li>
      <button
        type="button"
        className="a11y-menu__item"
        aria-pressed={panels.includes(panel)}
        onClick={() => choosePanel(panel)}
        data-testid={`a11y-open-${panel}`}
      >
        <Icon name={icon} />
        <span>{label}</span>
        <span className="a11y-menu__state">{panels.includes(panel) ? 'Abierto' : ''}</span>
      </button>
    </li>
  );

  return (
    <div className="a11y-controls" ref={containerRef}>
      <ThemeToggle />
      <button
        type="button"
        id={MENU_BUTTON_ID}
        className="a11y-button"
        aria-expanded={isOpen}
        aria-controls="a11y-menu"
        onClick={() => setOpen((value) => !value)}
        data-testid="a11y-toggle"
      >
        <Icon name="access" />
        <span className="a11y-button__label">Accesibilidad</span>
        {count > 0 && (
          <span className="a11y-badge" data-testid="a11y-count">
            {count}
            <span className="visually-hidden">
              {count === 1 ? ' ajuste activo' : ' ajustes activos'}
            </span>
          </span>
        )}
      </button>
      <div id="a11y-menu" className="a11y-menu" hidden={!isOpen} data-testid="a11y-menu">
        <p className="a11y-menu__group" id="a11y-group-view">
          Ver y leer
        </p>
        <ul aria-labelledby="a11y-group-view">
          <MenuToggle
            icon="contrast"
            label="Alto contraste"
            isOn={theme === 'contrast'}
            onToggle={() =>
              themeStore.set((current) => (current === 'contrast' ? 'system' : 'contrast'))
            }
            testId="a11y-contrast"
          />
          {panelItem('text', 'textsize', 'Tamaño del texto')}
          {panelItem('spacing', 'spacing', 'Espaciado')}
          <MenuToggle
            icon="book"
            label="Lectura fácil"
            isOn={modes.isEasyReading}
            onToggle={() => setUsageMode('isEasyReading', !modes.isEasyReading)}
            testId="usage-isEasyReading"
          />
          {panelItem('reader', 'speaker', 'Leer en voz alta')}
          {panelItem('keys', 'keyboard', 'Guía de teclado')}
          <li>
            <button
              type="button"
              className="a11y-menu__item"
              onClick={() => {
                setOpen(false);
                startTour(REPORTER_TOUR, MENU_BUTTON_ID);
              }}
              data-testid="a11y-tour"
            >
              <Icon name="sparkle" />
              <span>Recorrido guiado</span>
              <span className="a11y-menu__state" />
            </button>
          </li>
        </ul>
        <fieldset className="a11y-menu__modes" data-testid="usage-modes">
          <legend className="a11y-menu__group">Modos de uso</legend>
          {MODES.map((mode) => (
            <div key={mode.key} className="a11y-mode">
              <input
                type="checkbox"
                id={`usage-mode-${mode.key}`}
                checked={modes[mode.key]}
                aria-describedby={`usage-mode-${mode.key}-hint`}
                onChange={(event) => setUsageMode(mode.key, event.target.checked)}
                data-testid={`usage-${mode.key}`}
              />
              <label htmlFor={`usage-mode-${mode.key}`}>{mode.label}</label>
              <p id={`usage-mode-${mode.key}-hint`}>{mode.hint}</p>
            </div>
          ))}
        </fieldset>
        <button
          type="button"
          className="a11y-menu__reset"
          onClick={() => {
            themeStore.set(() => 'system');
            displayStore.set(() => DEFAULT_DISPLAY);
            setUsageMode('isEasyReading', false);
          }}
          disabled={theme === 'system' && isDefaultDisplay(display) && !modes.isEasyReading}
          data-testid="a11y-reset-all"
        >
          <Icon name="reset" /> Restablecer colores y texto
        </button>
      </div>
    </div>
  );
}

/** Marco común de cada panel flotante. */
function Panel({
  panel,
  icon,
  title,
  children,
}: {
  panel: PanelId;
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="a11y-panel"
      aria-labelledby={panelTitleId(panel)}
      data-testid={`a11y-panel-${panel}`}
    >
      <div className="a11y-panel__head">
        <Icon name={icon} />
        <h2 id={panelTitleId(panel)} tabIndex={-1}>
          {title}
        </h2>
        <button
          type="button"
          className="a11y-icon-button a11y-icon-button--small"
          aria-label={`Cerrar ${title.toLowerCase()}`}
          onClick={() => closePanel(panel)}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </section>
  );
}

/** Control de un valor con botones de menos y más, y una barra deslizable. */
function Stepper({
  label,
  value,
  valueText,
  range,
  onChange,
}: {
  label: string;
  value: number;
  valueText: string;
  range: { min: number; max: number; step: number };
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="a11y-stepper">
      <label htmlFor={id}>{label}</label>
      <div className="a11y-stepper__row">
        <button
          type="button"
          className="a11y-icon-button a11y-icon-button--small"
          aria-label={`Menos: ${label.toLowerCase()}`}
          onClick={() => onChange(snap(value - range.step, range))}
          disabled={value <= range.min}
        >
          <Icon name="flat" />
        </button>
        <output htmlFor={id} className="a11y-stepper__value">
          {valueText}
        </output>
        <button
          type="button"
          className="a11y-icon-button a11y-icon-button--small"
          aria-label={`Más: ${label.toLowerCase()}`}
          onClick={() => onChange(snap(value + range.step, range))}
          disabled={value >= range.max}
        >
          <Icon name="plus" />
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(snap(Number(event.target.value), range))}
      />
    </div>
  );
}

function ResetButton({ onReset, isDisabled }: { onReset: () => void; isDisabled: boolean }) {
  return (
    <button type="button" className="a11y-panel__reset" onClick={onReset} disabled={isDisabled}>
      <Icon name="reset" /> Restablecer
    </button>
  );
}

function TextSizePanel() {
  const display = useMemoryStore(displayStore);
  return (
    <Panel panel="text" icon="textsize" title="Tamaño del texto">
      <Stepper
        label="Tamaño"
        value={display.textScale}
        valueText={`${display.textScale} %`}
        range={TEXT_SCALE}
        onChange={(textScale) => updateDisplay({ textScale })}
      />
      <ResetButton
        onReset={() => updateDisplay({ textScale: TEXT_SCALE.default })}
        isDisabled={display.textScale === TEXT_SCALE.default}
      />
    </Panel>
  );
}

function SpacingPanel() {
  const display = useMemoryStore(displayStore);
  const lineHeight = display.lineHeight ?? LINE_HEIGHT.default;
  return (
    <Panel panel="spacing" icon="spacing" title="Espaciado">
      <Stepper
        label="Espacio entre líneas"
        value={lineHeight}
        valueText={lineHeight.toFixed(1)}
        range={LINE_HEIGHT}
        onChange={(value) =>
          updateDisplay({ lineHeight: value === LINE_HEIGHT.default ? null : value })
        }
      />
      <Stepper
        label="Espacio entre letras"
        value={display.letterSpacing}
        valueText={
          display.letterSpacing === 0 ? 'Normal' : `+${Math.round(display.letterSpacing * 100)} %`
        }
        range={LETTER_SPACING}
        onChange={(letterSpacing) => updateDisplay({ letterSpacing })}
      />
      <ResetButton
        onReset={() => updateDisplay({ lineHeight: null, letterSpacing: LETTER_SPACING.default })}
        isDisabled={display.lineHeight === null && display.letterSpacing === 0}
      />
    </Panel>
  );
}

/** Texto visible del contenido principal, sin la barra, el menú ni los paneles. */
function pageText(): string {
  return document.getElementById('contenido')?.innerText ?? '';
}

function ReaderPanel() {
  const voice = useLocalVoice();
  const [isReading, setReading] = useState(false);
  useEffect(() => () => stopSpeaking(), []);

  function read(text: string): void {
    if (voice === null || text.trim() === '') return;
    setReading(true);
    speakText(text, voice, () => setReading(false));
  }

  return (
    <Panel panel="reader" icon="speaker" title="Leer en voz alta">
      {voice === null ? (
        <p data-testid="a11y-reader-unavailable">
          Tu equipo no tiene una voz en español instalada. Por privacidad solo usamos voces de tu
          equipo: una voz en internet recibiría lo que escribes. Puedes instalar una en los ajustes
          de accesibilidad de tu sistema, o usar el lector de pantalla de tu equipo.
        </p>
      ) : (
        <>
          <p>Usamos la voz de tu equipo. Lo que se lee no sale a internet.</p>
          <div className="a11y-panel__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => read(pageText())}
            >
              Leer esta página
            </button>
            <button
              type="button"
              className="button button--secondary"
              // Conserva la selección: al pulsar con el ratón, el foco no la borra.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => read(window.getSelection()?.toString() ?? '')}
            >
              Leer lo que seleccioné
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                stopSpeaking();
                setReading(false);
              }}
              disabled={!isReading}
            >
              Detener
            </button>
          </div>
        </>
      )}
      <p role="status" className="visually-hidden">
        {isReading ? 'Leyendo en voz alta.' : ''}
      </p>
    </Panel>
  );
}

/** Teclas de la guía, por grupo. */
const KEY_GUIDE: readonly { group: string; keys: readonly [string, string][] }[] = [
  {
    group: 'Moverte por la página',
    keys: [
      ['Ir al siguiente enlace o botón', 'Tab'],
      ['Regresar al anterior', 'Mayús + Tab'],
      ['Activar el enlace o botón', 'Intro'],
      ['Saltar al contenido', 'Tab, la primera vez'],
      ['Bajar o subir', 'Flechas o AvPág / RePág'],
    ],
  },
  {
    group: 'Formularios',
    keys: [
      ['Marcar o desmarcar una casilla', 'Espacio'],
      ['Elegir entre opciones', 'Flechas'],
      ['Cerrar este menú', 'Esc'],
    ],
  },
  {
    group: 'Seguridad',
    keys: [['Salida rápida: borra todo y sale', 'Esc dos veces']],
  },
  {
    group: 'Lectores de pantalla',
    keys: [
      ['NVDA (Windows): leer todo', 'Insert + flecha abajo'],
      ['VoiceOver (Mac): activar o desactivar', 'Cmd + F5'],
      ['VoiceOver (Mac): leer todo', 'Control + Opción + A'],
    ],
  },
];

function KeyboardPanel() {
  return (
    <Panel panel="keys" icon="keyboard" title="Guía de teclado">
      {KEY_GUIDE.map((section) => (
        <div key={section.group} className="a11y-keys">
          <h3>{section.group}</h3>
          <dl>
            {section.keys.map(([action, key]) => (
              <div key={action}>
                <dt>{action}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </Panel>
  );
}

const PANELS: Readonly<Record<PanelId, () => ReactNode>> = {
  text: () => <TextSizePanel />,
  spacing: () => <SpacingPanel />,
  reader: () => <ReaderPanel />,
  keys: () => <KeyboardPanel />,
};

/** Paneles abiertos, apilados a un lado (o abajo en el celular). */
export function AccessibilityPanels() {
  const panels = useMemoryStore(panelsStore);
  if (panels.length === 0) return null;
  return (
    <aside className="a11y-panels no-print" aria-label="Herramientas de accesibilidad">
      {panels.map((panel) => (
        <div key={panel}>{PANELS[panel]()}</div>
      ))}
    </aside>
  );
}

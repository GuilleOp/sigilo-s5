// Pruebas de las heurísticas de análisis estático (PRV-08, PRV-09, PRV-10, PRV-11 y PRV-13).
import { describe, expect, it } from 'vitest';
import {
  sampleCapture,
  samplePage,
  sampleRequest,
  sampleScript,
} from '../test-support/capture-builder.ts';
import {
  checkDraftStoragePassive,
  checkExternalMaps,
  checkFolioPatternPassive,
  checkSpeechRecognition,
  checkTrackers,
  collectObservations,
  findInCorpus,
} from './static-checks.ts';

const withScript = (body: string) => sampleCapture({ resources: [sampleScript(body)] });

describe('findInCorpus', () => {
  it('devuelve la URL y un fragmento con contexto', () => {
    const matches = findInCorpus(
      [sampleScript('const a = 1; window.webkitSpeechRecognition; const b = 2;')],
      /webkitSpeechRecognition/,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.snippet).toContain('window.webkitSpeechRecognition');
  });
});

describe('PRV-08 reconocimiento de voz', () => {
  it('advierte (inferencia) si el código usa SpeechRecognition', () => {
    const check = checkSpeechRecognition(
      withScript('let r=window.SpeechRecognition??window.webkitSpeechRecognition'),
    );
    expect(check.status).toBe('advertencia');
    expect(check.isHeuristic).toBe(true);
  });

  it('cumple (inferencia) si no aparece', () => {
    const check = checkSpeechRecognition(withScript('console.info("hola")'));
    expect(check).toMatchObject({ status: 'cumple', isHeuristic: true });
  });
});

describe('PRV-09 folio (pasivo)', () => {
  it('advierte con un ejemplo de folio con año y consecutivo', () => {
    const capture = sampleCapture({
      pages: [samplePage({ html: '<p>Folio: QJA-2031004417</p>' })],
    });
    expect(checkFolioPatternPassive(capture).status).toBe('advertencia');
  });

  it('advierte con una validación de folio con año y dígitos', () => {
    expect(checkFolioPatternPassive(withScript('const F=/^QJA-\\d{4}\\d{6}$/;')).status).toBe(
      'advertencia',
    );
  });

  it('advierte con una construcción de folio con prefijo y año', () => {
    const code =
      'const f="QJA-".concat(new Date().getFullYear()).concat(String(n).padStart(6,"0"))';
    expect(checkFolioPatternPassive(withScript(code)).status).toBe('advertencia');
  });

  it('no aplica si no hay ningún indicio', () => {
    expect(checkFolioPatternPassive(withScript('const folio = respuesta.folio;')).status).toBe(
      'no_aplica',
    );
  });
});

describe('PRV-09 folio generado en el cliente', () => {
  it('señala Math.random y la consulta de existencia del folio', () => {
    // Código sintético escrito para la prueba: imita el patrón, no copia código de ningún sitio.
    const code = [
      'function nuevoFolio(){',
      'const anio=new Date().getFullYear();',
      'const sufijo=String(Math.floor(Math.random()*999999)).padStart(6,"0");',
      'const folio="QJA-".concat(anio).concat(sufijo);',
      'return existeFolioRemoto(folio)?null:folio}',
    ].join('');
    const check = checkFolioPatternPassive(withScript(code));
    const descriptions = check.evidence.map((item) => item.description).join(' ');
    expect(check.status).toBe('advertencia');
    expect(descriptions).toContain('Math.random');
    expect(descriptions).toContain('oráculo');
  });
});

describe('PRV-10 borradores (estático)', () => {
  it('advierte si guarda datos del formulario en localStorage', () => {
    const check = checkDraftStoragePassive(
      withScript('localStorage.setItem("borrador", JSON.stringify(formData))'),
    );
    expect(check.status).toBe('advertencia');
    expect(check.evidence[0]?.kind).toBe('codigo');
  });

  it('advierte con una clave de borrador y un objeto serializado lejos de palabras clave', () => {
    const padding = 'x'.repeat(900);
    const code = `let k="app.formulario.draft";${padding}f=e=>{let t={version:1,values:l(e.values)};window.localStorage.setItem(k,JSON.stringify(t))}`;
    const check = checkDraftStoragePassive(withScript(code));
    const descriptions = check.evidence.map((item) => item.description).join(' ');
    expect(check.status).toBe('advertencia');
    expect(descriptions).toContain('Clave con nombre de borrador');
    expect(descriptions).toContain('objeto serializado');
  });

  it('no confunde bibliotecas que guardan JSON ni avisos negativos con un borrador', () => {
    const router =
      'function Pn(e,t){if(t.size>0){let n={};try{e.sessionStorage.setItem(vt,JSON.stringify(n))}catch(e){}}}';
    const capture = sampleCapture({
      resources: [sampleScript(router)],
      pages: [samplePage({ html: '<p>Nada queda guardado en tu navegador.</p>' })],
    });
    expect(checkDraftStoragePassive(capture).status).toBe('cumple');
  });

  it('advierte si la interfaz anuncia un guardado local', () => {
    const capture = sampleCapture({
      pages: [samplePage({ html: '<p>Tu avance se guarda sólo en este dispositivo</p>' })],
    });
    expect(checkDraftStoragePassive(capture).status).toBe('advertencia');
  });

  it('advierte con una clave larga de borrador ya presente, no con una bandera corta', () => {
    const flag = sampleCapture({
      pages: [
        samplePage({
          storage: [{ area: 'sessionStorage', key: 'denuncia-consejos-vistos', value: 'true' }],
        }),
      ],
    });
    expect(checkDraftStoragePassive(flag).status).toBe('cumple');
    const draft = sampleCapture({
      pages: [
        samplePage({
          storage: [
            {
              area: 'localStorage',
              key: 'draft',
              value: JSON.stringify({ hechos: 'texto sintético largo' }),
            },
          ],
        }),
      ],
    });
    expect(checkDraftStoragePassive(draft).status).toBe('advertencia');
  });

  it('cumple si el almacenamiento solo guarda preferencias', () => {
    const check = checkDraftStoragePassive(withScript('localStorage.setItem("tema","oscuro")'));
    expect(check.status).toBe('cumple');
  });
});

describe('PRV-11 mapas y PRV-13 rastreadores', () => {
  it('no cumple si la red pidió Mapbox; advierte si solo está en el código', () => {
    const observed = sampleCapture({
      requests: [
        sampleRequest({ url: 'https://api.mapbox.com/geocoding/v5/x.json', party: 'tercero' }),
      ],
    });
    expect(checkExternalMaps(observed).status).toBe('no_cumple');
    const inCode = withScript('fetch("https://api.mapbox.com/geocoding/v5/mapbox.places/"+q)');
    expect(checkExternalMaps(inCode)).toMatchObject({ status: 'advertencia', isHeuristic: true });
    expect(checkExternalMaps(withScript('const mapa = null;')).status).toBe('cumple');
  });

  it('detecta gtag, Meta Pixel y Sentry de terceros', () => {
    expect(checkTrackers(withScript("gtag('config','G-1')")).summary).toContain('Google Analytics');
    expect(checkTrackers(withScript("fbq('init','1')")).summary).toContain('Meta Pixel');
    const sentry = withScript('init({dsn:"https://0123456789abcdef0123@o1.ingest.sentry.io/1"})');
    expect(checkTrackers(sentry).summary).toContain('Sentry');
  });

  it('no cumple si la red contactó un rastreador', () => {
    const capture = sampleCapture({
      requests: [
        sampleRequest({
          url: 'https://www.googletagmanager.com/gtm.js?id=GTM-X',
          party: 'tercero',
        }),
      ],
    });
    expect(checkTrackers(capture).status).toBe('no_cumple');
  });
});

describe('collectObservations', () => {
  it('reconoce ALTCHA con reto propio y cabeceras de tecnología', () => {
    const capture = sampleCapture({
      pages: [samplePage({ headers: { 'x-powered-by': 'Next.js' } })],
      resources: [
        sampleScript('h("altcha-widget",{auto:"off",challenge:"/next-api/public/challenge?x=1"})'),
      ],
    });
    const observations = collectObservations(capture);
    expect(observations[0]?.description).toContain('/next-api/public/challenge');
    expect(observations[0]?.description).toContain('propio origen');
    expect(observations.some((item) => item.name === 'x-powered-by')).toBe(true);
  });
});

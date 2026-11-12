// Genera los archivos de la marca de SIGILO en `apps/web/public/marca/`: el símbolo (color, claro y
// una tinta), el sello, el favicon, los logotipos horizontales y sus PNG (favicon, íconos de
// aplicación, logotipos @2x e imagen para compartir). La forma sale de
// `apps/web/src/components/brand/geometria.ts`, la misma que dibuja la web.
//
// El nombre «SIGILO» va en trazos: se toman los contornos de Mulish Black (OFL, autoalojada en la
// web) imprimiendo el texto a PDF con Chromium y leyéndolo con pdf.js, así que los SVG no dependen
// de la fuente. Sin dependencias nuevas: Playwright y pdfjs-dist ya están en el repositorio.
// Uso: node scripts/marca/render.ts (o npm run marca:render). Necesita el Chromium de Playwright.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  BRAND_COLORS,
  MARK_FAVICON,
  MARK_FULL,
  MARK_SEAL,
} from '../../apps/web/src/components/brand/geometria.ts';
import type { MarkGeometry } from '../../apps/web/src/components/brand/geometria.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
/** Carpeta pública de la web: Vite la copia tal cual a la raíz de `dist/`. */
export const OUTPUT_DIR = join(REPO_ROOT, 'apps/web/public/marca');
const FONTS_DIR = join(REPO_ROOT, 'apps/web/src/assets/fonts/mulish');
/** Copia local del símbolo para el encabezado de Swagger UI (`estandar/swagger/`). */
const SWAGGER_MARK = join(REPO_ROOT, 'estandar/swagger/sigilo-simbolo-claro.svg');

/** Colores de cada pieza del símbolo; `null` en el disco lo deja hueco (versión de una tinta). */
interface Palette {
  seal: string;
  disc: string | null;
  ring: string;
  links: string;
  nodes: string;
  hub: string;
  accent: string;
}

/** Sobre fondo claro: lacre verde profundo, disco blanco y la red en turquesa. */
const ON_LIGHT: Palette = {
  seal: BRAND_COLORS.deepGreen,
  disc: BRAND_COLORS.white,
  ring: BRAND_COLORS.teal,
  links: BRAND_COLORS.teal,
  nodes: BRAND_COLORS.teal,
  hub: BRAND_COLORS.deepGreen,
  accent: BRAND_COLORS.marigold,
};

/** Sobre fondo oscuro: lacre blanco, disco verde profundo y la red en menta. */
const ON_DARK: Palette = {
  seal: BRAND_COLORS.white,
  disc: BRAND_COLORS.deepGreen,
  ring: BRAND_COLORS.mint,
  links: BRAND_COLORS.mint,
  nodes: BRAND_COLORS.mint,
  hub: BRAND_COLORS.white,
  accent: BRAND_COLORS.marigold,
};

/** Una tinta (`currentColor`): el disco queda hueco y deja ver el fondo. */
const MONO: Palette = {
  seal: 'currentColor',
  disc: null,
  ring: 'currentColor',
  links: 'currentColor',
  nodes: 'currentColor',
  hub: 'currentColor',
  accent: 'currentColor',
};

const circle = (c: { cx: number; cy: number; r: number }, fill: string): string =>
  `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${fill}"/>`;

/** Disco como subtrazo (para recortarlo del lacre con `evenodd`). */
function discSubpath(c: { cx: number; cy: number; r: number }): string {
  return `M${c.cx - c.r} ${c.cy}a${c.r} ${c.r} 0 1 0 ${2 * c.r} 0a${c.r} ${c.r} 0 1 0 ${-2 * c.r} 0Z`;
}

/** Elementos SVG del símbolo, en el orden en que se pintan. */
export function markElements(geometry: MarkGeometry, palette: Palette): string {
  const parts: string[] = [];
  if (geometry.shackle !== null) {
    parts.push(
      `<path d="${geometry.shackle.d}" fill="none" stroke="${palette.seal}" stroke-width="${geometry.shackle.width}"/>`,
    );
  }
  if (palette.disc === null) {
    parts.push(
      `<path d="${geometry.seal}${discSubpath(geometry.disc)}" fill="${palette.seal}" fill-rule="evenodd"/>`,
    );
  } else {
    parts.push(`<path d="${geometry.seal}" fill="${palette.seal}"/>`);
    parts.push(circle(geometry.disc, palette.disc));
  }
  if (geometry.ring !== null) {
    parts.push(
      `<path d="${geometry.ring.d}" fill="none" stroke="${palette.ring}" stroke-width="${geometry.ring.width}"/>`,
    );
  }
  parts.push(
    `<path d="${geometry.links.d}" fill="none" stroke="${palette.links}" stroke-width="${geometry.links.width}" stroke-linejoin="round" stroke-linecap="round"/>`,
  );
  for (const node of geometry.nodes) parts.push(circle(node, palette.nodes));
  parts.push(circle(geometry.hub, palette.hub));
  parts.push(circle(geometry.accent, palette.accent));
  return parts.join('\n  ');
}

function svgDocument(
  width: number,
  height: number,
  title: string,
  body: string,
  extra = '',
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"${extra} role="img" aria-labelledby="titulo">\n` +
    `  <title id="titulo">${title}</title>\n  ${body}\n</svg>\n`
  );
}

function symbolSvg(geometry: MarkGeometry, palette: Palette, title: string, extra = ''): string {
  return svgDocument(geometry.size, geometry.size, title, markElements(geometry, palette), extra);
}

// ---------------------------------------------------------------------------------------------
// Nombre «SIGILO» en trazos, de Mulish Black.

/** Contornos del nombre, en unidades de em (y hacia abajo, línea base en 0). */
interface Wordmark {
  d: string;
  /** Ancho total en em. */
  width: number;
  /** Altura de las mayúsculas en em. */
  capHeight: number;
}

const WORDMARK_TEXT = 'SIGILO';
/** Espacio entre letras del logotipo, en em (como el encabezado de la web, más cerrado). */
const WORDMARK_TRACKING = 0.04;

function fontDataUrl(file: string): string {
  return `data:font/woff2;base64,${readFileSync(join(FONTS_DIR, file)).toString('base64')}`;
}

const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/** Convierte las operaciones de dibujo de pdf.js (em, y hacia arriba) a un trazo SVG. */
function drawOpsToPath(ops: ArrayLike<number>, x0: number): { d: string; top: number } {
  let d = '';
  let top = 0;
  const p = (x: number, y: number): string => {
    top = Math.max(top, y);
    return `${(x0 + x).toFixed(4)} ${(-y).toFixed(4)}`;
  };
  for (let i = 0; i < ops.length;) {
    const op = ops[i++];
    const n = (): number => ops[i++] ?? 0;
    if (op === DRAW.moveTo) d += `M${p(n(), n())}`;
    else if (op === DRAW.lineTo) d += `L${p(n(), n())}`;
    else if (op === DRAW.curveTo) d += `C${p(n(), n())} ${p(n(), n())} ${p(n(), n())}`;
    else if (op === DRAW.quadraticCurveTo) d += `Q${p(n(), n())} ${p(n(), n())}`;
    else if (op === DRAW.closePath) d += 'Z';
    else throw new Error(`Operación de trazo desconocida: ${String(op)}`);
  }
  return { d, top };
}

interface PdfGlyph {
  fontChar: string;
  width: number;
}

/**
 * Imprime «SIGILO» en Mulish Black a PDF con Chromium y lee los contornos de cada letra con pdf.js
 * (que los entrega como operaciones de dibujo cuando no usa la fuente del sistema). Respeta el
 * interletraje de la fuente (las separaciones que Chromium escribe en el PDF).
 */
async function extractWordmark(browser: Browser): Promise<Wordmark> {
  const page = await browser.newPage();
  const fontSize = 1000;
  await page.setContent(
    `<style>@font-face{font-family:SigiloMarca;font-weight:900;src:url(${fontDataUrl('Mulish-Black.woff2')}) format('woff2')}` +
      `body{margin:0}p{margin:0;font:900 ${fontSize}px SigiloMarca;white-space:nowrap}</style><p>${WORDMARK_TEXT}</p>`,
  );
  await page.evaluate('document.fonts.ready.then(() => true)');
  const pdf = await page.pdf({ width: '5000px', height: '1400px', printBackground: false });
  await page.close();

  const loading = getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    fontExtraProperties: true,
    useSystemFonts: false,
  });
  const pdfPage = await (await loading.promise).getPage(1);
  const list = await pdfPage.getOperatorList();
  let loadedName = '';
  let pdfFontSize = 1;
  let cursor = 0;
  let lineStart = 0;
  let d = '';
  let capHeight = 0;
  let letters = 0;
  for (let index = 0; index < list.fnArray.length; index += 1) {
    const fn = list.fnArray[index];
    const args = list.argsArray[index] as unknown[];
    if (fn === OPS.setFont) {
      const font = pdfPage.commonObjs.get(args[0] as string) as { loadedName: string };
      loadedName = font.loadedName;
      pdfFontSize = args[1] as number;
    } else if (fn === OPS.moveText) {
      // Desplazamiento de línea en unidades de texto: lleva el interletraje (L-O, por ejemplo).
      lineStart += (args[0] as number) / pdfFontSize;
      cursor = lineStart;
    } else if (fn === OPS.showText) {
      for (const glyph of args[0] as (PdfGlyph | number)[]) {
        if (typeof glyph === 'number') {
          cursor -= glyph / 1000;
          continue;
        }
        const ops = (
          pdfPage.commonObjs.get(`${loadedName}_path_${glyph.fontChar}`) as {
            path: ArrayLike<number>;
          }
        ).path;
        const tracking = letters * WORDMARK_TRACKING;
        const outline = drawOpsToPath(ops, cursor + tracking);
        d += outline.d;
        capHeight = Math.max(capHeight, outline.top);
        cursor += glyph.width / 1000;
        letters += 1;
      }
    }
  }
  await loading.destroy();
  if (letters !== WORDMARK_TEXT.length) {
    throw new Error(`Se esperaban ${WORDMARK_TEXT.length} letras y se leyeron ${letters}.`);
  }
  return { d, width: cursor + (letters - 1) * WORDMARK_TRACKING, capHeight };
}

// ---------------------------------------------------------------------------------------------
// Logotipo horizontal: símbolo y nombre.

interface Lockup {
  width: number;
  height: number;
  body: string;
}

/** Arma el logotipo: el símbolo de 64 de alto y el nombre con mayúsculas de 30, centrados. */
function lockup(wordmark: Wordmark, palette: Palette, textColor: string): Lockup {
  const symbol = MARK_FULL.size;
  const capHeight = 30;
  const scale = capHeight / wordmark.capHeight;
  const gap = 13;
  const textX = symbol + gap;
  // Las mayúsculas se centran con el sello (no con el candado entero), como en el concepto.
  const baseline = 40 + capHeight / 2;
  const width = Math.ceil(textX + wordmark.width * scale + 2);
  const body =
    `<g>\n  ${markElements(MARK_FULL, palette)}\n  </g>\n  ` +
    `<path transform="translate(${textX} ${baseline}) scale(${scale.toFixed(4)})" fill="${textColor}" d="${wordmark.d}"/>`;
  return { width, height: symbol, body };
}

// ---------------------------------------------------------------------------------------------
// PNG con Chromium.

interface PngJob {
  file: string;
  width: number;
  height: number;
  html: string;
}

function pageHtml(content: string, background = 'transparent', extraCss = ''): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;` +
    `background:${background}}svg{display:block}${extraCss}</style></head><body>${content}</body></html>`
  );
}

/** SVG escalado al tamaño de la imagen. */
function sized(svg: string, width: number, height: number): string {
  return svg.replace(/ width="[\d.]+" height="[\d.]+"/u, ` width="${width}" height="${height}"`);
}

/** Ícono de aplicación: candado claro sobre un cuadro verde profundo, con margen seguro. */
function appIcon(size: number): string {
  const inner = Math.round(size * 0.72);
  const offset = (size - inner) / 2;
  const svg = sized(symbolSvg(MARK_FULL, ON_DARK, 'SIGILO'), inner, inner);
  return pageHtml(
    `<div style="position:absolute;left:${offset}px;top:${offset}px">${svg}</div>`,
    BRAND_COLORS.deepGreen,
  );
}

function ogImage(lockupSvg: string, lockupWidth: number): string {
  const width = 760;
  const height = Math.round((width / lockupWidth) * 64);
  return pageHtml(
    `<main><div>${sized(lockupSvg, width, height)}</div>` +
      `<p>Denuncia sin miedo. Tu nombre se queda contigo.</p><i></i></main>`,
    BRAND_COLORS.light,
    `@font-face{font-family:SigiloMarca;font-weight:700;src:url(${fontDataUrl('Mulish-Bold.woff2')}) format('woff2')}` +
      `main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;` +
      `background:radial-gradient(900px 500px at 100% 100%,rgb(52 203 180/.28),transparent 60%),` +
      `radial-gradient(700px 400px at 0 0,rgb(3 97 90/.12),transparent 60%)}` +
      `p{margin:0;font:700 44px/1.2 SigiloMarca;color:${BRAND_COLORS.ink};letter-spacing:-.005em}` +
      `i{position:absolute;left:0;right:0;bottom:0;height:14px;background:linear-gradient(90deg,` +
      `${BRAND_COLORS.deepGreen} 0 30%,${BRAND_COLORS.primary} 65%,${BRAND_COLORS.mint})}`,
  );
}

async function renderPngs(browser: Browser, jobs: PngJob[]): Promise<void> {
  const page = await browser.newPage();
  for (const job of jobs) {
    await page.setViewportSize({ width: job.width, height: job.height });
    await page.setContent(job.html);
    await page.evaluate('document.fonts.ready.then(() => true)');
    await page.screenshot({ path: join(OUTPUT_DIR, job.file), omitBackground: true });
  }
  await page.close();
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const wordmark = await extractWordmark(browser);
    const light = lockup(wordmark, ON_LIGHT, BRAND_COLORS.deepGreen);
    const dark = lockup(wordmark, ON_DARK, BRAND_COLORS.white);
    const files: Record<string, string> = {
      'sigilo-simbolo.svg': symbolSvg(MARK_FULL, ON_LIGHT, 'SIGILO'),
      'sigilo-simbolo-claro.svg': symbolSvg(MARK_FULL, ON_DARK, 'SIGILO'),
      'sigilo-simbolo-mono.svg': symbolSvg(MARK_FULL, MONO, 'SIGILO', ' fill="currentColor"'),
      'sigilo-sello.svg': symbolSvg(MARK_SEAL, ON_LIGHT, 'SIGILO'),
      'favicon.svg': symbolSvg(MARK_FAVICON, ON_LIGHT, 'SIGILO'),
      'sigilo-horizontal.svg': svgDocument(light.width, light.height, 'SIGILO', light.body),
      'sigilo-horizontal-oscuro.svg': svgDocument(dark.width, dark.height, 'SIGILO', dark.body),
    };
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(OUTPUT_DIR, name), content);
    }
    writeFileSync(SWAGGER_MARK, files['sigilo-simbolo-claro.svg'] ?? '');
    const favicon = files['favicon.svg'] ?? '';
    const horizontal = files['sigilo-horizontal.svg'] ?? '';
    const horizontalDark = files['sigilo-horizontal-oscuro.svg'] ?? '';
    await renderPngs(browser, [
      { file: 'favicon-16.png', width: 16, height: 16, html: pageHtml(sized(favicon, 16, 16)) },
      { file: 'favicon-32.png', width: 32, height: 32, html: pageHtml(sized(favicon, 32, 32)) },
      { file: 'apple-touch-icon.png', width: 180, height: 180, html: appIcon(180) },
      { file: 'icon-192.png', width: 192, height: 192, html: appIcon(192) },
      { file: 'icon-512.png', width: 512, height: 512, html: appIcon(512) },
      {
        file: 'sigilo-horizontal@2x.png',
        width: light.width * 4,
        height: light.height * 4,
        html: pageHtml(sized(horizontal, light.width * 4, light.height * 4)),
      },
      {
        file: 'sigilo-horizontal-oscuro@2x.png',
        width: dark.width * 4,
        height: dark.height * 4,
        html: pageHtml(sized(horizontalDark, dark.width * 4, dark.height * 4)),
      },
      { file: 'og-image.png', width: 1200, height: 630, html: ogImage(horizontal, light.width) },
    ]);
    console.log(`Marca generada en ${OUTPUT_DIR}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

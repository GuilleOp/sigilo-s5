// Reporte HTML autocontenido y accesible: sin recursos externos, tabla con encabezados, estados
// con ícono y texto (nunca solo color) y contraste AA en modo claro y oscuro.
import type { CheckResult, CheckStatus, Evidence, ValidationReport } from '../types.ts';

/** Texto e ícono de cada estado. */
export const STATUS_LABELS: Record<CheckStatus, { text: string; icon: string }> = {
  cumple: { text: 'Cumple', icon: '✓' },
  no_cumple: { text: 'No cumple', icon: '✗' },
  advertencia: { text: 'Advertencia', icon: '!' },
  no_aplica: { text: 'No aplica', icon: '–' },
};

const EVIDENCE_LABELS: Record<Evidence['kind'], string> = {
  cabecera: 'Cabecera',
  red: 'Red',
  html: 'HTML',
  codigo: 'Código',
  cookie: 'Cookie',
  almacenamiento: 'Almacenamiento',
  respuesta: 'Respuesta',
  nota: 'Nota',
};

/** Escapa texto para HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status: CheckStatus): string {
  const label = STATUS_LABELS[status];
  return `<span class="badge badge-${status}"><span class="icon" aria-hidden="true">${label.icon}</span> ${label.text}</span>`;
}

function renderEvidence(item: Evidence): string {
  const parts = [
    `<span class="kind">${EVIDENCE_LABELS[item.kind]}</span> ${escapeHtml(item.description)}`,
  ];
  if (item.url !== undefined)
    parts.push(`<div class="meta">URL: <code>${escapeHtml(item.url)}</code></div>`);
  if (item.name !== undefined) {
    parts.push(
      `<div class="meta">${escapeHtml(item.name)}${item.value === undefined ? '' : `: <code>${escapeHtml(item.value)}</code>`}</div>`,
    );
  } else if (item.value !== undefined) {
    parts.push(`<div class="meta">Valor: <code>${escapeHtml(item.value)}</code></div>`);
  }
  if (item.snippet !== undefined && item.snippet !== '') {
    parts.push(`<pre><code>${escapeHtml(item.snippet)}</code></pre>`);
  }
  return `<li>${parts.join('')}</li>`;
}

function renderCheckDetail(check: CheckResult): string {
  const evidence =
    check.evidence.length === 0
      ? '<p>Sin evidencia adicional.</p>'
      : `<ul class="evidence">${check.evidence.map(renderEvidence).join('')}</ul>`;
  return `<section class="check" id="${check.id}" aria-labelledby="${check.id}-title">
  <h3 id="${check.id}-title">${check.id} · ${escapeHtml(check.title)}</h3>
  <p>${statusBadge(check.status)} <span class="tag">${check.severity === 'obligatoria' ? 'Obligatoria (DEBE)' : 'Recomendada (DEBERÍA)'}</span> · ${check.isHeuristic ? '<span class="tag">Inferencia por análisis estático</span>' : '<span class="tag">Observación directa</span>'}</p>
  <p>${escapeHtml(check.summary)}</p>
  <h4>Evidencia</h4>
  ${evidence}
  <h4>Referencias</h4>
  <ul>${check.references.map((reference) => `<li>${escapeHtml(reference)}</li>`).join('')}</ul>
</section>`;
}

const STYLES = `
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1a1f24;--muted:#4a5560;--line:#c9d1d8;--accent:#0f6b5d;--code:#f2f5f7;
--ok-bg:#e3f4e8;--ok-fg:#0b5320;--bad-bg:#fde8e8;--bad-fg:#8a1414;--warn-bg:#fff1cc;--warn-fg:#5c3d00;--na-bg:#eceff2;--na-fg:#36404a}
@media (prefers-color-scheme:dark){:root{--bg:#0b1917;--fg:#e8eeec;--muted:#b4c2be;--line:#2f4541;--accent:#5fd3bf;--code:#132824;
--ok-bg:#123d22;--ok-fg:#b7f0c8;--bad-bg:#4a1414;--bad-fg:#ffd1d1;--warn-bg:#3f3000;--warn-fg:#ffe7a3;--na-bg:#25302e;--na-fg:#d5dedb}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:72rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.6rem;margin:.2rem 0 1rem;color:var(--accent)}
h2{font-size:1.25rem;margin-top:2.2rem;border-bottom:2px solid var(--line);padding-bottom:.3rem}
h3{font-size:1.05rem;margin:0 0 .4rem}
h4{font-size:.95rem;margin:1rem 0 .3rem;color:var(--muted)}
a{color:var(--accent)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:var(--bg);padding:.5rem;z-index:1}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;margin:0}
dl.facts dt{font-weight:600}dl.facts dd{margin:0;overflow-wrap:anywhere}
.summary{display:flex;flex-wrap:wrap;gap:.6rem;list-style:none;padding:0}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:40rem}
caption{text-align:left;font-weight:600;padding:.4rem 0}
th,td{border:1px solid var(--line);padding:.5rem .6rem;text-align:left;vertical-align:top}
thead th{background:var(--code)}
.badge{display:inline-block;padding:.15rem .55rem;border-radius:999px;font-weight:700;white-space:nowrap;border:1px solid currentColor}
.badge-cumple{background:var(--ok-bg);color:var(--ok-fg)}.badge-no_cumple{background:var(--bad-bg);color:var(--bad-fg)}
.badge-advertencia{background:var(--warn-bg);color:var(--warn-fg)}.badge-no_aplica{background:var(--na-bg);color:var(--na-fg)}
.icon{display:inline-block;min-width:1ch;text-align:center}
.tag{font-size:.85rem;color:var(--muted)}
.check{border:1px solid var(--line);border-radius:1rem;padding:1rem;margin:1rem 0}
ul.evidence{padding-left:1.1rem}ul.evidence li{margin:.5rem 0;overflow-wrap:anywhere}
.kind{font-weight:700}
.meta{font-size:.9rem;color:var(--muted)}
pre{background:var(--code);padding:.5rem;border-radius:.5rem;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.85rem}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

/** Genera el documento HTML completo del reporte. */
export function renderHtmlReport(report: ValidationReport): string {
  const rows = report.checks
    .map(
      (check) => `<tr>
  <th scope="row"><a href="#${check.id}">${check.id}</a></th>
  <td>${escapeHtml(check.title)}</td>
  <td>${check.severity === 'obligatoria' ? 'Obligatoria' : 'Recomendada'}</td>
  <td>${statusBadge(check.status)}</td>
  <td>${escapeHtml(check.summary)}</td>
  <td>${check.isHeuristic ? 'Inferencia' : 'Observación'}</td>
</tr>`,
    )
    .join('\n');
  const summaryItems = (Object.keys(STATUS_LABELS) as CheckStatus[])
    .map((status) => `<li>${statusBadge(status)} <strong>${report.summary[status]}</strong></li>`)
    .join('');
  const observations =
    report.observations.length === 0
      ? '<p>Sin observaciones.</p>'
      : `<ul class="evidence">${report.observations.map(renderEvidence).join('')}</ul>`;
  const requestRows = report.network.requests
    .map(
      (request) =>
        `<tr><td>${escapeHtml(request.page)}</td><td>${escapeHtml(request.method)}</td><td>${escapeHtml(request.resourceType)}</td><td>${escapeHtml(request.party)}</td><td>${request.isBlocked ? `Bloqueada: ${escapeHtml(request.blockReason ?? '')}` : String(request.status ?? 'sin respuesta')}</td><td><code>${escapeHtml(request.url)}</code></td></tr>`,
    )
    .join('\n');
  const errors =
    report.errors.length === 0
      ? ''
      : `<h2 id="errores">Errores de la corrida</h2><ul>${report.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>Reporte del Estándar S5 · ${escapeHtml(new URL(report.target.url).host)}</title>
<style>${STYLES}</style>
</head>
<body>
<a class="skip" href="#resultados">Saltar a los resultados</a>
<main>
<p class="tag">Prototipo para el Datatón 2026 · no es el sistema oficial</p>
<h1>Reporte de verificación del Estándar S5</h1>
<dl class="facts">
  <dt>Sitio</dt><dd><code>${escapeHtml(report.target.url)}</code></dd>
  <dt>Páginas</dt><dd>${report.target.pages.map((page) => `${escapeHtml(page.label)}: <code>${escapeHtml(page.url)}</code>`).join('<br>')}</dd>
  <dt>Modo</dt><dd>${report.mode === 'pasivo' ? 'Pasivo (solo GET a recursos públicos, sin enviar formularios)' : 'Conformidad (envía denuncias sintéticas)'}</dd>
  <dt>Fecha</dt><dd><time datetime="${escapeHtml(report.startedAt)}">${escapeHtml(report.startedAt)}</time></dd>
  <dt>Herramienta</dt><dd>${escapeHtml(report.tool.name)} ${escapeHtml(report.tool.version)} · User-Agent <code>${escapeHtml(report.tool.userAgent)}</code></dd>
  <dt>Peticiones</dt><dd>${report.network.requestCount} de un máximo de ${report.limits.maxRequests}${report.network.isRequestLimitReached ? ' (se alcanzó el tope)' : ''}</dd>
</dl>
<h2>Resumen</h2>
<ul class="summary" aria-label="Conteo por resultado">${summaryItems}</ul>
<p class="tag">«Inferencia» señala resultados del análisis estático del código descargado: son indicios, no certeza. «Observación» señala lo visto directamente en cabeceras, red o respuestas.</p>
<h2 id="resultados">Resultados por verificación</h2>
<div class="table-wrap">
<table>
<caption>Verificaciones del Estándar S5 y su resultado</caption>
<thead><tr><th scope="col">Id</th><th scope="col">Verificación</th><th scope="col">Severidad</th><th scope="col">Resultado</th><th scope="col">Conclusión</th><th scope="col">Tipo</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<h2>Detalle y evidencia</h2>
${report.checks.map(renderCheckDetail).join('\n')}
<h2>Observaciones</h2>
${observations}
${errors}
<h2>Peticiones de red registradas</h2>
<details>
<summary>Ver las ${report.network.requests.length} peticiones</summary>
<div class="table-wrap">
<table>
<caption>Peticiones del navegador durante la carga</caption>
<thead><tr><th scope="col">Página</th><th scope="col">Método</th><th scope="col">Tipo</th><th scope="col">Origen</th><th scope="col">Resultado</th><th scope="col">URL</th></tr></thead>
<tbody>
${requestRows}
</tbody>
</table>
</div>
</details>
</main>
</body>
</html>
`;
}

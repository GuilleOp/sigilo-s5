// Servicios externos conocidos que el estándar prohíbe: mapas y geocodificación (PRV-11) y
// analítica o rastreo (PRV-13). Cada entrada lleva sus hosts y las firmas de código que delatan su
// uso en los paquetes JavaScript.

/** Servicio externo conocido. */
export interface KnownService {
  name: string;
  /** Sufijos de host: coincide el host exacto o cualquier subdominio. */
  hostSuffixes: readonly string[];
  /** Firmas en el código (expresiones regulares), para el análisis estático. */
  codeSignatures: readonly RegExp[];
}

/** Mapas, teselas y geocodificación de terceros. */
export const MAP_SERVICES: readonly KnownService[] = [
  {
    name: 'Mapbox',
    hostSuffixes: ['mapbox.com', 'mapbox.cn', 'tiles.mapbox.com'],
    codeSignatures: [
      /api\.mapbox\.com/,
      /mapbox:\/\/styles/,
      /mapbox\.places/,
      /mapboxgl|mapbox-gl/,
    ],
  },
  {
    name: 'Google Maps',
    hostSuffixes: ['maps.googleapis.com', 'maps.gstatic.com', 'maps.google.com'],
    codeSignatures: [/maps\.googleapis\.com/, /google\.maps\.(?:Map|Geocoder|places)/],
  },
  {
    name: 'OpenStreetMap (teselas o Nominatim)',
    hostSuffixes: ['tile.openstreetmap.org', 'nominatim.openstreetmap.org'],
    codeSignatures: [/tile\.openstreetmap\.org/, /nominatim\.openstreetmap\.org/],
  },
  {
    name: 'MapTiler',
    hostSuffixes: ['maptiler.com'],
    codeSignatures: [/api\.maptiler\.com/],
  },
  {
    name: 'ArcGIS / Esri',
    hostSuffixes: ['arcgis.com', 'arcgisonline.com'],
    codeSignatures: [/arcgisonline\.com|geocode\.arcgis\.com/],
  },
  {
    name: 'HERE',
    hostSuffixes: ['hereapi.com', 'here.com'],
    codeSignatures: [/\.hereapi\.com/],
  },
  {
    name: 'TomTom',
    hostSuffixes: ['tomtom.com'],
    codeSignatures: [/api\.tomtom\.com/],
  },
  {
    name: 'Carto',
    hostSuffixes: ['basemaps.cartocdn.com', 'carto.com'],
    codeSignatures: [/basemaps\.cartocdn\.com/],
  },
];

/** Analítica, mapas de calor, píxeles publicitarios y monitoreo de errores alojado por terceros. */
export const TRACKER_SERVICES: readonly KnownService[] = [
  {
    name: 'Google Analytics / gtag',
    hostSuffixes: ['google-analytics.com', 'analytics.google.com'],
    codeSignatures: [/\bgtag\s*\(\s*['"](?:config|event|js)['"]/, /google-analytics\.com/],
  },
  {
    name: 'Google Tag Manager',
    hostSuffixes: ['googletagmanager.com'],
    codeSignatures: [/googletagmanager\.com/, /\bGTM-[A-Z0-9]{4,}\b/],
  },
  {
    name: 'DoubleClick / Google Ads',
    hostSuffixes: ['doubleclick.net', 'googleadservices.com', 'googlesyndication.com'],
    codeSignatures: [/doubleclick\.net|googleadservices\.com/],
  },
  {
    name: 'Meta Pixel',
    hostSuffixes: ['connect.facebook.net', 'facebook.com', 'facebook.net'],
    codeSignatures: [/connect\.facebook\.net/, /\bfbq\s*\(\s*['"](?:init|track)['"]/],
  },
  {
    name: 'Hotjar',
    hostSuffixes: ['hotjar.com', 'hotjar.io'],
    codeSignatures: [/static\.hotjar\.com|_hjSettings/],
  },
  {
    name: 'Microsoft Clarity',
    hostSuffixes: ['clarity.ms'],
    codeSignatures: [/clarity\.ms\/tag/, /\bclarity\s*\(\s*['"](?:set|identify|event)['"]/],
  },
  {
    name: 'Sentry (alojado por terceros)',
    hostSuffixes: ['sentry.io', 'sentry-cdn.com'],
    codeSignatures: [/https?:\/\/[0-9a-f]{16,}@[\w.-]*sentry\.io/, /browser\.sentry-cdn\.com/],
  },
  {
    name: 'Segment',
    hostSuffixes: ['segment.com', 'segment.io'],
    codeSignatures: [/cdn\.segment\.com/],
  },
  {
    name: 'Mixpanel',
    hostSuffixes: ['mixpanel.com', 'mxpnl.com'],
    codeSignatures: [/api(?:-js)?\.mixpanel\.com/],
  },
  {
    name: 'Amplitude',
    hostSuffixes: ['amplitude.com'],
    codeSignatures: [/api2?\.amplitude\.com/],
  },
  {
    name: 'New Relic',
    hostSuffixes: ['nr-data.net', 'newrelic.com'],
    codeSignatures: [/js-agent\.newrelic\.com|bam\.nr-data\.net/],
  },
  {
    name: 'Datadog RUM',
    hostSuffixes: ['datadoghq.com', 'datadoghq.eu', 'browser-intake-datadoghq.com'],
    codeSignatures: [/browser-intake-datadoghq/],
  },
  {
    name: 'Matomo en la nube',
    hostSuffixes: ['matomo.cloud'],
    codeSignatures: [/\.matomo\.cloud/],
  },
  {
    name: 'Plausible',
    hostSuffixes: ['plausible.io'],
    codeSignatures: [/plausible\.io\/js/],
  },
];

/** Busca el servicio cuyo host coincide con el de la URL. */
export function matchServiceByUrl(
  url: string,
  services: readonly KnownService[],
): KnownService | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    services.find((service) =>
      service.hostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)),
    ) ?? null
  );
}

/** Nombres de cookies de analítica y publicidad conocidos (PRV-12). */
export const TRACKING_COOKIE_PATTERN =
  /^(?:_ga(?:_[\w-]+)?|_gid|_gat(?:_[\w-]+)?|_gcl_\w+|__utm[a-z]|_fbp|_fbc|_hj\w*|_clck|_clsk|_uetsid|_uetvid|ajs_\w+|mp_\w+|amplitude_\w+|_pk_\w+|__hs\w+)$/i;

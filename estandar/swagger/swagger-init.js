// Generado con npm run standard:build desde scripts/standard/build.ts; no se edita a mano.
// Inicia Swagger UI con un desplegable de documentos (`urls`), como el Swagger UI de la PDN.
// Seguridad: sin validador en línea (validatorUrl: null) y sin «Try it out», para que la vista no
// haga peticiones fuera de su origen.
/* global SwaggerUIBundle, SwaggerUIStandalonePreset */
if (typeof SwaggerUIBundle === 'function' && typeof SwaggerUIStandalonePreset !== 'undefined') {
  const options = {
    urls: [
      {
        url: '../oas/OAS_API_S5_Estadisticas_Denuncias.json',
        name: 'S5 - Estadísticas de denuncias (PDN)',
      },
      { url: '../oas/OAS_API_S5_Denuncias_Nodo.json', name: 'S5 - Denuncia y seguimiento (nodo)' },
      { url: '../oas/OAS_API_S5_Red.json', name: 'S5 - Red federada' },
      { url: '../oas/OAS_API_S5_Corroboracion.json', name: 'S5 - Corroboración ciega' },
      { url: '../openapi.json', name: 'S5 - Estándar completo (OpenAPI 3.1)' },
    ],
    'urls.primaryName': 'S5 - Estadísticas de denuncias (PDN)',
    dom_id: '#swagger-ui',
    deepLinking: true,
    validatorUrl: null,
    supportedSubmitMethods: [],
    defaultModelsExpandDepth: 0,
    docExpansion: 'list',
  };
  SwaggerUIBundle({
    ...options,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
} else {
  document.getElementById('swagger-missing')?.removeAttribute('hidden');
}

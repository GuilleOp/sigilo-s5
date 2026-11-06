// Inicia Swagger UI con el documento local del Estándar S5.
// Seguridad: sin validador en línea (validatorUrl: null) y sin «Try it out», para que la vista no
// haga peticiones fuera del servidor estático.
/* global SwaggerUIBundle */
if (typeof SwaggerUIBundle === 'function') {
  SwaggerUIBundle({
    url: '../openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    validatorUrl: null,
    supportedSubmitMethods: [],
    defaultModelsExpandDepth: 0,
    docExpansion: 'list',
  });
} else {
  document.getElementById('swagger-missing')?.removeAttribute('hidden');
}

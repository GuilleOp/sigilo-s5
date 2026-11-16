# Política de seguridad

## Reporte de vulnerabilidades

**No abras un issue público.** Usa el aviso de seguridad privado de GitHub: pestaña **Security**,
**Report a vulnerability**
([enlace directo](https://github.com/GuilleOp/sigilo-s5/security/advisories/new)).

Incluye, si puedes:

- el componente afectado (`packages/core`, `apps/server`, `apps/enrutador`, `apps/web`…) y la
  versión o el commit;
- los pasos para reproducirlo, con datos sintéticos;
- el impacto que ves (por ejemplo, reidentificación de quien denuncia, lectura de una denuncia por
  quien no debe o alteración de la bitácora).

Se acusará recibo en un plazo de 72 horas. Se pide un periodo razonable para corregir antes de
cualquier divulgación pública, y se dará crédito a quien reporte si así lo desea.

## Alcance

SIGILO es un prototipo de referencia. No debe usarse para recibir denuncias reales sin una
evaluación de seguridad independiente. Los riesgos residuales conocidos están en el
[modelo de amenazas](docs/modelo-de-amenazas.md) y en
[seguridad en producción](docs/seguridad-produccion.md); los hallazgos ya corregidos, en el
[historial de seguridad](docs/historial-de-seguridad.md).

## Versiones con soporte

Solo la rama `main` recibe correcciones de seguridad.

## Hallazgos sobre sistemas de terceros

Las observaciones sobre sistemas de terceros se comunican primero a la institución responsable y
solo se publican después, de forma general.

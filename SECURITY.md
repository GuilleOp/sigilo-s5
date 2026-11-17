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

Plazos orientativos: acuse de recibo en 72 horas y triaje en 7 días; corrección de lo crítico o alto
en 30 días y de lo medio en 90. Se pide no divulgar antes de la corrección o de esos plazos, y se
dará crédito a quien reporte si así lo desea.

**Puerto seguro.** Se considera de buena fe y no se emprenderá ninguna acción contra la
investigación que use solo datos sintéticos, su propia instalación o la demostración local, que no
degrade el servicio de otros y que reporte por este canal.

## Alcance

**Dentro:** el código de este repositorio (`apps/`, `packages/`, `tools/`), las imágenes publicadas
`ghcr.io/guilleop/sigilo-*` y el Estándar S5 (`estandar/`).
**Fuera:** DoS volumétrico, ingeniería social, la demostración con `SIGILO_DEMO=1` cuando el hallazgo
depende de sus cuentas o llaves sintéticas publicadas, la infraestructura de terceros y el S5
oficial.

La última revisión interna, con su evidencia, está en
[pruebas de seguridad](docs/pruebas-de-seguridad.md). SIGILO es un prototipo de referencia. No debe usarse para recibir denuncias reales sin una
evaluación de seguridad independiente. Los riesgos residuales conocidos están en el
[modelo de amenazas](docs/modelo-de-amenazas.md) y en
[seguridad en producción](docs/seguridad-produccion.md); los hallazgos ya corregidos, en el
[historial de seguridad](docs/historial-de-seguridad.md).

## Versiones con soporte

Solo la versión más reciente (hoy 1.2.1, en la rama `main`) recibe correcciones de seguridad.

## Hallazgos sobre sistemas de terceros

Las observaciones sobre sistemas de terceros se comunican primero a la institución responsable y
solo se publican después, de forma general.

# Guion de la demostración

Duración: unos 9 minutos. Todo corre en local con datos sintéticos; no depende de internet.

## Preparación

- Restablecer datos de demostración y generar llaves.
- Ventanas abiertas: persona denunciante, panel de autoridad, terminal con la base de datos y
  verificador de la bitácora.
- Archivos listos: foto con GPS sintético, PDF de "memo interno" y texto con caracteres invisibles.
- Caso ficticio: adjudicación directa irregular en la Secretaría de Obras de Villa Ejemplo.
- Video de respaldo grabado de todo el flujo.

## Acto 0. Planteamiento (30 s)

Una persona denuncia a su superior y al día siguiente él sabe quién fue. No hizo falta vulnerar el
sistema: bastaron la foto adjunta, el texto y el acceso de alguien dentro. SIGILO cierra esas tres
puertas.

## Acto 1. Recepción con Huella Cero (2 min 30 s)

1. Elegir "Anónimo" o "Identidad sellada" y explicar la diferencia en una frase.
2. Adjuntar la foto. El panel muestra GPS, dispositivo y fecha. Limpiar y mostrar el antes y el
   después.
3. En la terminal, comprobar con `exiftool` que la foto limpia no tiene metadatos.
4. Adjuntar el PDF: se convierte a imagen y se explica por qué.
5. Pegar el texto del memo: aparece la alerta de caracteres invisibles y se eliminan.
6. Escribir "soy la única auxiliar contable del área": el revisor la subraya y sugiere otra
   redacción.
7. Mostrar el semáforo de riesgo y la vista "Así te verá la autoridad".
8. Enviar. Aparecen el folio y el recibo de 8 palabras; confirmar dos palabras.
9. En las herramientas del navegador, mostrar que no hay peticiones a terceros y que la identidad
   viaja cifrada.

## Acto 2. El administrador intenta saber quién fue (1 min)

1. Consultar la tabla de denuncias: la identidad y los mensajes son texto cifrado.
2. Modificar una fila de la bitácora.
3. El verificador marca la cadena como alterada frente a la cabeza anclada.

## Acto 3. Trámite (1 min)

1. En el panel, abrir la denuncia: hechos, pruebas limpias e identidad "sellada".
2. Cambiar el estatus a "En investigación".
3. Enviar por el buzón: "¿Recuerda el número de contrato?".

## Acto 4. Seguimiento (1 min 30 s)

1. Entrar con folio y recibo.
2. Ver la línea de tiempo, el comprobante verificado y la pregunta descifrada en el navegador.
3. Responder; el revisor avisa si la respuesta revela algo.
4. Ver "Historial de accesos a tu identidad: ninguno".

## Acto 5. Apertura con rendición de cuentas (1 min 30 s)

1. En el panel, solicitar la apertura de la identidad con fundamento legal escrito.
2. La identidad se descifra solo en el navegador de la autoridad.
3. En el seguimiento aparece la apertura con fecha y fundamento.
4. Cierre: revelar la identidad de un denunciante anónimo es obstrucción de la justicia según el
   artículo 64 de la LGRA; ahora queda evidencia de quién lo hizo.

## Acto 6. Adopción (1 min)

1. Mostrar los paquetes `core` y `huella` y la guía de integración.
2. Mostrar los datos abiertos con supresión de celdas pequeñas.
3. Lámina final: recepción, trámite y seguimiento, con sus mecanismos.

## Preguntas previstas

| Pregunta                                    | Respuesta breve                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ¿Y si el servidor entrega código malicioso? | Riesgo residual; hashes publicados por versión y verificador planeado.                                  |
| ¿Y si la autoridad abre sin motivo?         | Queda registrado y visible para la persona; el umbral 2 de 3 es la siguiente etapa.                     |
| ¿Y si pierdo el recibo?                     | No hay recuperación por diseño; se puede presentar otra denuncia citando el folio.                      |
| ¿Es legal la apertura?                      | La LGRA obliga a la autoridad a mantener la confidencialidad (art. 91); el sistema la hace verificable. |

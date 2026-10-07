# Guion de la demostración

Duración: unos 9 minutos. Todo corre en local con datos sintéticos y no depende de internet. Los
comandos se ejecutan desde la raíz del repositorio con Node 22.18 o superior.

## Preparación (antes de la presentación)

1. Instalar y generar llaves (una sola vez):

   ```sh
   npm ci
   npm run keys:generate
   ```

   `keys:generate` crea las llaves privadas en `apps/server/data/`, fija las públicas en
   `apps/web/src/config/pinned-keys.json` y crea `apps/server/.env` con un
   `SIGILO_AUTHORITY_TOKEN` aleatorio.

2. Dejar la base vacía (conserva las llaves). Con el servidor detenido:

   ```sh
   npm run demo:reset -- --yes
   ```

   Sin `--yes`, el script exige el marcador `.sigilo-demo` en `apps/server/data`, y se niega a correr
   si el servidor está en marcha. Una base creada antes de la migración 3 no arranca: el servidor
   pide ejecutar este mismo comando.

3. Preparar el reloj de demostración y levantar el servidor y la web, en dos terminales:

   ```sh
   printf 0 > /tmp/sigilo-reloj && chmod 600 /tmp/sigilo-reloj
   SIGILO_E2E=1 SIGILO_TEST_CLOCK_FILE=/tmp/sigilo-reloj npm run dev:server
   npm run dev:web
   ```

   Los eventos del día se publican al cerrar el día (UTC). Para mostrarlos durante la presentación
   se usa el reloj de pruebas: el servidor suma al reloj real los milisegundos escritos en el
   archivo. Solo se acepta con `SIGILO_E2E=1` (o `NODE_ENV=test`), con un archivo propio que no
   puedan escribir otros y un desfase de 0 a 400 días.

   La prueba de trabajo está activa (18 bits): al enviar, la web la resuelve en un Web Worker y
   avisa «Protegiendo tu envío contra envíos automáticos. Puede tardar unos segundos».

4. Ventanas abiertas en `http://127.0.0.1:5173`:
   - Persona denunciante: «Denunciar» y «Dar seguimiento».
   - Panel de autoridad: enlace «Panel de autoridad» del pie (o `http://127.0.0.1:5173/autoridad`).
     El token es el valor de `SIGILO_AUTHORITY_TOKEN` en `apps/server/.env`; la llave se importa
     desde `apps/server/data/authority-demo-key.json`.
   - Verificación: enlace «Verificar bitácora» del pie.
   - Una terminal libre.

5. Archivos sintéticos (nunca datos reales):
   - Foto con GPS ficticio, a partir de cualquier imagen propia sin personas ni lugares
     identificables:

     ```sh
     exiftool -GPSLatitude=20.5 -GPSLatitudeRef=N -GPSLongitude=100.25 -GPSLongitudeRef=W \
       -Make=Ejemplo -Model=Demo -Artist="Persona Ficticia" foto-demo.jpg
     ```

   - Un PDF de «memo interno» con texto ficticio (imprimir como PDF una página de prueba).
   - Texto con caracteres invisibles, copiado al portapapeles:

     ```sh
     node -e "process.stdout.write('Memo interno​ de la Secretaría‌ de Obras de Villa Ejemplo')" | pbcopy
     ```

6. Caso ficticio: adjudicación directa irregular en la Secretaría de Obras de Villa Ejemplo.
7. Video de respaldo grabado de todo el flujo.

## Acto 0. Planteamiento (30 s)

Una persona denuncia a su superior y al día siguiente él sabe quién fue. No hizo falta vulnerar el
sistema: bastaron la foto adjunta, el texto y el acceso de alguien dentro. SIGILO cierra esas tres
puertas.

## Acto 1. Recepción con Huella Cero (2 min 30 s)

1. Mostrar la barra mínima con «Salida rápida» y mencionar el atajo: Esc dos veces.
2. Elegir «Anónima (recomendada)» o «Identidad sellada» y explicar la diferencia en una frase.
3. En «Hechos», pegar el texto del portapapeles: aparece el aviso de marcas escondidas y se quitan.
   Aunque no se quiten, se eliminan siempre al enviar.
4. Escribir «soy la única auxiliar contable del área»: el revisor la subraya y sugiere otra
   redacción.
5. En «Pruebas», adjuntar la foto. El panel «Esta foto revela» muestra el lugar exacto, el
   dispositivo y el autor. Limpiar y mostrar el antes y el después, con «Revisado: la copia limpia ya
   no tiene datos escondidos».
6. Adjuntar el PDF: cada hoja se convierte en una foto, y se explica por qué.
7. En «Revisión», mostrar el semáforo de riesgo y la vista «Así te verá la autoridad».
8. Enviar. Aparecen el folio y el recibo de 8 palabras; confirmar dos palabras (basta con las
   primeras 4 letras).
9. En las herramientas del navegador, mostrar que no hay peticiones a terceros y que la identidad
   viaja cifrada.

## Acto 2. Trámite (1 min)

1. En el panel, abrir la denuncia: hechos, pruebas limpias e identidad «sellada».
2. Cambiar el estatus a «En investigación».
3. Enviar por el buzón: «¿Recuerda el número de contrato?».

## Acto 3. Seguimiento (1 min 30 s)

1. Entrar en «Dar seguimiento» con el folio y las 8 palabras.
2. Ver la línea de tiempo, el comprobante verificado, la pregunta descifrada en el navegador y el
   aviso de que su anotación está pendiente de publicar.
3. Responder; el revisor avisa si la respuesta revela algo.
4. Ver «Tu nombre sigue bajo llave. Nadie lo ha abierto».

## Acto 4. Apertura con rendición de cuentas (1 min 30 s)

1. En el panel, abrir la identidad con un fundamento legal escrito. El panel la muestra como
   «Identidad declarada por la persona, no verificada».
2. La identidad se descifra solo en el navegador de la autoridad.
3. En el seguimiento aparece la apertura con fecha y fundamento.
4. Cierre: revelar la identidad de un denunciante anónimo es obstrucción de la justicia según el
   artículo 64 de la LGRA; ahora queda evidencia de quién lo hizo.

## Acto 5. Integridad: bitácora, ancla y trasplante (1 min 30 s)

1. Avanzar el reloj de demostración un día y abrir «Verificar bitácora»: la cadena coincide con el
   registro firmado.

   ```sh
   printf 86400000 > /tmp/sigilo-reloj
   ```

   Al cerrar el día, los eventos se encadenan en orden barajado: el orden en la bitácora no es el de
   llegada. En el seguimiento, el aviso del registro público pasa de «pendiente de publicar» a «ya aparece en el registro público» y la
   apertura de identidad aparece conciliada con la bitácora.

2. Anclar la cabeza pública en un directorio temporal y pegar el contenido del archivo en
   «Verificar bitácora»: «La bitácora contiene el anclaje publicado».

   ```sh
   SIGILO_ANCHOR_URL=http://127.0.0.1:8787 SIGILO_ANCHORS_DIR=/tmp/sigilo-anclas npm run ledger:anchor
   cat /tmp/sigilo-anclas/*.json
   ```

3. Manipulación por un administrador, en una copia de la base. Detener el servidor (Ctrl+C) y
   ejecutar:

   ```sh
   rm -rf /tmp/sigilo-copia && cp -R apps/server/data /tmp/sigilo-copia && rm -f /tmp/sigilo-copia/server.lock
   node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/tmp/sigilo-copia/sigilo.db');db.exec('DROP TRIGGER ledger_events_no_update');db.prepare('UPDATE ledger_events SET payload_digest=? WHERE seq=0').run('0'.repeat(64))"
   SIGILO_DATA_DIR=/tmp/sigilo-copia SIGILO_E2E=1 SIGILO_TEST_CLOCK_FILE=/tmp/sigilo-reloj npm run dev:server
   ```

   Primero hay que quitar el trigger que impide modificar eventos. Al verificar de nuevo, la página
   indica que la bitácora no coincide. Después, detener ese servidor y volver a levantar el original.

4. Trasplante del sobre de identidad: detener el servidor y la web (las pruebas E2E usan los puertos
   8787 y 4173), ejecutar la prueba que reproduce el ataque y mostrar que se rechaza.

   ```sh
   npm run test:e2e -- e2e/transplant.spec.ts
   ```

   Un `authVerifier` repetido se rechaza con 400, y un sobre copiado con otro recibo no abre.

## Acto 6. Adopción (1 min)

1. Mostrar los paquetes `core` y `huella` y la [guía de integración](integracion-s5.md).
2. Mostrar «Datos abiertos»: solo meses congelados al cerrarse, conteos redondeados a múltiplos de 5
   y las denuncias que no se muestran para proteger a quienes denunciaron.
3. Lámina final: recepción, trámite y seguimiento, con sus mecanismos.

## Después de la presentación

```sh
npm run demo:reset -- --yes
rm -rf /tmp/sigilo-reloj /tmp/sigilo-anclas /tmp/sigilo-copia
```

## Preguntas previstas

| Pregunta                                    | Respuesta breve                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ¿Y si el servidor entrega código malicioso? | Riesgo residual documentado; hashes publicados por versión y verificador son trabajo futuro.                 |
| ¿Y si la autoridad abre sin motivo?         | Queda registrado y visible para la persona; el umbral 2 de 3 es la siguiente etapa.                          |
| ¿Y si pierdo el recibo?                     | No hay recuperación por diseño; se puede presentar otra denuncia citando el folio.                           |
| ¿Es legal la apertura?                      | La LGRA obliga a la autoridad a mantener la confidencialidad (art. 91); el sistema la hace verificable.      |
| ¿Qué evita el abuso masivo?                 | Prueba de trabajo por envío, límites, cuota de almacenamiento y, como último recurso, cuotas globales.       |
| ¿Por qué la bitácora tarda un día?          | Publicar al instante revelaría la hora exacta de cada envío; los lotes diarios lo evitan.                    |
| ¿Quién garantiza que no reescriben todo?    | Las anclas versionadas en un repositorio público; entre dos anclas sigue siendo posible, y así se documenta. |

# Cuando denuncia una persona ciudadana

SIGILO se diseñó primero pensando en Marta, una servidora pública que denuncia a su propia
oficina. Pero muchas denuncias vienen de personas que no trabajan ahí: alguien a quien le pidieron
dinero en una ventanilla, un policía que pidió una «mordida», un comercio al que le condicionaron un
permiso. Lo esencial del sistema les sirve igual. Lo que cambia es **cómo las reconocen**, **qué
represalias temen** y **qué dice la ley**.

## Qué aplica igual

Huella Cero, el revisor de frases, el cifrado, el enrutador ciego, la identidad sellada, el recibo
de 8 palabras, el buzón anónimo, la corroboración ciega, el seguimiento con plazos y la
inconformidad (LGRA, arts. 102 a 109) funcionan para cualquier persona. La denuncia anónima y la
confidencialidad de la identidad (LGRA, art. 91) también.

## Qué cambia

| Tema                      | Persona servidora pública                         | Persona ciudadana                                                                                              |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Cómo la reconocen         | Por el tamaño de su área y los detalles internos  | Por el trámite: número de expediente, placas, dirección de su casa o negocio, día y hora en la ventanilla      |
| Quién ya sabe quién es    | Sus compañeras y compañeros pueden deducirlo      | Si le pidieron dinero cara a cara, la persona denunciada ya la vio. El anonimato la protege de todas las demás |
| Miedo a ser cómplice      | Raro                                              | Frecuente: dar dinero puede ser soborno, una falta de particulares (LGRA, art. 66)                             |
| Represalias               | Laborales                                         | Negarle trámites, permisos o servicios; acoso                                                                  |
| Protección legal          | Puede pedir medidas de protección (LGRA, art. 64) | La LGRA no prevé medidas equivalentes para particulares                                                        |
| Valor de la corroboración | Alto                                              | Mayor: muchas personas pasan por la misma ventanilla. Si varias denuncian, ninguna es «la que habló»           |

## Qué hace la web

1. **Pregunta del paso 2.** «¿Trabajas o trabajaste en esa oficina?» ofrece «No (por ejemplo, fui
   a hacer un trámite)». La respuesta no se envía; solo decide el aviso de la revisión.
2. **Aviso en la revisión** (`CitizenNotice`). Si la respuesta es «No», en lugar del grupo de
   anonimato explica que la persona denunciada pudo verla, y cómo bajar ese riesgo: quitar números
   de trámite, placas y direcciones; no dar el día ni la hora; enviar unos días después; y pedir a
   otras personas que denuncien por separado, con la corroboración ciega.
3. **Información sobre el soborno.** «¿Te pidieron dinero y lo pagaste?»: denunciar de forma anónima
   no la expone. Si decide identificarse y reconocer su participación, la LGRA (arts. 88 y 89)
   contempla reducir la sanción a quien confiese antes de que le notifiquen un procedimiento, sea
   la primera persona en aportar pruebas y colabore. Es información general, no asesoría legal.
4. **Represalias.** «¿Y si me niegan el trámite o me amenazan?»: dice de frente que la ley no prevé
   medidas de protección equivalentes para particulares y sugiere guardar comprobantes y acudir
   también a la fiscalía.
5. **Revisor de frases** (`packages/huella`). Además de correos, teléfonos, CURP, RFC, fechas y
   horas, marca números de trámite, expediente, folio, licencia o cuenta de servicio
   (`case_number`), placas (`plate`), direcciones con calle y número (`address`) y frases como «mi
   negocio», «mi casa» o «mi carro» (`own_property`), cada uno con una versión más general. No marca
   el número de un contrato público, que suele ser el objeto de la denuncia.

## Hueco legal

La LGRA prevé medidas de protección para las personas servidoras públicas que denuncian (art. 64),
pero no para particulares. SIGILO no puede llenar ese hueco: reduce el riesgo de que reconozcan a la
persona, pero si la reconocen, la ley no le ofrece la misma protección. Es una propuesta de mejora
normativa que conviene presentar junto con el estándar.

## En la demostración

Casos `case.ventanilla-1` y `case.ventanilla-2` en [demo-escenario.md](demo-escenario.md): dos
personas ciudadanas a quienes les pidieron dinero en la misma ventanilla del Instituto de Movilidad
Estatal Ficticio denuncian por separado, en días distintos, ante la Contraloría de Querétaro. La
corroboración ciega las junta como dos fuentes independientes sin revelar quiénes son.

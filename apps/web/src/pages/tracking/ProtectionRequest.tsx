// «Solicitar medidas de protección» desde el seguimiento. Envía por el buzón cifrado un mensaje con
// la solicitud y, si la persona quiere, lo que le preocupa. No pide datos nuevos y explica que la
// decisión es de la autoridad competente (LGRA, art. 64; CNPP, arts. 109 fr. XVI y XIX, y 137).
import { useState } from 'react';
import { ReviewedTextArea } from '../../components/ReviewedTextArea.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import {
  buildProtectionRequestMessage,
  MAX_PROTECTION_DETAILS_LENGTH,
} from '../../lib/protection-request.ts';

interface ProtectionRequestProps {
  isSending: boolean;
  onSend: (text: string) => Promise<boolean>;
}

/** Solicitud de medidas de protección por el buzón. */
export function ProtectionRequest({ isSending, onSend }: ProtectionRequestProps) {
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [isSent, setSent] = useState(false);

  return (
    <details className="protection-request" data-testid="protection-request">
      <summary>Solicitar medidas de protección</summary>
      <p>
        Si temes represalias o crees que corres riesgo por haber denunciado, puedes pedir medidas de
        protección. Enviamos tu solicitud por este mismo buzón cifrado, con lo que tú decidas
        escribir y nada más.
      </p>
      <ul>
        <li>
          <strong>Quién decide.</strong> SIGILO no otorga medidas: tu solicitud llega a la autoridad
          que lleva tu denuncia. Si trabajas en el servicio público, la ley pide que la evalúe el
          ente donde trabajas (LGRA, art. 64). Si el caso va por la vía penal y la ley te reconoce
          como víctima, deciden el Ministerio Público o el juez (CNPP, arts. 109 fr. XVI y XIX, y
          137).
        </li>
        <li>
          <strong>Tu identidad.</strong> Pedirlas no revela quién eres. Algunas medidas, como la
          vigilancia o la protección policial, requieren que la autoridad sepa quién eres o dónde
          estás; si te lo piden por aquí, tú decides si das esos datos.
        </li>
        <li>
          <strong>Si tu vida corre peligro ahora</strong>, llama al 911.
        </li>
      </ul>
      {isSent ? (
        <p role="status" data-testid="protection-request-sent">
          Enviaste tu solicitud. La verás en el hilo de mensajes; la respuesta de la autoridad
          llegará por el mismo buzón.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (isSending) return;
            const message = buildProtectionRequestMessage(details);
            if (!message.ok) {
              setError(message.error);
              focusAfterRender('protection-details');
              return;
            }
            setError('');
            void onSend(message.text).then((ok) => {
              if (!ok) return;
              setDetails('');
              setSent(true);
            });
          }}
          noValidate
        >
          <ReviewedTextArea
            id="protection-details"
            label="Lo que te preocupa (opcional)"
            hint="Por ejemplo, qué tipo de represalia temes. No escribas datos que te identifiquen si no quieres darlos."
            rows={4}
            maxLength={MAX_PROTECTION_DETAILS_LENGTH}
            value={details}
            error={error || undefined}
            onChange={(value) => {
              setDetails(value);
              setError('');
            }}
          />
          <button
            type="submit"
            className="button"
            aria-disabled={isSending ? true : undefined}
            data-testid="send-protection-request"
          >
            {isSending ? 'Enviando...' : 'Enviar la solicitud de medidas de protección'}
          </button>
        </form>
      )}
    </details>
  );
}

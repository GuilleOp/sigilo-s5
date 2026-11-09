// Recorridos guiados, como el tutorial de la bandeja del S5 pero a pedido: solo empiezan cuando la
// persona los pide (nada se guarda para saber si ya los vio, así el equipo no delata que se usó
// SIGILO). Cada paso es una frase corta y, si tiene `target`, resalta ese elemento de la pantalla.
import type { AuthorityRole } from './authority-role.ts';

/** Un paso del recorrido. `target` es el `data-testid` del elemento que se resalta. */
export interface TourStep {
  title: string;
  text: string;
  target?: string;
}

/** Recorrido con su nombre (va arriba de la tarjeta) y la ruta donde ocurre. */
export interface Tour {
  id: string;
  label: string;
  path: string;
  steps: readonly TourStep[];
}

export const REPORTER_TOUR: Tour = {
  id: 'reporter',
  label: 'Recorrido · Quien denuncia',
  path: '/',
  steps: [
    {
      title: 'Bienvenida',
      text: 'En un minuto te mostramos cómo denunciar sin que nadie sepa que fuiste tú.',
    },
    {
      title: 'Salida rápida',
      text: 'Si alguien se acerca, pulsa aquí o Esc dos veces. Se borra todo y se abre una página del clima.',
      target: 'quick-exit',
    },
    {
      title: 'Hazlo a tu medida',
      text: 'Letra más grande, alto contraste, lectura en voz alta y más. Todo en «Accesibilidad».',
      target: 'a11y-toggle',
    },
    {
      title: 'Presentar una denuncia',
      text: 'Son 5 pasos. No pedimos tu nombre, ni tu correo, ni tu teléfono.',
      target: 'cta-report',
    },
    {
      title: 'Nada te delata',
      text: 'Revisamos tu relato y limpiamos tus fotos en tu equipo, antes de enviar.',
      target: 'promises',
    },
    {
      title: 'Ver cómo va',
      text: 'Al enviar te damos un folio y 8 palabras. Solo con ellas puedes entrar a tu denuncia.',
      target: 'cta-tracking',
    },
    {
      title: '¿Te quedan dudas?',
      text: 'Aquí te explicamos quién puede saber qué, y cómo comprobarlo tú.',
      target: 'protection-link',
    },
  ],
};

const AUTHORITY_INTRO: Readonly<Record<AuthorityRole, TourStep>> = {
  intake: {
    title: 'Tu función: recepción y turnado',
    text: 'Recibes las denuncias nuevas y las envías a la autoridad que puede investigarlas.',
  },
  investigation: {
    title: 'Tu función: investigación',
    text: 'Aceptas las denuncias que te turnan, investigas y calificas. Los plazos de la ley corren desde que aceptas.',
  },
  intake_investigation: {
    title: 'Tu función: recepción e investigación',
    text: 'Aceptas o reasignas lo que llega, investigas, calificas y presentas el informe a la autoridad substanciadora.',
  },
  substantiation: {
    title: 'Tu función: substanciación y resolución',
    text: 'Recibes el informe de la autoridad investigadora y llevas el procedimiento hasta la resolución. Nunca investigas.',
  },
  supervision: {
    title: 'Tu función: supervisión',
    text: 'Recibes las denuncias que una autoridad no atendió a tiempo, con los hechos y nunca con el nombre.',
  },
  operation: {
    title: 'Tu función: operación del nodo',
    text: 'Revisas las solicitudes de alta de las instituciones. No ves denuncias.',
  },
};

const AUTHORITY_DETAIL: Readonly<Record<AuthorityRole, TourStep>> = {
  intake: {
    title: 'Turna con cuidado',
    text: 'Si tienes un interés con la persona señalada, el sistema te pide excusarte. Para reasignar o devolver, escribe un motivo: la persona lo leerá.',
  },
  investigation: {
    title: 'Decisiones con fundamento',
    text: 'Calificar o cerrar pide fundamento y acuerdo. Abrir un nombre sellado exige dos personas y queda en el registro público.',
  },
  intake_investigation: {
    title: 'Decisiones con fundamento',
    text: 'Para reasignar o devolver, escribe un motivo. Calificar o cerrar pide fundamento. Abrir un nombre exige dos personas.',
  },
  substantiation: {
    title: 'Del informe a la resolución',
    text: 'Avanzas las etapas después del informe y resuelves con fundamento. No turnas ni abres nombres sellados.',
  },
  supervision: {
    title: 'Lo que puedes hacer',
    text: 'Abres la segunda llave para leer los hechos y das seguimiento sin depender de la autoridad que se tardó.',
  },
  operation: {
    title: 'Confirma la huella por teléfono',
    text: 'Llama a la institución y pide que te lea su huella. Solo si coincide con la que calcula tu navegador puedes aprobar.',
  },
};

/** Recorrido del panel según la función de la cuenta. */
export function authorityTour(role: AuthorityRole): Tour {
  return {
    id: `authority-${role}`,
    label: 'Recorrido · Panel de autoridad',
    path: '/autoridad',
    steps: [
      AUTHORITY_INTRO[role],
      {
        title: 'Nunca ves quién denuncia',
        text: 'Ves hechos y pruebas limpias. El nombre, si lo hay, va en un sobre que solo se abre con dos aprobaciones.',
      },
      ...(role === 'supervision'
        ? [
            {
              title: 'Escalamientos que recibiste',
              text: 'Cada uno dice qué regla pública se cumplió: por ejemplo, un plazo vencido.',
              target: 'escalations',
            },
          ]
        : []),
      {
        title: role === 'intake' ? 'Bandeja general de turnado' : 'Tus denuncias',
        text: 'Cada fila dice el folio, la conducta y su turnado: «SIN TURNAR», «TURNADA» o «ACEPTADA», como en la bandeja del S5.',
        target: 'complaint-list',
      },
      AUTHORITY_DETAIL[role],
      {
        title: 'Al terminar',
        text: 'Cierra la sesión: también borra la llave de la memoria de este equipo.',
        target: 'authority-logout',
      },
    ],
  };
}

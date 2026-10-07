// "Asesor antes de denunciar": cinco preguntas y consejos personalizados. Todo ocurre en el
// navegador y las respuestas no se envían ni se guardan.

/** Identificador de cada pregunta. */
export type AdvisorQuestionId = 'witnesses' | 'device' | 'network' | 'evidence' | 'protection';

/** Una pregunta del asesor y sus opciones. */
export interface AdvisorQuestion {
  id: AdvisorQuestionId;
  text: string;
  options: readonly { value: string; label: string }[];
}

/** Respuestas elegidas (puede faltar alguna). */
export type AdvisorAnswers = Partial<Record<AdvisorQuestionId, string>>;

/** Consejo personalizado. */
export interface AdvisorTip {
  id: string;
  priority: 'important' | 'useful';
  title: string;
  text: string;
}

/** Resultado del asesor. */
export interface AdvisorResult {
  recommendedMode: 'anonymous' | 'sealed';
  modeReason: string;
  tips: AdvisorTip[];
}

/** Las cinco preguntas, en orden. */
export const ADVISOR_QUESTIONS: readonly AdvisorQuestion[] = [
  {
    id: 'witnesses',
    text: '¿Cuántas personas conocen estos hechos?',
    options: [
      { value: 'only-me', label: 'Solo yo' },
      { value: 'few', label: 'Pocas personas (de 2 a 5)' },
      { value: 'many', label: 'Muchas personas (más de 5)' },
      { value: 'unknown', label: 'No lo sé' },
    ],
  },
  {
    id: 'device',
    text: '¿Desde qué equipo escribes?',
    options: [
      { value: 'work', label: 'Un equipo del trabajo' },
      { value: 'own-phone', label: 'Mi celular' },
      { value: 'own-computer', label: 'Mi computadora personal' },
      { value: 'shared', label: 'Un equipo prestado o público (café internet, biblioteca)' },
    ],
  },
  {
    id: 'network',
    text: '¿Desde qué red te conectas?',
    options: [
      { value: 'work', label: 'La red (wifi o cable) del trabajo' },
      { value: 'mobile', label: 'Los datos de mi celular' },
      { value: 'home', label: 'El wifi de mi casa' },
      { value: 'public', label: 'Un wifi público' },
    ],
  },
  {
    id: 'evidence',
    text: '¿Tienes pruebas?',
    options: [
      { value: 'photos', label: 'Sí, fotos o capturas de pantalla' },
      { value: 'documents', label: 'Sí, documentos (PDF, Word, Excel)' },
      { value: 'media', label: 'Sí, audios o videos' },
      { value: 'none', label: 'No tengo pruebas' },
    ],
  },
  {
    id: 'protection',
    text: '¿Necesitas medidas de protección (por ejemplo, contra represalias en tu trabajo)?',
    options: [
      { value: 'yes', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'unsure', label: 'No lo sé' },
    ],
  },
];

/** Genera la recomendación de modo y los consejos para las respuestas dadas. */
export function adviseReporter(answers: AdvisorAnswers): AdvisorResult {
  const tips: AdvisorTip[] = [];
  const add = (tip: AdvisorTip): void => {
    tips.push(tip);
  };

  if (answers.witnesses === 'only-me') {
    add({
      id: 'only-me',
      priority: 'important',
      title: 'Si solo tú lo sabes, los hechos pueden señalarte',
      text: 'Aunque no des tu nombre, quien lea la denuncia podría deducir quién fue. Describe lo que pasó sin detalles que solo tú conocerías y considera esperar a que más personas lo sepan.',
    });
  } else if (answers.witnesses === 'few') {
    add({
      id: 'few',
      priority: 'useful',
      title: 'Pocas personas lo saben',
      text: 'Evita detalles que reduzcan la lista a ti, como el día exacto en que estuviste presente o tu puesto.',
    });
  }

  if (answers.device === 'work') {
    add({
      id: 'device-work',
      priority: 'important',
      title: 'No uses un equipo del trabajo',
      text: 'Los equipos del trabajo pueden tener programas de monitoreo. Usa tu celular o una computadora personal.',
    });
  } else if (answers.device === 'shared') {
    add({
      id: 'device-shared',
      priority: 'useful',
      title: 'En un equipo prestado, cierra todo al terminar',
      text: 'Usa una ventana privada, no guardes archivos en el equipo y cierra el navegador al terminar. Anota tu recibo en papel.',
    });
  }

  if (answers.network === 'work') {
    add({
      id: 'network-work',
      priority: 'important',
      title: 'No uses la red del trabajo',
      text: 'La red de tu dependencia puede registrar a qué sitios entras y a qué hora. Usa los datos de tu celular o una red fuera del trabajo, y fuera del horario laboral.',
    });
  } else if (answers.network === 'public') {
    add({
      id: 'network-public',
      priority: 'useful',
      title: 'En un wifi público, cuida tu pantalla',
      text: 'La conexión va cifrada, pero alguien podría ver tu pantalla. Elige un lugar donde nadie te observe.',
    });
  }

  if (answers.evidence === 'photos') {
    add({
      id: 'evidence-photos',
      priority: 'useful',
      title: 'Tus fotos pueden decir dónde estabas',
      text: 'Las fotos guardan la ubicación, el modelo del celular y la hora. SIGILO te muestra esos datos y los quita antes de enviar.',
    });
  } else if (answers.evidence === 'documents') {
    add({
      id: 'evidence-documents',
      priority: 'useful',
      title: 'Convierte los documentos a PDF',
      text: 'Los archivos de Word o Excel guardan el nombre del autor y su historial. Imprímelos como PDF; SIGILO los convierte a imagen para borrar todo lo oculto. Si el documento te lo entregaron solo a ti, podría estar marcado: cuéntalo con tus palabras.',
    });
  } else if (answers.evidence === 'media') {
    add({
      id: 'evidence-media',
      priority: 'useful',
      title: 'Los audios y videos no se pueden limpiar',
      text: 'La voz y la imagen pueden identificarte. Toma capturas de los momentos importantes o escribe lo que se escucha.',
    });
  } else if (answers.evidence === 'none') {
    add({
      id: 'evidence-none',
      priority: 'useful',
      title: 'Puedes denunciar sin pruebas',
      text: 'Describe con claridad qué pasó, quién participó y en qué mes. La autoridad puede pedirte más información por el buzón anónimo.',
    });
  }

  const needsProtection = answers.protection === 'yes';
  if (needsProtection) {
    add({
      id: 'protection',
      priority: 'important',
      title: 'Para pedir protección, la autoridad necesita saber quién eres',
      text: 'Elige "Identidad sellada": tu nombre viaja cifrado y solo la autoridad competente puede abrirlo. Cada apertura queda registrada y tú la verás en tu seguimiento.',
    });
  } else if (answers.protection === 'unsure') {
    add({
      id: 'protection-unsure',
      priority: 'useful',
      title: 'Si no sabes si necesitarás protección',
      text: 'Puedes denunciar de forma anónima. Si más adelante necesitas protección, podrás presentar otra denuncia citando tu folio.',
    });
  }

  tips.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'important' ? -1 : 1));
  return needsProtection
    ? {
        recommendedMode: 'sealed',
        modeReason:
          'Te recomendamos la identidad sellada porque pediste medidas de protección y para darlas la autoridad necesita saber quién eres.',
        tips,
      }
    : {
        recommendedMode: 'anonymous',
        modeReason:
          'Te recomendamos la denuncia anónima: no das ningún dato de contacto y das seguimiento con tu recibo.',
        tips,
      };
}

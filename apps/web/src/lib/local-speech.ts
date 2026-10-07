// Lectura en voz alta del recibo usando solo voces instaladas en el equipo.

/**
 * Voces en español que funcionan sin red (`localService === true`).
 * Seguridad: las voces remotas envían el texto (el recibo) a un servicio externo.
 */
export function localSpanishVoices(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice[] {
  return voices.filter((voice) => voice.localService && voice.lang.toLowerCase().startsWith('es'));
}

/** Separa una palabra o grupo en letras para deletrearla: «abeja» → «a, b, e, j, a». */
export function spellOut(text: string): string {
  return Array.from(text).join(', ');
}

/** Frases que se leen: primero el folio por grupos y después cada palabra, deletreada. */
export function receiptSpeechParts(folio: string, words: readonly string[]): string[] {
  const groups = folio.split('-').filter(Boolean);
  return [
    `Tu folio tiene ${groups.length} grupos.`,
    ...groups.map((group, index) => `Grupo ${index + 1}: ${spellOut(group)}.`),
    'Tus 8 palabras.',
    ...words.map((word, index) => `Palabra ${index + 1}: ${word}. Se escribe: ${spellOut(word)}.`),
  ];
}

/** Lee el folio y las palabras con la voz local dada. Cancela cualquier lectura anterior. */
export function speakReceipt(
  folio: string,
  words: readonly string[],
  voice: SpeechSynthesisVoice,
): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  for (const text of receiptSpeechParts(folio, words)) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.8;
    synth.speak(utterance);
  }
}

/** Detiene la lectura en voz alta, si hay una. */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

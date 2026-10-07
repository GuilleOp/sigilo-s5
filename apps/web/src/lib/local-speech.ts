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

/** Lee las palabras una por una, con su número, usando la voz local dada. */
export function speakWords(words: readonly string[], voice: SpeechSynthesisVoice): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  words.forEach((word, index) => {
    const utterance = new SpeechSynthesisUtterance(`Palabra ${index + 1}: ${word}.`);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.8;
    synth.speak(utterance);
  });
}

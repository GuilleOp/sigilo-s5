// Hook que encuentra una voz local en español; `null` si no hay (y el botón se oculta).
import { useEffect, useState } from 'react';
import { localSpanishVoices } from './local-speech.ts';

/** Primera voz local en español disponible. */
export function useLocalVoice(): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const update = (): void => setVoice(localSpanishVoices(synth.getVoices())[0] ?? null);
    update();
    synth.addEventListener('voiceschanged', update);
    return () => {
      synth.removeEventListener('voiceschanged', update);
      synth.cancel();
    };
  }, []);
  return voice;
}

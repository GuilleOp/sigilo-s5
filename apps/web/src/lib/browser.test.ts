// Pruebas de las ayudas del navegador con dobles: portapapeles y voces locales.
import { describe, expect, it, vi } from 'vitest';
import { copyWithAutoClear } from './clipboard.ts';
import { localSpanishVoices } from './local-speech.ts';

describe('copyWithAutoClear', () => {
  it('copia y vacía el portapapeles al terminar el plazo', async () => {
    vi.useFakeTimers();
    let content = '';
    const clipboard = {
      writeText: async (text: string) => {
        content = text;
      },
      readText: async () => content,
    } as unknown as Clipboard;
    await copyWithAutoClear('abeja abierto', 60, clipboard);
    expect(content).toBe('abeja abierto');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(content).toBe('');
    vi.useRealTimers();
  });

  it('no borra si la persona ya copió otra cosa', async () => {
    vi.useFakeTimers();
    let content = '';
    const clipboard = {
      writeText: async (text: string) => {
        content = text;
      },
      readText: async () => content,
    } as unknown as Clipboard;
    await copyWithAutoClear('recibo', 60, clipboard);
    content = 'otra cosa';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(content).toBe('otra cosa');
    vi.useRealTimers();
  });
});

describe('localSpanishVoices', () => {
  it('descarta voces remotas y de otros idiomas', () => {
    const voices = [
      { name: 'remota', lang: 'es-MX', localService: false },
      { name: 'inglés', lang: 'en-US', localService: true },
      { name: 'local', lang: 'es-ES', localService: true },
    ] as SpeechSynthesisVoice[];
    expect(localSpanishVoices(voices).map((voice) => voice.name)).toEqual(['local']);
  });
});

// Miniaturas de las pruebas: cada contenedor cifrado se descarga con el token y se abre en este
// navegador (con la llave de la autoridad o, en un escalamiento, con la llave del archivo del
// sobre). Antes de mostrarla se comprueba su digesto, su compromiso y el tipo real de la imagen.
import { useEffect, useState } from 'react';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { EvidenceUnreadableError } from '../../crypto/evidence.ts';
import type { OpenedEvidence } from '../../crypto/evidence.ts';

interface EvidenceGalleryProps {
  evidence: readonly EvidenceDescriptor[];
  /** Descarga y abre una prueba en este navegador. Debe ser estable (`useCallback`). */
  open: (item: EvidenceDescriptor) => Promise<OpenedEvidence>;
}

type Thumb = { id: string; url: string; check: Check } | { id: string; error: string };

type Check = 'anchored' | 'mismatch' | 'digest' | 'legacy';

const CHECK_TEXT: Record<Check, string> = {
  anchored: 'Descifrada aquí; coincide con lo anclado en la bitácora al recibirla.',
  mismatch: 'No coincide con lo anclado en la bitácora: no confíes en esta prueba y repórtalo.',
  digest: 'Descifrada aquí; coincide con su digesto y su compromiso.',
  legacy: 'Prueba anterior al cifrado: se guardó en claro y no tiene anclaje en la bitácora.',
};

function checkOf(opened: OpenedEvidence): Check {
  if (opened.isLegacy) return 'legacy';
  if (opened.matchesAnchor === null) return 'digest';
  return opened.matchesAnchor ? 'anchored' : 'mismatch';
}

/** Galería de pruebas abiertas en el navegador. */
export function EvidenceGallery({ evidence, open }: EvidenceGalleryProps) {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);

  useEffect(() => {
    let isActive = true;
    const urls: string[] = [];
    void Promise.all(
      evidence.map(async (item): Promise<Thumb> => {
        try {
          const opened = await open(item);
          // Si la galería ya se desmontó, no se crea la URL: nadie la revocaría después.
          if (!isActive) return { id: item.evidenceId, error: 'Descarga cancelada.' };
          const url = URL.createObjectURL(opened.blob);
          urls.push(url);
          return { id: item.evidenceId, url, check: checkOf(opened) };
        } catch (failure) {
          return {
            id: item.evidenceId,
            error:
              failure instanceof EvidenceUnreadableError
                ? failure.message
                : 'No se pudo descargar la prueba.',
          };
        }
      }),
    ).then((result) => {
      if (isActive) setThumbs(result);
    });
    return () => {
      isActive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [evidence, open]);

  if (evidence.length === 0) return <p>Sin pruebas.</p>;
  return (
    <ul className="thumbs" data-testid="authority-evidence">
      {thumbs.map((thumb, index) =>
        'url' in thumb ? (
          <li key={thumb.id}>
            <a href={thumb.url} target="_blank" rel="noreferrer noopener">
              <img src={thumb.url} alt={`Prueba ${index + 1} (abre en tamaño completo)`} />
            </a>
            <p
              className={thumb.check === 'mismatch' ? 'field__error' : 'field__hint'}
              data-testid="evidence-check"
            >
              {CHECK_TEXT[thumb.check]}
            </p>
          </li>
        ) : (
          <li key={thumb.id} className="field__error">
            Prueba {index + 1}: {thumb.error}
          </li>
        ),
      )}
    </ul>
  );
}

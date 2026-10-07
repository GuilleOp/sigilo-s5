// Miniaturas de las pruebas descargadas con el token; se verifica su SHA-256 antes de mostrarlas.
import { useEffect, useState } from 'react';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { digestBlob } from '@sigilo/huella';
import { api } from '../../services/api.ts';

interface EvidenceGalleryProps {
  token: string;
  evidence: readonly EvidenceDescriptor[];
}

type Thumb = { id: string; url: string } | { id: string; error: string };

/** Galería de pruebas limpias. */
export function EvidenceGallery({ token, evidence }: EvidenceGalleryProps) {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);

  useEffect(() => {
    let isActive = true;
    const urls: string[] = [];
    void Promise.all(
      evidence.map(async (item): Promise<Thumb> => {
        try {
          const raw = await api.getEvidence(token, item.evidenceId);
          // Seguridad: se fija el tipo declarado y se comprueba el digesto antes de mostrarla.
          const blob = new Blob([raw], { type: item.mediaType });
          if ((await digestBlob(blob)) !== item.sha256) {
            return { id: item.evidenceId, error: 'El archivo no coincide con su digesto.' };
          }
          // Si la galería ya se desmontó, no se crea la URL: nadie la revocaría después.
          if (!isActive) return { id: item.evidenceId, error: 'Descarga cancelada.' };
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return { id: item.evidenceId, url };
        } catch {
          return { id: item.evidenceId, error: 'No se pudo descargar la prueba.' };
        }
      }),
    ).then((result) => {
      if (isActive) setThumbs(result);
    });
    return () => {
      isActive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [token, evidence]);

  if (evidence.length === 0) return <p>Sin pruebas.</p>;
  return (
    <ul className="thumbs" data-testid="authority-evidence">
      {thumbs.map((thumb, index) =>
        'url' in thumb ? (
          <li key={thumb.id}>
            <a href={thumb.url} target="_blank" rel="noreferrer noopener">
              <img src={thumb.url} alt={`Prueba ${index + 1} (abre en tamaño completo)`} />
            </a>
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

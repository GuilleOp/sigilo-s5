// Pantalla para rutas inexistentes.
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

/** Página no encontrada. */
export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');
  return (
    <>
      <h1>No encontramos esta página</h1>
      <p>
        <Link to={PATHS.home}>Volver al inicio</Link>
      </p>
    </>
  );
}

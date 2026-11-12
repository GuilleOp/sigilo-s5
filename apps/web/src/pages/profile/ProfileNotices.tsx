// Avisos de los perfiles de la web. En el nodo de un estado (perfil panel) las pantallas públicas
// dicen dónde está la ventanilla única; en la ventanilla, el panel dice que cada autoridad entra por
// el nodo de su estado y enlista los nodos del directorio verificado.
import { Link } from 'react-router';
import type { AuthorityDirectory } from '@sigilo/contracts';
import { PATHS } from '../../app/paths.ts';
import { Alert } from '../../components/Alert.tsx';
import { VENTANILLA_URL } from '../../config/app-config.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useNetworkState } from '../../network/use-network-state.ts';

/** Perfil panel: la ventanilla única no está en este nodo. */
export function VentanillaNoticePage({
  ventanillaUrl = VENTANILLA_URL,
}: {
  ventanillaUrl?: string | null;
}) {
  useDocumentTitle('La ventanilla única está en otro sitio');
  return (
    <>
      <h1>Este es el nodo de las autoridades</h1>
      <Alert tone="info" title="La ventanilla única está en otro sitio" testId="ventanilla-notice">
        {ventanillaUrl === null ? (
          <p>
            Aquí no se reciben denuncias. Para denunciar, seguir tu denuncia o consultar los datos
            abiertos, entra a la ventanilla única nacional.
          </p>
        ) : (
          <p>
            Aquí no se reciben denuncias. Para denunciar, seguir tu denuncia o consultar los datos
            abiertos, entra a la ventanilla única:{' '}
            <a href={ventanillaUrl} rel="noreferrer" data-testid="ventanilla-link">
              {ventanillaUrl}
            </a>
            .
          </p>
        )}
        <p>
          Tu denuncia llega cifrada a la autoridad de tu estado desde la ventanilla: este nodo solo
          la guarda y la tramita.
        </p>
      </Alert>
      <p>
        ¿Trabajas en una autoridad de este nodo? <Link to={PATHS.authority}>Entra al panel</Link>
      </p>
    </>
  );
}

/** Nodos con su panel, del directorio verificado. */
export function nodePanels(directory: AuthorityDirectory): { name: string; url: string }[] {
  return directory.nodes.map((node) => ({
    name: node.name,
    url: `${node.baseUrl}${PATHS.authority}`,
  }));
}

/** Perfil ventanilla: cada autoridad entra al panel en el nodo de su estado. */
export function PanelNoticePage() {
  useDocumentTitle('Panel de autoridad');
  const network = useNetworkState();
  return (
    <>
      <h1>El panel de autoridad está en el nodo de tu estado</h1>
      <p className="lead">
        Esta es la ventanilla única: aquí se reciben las denuncias, cifradas para cada autoridad.
        Nadie de la ventanilla puede leerlas. Las autoridades entran a su panel en el nodo de su
        estado o en el nodo federal.
      </p>
      {network.kind === 'verified' ? (
        <ul data-testid="node-panels">
          {nodePanels(network.directory).map((item) => (
            <li key={item.url}>
              <a href={item.url} rel="noreferrer">
                {item.name}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">
          {network.kind === 'loading'
            ? 'Cargando el directorio firmado.'
            : 'No pudimos cargar el directorio de nodos. Inténtalo más tarde.'}
        </p>
      )}
      <p>
        ¿Tu institución todavía no está en la red?{' '}
        <Link to={PATHS.registration}>Solicita su alta</Link>
      </p>
    </>
  );
}

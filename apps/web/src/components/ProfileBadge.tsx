// Distintivo del perfil en la barra: dice de un vistazo desde qué perfil se ve la pantalla (vista
// pública, persona denunciante o una función del panel de autoridad), con un punto de color y el
// nombre en texto (nunca solo el color). En el panel muestra también la institución.
import { useLocation } from 'react-router';
import { PATHS } from '../app/paths.ts';
import { useMemoryStore } from '../state/memory-store.ts';
import { authorityProfileStore } from '../state/profile.ts';

type BadgeKind = 'public' | 'reporter' | 'guest' | 'intake' | 'investigation' | 'supervision';

const LABELS: Readonly<Record<BadgeKind, string>> = {
  public: 'Vista pública',
  reporter: 'Persona denunciante',
  guest: 'Autoridad · sin sesión',
  intake: 'Recepción y turnado',
  investigation: 'Investigación',
  supervision: 'Supervisión',
};

/** Pantallas de quien denuncia: las demás públicas son de consulta. */
const REPORTER_PATHS: ReadonlySet<string> = new Set([PATHS.report, PATHS.tracking]);

/** Distintivo del perfil. */
export function ProfileBadge() {
  const { pathname } = useLocation();
  const profile = useMemoryStore(authorityProfileStore);
  const kind: BadgeKind =
    pathname === PATHS.authority
      ? (profile?.role ?? 'guest')
      : REPORTER_PATHS.has(pathname)
        ? 'reporter'
        : 'public';
  const institution =
    kind !== 'guest' && pathname === PATHS.authority ? profile?.authorityName : null;
  return (
    <p
      className={`profile-badge profile-badge--${kind}`}
      data-testid="profile-badge"
      data-kind={kind}
    >
      <span className="profile-badge__dot" aria-hidden="true" />
      <span className="visually-hidden">Perfil: </span>
      <span className="profile-badge__label">{LABELS[kind]}</span>
      {institution && <span className="profile-badge__place">{institution}</span>}
    </p>
  );
}

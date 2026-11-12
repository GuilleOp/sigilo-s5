// Tipos de las variables de entorno de Vite que usa la aplicación.
interface ImportMetaEnv {
  readonly VITE_QUICK_EXIT_URL?: string;
  readonly VITE_DEMO_NOTICE?: string;
  /** Perfil de la web: `completo` (un solo nodo), `ventanilla` (SESNA) o `panel` (nodo estatal). */
  readonly VITE_SIGILO_PERFIL?: string;
  /** Dirección de la ventanilla única, para los enlaces del perfil panel. */
  readonly VITE_SIGILO_VENTANILLA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

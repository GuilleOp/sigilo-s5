// Tipos de las variables de entorno de Vite que usa la aplicación.
interface ImportMetaEnv {
  readonly VITE_QUICK_EXIT_URL?: string;
  readonly VITE_DEMO_NOTICE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

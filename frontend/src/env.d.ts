interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly vite_api_base_url?: string;
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


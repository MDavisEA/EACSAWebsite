import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The old config's only real job besides the React plugin was Base44's
// vite-plugin, which quietly provided the "@/" -> "src/" path alias used
// throughout this codebase (e.g. `import { Button } from "@/components/ui/button"`).
// That alias is defined explicitly here now instead of coming from a
// platform-specific plugin.
export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

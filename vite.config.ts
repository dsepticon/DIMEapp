import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'build' && env.VITE_DIME_MODE === 'local')
    throw new Error('Local authentication cannot be included in a release build.');
  return {
    plugins: [react()],
    base: './',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: {
      outDir: 'dist/frontend',
      sourcemap: false,
      rollupOptions: { input: ['index.html', 'panel.html', 'mobile.html'] },
    },
  };
});

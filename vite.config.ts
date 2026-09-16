import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'build' && env.VITE_DIME_MODE === 'local')
    throw new Error('Local authentication cannot be included in a release build.');
  const guest = env.VITE_DIME_MODE === 'guest';
  if (command === 'build' && guest && env.VITE_DIME_API_URL)
    throw new Error('Guest builds cannot configure a persistent gameplay API.');
  return {
    plugins: [react()],
    resolve: {
      alias:
        command === 'build'
          ? [
              ...(guest
                ? [
                    {
                      find: /^\.\/pendingStorage$/,
                      replacement: fileURLToPath(
                        new URL('./app/original/guestPendingUnavailable.ts', import.meta.url),
                      ),
                    },
                  ]
                : []),
              {
                find: /^\.\/guestRuntime$/,
                replacement: fileURLToPath(
                  new URL(
                    guest ? './app/original/guestRuntime.ts' : './app/original/guestUnavailable.ts',
                    import.meta.url,
                  ),
                ),
              },
              {
                find: /^\.\/globals\.css$/,
                replacement: fileURLToPath(new URL('./app/original/original.css', import.meta.url)),
              },
              {
                find: /^\.\/activeHome$/,
                replacement: fileURLToPath(new URL('./app/original/Main.tsx', import.meta.url)),
              },
            ]
          : [],
    },
    base: guest ? '/game/0.9.0/' : './',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: {
      outDir: guest ? 'dist/guest' : 'dist/frontend',
      copyPublicDir: false,
      sourcemap: false,
      rollupOptions: { input: guest ? ['index.html'] : ['index.html', 'panel.html', 'mobile.html'] },
    },
  };
});

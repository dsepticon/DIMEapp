import { build } from 'esbuild';
await build({
  entryPoints: ['server/webHandler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/web-server/index.mjs',
  sourcemap: false,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});

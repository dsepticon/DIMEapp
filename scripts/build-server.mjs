import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
// Remove a stale map from older builds so the packaged CodeUri contains only the reviewed bundle.
rmSync('dist/server/index.mjs.map', { force: true });
await build({
  entryPoints: ['server/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server/index.mjs',
  sourcemap: false,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
const bundle = readFileSync('dist/server/index.mjs', 'utf8');
if (/MIGRATION#v1#|LEGACY#v1#|commitMigration|previewLegacySave|assessLegacySources/.test(bundle)) {
  throw new Error('Migration code must remain excluded from the staging Lambda bundle.');
}

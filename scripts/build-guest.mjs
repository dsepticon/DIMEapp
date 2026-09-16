import { build } from 'vite';
// An explicit production target, never a local authentication override.
process.env.VITE_DIME_MODE = 'guest';
process.env.VITE_DIME_API_URL = '';
await build({ configFile: 'vite.config.ts' });

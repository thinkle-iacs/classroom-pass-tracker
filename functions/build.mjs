import { build } from 'esbuild';
// Inline the workspace contract; Firebase uploads functions/ as an independent source,
// so functions/package.json must not reference workspace packages.
await build({ entryPoints: ['src/index.ts'], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: 'lib/index.js',
  external: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*', 'zod'], sourcemap: true });

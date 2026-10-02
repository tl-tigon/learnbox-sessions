/* Bundles each API group into one file for Lambda (Node 22), and writes the route manifest the
   infrastructure reads to make the gateway's routes. Output: dist/lambda/<group>.js, dist/lambda/routes.json.
   Run: node scripts/build-lambda.mjs */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const GROUPS = ['audience', 'host', 'billing'];
mkdirSync('dist/lambda', { recursive: true });
for (const g of GROUPS) {
  const r = await build({
    entryPoints: [`src/api/lambda/${g}.ts`],
    outfile: `dist/lambda/${g}.js`,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  });
  const bytes = Object.values(r.metafile.outputs)[0].bytes;
  console.log(`${g}: ${(bytes / 1024).toFixed(0)} KB`);
}

/* The manifest: every route with its methods and group, from the same table the handlers use. */
await build({ entryPoints: ['src/api/all.ts'], outfile: 'dist/lambda/routes.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', logLevel: 'warning' });
const { ROUTES } = createRequire(import.meta.url)(resolve('dist/lambda/routes.cjs'));
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const methodsOf = (r) => METHODS.filter((m) => r.handlers[m]);
const manifest = ROUTES.map((r) => ({ path: r.path, methods: methodsOf(r), group: r.group }));
writeFileSync('dist/lambda/routes.json', JSON.stringify(manifest, null, 2));
console.log(`routes: ${manifest.length}`);

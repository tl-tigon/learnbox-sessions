/* Serves the app as production does, on this machine: the built files from `out/` as a CDN would,
   and `/api` and `/j` through the Lambda bundles in `dist/lambda/`, each call wrapped in an API
   Gateway event the way the gateway does it. Data is kept in memory and sign-in is the
   development one, so the browser walk can run against it: BASE=http://localhost:3300 node scripts/walk.js
   Build first: npm run build && node scripts/build-lambda.mjs. Run: npm run preview */
const fs = require('fs'), http = require('http'), path = require('path');

const PORT = Number(process.env.PORT || 3300);
/* OUT=.next-check when the build was made beside a running dev server (NEXT_DIST_DIR=.next-check). */
const OUT = path.resolve(__dirname, '..', process.env.OUT || 'out');
const DIST = path.join(__dirname, '..', 'dist', 'lambda');
Object.assign(process.env, { AUTH_MODE: 'dev', ALLOW_MEMORY_STORE: '1', PAYU_ENV: 'standin', SITE_URL: `http://localhost:${PORT}` });
if (process.env.NODE_ENV === 'production') delete process.env.NODE_ENV;

const routes = JSON.parse(fs.readFileSync(path.join(DIST, 'routes.json'), 'utf8'));
const lambdas = {};
const lambda = (group) => (lambdas[group] ??= require(path.join(DIST, `${group}.js`)).handler);
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', txt: 'text/plain', json: 'application/json', woff2: 'font/woff2', woff: 'font/woff' };

/** The gateway's routing: the first route whose pattern fits the path, segment by segment. */
function groupFor(pathname) {
  const got = pathname.split('/');
  return routes.find((r) => {
    const want = r.path.split('/');
    return want.length === got.length && want.every((w, i) => (w.startsWith('{') ? !!got[i] : w === got[i]));
  })?.group;
}

function staticFile(pathname) {
  const clean = decodeURIComponent(pathname).replace(/\/+$/, '') || '/index';
  for (const f of [clean, `${clean}.html`, `${clean}/index.html`]) {
    const p = path.join(OUT, f);
    if (p.startsWith(OUT) && fs.existsSync(p) && fs.statSync(p).isFile()) return { p, status: 200 };
  }
  return { p: path.join(OUT, '404.html'), status: 404 };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const group = groupFor(url.pathname);
  if (group) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(',') : v;
    const event = {
      version: '2.0', rawPath: url.pathname, rawQueryString: url.search.slice(1), headers,
      body: body.length ? body.toString('base64') : undefined, isBase64Encoded: body.length > 0,
      requestContext: { http: { method: req.method, sourceIp: req.socket.remoteAddress }, domainName: `localhost:${PORT}` },
    };
    const r = await lambda(group)(event);
    res.writeHead(r.statusCode, r.headers);
    res.end(r.isBase64Encoded ? Buffer.from(r.body, 'base64') : r.body);
    return;
  }
  const { p, status } = staticFile(url.pathname);
  res.writeHead(status, { 'content-type': TYPES[path.extname(p).slice(1)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`preview on http://localhost:${PORT}  (files: ${OUT}, lambdas: ${DIST})`));

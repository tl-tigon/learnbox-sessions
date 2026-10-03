import { describe, expect, it, vi } from 'vitest';
import { serve, toRequest, toResult, type GatewayEvent } from '../lambda/adapter';
import { dispatch, matchPath, type Route } from '../routes';
import { clientIp, json } from '@/lib/http';

const event = (over: Partial<GatewayEvent> & { method?: string } = {}): GatewayEvent => ({
  rawPath: over.rawPath ?? '/api/thing/a1',
  rawQueryString: over.rawQueryString,
  headers: over.headers ?? { host: 'api.example' },
  cookies: over.cookies,
  body: over.body,
  isBase64Encoded: over.isBase64Encoded,
  requestContext: { http: { method: over.method ?? 'GET', sourceIp: '1.2.3.4' }, domainName: 'api.example' },
});

const ROUTES: Route[] = [
  {
    path: '/api/thing/{id}', group: 'audience', handlers: {
      GET: async (req, ctx) => json({ id: (await ctx.params).id, q: new URL(req.url).searchParams.get('q'), cookie: req.headers.get('cookie') }),
      POST: async (req) => json({ got: await req.text() }, 201),
    },
  },
  { path: '/api/file', group: 'host', handlers: { GET: () => new Response(Buffer.from([0x50, 0x4b, 0, 1]), { headers: { 'content-type': 'application/octet-stream' } }) } },
  { path: '/api/boom', group: 'host', handlers: { GET: () => { throw new Error('no'); } } },
];

describe('the route table', () => {
  it('matches one segment per {name}, decodes it, and ignores a trailing slash', async () => {
    expect(matchPath('/api/thing/{id}', '/api/thing/a%20b')).toEqual({ id: 'a b' });
    expect(matchPath('/api/thing/{id}', '/api/thing')).toBeNull();
    expect(matchPath('/api/thing/{id}', '/api/thing/a/b')).toBeNull();
    expect(matchPath('/api/thing/{id}', '/api/thing/')).toBeNull();
    expect(matchPath('/api/thing/{id}', '/api/thing/%E0%A4%A')).toBeNull();
    const r = await dispatch(new Request('https://x/api/thing/a1/?q=2'), ROUTES);
    expect(await r.json()).toMatchObject({ id: 'a1', q: '2' });
  });

  it('answers 404 for an unknown path and 405 for a method the path lacks', async () => {
    expect((await dispatch(new Request('https://x/api/nope'), ROUTES)).status).toBe(404);
    expect((await dispatch(new Request('https://x/api/thing/a1', { method: 'DELETE' }), ROUTES)).status).toBe(405);
  });
});

describe('the Lambda adapter', () => {
  it('turns the gateway event into a request: address, query, headers, cookies and body', async () => {
    const r = toRequest(event({ rawQueryString: 'q=1&t=x', cookies: ['a=1', 'b=2'], headers: { host: 'api.example', 'x-forwarded-for': '9.9.9.9' } }));
    expect(r.url).toBe('https://api.example/api/thing/a1?q=1&t=x');
    expect(r.method).toBe('GET');
    expect(r.headers.get('cookie')).toBe('a=1; b=2');
    expect(r.headers.get('x-forwarded-for')).toBe('9.9.9.9');
    const posted = toRequest(event({ method: 'POST', body: Buffer.from('{"a":1}').toString('base64'), isBase64Encoded: true }));
    expect(await posted.text()).toBe('{"a":1}');
    const plain = toRequest(event({ method: 'POST', body: 'x=1' }));
    expect(await plain.text()).toBe('x=1');
  });

  it('turns a response into the gateway result, text as text and files as base64', async () => {
    const text = await toResult(json({ ok: true }, 201));
    expect(text).toMatchObject({ statusCode: 201, isBase64Encoded: false, body: '{"ok":true}' });
    expect(text.headers['content-type']).toBe('application/json');
    expect(text.headers['cache-control']).toBe('no-store');
    const file = await toResult(new Response(Buffer.from([0x50, 0x4b, 0, 1]), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="r.xlsx"' } }));
    expect(file).toMatchObject({ statusCode: 200, isBase64Encoded: true, body: Buffer.from([0x50, 0x4b, 0, 1]).toString('base64') });
    expect(file.headers['content-disposition']).toBe('attachment; filename="r.xlsx"');
    const redirect = await toResult(new Response(null, { status: 303, headers: { location: 'https://x/app/account' } }));
    expect(redirect).toMatchObject({ statusCode: 303, body: '', isBase64Encoded: false });
    expect(redirect.headers.location).toBe('https://x/app/account');
  });

  it('takes the caller\'s address from the connection the gateway saw, never from a header the caller sent', async () => {
    const r = toRequest(event({ headers: { host: 'api.example', 'x-client-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' } }));
    expect(r.headers.get('x-client-ip')).toBe('1.2.3.4');
    expect(clientIp(r)).toBe('1.2.3.4');
    /* Without one (the local preview over a socket with no address), a sent x-client-ip is still dropped. */
    const e = event({ headers: { host: 'api.example', 'x-client-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' } });
    delete e.requestContext.http.sourceIp;
    expect(toRequest(e).headers.get('x-client-ip')).toBeNull();
    expect(clientIp(toRequest(e))).toBe('9.9.9.9');
  });

  it('serves one group\'s routes and answers 500, not a crash, when a handler throws', async () => {
    const audience = serve(ROUTES.filter((r) => r.group === 'audience'));
    const hit = await audience(event({ rawQueryString: 'q=7' }));
    expect(hit.statusCode).toBe(200);
    expect(JSON.parse(hit.body)).toMatchObject({ id: 'a1', q: '7' });
    const made = await audience(event({ method: 'POST', body: 'hello' }));
    expect(made.statusCode).toBe(201);
    expect(JSON.parse(made.body)).toEqual({ got: 'hello' });
    /* Another group's route is not this function's. */
    expect((await audience(event({ rawPath: '/api/file' }))).statusCode).toBe(404);
    const host = serve(ROUTES.filter((r) => r.group === 'host'));
    expect((await host(event({ rawPath: '/api/file' }))).isBase64Encoded).toBe(true);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = await host(event({ rawPath: '/api/boom' }));
    expect(boom.statusCode).toBe(500);
    expect(JSON.parse(boom.body)).toEqual({ error: 'Something went wrong' });
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});

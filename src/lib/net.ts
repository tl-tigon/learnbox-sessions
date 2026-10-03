/**
 * Requests that never throw. When the network drops, `fetch` rejects; a handler that awaits it
 * would then stop halfway and leave its button disabled. These hand back an ordinary failed
 * response instead, which every handler already knows how to show.
 *
 * The API lives apart from the pages in production (API Gateway beside Amplify Hosting), so a
 * path such as `/api/live/<id>` is sent to `NEXT_PUBLIC_API_URL`, baked in at build time. In
 * development the dev server answers the same paths itself and the variable is unset.
 */
const API = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

/** The absolute address of an API path. */
export const apiUrl = (path: string) => (path.startsWith('/') ? `${API}${path}` : path);

const offline = () => new Response(JSON.stringify({ error: 'Connection lost' }), { status: 503, headers: { 'content-type': 'application/json' } });

export const request = (url: string, init?: RequestInit): Promise<Response> => fetch(apiUrl(url), init).catch(offline);

export const post = (url: string, body: unknown): Promise<Response> =>
  request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

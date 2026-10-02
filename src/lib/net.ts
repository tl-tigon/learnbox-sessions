/**
 * Requests that never throw. When the network drops, `fetch` rejects; a handler that awaits it
 * would then stop halfway and leave its button disabled. These hand back an ordinary failed
 * response instead, which every handler already knows how to show.
 */
const offline = () => new Response(JSON.stringify({ error: 'Connection lost' }), { status: 503, headers: { 'content-type': 'application/json' } });

export const request = (url: string, init?: RequestInit): Promise<Response> => fetch(url, init).catch(offline);

export const post = (url: string, body: unknown): Promise<Response> =>
  request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Runs the API's handlers inside AWS Lambda behind an API Gateway HTTP API (payload format 2.0).
 * The event becomes a web `Request`, the handler's `Response` becomes the gateway's result, and
 * the handlers themselves never know which of the two they are running under.
 */
import { dispatch, type Route } from '../routes';

/** The parts of the HTTP API's event that are used. */
export interface GatewayEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string; sourceIp?: string }; domainName?: string };
}

export interface GatewayResult { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded: boolean }

const TEXT = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/;

export function toRequest(e: GatewayEvent): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(e.headers ?? {})) if (v !== undefined) headers.set(k, v);
  if (e.cookies?.length) headers.set('cookie', e.cookies.join('; '));
  /* The caller's address, as `clientIp` reads it: the one the gateway saw on the connection (browsers call the API
     directly), never a header the caller sent. */
  headers.delete('x-client-ip');
  if (e.requestContext.http.sourceIp) headers.set('x-client-ip', e.requestContext.http.sourceIp);
  const method = e.requestContext.http.method.toUpperCase();
  const url = `https://${e.requestContext.domainName ?? headers.get('host') ?? 'localhost'}${e.rawPath}${e.rawQueryString ? `?${e.rawQueryString}` : ''}`;
  const body = e.body === undefined || method === 'GET' || method === 'HEAD' ? undefined : e.isBase64Encoded ? Buffer.from(e.body, 'base64') : e.body;
  return new Request(url, { method, headers, body });
}

export async function toResult(r: Response): Promise<GatewayResult> {
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => { headers[k] = v; });
  const type = r.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await r.arrayBuffer());
  const text = !bytes.length || TEXT.test(type);
  return { statusCode: r.status, headers, body: text ? bytes.toString('utf8') : bytes.toString('base64'), isBase64Encoded: !text };
}

/** A Lambda handler that serves one group's routes. */
export function serve(mine: Route[]) {
  return async (event: GatewayEvent): Promise<GatewayResult> => {
    try {
      return await toResult(await dispatch(toRequest(event), mine));
    } catch (e) {
      console.error('request failed', event.requestContext.http.method, event.rawPath, e);
      return { statusCode: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ error: 'Something went wrong' }), isBase64Encoded: false };
    }
  };
}

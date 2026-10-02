import { gateway } from '@/lib/billing';
import { requestHash, responseHash } from '@/lib/billing/payu';
import { fail } from '@/lib/http';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A stand-in for PayU's payment page, for development with no PayU keys. It takes the same form,
 * checks its signature, and posts back an outcome signed the way PayU signs it. No money moves.
 * It does not exist unless the development gateway is the one in use.
 */
export async function POST(req: Request) {
  const g = gateway();
  if (!g?.dev) return fail(404, 'Not found');
  const f: Record<string, string> = {};
  for (const [k, v] of await req.formData()) if (typeof v === 'string') f[k] = v;
  const signed = f.key === g.key && f.hash === requestHash({ key: f.key, txnid: f.txnid ?? '', amount: f.amount ?? '', productinfo: f.productinfo ?? '', firstname: f.firstname ?? '', email: f.email ?? '', udf1: f.udf1 ?? '' }, g.salt);
  if (!signed) return fail(400, 'Bad signature');

  const outcome = (status: string, to: string, label: string, primary: boolean) => {
    const back: Record<string, string> = {
      mihpayid: `dev${Date.now()}`, status, key: f.key, txnid: f.txnid, amount: f.amount, productinfo: f.productinfo,
      firstname: f.firstname, email: f.email, udf1: f.udf1,
    };
    back.hash = responseHash(back, g.salt);
    const inputs = Object.entries(back).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    return `<form method="post" action="${esc(to)}">${inputs}<button${primary ? ' class="primary"' : ''}>${label}</button></form>`;
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Development payment</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f5;color:#1a1a1a}main{background:#fff;border:1px solid #ddd;border-radius:8px;padding:24px;display:grid;gap:12px;width:min(360px,calc(100vw - 32px))}h1{font-size:16px;margin:0}p{margin:0}b{font-size:24px}div{display:flex;gap:8px}button{font:inherit;min-height:40px;padding:0 16px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}button.primary{background:#1f7a52;border-color:#1f7a52;color:#fff}</style></head>
<body><main><h1>Development payment page</h1><p>${esc(f.productinfo)}</p><b>&#8377;${esc(f.amount)}</b><p>No money moves. This page stands in for PayU when no PayU keys are set.</p>
<div>${outcome('success', f.surl, 'Pay', true)}${outcome('failure', f.furl, 'Fail', false)}</div></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

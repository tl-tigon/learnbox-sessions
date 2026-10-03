import { store } from '@/lib/store';
import { blocked, clientIp, limited } from '@/lib/http';
import { isCode } from '@/lib/ids';
import { joinPath } from '@/lib/links';
import { canJoin, isClosed } from '@/lib/live';

type Ctx = { params: Promise<{ code: string }> };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The join link people share: `/j/<code>`. Chat apps that preview a link read the title and
 * description here, with the session's name; a phone that opens it is sent on to the join page.
 * A code that is wrong or ended gets the front page instead.
 */
export async function GET(req: Request, ctx: Ctx) {
  const key = `code:${clientIp(req)}`;
  const code = (await ctx.params).code;
  let s = null;
  if (!blocked(key, 30) && isCode(code)) {
    const db = store();
    const id = await db.sessionIdForCode(code);
    s = id ? await db.getSession(id) : null;
    if (!s || !canJoin(s)) {
      limited(key, 30);
      s = null;
    }
  }
  const to = s ? joinPath(code) : '/';
  /* After the session has ended, the link is the one shared for its feedback form. */
  const title = s ? (isClosed(s) ? `Feedback on ${s.title}` : `Join ${s.title}`) : 'LearnBox Sessions';
  const text = s ? (isClosed(s) ? `Enter code ${code.slice(0, 3)} ${code.slice(3)} to give your feedback.` : `Enter code ${code.slice(0, 3)} ${code.slice(3)} to ask questions and vote.`) : 'Live polls, Q&A, quizzes and surveys.';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s ? `${title} · LearnBox Sessions` : title)}</title><meta name="robots" content="noindex">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(text)}"><meta property="og:site_name" content="LearnBox Sessions"><meta name="description" content="${esc(text)}">
<meta http-equiv="refresh" content="0; url=${esc(to)}"><script>location.replace(${JSON.stringify(to)})</script></head>
<body><p><a href="${esc(to)}">${esc(title)}</a></p></body></html>`;
  return new Response(html, { status: s ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

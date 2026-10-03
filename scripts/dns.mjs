/* Sets one DNS record of learnbox.one in Cloudflare, with CLOUDFLARE_API_TOKEN from .env.local (a token with DNS:Edit on the zone).
   Records are DNS only (not proxied): Amplify and API Gateway are the edge.
     node scripts/dns.mjs <name> <type> <content>      e.g. node scripts/dns.mjs sessions CNAME d1234.cloudfront.net
     node scripts/dns.mjs list */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZONE = 'learnbox.one';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const token = process.env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not in .env.local');

const api = async (method, url, body) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${url}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors));
  return j.result;
};

const [zone] = await api('GET', `/zones?name=${ZONE}`);
if (!zone) throw new Error(`zone ${ZONE} is not visible to this token`);
const records = await api('GET', `/zones/${zone.id}/dns_records?per_page=200`);

const [arg, type, content] = process.argv.slice(2);
if (!arg || arg === 'list') {
  for (const r of records) console.log(`${r.type.padEnd(6)} ${r.name.padEnd(60)} ${r.content}${r.proxied ? '  (proxied)' : ''}`);
} else {
  const name = arg.endsWith(ZONE) ? arg : `${arg}.${ZONE}`;
  const existing = records.find((r) => r.name === name && r.type === type);
  const record = { type, name, content, ttl: 60, proxied: false };
  const r = existing ? await api('PATCH', `/zones/${zone.id}/dns_records/${existing.id}`, record) : await api('POST', `/zones/${zone.id}/dns_records`, record);
  console.log(`${existing ? 'updated' : 'added'}: ${r.type} ${r.name} -> ${r.content}`);
}

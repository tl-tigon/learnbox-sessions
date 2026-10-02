/**
 * Who is calling. Facilitators sign in with Cognito and send their ID token as a Bearer header.
 *
 * AUTH_MODE=dev accepts "dev:<email>" as a token so the app can be worked on with no Cognito pool.
 * It is refused whenever NODE_ENV is production, whatever AUTH_MODE says.
 */
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { isEmail } from './email';

export interface User { sub: string; email: string }

const POOL = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const CLIENT = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const verifier = POOL && CLIENT ? CognitoJwtVerifier.create({ userPoolId: POOL, clientId: CLIENT, tokenUse: 'id' }) : null;

export const devAuth = () => process.env.AUTH_MODE === 'dev' && process.env.NODE_ENV !== 'production';

export async function getUser(req: Request): Promise<User | null> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  if (token.startsWith('dev:')) {
    if (!devAuth()) return null;
    const email = token.slice(4).toLowerCase();
    if (!isEmail(email)) return null;
    return { sub: `dev-${email.replace(/[^a-z0-9]/g, '-')}`, email };
  }
  if (!verifier) return null;
  try {
    const p = await verifier.verify(token);
    return { sub: p.sub, email: String(p.email ?? '') };
  } catch {
    return null;
  }
}

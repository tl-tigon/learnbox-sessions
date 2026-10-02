'use client';
/**
 * Facilitator sign-in in the browser.
 *
 * With a Cognito pool configured: email + password with an emailed confirmation code, or Google.
 * Without one (NEXT_PUBLIC_AUTH_MODE=dev): any email, no password, for local work only. The server
 * refuses dev tokens in production regardless.
 */
import { Amplify } from 'aws-amplify';
import {
  confirmSignUp,
  deleteUser,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  signIn,
  signInWithRedirect,
  signOut as amplifySignOut,
  signUp,
  updatePassword,
} from 'aws-amplify/auth';
import { request } from '../net';
import { isEmail } from './email';

const POOL = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const CLIENT = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
export const DEV_AUTH = process.env.NEXT_PUBLIC_AUTH_MODE === 'dev' || !POOL;
const DEV_KEY = 'la-dev-email';

let configured = false;
function configure() {
  if (configured || DEV_AUTH || typeof window === 'undefined') return;
  const origin = window.location.origin;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: POOL!,
        userPoolClientId: CLIENT!,
        loginWith: DOMAIN
          ? { email: true, oauth: { domain: DOMAIN, scopes: ['openid', 'email', 'profile'], redirectSignIn: [`${origin}/app`], redirectSignOut: [`${origin}/`], responseType: 'code', providers: ['Google'] } }
          : { email: true },
      },
    },
  });
  configured = true;
}

/** The Bearer token for API calls, or null when signed out. */
export async function idToken(): Promise<string | null> {
  if (DEV_AUTH) {
    try {
      const e = localStorage.getItem(DEV_KEY);
      return e ? `dev:${e}` : null;
    } catch {
      return null;
    }
  }
  configure();
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function currentEmail(): Promise<string | null> {
  const t = await idToken();
  if (!t) return null;
  if (t.startsWith('dev:')) return t.slice(4);
  try {
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null;
  } catch {
    return null;
  }
}

export async function devSignIn(email: string) {
  const e = email.trim().toLowerCase();
  /* The server takes only a full address, so one it would refuse is turned away here. */
  if (!isEmail(e)) throw new Error('Enter a full email address');
  localStorage.setItem(DEV_KEY, e);
}

export async function emailSignUp(email: string, password: string) {
  configure();
  return signUp({ username: email, password, options: { userAttributes: { email } } });
}
export async function emailConfirm(email: string, code: string) {
  configure();
  return confirmSignUp({ username: email, confirmationCode: code });
}
export async function emailResend(email: string) {
  configure();
  return resendSignUpCode({ username: email });
}
export async function emailSignIn(email: string, password: string) {
  configure();
  return signIn({ username: email, password });
}
export async function forgotPassword(email: string) {
  configure();
  return resetPassword({ username: email });
}
export async function confirmForgot(email: string, code: string, password: string) {
  configure();
  return confirmResetPassword({ username: email, confirmationCode: code, newPassword: password });
}
export const googleAvailable = () => !DEV_AUTH && !!DOMAIN;
export async function googleSignIn() {
  configure();
  return signInWithRedirect({ provider: 'Google' });
}

export async function signOut() {
  if (DEV_AUTH) {
    localStorage.removeItem(DEV_KEY);
    return;
  }
  configure();
  await amplifySignOut();
}

export async function changePassword(oldPassword: string, newPassword: string) {
  configure();
  return updatePassword({ oldPassword, newPassword });
}

/** Removes the sign-in itself: the Cognito user, or in development the remembered email. */
export async function removeSignIn() {
  if (DEV_AUTH) {
    localStorage.removeItem(DEV_KEY);
    return;
  }
  configure();
  await deleteUser();
}

/**
 * fetch with the facilitator's token attached. When the server refuses the sign-in this browser
 * holds (expired, or not one it accepts), the sign-in is dropped and the sign-in page opens, so
 * no screen is left waiting on requests that cannot succeed.
 */
let leaving = false;
export async function authed(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await idToken();
  const headers = new Headers(init.headers);
  if (t) headers.set('authorization', `Bearer ${t}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const r = await request(url, { ...init, headers, cache: 'no-store' });
  if (r.status === 401 && !leaving && typeof window !== 'undefined') {
    leaving = true;
    await signOut().catch(() => {});
    window.location.replace('/sign-in');
  }
  return r;
}

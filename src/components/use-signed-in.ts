'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentEmail } from '@/lib/auth/client';

/** The signed-in facilitator's email; sends them to sign in if there is none. */
export function useSignedIn(): string | null {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    currentEmail().then((e) => (e ? setEmail(e) : router.replace('/sign-in')));
  }, [router]);
  return email;
}

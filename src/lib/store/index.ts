import { memoryStore, freshDb } from './memory';
import { dynamoStore } from './dynamo';
import type { Store } from './types';

/* The memory database lives on `globalThis` so a dev reload keeps its data. The store built over
   it lives in this module, so a reload also picks up store functions added since the server started. */
const g = globalThis as unknown as { __memDb?: ReturnType<typeof freshDb> };
let cached: Store | null = null;

/** The store this server uses: DynamoDB when STORE=dynamo, otherwise memory (development only). */
export function store(): Store {
  if (cached) return cached;
  if (process.env.STORE === 'dynamo') {
    cached = dynamoStore();
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MEMORY_STORE !== '1') {
      throw new Error('STORE=dynamo is required in production');
    }
    g.__memDb ??= freshDb();
    cached = memoryStore(g.__memDb);
  }
  return cached;
}

export type { Store } from './types';

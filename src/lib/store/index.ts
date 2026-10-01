import { memoryStore, freshDb } from './memory';
import { dynamoStore } from './dynamo';
import type { Store } from './types';

const g = globalThis as unknown as { __store?: Store; __memDb?: ReturnType<typeof freshDb> };

/** The store this server uses: DynamoDB when STORE=dynamo, otherwise memory (development only). */
export function store(): Store {
  if (g.__store) return g.__store;
  if (process.env.STORE === 'dynamo') {
    g.__store = dynamoStore();
  } else {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MEMORY_STORE !== '1') {
      throw new Error('STORE=dynamo is required in production');
    }
    g.__memDb ??= freshDb();
    g.__store = memoryStore(g.__memDb);
  }
  return g.__store;
}

export type { Store } from './types';

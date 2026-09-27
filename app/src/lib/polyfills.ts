// Hermes has no Web Crypto. The cryptography libraries need crypto.getRandomValues for anything
// random (such as generating keys); the platform's secure generator provides it.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...g.crypto, getRandomValues };
}

// Keys fixed at build time (app.config.ts): trusted roots, and the app keys that seal everything sent.
import Constants from 'expo-constants';
import { b64url, loadKey, openContainer, type Crl } from '@qretina/protocol/containers.js';

const extra = (Constants.expoConfig?.extra ?? {}) as { rootKeys?: string[]; appKeys?: string[]; crl?: string };

export const rootKeys = (extra.rootKeys ?? []).map(loadKey);
export const appKeys = (extra.appKeys ?? []).map(b64url);

// The revocation list shipped with this release, if a root key signed it.
export const bundledCrl: Crl | undefined = (() => {
  try { return extra.crl ? openContainer(b64url(extra.crl), { roots: rootKeys, keys: appKeys }).crl : undefined; } catch { return undefined; }
})();

// The link shown in the countdown before a broadcast; it opens QRetina on the Receive screen.
export const LINK = 'HTTPS://QRETINA.APP/SCAN';

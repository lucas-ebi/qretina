// Keys fixed at build time (app.config.ts): trusted roots, and the app keys that seal everything sent.
import Constants from 'expo-constants';
import { b64url, loadKey } from '@resqr/protocol/containers.js';

const extra = (Constants.expoConfig?.extra ?? {}) as { rootKeys?: string[]; appKeys?: string[] };

export const rootKeys = (extra.rootKeys ?? []).map(loadKey);
export const appKeys = (extra.appKeys ?? []).map(b64url);

// The link shown in the countdown before a broadcast; it opens ResQR on the Receive screen.
export const LINK = 'HTTPS://RESQR.APP/SCAN';

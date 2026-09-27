// App configuration. Keys are fixed at build time from the environment:
//   TRUSTED_KEYS  root public keys (base64url), separated by commas or spaces; code signed by them,
//                 or by publishers they certify, may run.
//   APP_KEYS      sealing keys (base64url, 32 bytes), comma-separated, current first; everything
//                 sent is sealed with the first, and any of them opens what is received.
//   QRETINA_RELEASE set to 1 for store builds: the keys become mandatory and Android loses the
//                 INTERNET permission, which only the development server needs.
// The newest revocation list, when release/crl.bin exists (from certify.yml), ships with the app,
// so phones know of revocations before any reaches them over the air.
import { existsSync, readFileSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const list = (v?: string) => (v ?? '').split(/[\s,]+/).filter(Boolean);
const release = process.env.QRETINA_RELEASE === '1' || process.env.EAS_BUILD_PROFILE === 'production';
const rootKeys = list(process.env.TRUSTED_KEYS), appKeys = list(process.env.APP_KEYS);
const crlFile = new URL('./release/crl.bin', import.meta.url);
const crl = existsSync(crlFile) ? readFileSync(crlFile).toString('base64url') : undefined;

if (release && !(rootKeys.length && appKeys.length)) throw new Error('release builds need TRUSTED_KEYS and APP_KEYS');
for (const k of rootKeys) if (!/^[A-Za-z0-9_-]{43}$/.test(k)) throw new Error(`TRUSTED_KEYS: not an Ed25519 public key: ${k}`);
for (const k of appKeys) if (!/^[A-Za-z0-9_-]{43}$/.test(k)) throw new Error('APP_KEYS: each key is 32 bytes, base64url');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'QRetina',
  slug: 'qretina',
  scheme: 'qretina',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.qretina',
    supportsTablet: true,
    associatedDomains: ['applinks:qretina.app'],
  },
  android: {
    package: 'app.qretina',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#F4F7F9' },
    // Only the camera is needed. The app sets its own window's brightness, not the system's; the
    // development server needs the network and overlays, which release builds drop.
    blockedPermissions: [
      'android.permission.WRITE_SETTINGS', 'android.permission.VIBRATE', 'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK', // previews play in the foreground only
      ...(release ? ['android.permission.INTERNET', 'android.permission.SYSTEM_ALERT_WINDOW'] : []),
    ],
    intentFilters: [{
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: [{ scheme: 'https', host: 'qretina.app', pathPrefix: '/SCAN' }, { scheme: 'https', host: 'qretina.app', pathPrefix: '/scan' }],
    }],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', {
      image: './assets/splash.png', imageWidth: 240, resizeMode: 'contain', backgroundColor: '#F4F7F9',
      dark: { image: './assets/splash-dark.png', backgroundColor: '#0A1E2C' },
    }],
    ['expo-camera', { cameraPermission: 'QRetina films QR codes on another screen to receive files.', microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true }],
    // No cameraPermission: false here, which would remove the camera permission for the whole app.
    ['expo-image-picker', { photosPermission: 'QRetina sends photos you choose as QR codes.', microphonePermission: false }],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }],
    'expo-video',
    'expo-secure-store',
    // Other apps can share a file to QRetina, to broadcast it, or a key file, to add it.
    ['expo-sharing', {
      ios: { enabled: true, activationRule: { supportsFileWithMaxCount: 1, supportsImageWithMaxCount: 1, supportsMovieWithMaxCount: 1 } },
      android: { enabled: true, singleShareMimeTypes: ['*/*'] },
    }],
  ],
  extra: { rootKeys, appKeys, crl },
});

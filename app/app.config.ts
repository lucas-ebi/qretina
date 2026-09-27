// App configuration. Keys are fixed at build time from the environment:
//   TRUSTED_KEYS  root public keys (base64url), separated by commas or spaces; code signed by them,
//                 or by publishers they certify, may run.
//   APP_KEYS      sealing keys (base64url, 32 bytes), comma-separated, current first; everything
//                 sent is sealed with the first, and any of them opens what is received.
//   QRETINA_RELEASE set to 1 for store builds: the keys become mandatory and Android loses the
//                 INTERNET permission, which only the development server needs.
import type { ConfigContext, ExpoConfig } from 'expo/config';

const list = (v?: string) => (v ?? '').split(/[\s,]+/).filter(Boolean);
const release = process.env.QRETINA_RELEASE === '1' || process.env.EAS_BUILD_PROFILE === 'production';
const rootKeys = list(process.env.TRUSTED_KEYS), appKeys = list(process.env.APP_KEYS);

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
    adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#000000' },
    // Only the camera is needed. The app sets its own window's brightness, not the system's; the
    // development server needs the network and overlays, which release builds drop.
    blockedPermissions: [
      'android.permission.WRITE_SETTINGS', 'android.permission.VIBRATE', 'android.permission.WRITE_EXTERNAL_STORAGE',
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
    ['expo-camera', { cameraPermission: 'QRetina films QR codes on another screen to receive files.', microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true }],
    // No cameraPermission: false here, which would remove the camera permission for the whole app.
    ['expo-image-picker', { photosPermission: 'QRetina sends photos you choose as QR codes.', microphonePermission: false }],
    'expo-secure-store',
    'expo-sharing',
  ],
  extra: { rootKeys, appKeys },
});

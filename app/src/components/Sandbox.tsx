// Runs a signed HTML program with no network, no storage and no bridge to the app. The content
// security policy blocks every fetch, frame and external resource; navigation away from the
// program is refused; the WebView keeps no cookies, cache or storage.
import { WebView } from 'react-native-webview';

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";

// The policy goes first, before any script can run; the parser moves it into <head>.
export const withPolicy = (html: string) =>
  html.replace(/^(\s*<!doctype[^>]*>)?/i, `$1<meta http-equiv="Content-Security-Policy" content="${CSP}">`);

export function Sandbox({ html }: { html: string }) {
  return (
    <WebView
      source={{ html: withPolicy(html), baseUrl: 'about:blank' }}
      originWhitelist={['about:*']}
      onShouldStartLoadWithRequest={r => r.url === 'about:blank' || r.url.startsWith('about:srcdoc')}
      javaScriptEnabled
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      geolocationEnabled={false}
      mixedContentMode="never"
      style={{ flex: 1, backgroundColor: '#000' }}
    />
  );
}

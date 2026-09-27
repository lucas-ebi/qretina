// Both resqr://scan and https://resqr.app/SCAN (the countdown link, in upper case to fit the QR
// alphanumeric mode) open the Receive screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return /^(resqr:\/\/|https:\/\/resqr\.app\/)?\/?scan\/?$/i.test(path) ? '/' : path;
  } catch {
    return '/';
  }
}

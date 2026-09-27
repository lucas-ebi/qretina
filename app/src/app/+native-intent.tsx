// Both qretina://scan and https://qretina.app/SCAN (the countdown link, in upper case to fit the QR
// alphanumeric mode) open the Receive screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return /^(qretina:\/\/|https:\/\/qretina\.app\/)?\/?scan\/?$/i.test(path) ? '/' : path;
  } catch {
    return '/';
  }
}

// Both qretina://scan and https://qretina.app/SCAN (the countdown link, in upper case to fit the QR
// alphanumeric mode) open the Receive screen. expo-sharing reports a file shared from another app as
// qretina://expo-sharing, which opens the Share screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^(qretina:\/\/)?\/?expo-sharing\/?$/i.test(path)) return '/share';
    return /^(qretina:\/\/|https:\/\/qretina\.app\/)?\/?scan\/?$/i.test(path) ? '/' : path;
  } catch {
    return '/';
  }
}

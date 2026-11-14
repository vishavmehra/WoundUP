/** Quest Browser (and the profile IWER itself installs) name themselves in the user agent; this is the dev plugin's own exception. */
export function isHeadsetBrowser(userAgent: string): boolean {
  return /OculusBrowser/i.test(userAgent);
}

/**
 * Pages that anyone can open without signing in. They render without the app
 * chrome (sidebar, top bar) and are not covered by the auth proxy.
 */
export const PUBLIC_PATHS = ["/login", "/privacy-policy"];

export function isPublicPath(pathname: string | null) {
  return pathname !== null && PUBLIC_PATHS.includes(pathname);
}

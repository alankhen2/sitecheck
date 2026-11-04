export const DEFAULT_PATH = '/dashboard';

/**
 * Where to go after login, from the `?from=` parameter. Only a path on this
 * site is accepted. Anything else would make the login page an open redirect:
 * a link like /login?from=https://evil.example looks like ours, and after a
 * real login would send the user to a fake page asking for their password again.
 */
export function safeRedirect(from: string | null): string {
  if (!from) return DEFAULT_PATH;
  // Must be a path ("/..."), not "//host" (protocol-relative) and no
  // backslashes, which browsers treat like "/" ("/\host" means "//host").
  if (!from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return DEFAULT_PATH;
  // No control characters (tabs and newlines are stripped by URL parsing,
  // which can turn "/\t/host" into "//host").
  for (const char of from) {
    if (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f) return DEFAULT_PATH;
  }
  if (from === '/login' || from.startsWith('/login?')) return DEFAULT_PATH;
  return from;
}

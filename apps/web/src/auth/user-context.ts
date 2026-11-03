import type { PublicUser } from '@sitecheck/shared';
import { createContext, useContext } from 'react';

/**
 * The user RequireAuth has checked, handed down to the pages it wraps.
 *
 * Pages could read the cache with useCurrentUser() instead, but at logout or
 * when a session expires the cache turns to `null` and a page can re-render
 * with that before RequireAuth has redirected it away. A context carries the
 * exact value RequireAuth rendered with, so a protected page never sees null.
 */
export const UserContext = createContext<PublicUser | null>(null);

/** The logged-in user, in any component below RequireAuth. */
export function useUser(): PublicUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser() must be used inside <RequireAuth>');
  return user;
}

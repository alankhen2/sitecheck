import { Navigate, Outlet, useLocation } from 'react-router';
import { userMessage } from '../lib/errors';
import { useCurrentUser } from './queries';
import { UserContext } from './user-context';

/**
 * Wraps every page that needs a login. It only decides what to *show*: the
 * API checks the session on every request regardless, so hiding a page here
 * is for the user's sake, not for security.
 */
export function RequireAuth() {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return (
      <p role="status" className="p-8 text-center text-slate-600">
        Loading…
      </p>
    );
  }

  if (isError) {
    // Not "logged out" (that is user === null): the API could not be reached.
    return (
      <div role="alert" className="mx-auto max-w-md p-8 text-center">
        <p className="text-slate-800">{userMessage(error)}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!user) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return (
    <UserContext value={user}>
      <Outlet />
    </UserContext>
  );
}

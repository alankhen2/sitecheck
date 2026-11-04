import { useRef } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useLogout } from '../auth/queries';
import { useUser } from '../auth/user-context';
import { userMessage } from '../lib/errors';

const links = [
  { to: '/plants', label: 'Plants' },
  { to: '/sites', label: 'Sites' },
];

const roleLabel = { ADMIN: 'Admin', INSPECTOR: 'Inspector' } as const;

/** The frame around every logged-in page (rendered inside RequireAuth). */
export function AppLayout() {
  const user = useUser();
  const logout = useLogout();
  const main = useRef<HTMLElement>(null);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {/* The first stop for Tab, so a keyboard user need not cross the menu on every page. */}
      <a
        href="#main"
        onClick={(event) => {
          // Move focus without "#main" landing in the URL, which holds the filters.
          event.preventDefault();
          main.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">SiteCheck</span>
          <nav className="flex gap-4" aria-label="Main">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  isActive ? 'font-medium text-amber-700' : 'text-slate-600 hover:text-slate-900'
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span>
              {user.name}{' '}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {roleLabel[user.role]}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                logout.mutate();
              }}
              disabled={logout.isPending}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-60"
            >
              Log out
            </button>
          </div>
        </div>
        {logout.isError && (
          <p role="alert" className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-700">
            Could not log out: {userMessage(logout.error)}
          </p>
        )}
      </header>
      <main ref={main} id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 outline-none">
        <Outlet />
      </main>
    </div>
  );
}

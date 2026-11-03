import { NavLink, Outlet } from 'react-router';

const links = [
  { to: '/plants', label: 'Plants' },
  { to: '/sites', label: 'Sites' },
];

/** The frame around every logged-in page. Auth and roles arrive in session 3.1. */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3" aria-label="Main">
          <span className="font-semibold">SiteCheck</span>
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
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

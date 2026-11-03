import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

/**
 * Exported separately from the router so tests can mount the same routes in a
 * memory router at any URL.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <PlaceholderPage title="Log in" /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/plants" replace /> },
      { path: 'plants', element: <PlaceholderPage title="Plants" /> },
      { path: 'sites', element: <PlaceholderPage title="Sites" /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);

import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { InspectPage } from './pages/InspectPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlantDetailPage } from './pages/PlantDetailPage';
import { PlantsPage } from './pages/PlantsPage';
import { SitesPage } from './pages/SitesPage';

/**
 * Exported separately from the router so tests can mount the same routes in a
 * memory router at any URL.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    // A layout route without a path: everything below needs a login.
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/plants" replace /> },
          { path: 'plants', element: <PlantsPage /> },
          { path: 'plants/:id', element: <PlantDetailPage /> },
          { path: 'plants/:id/inspect', element: <InspectPage /> },
          { path: 'sites', element: <SitesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);

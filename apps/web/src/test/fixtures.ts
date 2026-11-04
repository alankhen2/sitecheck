import type { PublicUser } from '@sitecheck/shared';
import { http, HttpResponse } from 'msw';
import { apiUrl } from './server';

export const adminUser: PublicUser = {
  id: '019a0000-0000-7000-8000-0000000000ad',
  name: 'Alex Admin',
  email: 'admin@sitecheck.dev',
  role: 'ADMIN',
};

export const inspectorUser: PublicUser = {
  id: '019a0000-0000-7000-8000-0000000000aa',
  name: 'Ivy Inspector',
  email: 'inspector@sitecheck.dev',
  role: 'INSPECTOR',
};

export const viewerUser: PublicUser = {
  id: '019a0000-0000-7000-8000-0000000000ae',
  name: 'Demo Viewer',
  email: 'demo@sitecheck.dev',
  role: 'VIEWER',
};

const unauthorized = () =>
  HttpResponse.json({ message: 'Authentication required' }, { status: 401 });

/** MSW handlers for the auth endpoints. */
export const authHandlers = {
  loggedInAs: (user: PublicUser) => http.get(apiUrl('/auth/me'), () => HttpResponse.json(user)),
  loggedOut: () => http.get(apiUrl('/auth/me'), unauthorized),
  loginSucceeds: (user: PublicUser) =>
    http.post(apiUrl('/auth/login'), () => HttpResponse.json(user)),
  loginFails: () =>
    http.post(apiUrl('/auth/login'), () =>
      HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 }),
    ),
  logoutSucceeds: () =>
    http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
};

import { plantPageSchema } from '@sitecheck/shared';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiFetch } from '../lib/api';
import { dataHandlers } from '../test/data';
import { adminUser, authHandlers, inspectorUser } from '../test/fixtures';
import { currentUrl, renderApp } from '../test/render';
import { apiUrl, server } from '../test/server';

// Protected pages load their own data; these tests are about auth and routing.
beforeEach(() => {
  server.use(...dataHandlers().handlers);
});

async function fillLogin(user: ReturnType<typeof renderApp>['user']) {
  await user.type(await screen.findByLabelText('Email'), 'admin@sitecheck.dev');
  await user.type(screen.getByLabelText('Password'), 'sitecheck-dev');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('protected pages', () => {
  it('sends a logged-out visitor to the login page, remembering where they were going', async () => {
    server.use(authHandlers.loggedOut());
    const { router } = renderApp('/sites?x=1');

    expect(await screen.findByRole('heading', { name: 'Log in to SiteCheck' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe(`/login?from=${encodeURIComponent('/sites?x=1')}`);
  });

  it('shows the page with the user name and role when logged in', async () => {
    server.use(authHandlers.loggedInAs(inspectorUser));
    renderApp('/plants');

    expect(await screen.findByRole('heading', { name: 'Plants' })).toBeInTheDocument();
    expect(screen.getByText('Ivy Inspector')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });

  it('offers a retry instead of the login page when the API is down', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/auth/me'), () => {
        calls += 1;
        return calls <= 3
          ? HttpResponse.json({ message: 'boom' }, { status: 503 })
          : HttpResponse.json(adminUser);
      }),
    );
    const { user } = renderApp('/plants');

    // First attempt + 2 retries (5xx is retried), then the error is shown.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(screen.queryByRole('heading', { name: 'Log in to SiteCheck' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Plants' })).toBeInTheDocument();
  });
});

describe('login page', () => {
  it('logs in and returns to the page the user wanted', async () => {
    server.use(authHandlers.loggedOut(), authHandlers.loginSucceeds(adminUser));
    const { router, user } = renderApp('/sites');

    await fillLogin(user);

    expect(await screen.findByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/sites');
    expect(screen.getByText('Alex Admin')).toBeInTheDocument();
  });

  it('sends the email in lower case and trimmed, as the shared schema defines', async () => {
    let body: unknown;
    server.use(
      authHandlers.loggedOut(),
      http.post(apiUrl('/auth/login'), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(adminUser);
      }),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), '  Admin@SiteCheck.dev ');
    await user.type(screen.getByLabelText('Password'), 'sitecheck-dev');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(body).toEqual({ email: 'admin@sitecheck.dev', password: 'sitecheck-dev' });
    });
  });

  it("shows the server's message for wrong credentials and stays on the page", async () => {
    server.use(authHandlers.loggedOut(), authHandlers.loginFails());
    const { router, user } = renderApp('/login');

    await fillLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(currentUrl(router)).toBe('/login');
  });

  it('validates the form before sending anything', async () => {
    // No login handler: a request would fail the test (see test/setup.ts).
    server.use(authHandlers.loggedOut());
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('never redirects to another site after login', async () => {
    server.use(authHandlers.loggedOut(), authHandlers.loginSucceeds(adminUser));
    const { router, user } = renderApp(
      `/login?from=${encodeURIComponent('https://evil.example/login')}`,
    );

    await fillLogin(user);

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(currentUrl(router)).toBe('/dashboard');
  });

  it('skips the form when the user is already logged in', async () => {
    server.use(authHandlers.loggedInAs(adminUser));
    const { router } = renderApp('/login?from=%2Fsites');

    expect(await screen.findByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/sites');
  });
});

describe('logout', () => {
  it('ends the session, clears cached data and shows the login page', async () => {
    let loggedIn = true;
    server.use(
      http.get(apiUrl('/auth/me'), () =>
        loggedIn
          ? HttpResponse.json(adminUser)
          : HttpResponse.json({ message: 'Authentication required' }, { status: 401 }),
      ),
      http.post(apiUrl('/auth/logout'), () => {
        loggedIn = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router, queryClient, user } = renderApp('/plants');
    queryClient.setQueryData(['some', 'cached', 'data'], { secret: true });

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in to SiteCheck' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe('/login');
    expect(queryClient.getQueryData(['some', 'cached', 'data'])).toBeUndefined();
  });
});

describe('session expiry', () => {
  it('sends the user to the login page when any request gets a 401', async () => {
    server.use(authHandlers.loggedInAs(adminUser));
    const { router, queryClient } = renderApp('/plants');
    await screen.findByRole('heading', { name: 'Plants' });

    // Any query failing with 401 (here simulated directly on the cache).
    server.use(
      authHandlers.loggedOut(),
      http.get(apiUrl('/plants'), () =>
        HttpResponse.json({ message: 'Authentication required' }, { status: 401 }),
      ),
    );
    await queryClient
      .query({ queryKey: ['plants'], queryFn: () => apiFetch('/plants', plantPageSchema) })
      .catch(() => undefined);

    expect(await screen.findByRole('heading', { name: 'Log in to SiteCheck' })).toBeInTheDocument();
    expect(currentUrl(router)).toBe(`/login?from=${encodeURIComponent('/plants')}`);
  });
});

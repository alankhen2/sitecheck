import { zodResolver } from '@hookform/resolvers/zod';
import { loginBodySchema } from '@sitecheck/shared';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useCurrentUser, useLogin } from '../auth/queries';
import { userMessage } from '../lib/errors';
import { safeRedirect } from '../lib/redirect';
import { usePageHeading } from '../lib/usePageHeading';

export function LoginPage() {
  const heading = usePageHeading('Log in');
  const [params] = useSearchParams();
  const target = safeRedirect(params.get('from'));
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const login = useLogin();

  // The same schema the API validates with: the rules cannot drift apart.
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: '', password: '' },
  });

  // Already logged in (e.g. opened /login in a new tab): nothing to do here.
  if (user) return <Navigate to={target} replace />;

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => void navigate(target, { replace: true }),
    });
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        aria-labelledby="login-title"
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1
          ref={heading}
          id="login-title"
          tabIndex={-1}
          className="text-xl font-semibold text-slate-900 outline-none"
        >
          Log in to SiteCheck
        </h1>

        {login.isError && (
          <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {userMessage(login.error)}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-700">
              Enter a valid email address.
            </p>
          )}
        </div>

        <div className="mt-4">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-sm text-red-700">
              Enter your password.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-6 w-full rounded bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}

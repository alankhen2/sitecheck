import { publicUserSchema, type LoginBody, type PublicUser } from '@sitecheck/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch, apiFetchEmpty } from '../lib/api';
import { currentUserKey } from './keys';

/**
 * The logged-in user, or `null`. "Not logged in" (401) is a normal answer
 * here, not an error, so pages can tell it apart from "the API is down".
 */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<PublicUser | null> {
  try {
    return await apiFetch('/auth/me', publicUserSchema, signal ? { signal } : {});
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) return null;
    throw err;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiFetch('/auth/login', publicUserSchema, { method: 'POST', body }),
    // The login response already is the user, so no extra GET /auth/me.
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiFetchEmpty('/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      // Leave the protected pages first, then drop every cached response, so
      // the next person on this browser cannot see the previous user's data.
      await navigate('/login', { replace: true });
      queryClient.clear();
      queryClient.setQueryData(currentUserKey, null);
    },
  });
}

import { useEffect, useState } from 'react';
import { healthResponseSchema, type HealthResponse } from '@sitecheck/shared';

type State =
  { kind: 'loading' } | { kind: 'ok'; data: HealthResponse } | { kind: 'error'; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((json: unknown) => {
        setState({ kind: 'ok', data: healthResponseSchema.parse(json) });
      })
      .catch((err: unknown) => {
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  return (
    <main>
      <h1>SiteCheck</h1>
      {state.kind === 'loading' && <p>Checking API…</p>}
      {state.kind === 'ok' && <p>API status: {state.data.status}</p>}
      {state.kind === 'error' && <p>API unreachable: {state.message}</p>}
    </main>
  );
}

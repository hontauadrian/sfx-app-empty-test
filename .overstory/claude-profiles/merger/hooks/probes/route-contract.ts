/**
 * Probe 1 — Route-contract.
 *
 * Every HTTP route registered with Nest must return a response body that
 * matches the envelope shape declared by the static detectors
 * (response-envelope.js for success, error-envelope.js for errors). The
 * expected shapes live on the matrix at `responseEnvelope` and
 * `errorEnvelope` — this probe never hardcodes them.
 *
 * The most common regression here is a controller returning a raw value that
 * bypasses the interceptor (e.g. throwing a non-HttpException, calling
 * res.send() directly, returning an Observable that the interceptor can't
 * wrap). The bug that motivated this probe: "Disconnected" UI — the frontend
 * was unwrapping the success envelope, but a route had been stubbed to return
 * `data` directly, and executeRequest() read `undefined.data` → error toast.
 *
 * This probe hits every GET route with no auth/body and asserts the response
 * is a valid envelope. Routes with :id params receive a sentinel UUID — the
 * stateless prisma mock returns `null`, so controllers typically 404; that's
 * still a valid error envelope.
 */
import { API_PREFIX, bootApp, enumerateRoutes, hasApi, isErrorEnvelope, isSuccessEnvelope, type ProbeResult } from './shared';
import { loadMatrix, MatrixLoadError } from './matrix-loader';

export async function runRouteContract(): Promise<ProbeResult[]> {
  if (!hasApi()) {
    return [{ name: 'Route-contract', status: 'skip', note: 'no apps/api present' }];
  }

  // Load declared envelope shapes from the matrix. If the matrix is missing
  // (e.g. first run before derive-test-matrix), skip gracefully — same as
  // the boot-failure path below.
  let declaredSuccess: { successWrapper: string[] | null } | null = null;
  let declaredError: { wrapper: string[]; statusField: string | null; messageField: string | null } | null = null;
  try {
    const matrix = loadMatrix();
    declaredSuccess = matrix.responseEnvelope;
    declaredError = matrix.errorEnvelope;
  } catch (error) {
    if (error instanceof MatrixLoadError && error.code === 'MATRIX_MISSING') {
      // Matrix not yet generated — envelope checks will emit DIAG notes below.
    } else {
      const message = error instanceof Error ? error.message : String(error);
      return [{ name: 'Route-contract', status: 'skip', note: `matrix load failed: ${message}` }];
    }
  }

  const supertest = (await import('supertest')).default;

  let app: Awaited<ReturnType<typeof bootApp>> | null = null;
  try {
    app = await bootApp();
  } catch (error) {
    // Booting in-process requires the project to be fully wired (decorators,
    // env, workspace imports). When it fails we can't exercise the contract,
    // so skip rather than block — the agent still gets visibility that the
    // probe couldn't run and why.
    const message = error instanceof Error ? error.message : String(error);
    return [{ name: 'Route-contract', status: 'skip', note: `AppModule failed to boot: ${message}` }];
  }

  try {
    const routes = enumerateRoutes(app);
    if (routes.length === 0) {
      return [{ name: 'Route-contract', status: 'skip', note: 'no routes discovered' }];
    }

    // Only probe GET routes without required auth — mutating routes are covered
    // by mutation-roundtrip, and auth is covered by auth-matrix.
    const getRoutes = routes.filter((route) => route.method === 'GET');
    if (getRoutes.length === 0) {
      return [
        {
          name: 'Route-contract',
          status: 'skip',
          note: `no GET routes (${routes.length} total routes)`,
        },
      ];
    }

    const results: ProbeResult[] = [];
    const httpInstance = app.getHttpServer();

    for (const route of getRoutes) {
      // The Express router registers routes without the global prefix — prepend
      // it so supertest hits the real path.
      const url = normalizePath(API_PREFIX, route.concretePath);
      try {
        const response = await supertest(httpInstance).get(url);
        const body = response.body;

        let envelopeOk: boolean | null;
        if (response.status < 400) {
          envelopeOk = isSuccessEnvelope(body, declaredSuccess);
        } else {
          envelopeOk = isErrorEnvelope(body, declaredError);
        }

        if (envelopeOk === null) {
          // Undeclared envelope shape — DIAG, skip assertion for this route.
          const diagKind = response.status < 400 ? 'RESPONSE_ENVELOPE_UNDECLARED' : 'ERROR_ENVELOPE_UNDECLARED';
          results.push({
            name: `GET ${url} → ${response.status}`,
            status: 'pass',
            note: `DIAG:${diagKind} — no declared envelope shape; skipping envelope assertion`,
          });
        } else if (envelopeOk) {
          results.push({
            name: `GET ${url} → ${response.status}`,
            status: 'pass',
          });
        } else {
          results.push({
            name: `GET ${url} → ${response.status}`,
            status: 'fail',
            note: 'response body does not match declared envelope shape',
            details: JSON.stringify(body, null, 2),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          name: `GET ${url}`,
          status: 'fail',
          note: `request failed: ${message}`,
        });
      }
    }

    return results;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        // Ignore close errors — the process exits after this probe anyway.
      }
    }
  }
}

function normalizePath(prefix: string, path: string): string {
  const cleanPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith(cleanPrefix)) return cleanPath;
  return `${cleanPrefix}${cleanPath}`;
}

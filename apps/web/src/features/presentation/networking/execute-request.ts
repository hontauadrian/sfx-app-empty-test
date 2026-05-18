import type { RequestConfig, RequestResponse, RequestError, RequestFieldError } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const OAUTH2_SIGN_IN_PATH = '/oauth2/sign_in';

function redirectToSignInIfBrowser(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/oauth2/')) return;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.href = `${OAUTH2_SIGN_IN_PATH}?rd=${encodeURIComponent(returnTo)}`;
}

function parseFieldErrors(value: unknown): ReadonlyArray<RequestFieldError> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: RequestFieldError[] = [];
  for (const entry of value) {
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const field = record.field;
      const message = record.message;
      if (typeof field === 'string' && typeof message === 'string') {
        parsed.push({ field, message });
      }
    }
  }
  return parsed.length > 0 ? parsed : undefined;
}

export async function executeRequest<T>(config: RequestConfig): Promise<RequestResponse<T>> {
  const { path, method = 'GET', body, headers = {} } = config;

  const url = `${API_BASE_URL}/${path}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const envelope = errorBody.error as Record<string, unknown> | undefined;
    const envelopeMessage = typeof envelope?.message === 'string' ? (envelope.message as string) : undefined;
    const topLevelMessage = typeof errorBody.message === 'string' ? (errorBody.message as string) : undefined;
    const envelopeCode = typeof envelope?.code === 'string' ? (envelope.code as string) : undefined;
    const topLevelCode = typeof errorBody.code === 'string' ? (errorBody.code as string) : undefined;

    const error: RequestError = {
      message: envelopeMessage ?? topLevelMessage ?? 'Request failed',
      status: response.status,
      code: envelopeCode ?? topLevelCode,
      errors: parseFieldErrors(envelope?.errors) ?? parseFieldErrors(errorBody.errors),
    };
    if (response.status === 401) {
      redirectToSignInIfBrowser();
    }
    throw error;
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

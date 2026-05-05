import type { RequestConfig, RequestResponse, RequestError } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
    const errorBody = await response.json().catch(() => ({}));
    const error: RequestError = {
      message: (errorBody as Record<string, unknown>).message as string ?? 'Request failed',
      status: response.status,
      code: (errorBody as Record<string, unknown>).code as string | undefined,
    };
    throw error;
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

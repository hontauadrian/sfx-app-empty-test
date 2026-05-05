export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestConfig {
  readonly path: string;
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export interface RequestResponse<T> {
  readonly data: T;
  readonly status: number;
}

export interface RequestError {
  readonly message: string;
  readonly status: number;
  readonly code?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const HEALTH_QUERY_KEY = ['health'] as const;
export const HEALTH_ENDPOINT = 'api/v1/health';
export const API_DOCS_HREF = `${API_BASE_URL.replace(/\/+$/, '')}/api/docs`;

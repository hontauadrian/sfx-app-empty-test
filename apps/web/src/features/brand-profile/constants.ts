export const BRANDS_ENDPOINT = 'api/v1/brands';
export const BRANDS_QUERY_KEY = ['brands'] as const;

export function brandQueryKey(id: string): readonly [string, string] {
  return ['brands', id] as const;
}

export const BRAND_NAME_MAX_LENGTH = 120;
export const BRAND_DESCRIPTION_MAX_LENGTH = 2000;

export function brandRoute(id: string): string {
  return `/brands/${id}`;
}

export const NEW_BRAND_ROUTE = '/brands/new';
export const DASHBOARD_ROUTE = '/';

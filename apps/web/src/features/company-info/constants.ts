export const COMPANY_INFO_ENDPOINT = 'api/v1/company-info';
export const COMPANY_INFO_QUERY_KEY = ['company-info'] as const;
export const COMPANY_INFO_VERSIONS_QUERY_KEY = ['company-info', 'versions'] as const;
export const COMPANY_INFO_VERSION_QUERY_KEY = (id: string) =>
  ['company-info', 'versions', id] as const;

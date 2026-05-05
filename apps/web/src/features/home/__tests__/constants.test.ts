describe('home constants', () => {
  const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (ORIGINAL_API_URL === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
    }
    vi.resetModules();
  });

  it('exports stable health query key', async () => {
    const { HEALTH_QUERY_KEY } = await import('../constants');
    expect(HEALTH_QUERY_KEY).toEqual(['health']);
  });

  it('exports health API path', async () => {
    const { HEALTH_ENDPOINT } = await import('../constants');
    expect(HEALTH_ENDPOINT).toBe('api/v1/health');
  });

  it('builds API docs href from configured API base URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    vi.resetModules();
    const { API_DOCS_HREF } = await import('../constants');
    expect(API_DOCS_HREF).toBe('https://api.example.com/api/docs');
  });

  it('strips trailing slashes from configured API base URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';
    vi.resetModules();
    const { API_DOCS_HREF } = await import('../constants');
    expect(API_DOCS_HREF).toBe('https://api.example.com/api/docs');
  });

  it('falls back to localhost when NEXT_PUBLIC_API_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.resetModules();
    const { API_DOCS_HREF } = await import('../constants');
    expect(API_DOCS_HREF).toBe('http://localhost:3001/api/docs');
  });
});

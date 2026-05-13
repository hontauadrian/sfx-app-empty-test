describe('home constants', () => {
  afterEach(() => {
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

  it('exports API docs path', async () => {
    const { API_DOCS_HREF } = await import('../constants');
    expect(API_DOCS_HREF).toBe('/api/docs');
  });
});

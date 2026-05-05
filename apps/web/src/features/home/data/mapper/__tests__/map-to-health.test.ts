import { mapToHealth } from '../map-to-health';

describe('mapToHealth', () => {
  it('maps ok status and connected database to healthy', () => {
    const result = mapToHealth({
      status: 'ok',
      timestamp: '2025-01-01T00:00:00.000Z',
      database: 'connected',
    });
    expect(result.isHealthy).toBe(true);
    expect(result.databaseConnected).toBe(true);
    expect(result.checkedAt).toEqual(new Date('2025-01-01T00:00:00.000Z'));
  });

  it('maps non-ok status to unhealthy', () => {
    const result = mapToHealth({
      status: 'error',
      timestamp: '2025-01-01T00:00:00.000Z',
      database: 'connected',
    });
    expect(result.isHealthy).toBe(false);
  });

  it('maps disconnected database', () => {
    const result = mapToHealth({
      status: 'ok',
      timestamp: '2025-01-01T00:00:00.000Z',
      database: 'disconnected',
    });
    expect(result.databaseConnected).toBe(false);
  });
});

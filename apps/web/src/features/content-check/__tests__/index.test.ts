import { describe, expect, it } from 'vitest';
import { ContentCheckPage, CONTENT_CHECK_ROUTE } from '../index';

describe('content-check feature barrel', () => {
  it('exports the page component and the route constant', () => {
    expect(ContentCheckPage).toBeDefined();
    expect(typeof ContentCheckPage).toBe('function');
    expect(CONTENT_CHECK_ROUTE).toBe('/content-check');
  });
});

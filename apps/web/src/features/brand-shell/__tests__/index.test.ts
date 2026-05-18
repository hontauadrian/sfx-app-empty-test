import * as barrel from '../index';

describe('brand-shell barrel', () => {
  it('exports BrandGuidelinesEmptyPage and BrandGuidelinesDetailPage', () => {
    expect(typeof barrel.BrandGuidelinesEmptyPage).toBe('function');
    expect(typeof barrel.BrandGuidelinesDetailPage).toBe('function');
  });
});

import * as barrel from '../index';

describe('brand module barrel', () => {
  it('re-exports BrandModule', () => {
    expect(barrel.BrandModule).toBeDefined();
    expect(barrel.BrandModule.name).toBe('BrandModule');
  });
});

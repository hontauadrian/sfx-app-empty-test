import * as barrel from '..';
import { CompanyInfoModule } from '../company-info.module';

describe('company-info barrel', () => {
  it('re-exports CompanyInfoModule', () => {
    expect(barrel.CompanyInfoModule).toBe(CompanyInfoModule);
  });
});

import {
  COMPANY_INFO_REPOSITORY,
  PRISMA_CLIENT,
} from '../company-info.tokens';

describe('company-info.tokens', () => {
  it('exports a unique Symbol for COMPANY_INFO_REPOSITORY', () => {
    expect(typeof COMPANY_INFO_REPOSITORY).toBe('symbol');
    expect(COMPANY_INFO_REPOSITORY.toString()).toBe('Symbol(COMPANY_INFO_REPOSITORY)');
  });

  it('exports a unique Symbol for PRISMA_CLIENT', () => {
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(PRISMA_CLIENT.toString()).toBe('Symbol(PRISMA_CLIENT)');
  });

  it('treats the two tokens as distinct DI keys', () => {
    expect(COMPANY_INFO_REPOSITORY).not.toBe(PRISMA_CLIENT);
  });
});

import { paginationSchema, idParamSchema } from '../../src/schemas/common.schema';

describe('paginationSchema', () => {
  it('should use defaults when no input provided', () => {
    const result = paginationSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should reject page less than 1', () => {
    const result = paginationSchema.safeParse({ page: 0 });

    expect(result.success).toBe(false);
  });

  it('should reject limit greater than 100', () => {
    const result = paginationSchema.safeParse({ limit: 101 });

    expect(result.success).toBe(false);
  });
});

describe('idParamSchema', () => {
  it('should validate a non-empty string id', () => {
    const result = idParamSchema.safeParse({ id: '123' });

    expect(result.success).toBe(true);
  });

  it('should reject empty id', () => {
    const result = idParamSchema.safeParse({ id: '' });

    expect(result.success).toBe(false);
  });
});

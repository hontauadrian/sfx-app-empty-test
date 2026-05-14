import { createHelmetOptions } from '../helmet-options';

describe('createHelmetOptions', () => {
  it('does not upgrade local HTTP Swagger asset requests to HTTPS', () => {
    expect(createHelmetOptions()).toMatchObject({
      contentSecurityPolicy: {
        directives: {
          'upgrade-insecure-requests': null,
        },
      },
    });
  });
});

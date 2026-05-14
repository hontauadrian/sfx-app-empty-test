import type { HelmetOptions } from 'helmet';

export function createHelmetOptions(): HelmetOptions {
  return {
    contentSecurityPolicy: {
      directives: {
        'upgrade-insecure-requests': null,
      },
    },
  };
}

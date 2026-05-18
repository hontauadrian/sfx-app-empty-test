// Single source of truth for Keycloak role names consumed across the stack.
// Add roles as additional named string-literal constants — never an enum
// or union, so each role remains a stable grep target.
export const AUTH_ROLE_ADMIN = 'admin' as const;
export const AUTH_ROLE_AGENT = 'agent' as const;

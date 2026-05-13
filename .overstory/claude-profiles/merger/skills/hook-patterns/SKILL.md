---
name: hook-patterns
description: Use when creating custom React hooks, composing shared logic, or implementing navigation. Covers useCallback wrapping, navigation handler pattern, shared base hooks, and UIModel mapper pattern.
---

# Hook Patterns

## Navigation Handler Pattern

Hooks NEVER call `router.push()`. Instead, they expose navigation state that the page wires to a separate handler.

### Anti-pattern

```typescript
// WRONG — hook imports and calls router directly
export function useLogin(): UseLoginReturn {
  const router = useRouter();
  const handleRegister = useCallback(() => {
    router.push("/register"); // ❌ Never call router in a hook
  }, [router]);
}
```

### Correct pattern

```typescript
// Hook exposes navigation target state
export function useLogin(): UseLoginReturn {
  const [navigationTarget, setNavigationTarget] = useState<LoginNavigationTarget>(null);

  const handleRegister = useCallback(() => setNavigationTarget("register"), []);
  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return { navigationTarget, clearNavigationTarget, handleRegister };
}

// Separate handler owns the router
export function useLoginNavigationHandler(target: LoginNavigationTarget, onNavigated: () => void) {
  const router = useRouter();

  useEffect(() => {
    if (!target) return;
    switch (target) {
      case "register": router.push("/register"); break;
      case "forgotPassword": router.push("/forgot-password"); break;
    }
    onNavigated();
  }, [target, router, onNavigated]);
}

// Page wires them together
export function LoginPage() {
  const { navigationTarget, clearNavigationTarget, ...rest } = useLogin();
  useLoginNavigationHandler(navigationTarget, clearNavigationTarget);
  // ...
}
```

---

## useCallback — All Returned Handlers

Every handler returned from a hook must be wrapped in `useCallback`. Never return inline arrows.

### Anti-pattern

```typescript
// WRONG — inline arrows in return
return {
  handleSubmit: () => { /* ... */ },       // ❌
  handleCancel: () => setMode(null),       // ❌
};
```

### Correct pattern

```typescript
const handleSubmit = useCallback(() => {
  // ... logic
}, [dependencies]);

const handleCancel = useCallback(() => setMode(null), []);

return { handleSubmit, handleCancel };
```

---

## Hook Return Types

Always explicitly annotate. Never rely on inference.

```typescript
// WRONG
export const useLogin = () => { /* ... */ };

// CORRECT
export function useLogin(): UseLoginReturn { /* ... */ }

// Define in types.ts
export interface UseLoginReturn {
  uiModel: LoginPageUIModel;
  navigationTarget: LoginNavigationTarget;
  clearNavigationTarget: () => void;
  handleInputChange: (field: "email" | "password", value: string) => void;
  handleLogin: () => void;
}
```

---

## Shared Hook Composition (Monorepo)

Shared base hooks live in `@project/shared/features/[feature]/presentations/`. App-level hooks compose them and add platform-specific behavior.

```
@project/shared:   features/auth/presentations/useLoginForm.ts     ← base hook
@project/web:      features/auth/pages/login/useLogin.ts           ← composes base + web behavior
@project/mobile:   features/auth/pages/login/useLogin.ts           ← composes base + mobile behavior
```

**Naming:** shared base hook = `use[Feature]Form`; app-level hook = `use[Feature]` — same name on both platforms.

### Shared base hook

```typescript
// packages/shared/src/features/auth/presentations/useLoginForm.ts
import { useState, useCallback } from "react";
import { useAuthRepository } from "../data/repositories/useAuthRepository";
import type { UseLoginFormReturn, LoginForm } from "./types";

export function useLoginForm(): UseLoginFormReturn {
  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });
  const [errors, setErrors] = useState({ email: null, password: null });
  const { loginMutation } = useAuthRepository();

  const handleInputChange = useCallback((field: keyof LoginForm, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleInputBlur = useCallback((field: keyof LoginForm) => {
    // validate single field
  }, [form]);

  const handleLogin = useCallback(() => {
    loginMutation.mutate(form);
  }, [form, loginMutation]);

  return {
    form,
    errors,
    isSubmitting: loginMutation.isPending,
    handleInputChange,
    handleInputBlur,
    handleLogin,
  };
}
```

### App-level hook (composes base)

```typescript
// App hook — same pattern on web and mobile
import { useState, useCallback } from "react";
import { useLoginForm } from "@project/shared";
import { useTheme } from "@project/shared/theme";
import { mapToLoginPageUIModel } from "./mapToLoginPageUIModel";
import type { UseLoginReturn, LoginNavigationTarget } from "./types";

export function useLogin(): UseLoginReturn {
  const { isDark } = useTheme();
  const { form, errors, isSubmitting, handleInputChange, handleInputBlur, handleLogin } = useLoginForm();
  const [navigationTarget, setNavigationTarget] = useState<LoginNavigationTarget>(null);

  const uiModel = mapToLoginPageUIModel({ form, errors, isSubmitting, isDark });
  const handleRegister = useCallback(() => setNavigationTarget("register"), []);
  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleInputBlur, handleLogin, handleRegister };
}
```

---

## UIModel Mapper Pattern

The mapper is a pure function that converts domain state + translations into a flat UIModel. The page never computes values — it only renders what the UIModel provides.

### Anti-pattern

```typescript
// WRONG — logic in JSX
<button>{isSubmitting ? "Submitting..." : "Submit"}</button>  // ❌
<p>{t("auth.loginHeading")}</p>                               // ❌
```

### Correct pattern

```typescript
// Mapper resolves everything
export function mapToLoginPageUIModel(input: MapToLoginPageUIModelInput): LoginPageUIModel {
  return {
    submitButtonLabel: input.isSubmitting ? authLabels.submitting : authLabels.submit,
    loginHeading: authLabels.loginHeading,
    submitButtonDisabled: input.isSubmitting,
  };
}

// Page just renders
<button disabled={uiModel.submitButtonDisabled}>{uiModel.submitButtonLabel}</button>
<p>{uiModel.loginHeading}</p>
```

Conditional rendering based on UIModel boolean flags is acceptable — computing values is not:

```typescript
// OK — conditional rendering
{uiModel.showErrorBanner && <ErrorBanner message={uiModel.errorBannerMessage} />}

// WRONG — computing values in JSX
{error ? <ErrorBanner message={error.message} /> : null}  // ❌
```

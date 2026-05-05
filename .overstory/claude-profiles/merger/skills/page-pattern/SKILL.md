---
name: page-pattern
description: Full implementation pattern for pages and components. Includes types, UIModel mapper, hook, navigation handler, page component, and thin wrapper. Use when creating a new page, screen, route, or component in any project variant (standalone Next.js, monorepo web, monorepo mobile).
---

# Page & Component Pattern

## Page Structure

Every page consists of 5 files in `pages/[pageName]/`:

| File | Responsibility |
|------|---------------|
| `types.ts` | Navigation target, UIModel interface, mapper input, hook return type |
| `mapTo[Feature]PageUIModel.ts` | Pure mapper — labels + derived state |
| `use[Feature].ts` | All logic, NO router |
| `use[Feature]NavigationHandler.ts` | Owns router, reacts to navigation state |
| `[pageName]-page.tsx` (or `index.tsx` on mobile) | UI only — renders uiModel.* |

The `app/` route file is a thin wrapper importing the page component.

---

## Mandatory route guard contract header

Every page file MUST begin with this JSDoc header:

```ts
/**
 * @routeGuard  authenticated | public | optional-auth
 * @unauthRedirect  /login          // required when routeGuard=authenticated; symbolic
 * @postLoginRedirect  /dashboard   // required for /login and /register surfaces
 */
```

The `derive-test-matrix` utility (plan 02) reads these headers to build the
auth matrix generically. A page without this header is treated by the Stop
hook as protected-by-default; a missing unauth redirect fails the probe.

This header is NOT for humans — it is for the probe. Keep it machine-parseable.

---

## Standalone Next.js

### types.ts

```typescript
export type LoginNavigationTarget = "register" | "forgotPassword" | null;

export interface LoginPageUIModel {
  emailValue: string;
  emailError: string | null;
  passwordValue: string;
  passwordError: string | null;
  submitButtonLabel: string;
  submitButtonDisabled: boolean;
  loginHeading: string;
  registerLinkLabel: string;
  showErrorBanner: boolean;
  errorBannerMessage: string | null;
}

export interface MapToLoginPageUIModelInput {
  form: { email: string; password: string };
  errors: { email: string | null; password: string | null };
  isSubmitting: boolean;
  loginError: string | null;
}

export interface UseLoginReturn {
  uiModel: LoginPageUIModel;
  navigationTarget: LoginNavigationTarget;
  clearNavigationTarget: () => void;
  handleInputChange: (field: "email" | "password", value: string) => void;
  handleLogin: () => void;
  handleRegister: () => void;
}
```

### mapTo[Feature]PageUIModel.ts — pure mapper

```typescript
import { authLabels } from "@/features/presentation/localization/labels/auth-labels";
import type { LoginPageUIModel, MapToLoginPageUIModelInput } from "./types";

export function mapToLoginPageUIModel(input: MapToLoginPageUIModelInput): LoginPageUIModel {
  return {
    emailValue: input.form.email,
    emailError: input.errors.email,
    passwordValue: input.form.password,
    passwordError: input.errors.password,
    submitButtonLabel: input.isSubmitting ? authLabels.submitting : authLabels.submit,
    submitButtonDisabled: input.isSubmitting,
    loginHeading: authLabels.loginHeading,
    registerLinkLabel: authLabels.registerLink,
    showErrorBanner: input.loginError !== null,
    errorBannerMessage: input.loginError,
  };
}
```

### use[Feature].ts — all logic, NO router

```typescript
"use client";
import { useState, useCallback } from "react";
import { useLoginForm } from "../../validators/loginSchema";
import { mapToLoginPageUIModel } from "./mapToLoginPageUIModel";
import type { UseLoginReturn, LoginNavigationTarget } from "./types";

export function useLogin(): UseLoginReturn {
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({ email: null, password: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<LoginNavigationTarget>(null);

  const uiModel = mapToLoginPageUIModel({ form, errors, isSubmitting, loginError });

  const handleInputChange = useCallback((field: "email" | "password", value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleLogin = useCallback(() => {
    setIsSubmitting(true);
    // ... mutation logic via React Query
  }, [form]);

  const handleRegister = useCallback(() => setNavigationTarget("register"), []);
  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleLogin, handleRegister };
}
```

### use[Feature]NavigationHandler.ts — owns the router

```typescript
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LoginNavigationTarget } from "./types";

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
```

### login-page.tsx — UI only

```typescript
"use client";
import { useLogin } from "./useLogin";
import { useLoginNavigationHandler } from "./useLoginNavigationHandler";

export function LoginPage() {
  const { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleLogin, handleRegister } = useLogin();
  useLoginNavigationHandler(navigationTarget, clearNavigationTarget);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">{uiModel.loginHeading}</h1>
      {uiModel.showErrorBanner && <p className="text-red-500">{uiModel.errorBannerMessage}</p>}
      <input
        value={uiModel.emailValue}
        onChange={(event) => handleInputChange("email", event.target.value)}
        aria-label="Email"
      />
      {uiModel.emailError && <p className="text-red-500 text-sm">{uiModel.emailError}</p>}
      <button onClick={handleLogin} disabled={uiModel.submitButtonDisabled}>
        {uiModel.submitButtonLabel}
      </button>
      <button onClick={handleRegister}>{uiModel.registerLinkLabel}</button>
    </main>
  );
}
```

### Thin wrapper in app/

```typescript
// app/login/page.tsx
"use client";
import { LoginPage } from "@/features/auth/presentation/pages/login/login-page";
export default function Route() { return <LoginPage />; }
```

---

## Monorepo — Web Variant

Web hooks compose shared base hooks. Mapper uses typed label constants.

### Web page

```typescript
"use client";
import { useTheme } from "@project/shared/theme";
import { useLogin } from "./useLogin";
import { useLoginNavigationHandler } from "./useLoginNavigationHandler";

export function LoginPage() {
  const { theme } = useTheme();
  const { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleLogin } = useLogin();
  useLoginNavigationHandler(navigationTarget, clearNavigationTarget);

  return (
    <main style={{ backgroundColor: theme.colors.background }}>
      <h1>{uiModel.loginHeading}</h1>
      {uiModel.showErrorBanner && <p>{uiModel.errorBannerMessage}</p>}
      <input value={uiModel.emailValue} onChange={(event) => handleInputChange("email", event.target.value)} />
      <button onClick={handleLogin} disabled={uiModel.submitButtonDisabled}>
        {uiModel.submitButtonLabel}
      </button>
    </main>
  );
}
```

### Web hook (composes shared base hook)

```typescript
"use client";
import { useState, useCallback } from "react";
import { useTheme } from "@project/shared/theme";
import { useLoginForm } from "@project/shared";
import { mapToLoginPageUIModel } from "./mapToLoginPageUIModel";
import type { UseLoginReturn, AuthNavigationTarget } from "./types";

export function useLogin(): UseLoginReturn {
  const { isDark } = useTheme();
  const { form, errors, isSubmitting, handleInputChange, handleInputBlur, handleLogin } = useLoginForm();
  const [navigationTarget, setNavigationTarget] = useState<AuthNavigationTarget>(null);

  const uiModel = mapToLoginPageUIModel({ form, errors, isSubmitting, isDark });
  const handleRegister = useCallback(() => setNavigationTarget("register"), []);
  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleInputBlur, handleLogin, handleRegister };
}
```

### Web mapper (label constants)

```typescript
import { authLabels, commonLabels } from "@project/shared/localization";
import type { LoginPageUIModel, MapToLoginPageUIModelInput } from "./types";

export function mapToLoginPageUIModel(input: MapToLoginPageUIModelInput): LoginPageUIModel {
  return {
    emailValue: input.form.email,
    emailError: input.errors.email,
    submitButtonLabel: input.isSubmitting ? authLabels.submitting : authLabels.submit,
    submitButtonDisabled: input.isSubmitting,
    loginHeading: authLabels.loginHeading,
    showErrorBanner: false,
    errorBannerMessage: null,
  };
}
```

### Web navigation handler

```typescript
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuthNavigationTarget } from "./types";

export function useLoginNavigationHandler(target: AuthNavigationTarget, onNavigated: () => void) {
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
```

---

## Monorepo — Mobile Variant

Mobile hooks compose shared base hooks. Mapper uses `scopedTranslate`.

### Mobile page

```typescript
export const LoginPage: React.FC = () => {
  const { theme } = useTheme();
  const { colors } = theme;
  const { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleLogin } = useLogin();
  useLoginNavigationHandler(navigationTarget, clearNavigationTarget);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.text }}>{uiModel.loginHeading}</Text>
      <TextInput
        value={uiModel.emailValue}
        placeholder={uiModel.emailPlaceholder}
        onChangeText={(value) => handleInputChange("email", value)}
        accessibilityLabel={uiModel.emailPlaceholder}
      />
      {uiModel.emailError && <Text style={{ color: colors.error }}>{uiModel.emailError}</Text>}
      <TouchableOpacity
        onPress={handleLogin}
        disabled={uiModel.submitButtonDisabled}
        style={{ opacity: uiModel.submitButtonOpacity }}
        accessibilityLabel={uiModel.submitButtonLabel}
        accessibilityRole="button"
      >
        <Text>{uiModel.submitButtonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};
export default LoginPage;
```

### Mobile hook (composes shared base hook)

```typescript
import { useState, useCallback } from "react";
import { useLoginForm } from "@project/shared";
import { useTheme } from "@project/shared/theme";
import { mapToLoginPageUIModel } from "./mapToLoginPageUIModel";
import type { UseLoginReturn, LoginNavigationTarget } from "./types";

export const useLogin = (): UseLoginReturn => {
  const { isDark, toggleTheme } = useTheme();
  const { form, errors, isSubmitting, handleInputChange, handleInputBlur, handleLogin } = useLoginForm();
  const [navigationTarget, setNavigationTarget] = useState<LoginNavigationTarget>(null);

  const uiModel = mapToLoginPageUIModel({ form, errors, isSubmitting, isDark });
  const handleRegister = useCallback(() => setNavigationTarget("register"), []);
  const handleForgotPassword = useCallback(() => setNavigationTarget("forgotPassword"), []);
  const clearNavigationTarget = useCallback(() => setNavigationTarget(null), []);

  return { uiModel, navigationTarget, clearNavigationTarget, handleInputChange, handleInputBlur, handleLogin, handleRegister, handleForgotPassword, toggleTheme };
};
```

### Mobile mapper (scopedTranslate)

```typescript
import { scopedTranslate } from "@project/shared/localization";

const translateAuth = scopedTranslate("auth");
const translateCommon = scopedTranslate("common");

export function mapToLoginPageUIModel({ form, errors, isSubmitting, isDark }): LoginPageUIModel {
  return {
    emailValue: form.email,
    emailError: errors.email,
    submitButtonLabel: isSubmitting ? translateAuth("login.submittingButton") : translateAuth("login.submitButton"),
    submitButtonDisabled: isSubmitting,
    submitButtonOpacity: isSubmitting ? 0.7 : 1,
    themeToggleLabel: isDark ? translateCommon("themeToggleLight") : translateCommon("themeToggleDark"),
    loginHeading: translateAuth("login.heading"),
  };
}
```

### Mobile navigation handler

```typescript
import { useEffect } from "react";
import { useRouter } from "expo-router";
import type { LoginNavigationTarget } from "./types";

export function useLoginNavigationHandler(target: LoginNavigationTarget, onNavigated: () => void) {
  const router = useRouter();

  useEffect(() => {
    if (!target) return;
    switch (target) {
      case "register": router.push("/(auth)/(authtabs)/register"); break;
      case "forgotPassword": router.push("/(auth)/resetPassword"); break;
    }
    onNavigated();
  }, [target, router, onNavigated]);
}
```

---

## Component Pattern

```
[ComponentName]/
├── [component-name].tsx        # Presentational (dumb, no logic)
├── use[ComponentName].ts       # Custom hook with ALL logic
├── types.ts                    # Props, return types
└── index.ts                    # Barrel exports
```

Rules:
1. NO logic in component files — no `useState`, `useReducer`, `useMemo`, `useQuery`
2. ALL logic in custom hooks
3. ALL types in `types.ts`
4. Barrel exports in `index.ts`

---
name: localization-patterns
description: Localization and internationalization patterns including typed label constants (web), scopedTranslate and useTranslations (mobile), and label resolution in mappers. Use when working with user-facing strings, translations, or localization.
---

# Localization Patterns

## Core Rule

All labels are resolved in the UIModel mapper — never inline in JSX. Pages only render what the UIModel provides.

---

## Web — Typed Label Constants

```typescript
// features/presentation/localization/labels/auth-labels.ts
export const authLabels = {
  loginHeading: "Sign In",
  submit: "Sign In",
  submitting: "Signing In...",
  registerLink: "Create an account",
  emailPlaceholder: "Enter your email",
  validation: {
    emailRequired: "Email is required",
    emailInvalid: "Invalid email address",
    passwordMin: "Password must be at least 8 characters",
  },
} as const;
```

Usage in mapper:

```typescript
import { authLabels, commonLabels } from "@project/shared/localization";

export function mapToLoginPageUIModel(input: MapToLoginPageUIModelInput): LoginPageUIModel {
  return {
    submitButtonLabel: input.isSubmitting ? authLabels.submitting : authLabels.submit,
    loginHeading: authLabels.loginHeading,
    emailPlaceholder: authLabels.emailPlaceholder,
  };
}
```

---

## Mobile — scopedTranslate (Mappers) and useTranslations (Hooks)

### scopedTranslate — pure functions and mappers

```typescript
import { scopedTranslate } from "@project/shared/localization";

const translateAuth = scopedTranslate("auth");
const translateCommon = scopedTranslate("common");

export function mapToLoginPageUIModel({ form, errors, isSubmitting, isDark }): LoginPageUIModel {
  return {
    submitButtonLabel: isSubmitting
      ? translateAuth("login.submittingButton")
      : translateAuth("login.submitButton"),
    loginHeading: translateAuth("login.heading"),
    themeToggleLabel: isDark
      ? translateCommon("themeToggleLight")
      : translateCommon("themeToggleDark"),
  };
}
```

### useTranslations — React hooks and components

```typescript
import { useTranslations } from "@project/shared/localization";

export function useSettings(): UseSettingsReturn {
  const translateSettings = useTranslations("settings");
  // use translateSettings("someKey") inside hook logic
}
```

---

## Anti-Patterns

```typescript
// WRONG — inline i18n.t() with namespace
<Text>{i18n.t("login.heading", { ns: "auth" })}</Text>     // ❌

// WRONG — t() call in JSX
<Text>{t("login.heading")}</Text>                           // ❌

// WRONG — hardcoded string
<Text>Sign In</Text>                                        // ❌

// CORRECT — label from UIModel
<Text>{uiModel.loginHeading}</Text>                         // ✅
```

---

## Import Conventions

```typescript
// Web
import { authLabels, commonLabels } from "@project/shared/localization";

// Mobile — mappers
import { scopedTranslate } from "@project/shared/localization";

// Mobile — hooks/components
import { useTranslations } from "@project/shared/localization";
```

Name the result `translate[Namespace]` (e.g. `translateAuth`, `translateCommon`).

---
name: web-patterns
description: Web-specific implementation patterns for Next.js App Router. Includes server vs client components, providers setup, next/image usage, Tailwind theming, route structure, accessibility, error handling, and performance. Use when working on web pages, components, or web-specific features.
---

# Web Patterns

## App Structure

```
apps/web/src/                    (monorepo)
src/                             (standalone)
├── app/                         # Next.js App Router — THIN WRAPPERS ONLY
│   ├── layout.tsx               # Root layout with <Providers>
│   ├── providers.tsx            # "use client" — QueryClientProvider, ThemeProvider
│   ├── globals.css
│   └── [route]/
│       └── page.tsx             # Thin wrapper: imports from features/
├── features/                    # Feature modules
│   ├── [feature]/
│   │   ├── pages/ (standalone) or directly in feature (monorepo)
│   │   └── components/
│   └── presentation/            # Cross-feature: theme, localization, networking
└── __tests__/
```

---

## Server vs Client Components

- **Server Components** (default): static layouts, metadata, no hooks, no state
- **Client Components** (`"use client"`): hooks, state, event handlers

```typescript
// app/layout.tsx — server component (no directive)
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}

// Feature pages — client component (needs hooks)
"use client";
import { useLogin } from "./useLogin";
```

Keep `"use client"` boundaries as narrow as possible. All `@project/shared` hooks require a `"use client"` boundary.

---

## Providers

```typescript
// providers.tsx
"use client";
import { ThemeProvider } from "@project/shared/theme";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialMode="light">{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
```

---

## Theming

```typescript
import { useTheme } from "@project/shared/theme";

const { theme } = useTheme();
const { colors, spacing, fontSizes, borderRadius } = theme;

<div style={{
  backgroundColor: colors.background,
  color: colors.text,
  padding: spacing.md,
  fontSize: fontSizes.md,
  borderRadius: borderRadius.md,
}} />
```

- Use Tailwind CSS with CSS variables for theme tokens
- Dark mode via Tailwind's `dark:` variant or CSS variables
- Never hardcode color hex values, pixel sizes, or font sizes

---

## Images — next/image

Use `next/image` for ALL images — never raw `<img>` tags.

```typescript
import Image from "next/image";

<Image
  src="/hero.webp"
  alt="Hero banner"
  width={1200}
  height={600}
  priority    // above-the-fold
/>

<Image
  src="/product.webp"
  alt={uiModel.productImageAlt}
  fill          // fills parent container
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

---

## Lazy Loading

```typescript
import dynamic from "next/dynamic";

const HeavyChart = dynamic(() => import("./HeavyChart"), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});
```

---

## Accessibility

- Semantic HTML (`<main>`, `<nav>`, `<section>`, `<header>`, `<footer>`) — never generic `<div>` for landmarks
- All interactive elements: `aria-label` or `<label htmlFor="...">`
- Images: `alt` text. Decorative: `alt=""`
- Form inputs: always paired with `<label>` — never rely on placeholder alone

---

## Error Handling

- **Transient errors**: toast notifications in the hook — never `window.alert()`, never in the page
- **Persistent errors**: surface through UIModel (`uiModel.showErrorBanner`, etc.)
- **Unrecoverable errors**: root layout error boundary. No per-route `error.tsx`

---

## Loading States — Skeleton Screens

Loading states use skeleton screens that reproduce the live UI layout. Driven by `uiModel.isLoading`, rendered inline — not in a separate `loading.tsx`.

```typescript
{uiModel.isLoading ? (
  <div className="animate-pulse space-y-4">
    <div className="h-8 bg-gray-200 rounded w-1/3" />
    <div className="h-4 bg-gray-200 rounded w-2/3" />
    <div className="h-4 bg-gray-200 rounded w-1/2" />
  </div>
) : (
  <div>{uiModel.content}</div>
)}
```

---

## Deployment Config

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["example.com", "cdn.example.com"],
    formats: ["image/webp", "image/avif"],
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
      ],
    }];
  },
};

module.exports = nextConfig;
```

---

## Common Issues

| Issue | Solution |
|-------|---------|
| Hydration mismatch | Use `useEffect` for client-only code; `dynamic` imports with `ssr: false` |
| Large list performance | Virtualization, pagination, `React.memo`, server-side filtering |
| TypeScript build errors | Enable strict mode, fix all type errors before deployment |
| SEO/meta tags not working | Use Next.js `Metadata` API, ensure server-side rendering |

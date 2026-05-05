---
name: data-layer-patterns
description: Data layer implementation patterns including executeRequest networking, React Query repositories, Zustand stores, Zod form validation, and state management. Use when working on API calls, data fetching, state management, or form validation.
---

# Data Layer Patterns

## Networking — executeRequest

All API calls go through `executeRequest<T>()` — never fetch/axios directly in feature files.

```typescript
// features/presentation/networking/executeRequest.ts
export async function executeRequest<T>(config: { path: string; method?: string; body?: unknown }): Promise<{ data: T }> {
  const response = await fetch(`${API_BASE_URL}/${config.path}`, {
    method: config.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: config.body ? JSON.stringify(config.body) : undefined,
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const data = await response.json();
  return { data };
}
```

### Interceptor Chain

Centralized error handling:
1. `refreshTokenOnUnauthorized` — 401: refresh token + retry
2. `handleForbiddenError` — 403: emit `auth:loginRequired`
3. `mapApiError` — maps HTTP codes to `APIError` enum

Auth events via `mitt`: `auth:loginRequired`, `auth:loginSuccess`, `auth:loginFailed`

---

## State Management

| State Type | Tool | Location | Examples |
|-----------|------|----------|---------|
| Server state (async API data) | React Query | `data/repositories/` | Users, products, orders |
| Client state (UI) | Zustand | `data/local/` | Theme, sidebar, modals |
| Local state (component-level) | useState / useReducer | hooks | Input values, toggles |

Never use Zustand for server data. Never use React Query for pure UI state.

---

## React Query Repository Pattern

Each feature has a single repository hook in `data/repositories/`:

```typescript
// features/rewards/data/repositories/useRewardsRepository.ts
export const REWARDS_QUERY_KEY = "rewardsList";

export function useRewardsRepository() {
  const queryClient = useQueryClient();

  const rewardsQuery = useQuery({
    queryKey: [REWARDS_QUERY_KEY],
    queryFn: fetchRewards,
    staleTime: 1000 * 60 * 5,
  });

  const addRewardMutation = useMutation({
    mutationFn: (params: AddRewardRequest) => addReward(params),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [REWARDS_QUERY_KEY] }),
  });

  return { rewardsQuery, addRewardMutation };
}
```

Rules:
- Always invalidate related queries in `onSettled`
- Accept `onSuccess`/`onError` callbacks for UI-level feedback
- Query keys exported as constants (`UPPER_SNAKE_CASE`)

---

## Zustand Store Pattern

```typescript
// features/[feature]/data/local/types.ts
export interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

// features/[feature]/data/local/index.ts
import { createStore } from "zustand";
import type { CartState } from "./types";

export const initializeCartStore = () =>
  createStore<CartState>((set) => ({
    items: [],
    addItem: (item) => set((state) => ({ items: [...state.items, item] })),
    removeItem: (itemId) => set((state) => ({ items: state.items.filter((item) => item.id !== itemId) })),
    clearCart: () => set({ items: [] }),
  }));
```

---

## Form Validation — Zod

Schemas are factory functions accepting a translate argument for localized messages. Schemas live in `presentations/validators/` (monorepo shared) or `presentation/validators/` (standalone).

### Schema factory

```typescript
// features/auth/presentations/validators/loginSchema.ts
import { z } from "zod";

export function createLoginSchema(translate: (key: string) => string) {
  return z.object({
    email: z.string().email({ message: translate("validation.emailInvalid") }),
    password: z.string().min(6, translate("validation.passwordMinLength")),
  });
}

export type LoginForm = z.infer<ReturnType<typeof createLoginSchema>>;
```

### Web instantiation (label constants)

```typescript
import { createLoginSchema } from "@project/shared";
import { authLabels } from "@project/shared/localization";

const schema = createLoginSchema((key) => authLabels.validation[key]);
```

### Mobile instantiation (scopedTranslate)

```typescript
import { createLoginSchema } from "@project/shared";
import { scopedTranslate } from "@project/shared/localization";

const translateAuth = scopedTranslate("auth");
const schema = createLoginSchema(translateAuth);
```

### Standalone instantiation

```typescript
import { authLabels } from "@/features/presentation/localization/labels/auth-labels";

export function createLoginSchema(labels: { emailRequired: string; emailInvalid: string; passwordMin: string }) {
  return z.object({
    email: z.string().min(1, labels.emailRequired).email(labels.emailInvalid),
    password: z.string().min(8, labels.passwordMin),
  });
}

export type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>;
```

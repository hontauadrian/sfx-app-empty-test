---
name: clean-architecture
description: Use when creating a new feature module, organizing layer structure, or setting up barrel exports. Covers domain, data, and presentation layer structure with examples.
---

# Clean Architecture Layers

Dependencies point inwards only: `presentation → data → domain`.

---

## Standalone Next.js — Feature Structure

```
features/[feature]/
├── domain/
│   ├── model/          # Plain TS interfaces — NO framework imports, NO I/O
│   │   └── User.ts
│   └── useCase/        # Thin wrappers delegating to repository hooks
│       └── useGetUserUseCase.ts
├── data/
│   ├── remote/         # API calls via executeRequest (never axios directly)
│   │   └── fetchUser.ts
│   ├── repositories/   # React Query hooks (use[Feature]Repository)
│   │   └── useUserRepository.ts
│   ├── model/          # DTOs matching API shape
│   │   └── UserDataModel.ts
│   ├── mapper/         # DataModel → Domain conversion only
│   │   └── mapToUser.ts
│   └── local/          # Zustand stores (optional, UI state only)
│       ├── index.ts
│       └── types.ts
├── presentation/
│   ├── pages/
│   │   └── [pageName]/ # See page-pattern skill
│   ├── components/
│   │   └── [ComponentName]/
│   └── validators/     # Zod schemas for this feature
│       └── [feature]Schema.ts
├── constants.ts
└── index.ts            # Barrel exports
```

Cross-feature concerns:

```
features/presentation/
├── theme/              # ThemeContext, useTheme, color tokens
├── localization/       # i18n config, label constants
├── components/         # Shared UI components
└── networking/         # executeRequest, interceptors
```

---

## Monorepo — Shared Package Structure

Domain and data layers live in `@project/shared`. Apps own only the presentation layer.

```
packages/shared/src/features/[feature]/
├── domain/
│   ├── model/
│   └── useCase/
├── data/
│   ├── remote/
│   ├── repositories/
│   ├── model/
│   ├── mapper/
│   └── local/
├── presentations/      # Shared base hooks consumed by both apps
│   ├── use[Feature]Form.ts
│   └── validators/
│       └── [feature]Schema.ts
└── index.ts

packages/shared/src/features/presentation/    # Cross-feature concerns
├── theme/
├── localization/
└── components/
```

---

## Domain Layer Examples

```typescript
// features/users/domain/model/User.ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | "moderator";
}
```

```typescript
// features/users/domain/useCase/useGetUserByIdUseCase.ts
import { useUserRepository } from "../../data/repositories/useUserRepository";

export function useGetUserByIdUseCase(userId: string) {
  const { userQuery } = useUserRepository(userId);
  return userQuery;
}
```

Domain rules:
- Must NOT import from data layer or any framework
- Must not perform I/O
- Use cases delegate to repository hooks; thin wrappers only

---

## Data Layer Examples

```typescript
// features/users/data/model/UserDataModel.ts
export interface UserDataModel {
  user_id: string;
  full_name: string;
  email_address: string;
  user_role: string;
}
```

```typescript
// features/users/data/mapper/mapToUser.ts
import type { User } from "../../domain/model/User";
import type { UserDataModel } from "../model/UserDataModel";

export function mapToUser(dataModel: UserDataModel): User {
  return {
    id: dataModel.user_id,
    name: dataModel.full_name,
    email: dataModel.email_address,
    role: dataModel.user_role as User["role"],
  };
}
```

```typescript
// features/users/data/remote/fetchUser.ts
import { executeRequest } from "@/features/presentation/networking/executeRequest";
import type { UserDataModel } from "../model/UserDataModel";
import { mapToUser } from "../mapper/mapToUser";

export async function fetchUserById(userId: string) {
  const response = await executeRequest<UserDataModel>({ path: `api/users/${userId}` });
  return mapToUser(response.data);
}

export async function fetchUsers() {
  const response = await executeRequest<UserDataModel[]>({ path: "api/users" });
  return response.data.map(mapToUser);
}
```

```typescript
// features/users/data/repositories/useUserRepository.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUserById, fetchUsers } from "../remote/fetchUser";

export const USER_QUERY_KEY = "users";

export function useUserRepository(userId?: string) {
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: [USER_QUERY_KEY, userId],
    queryFn: () => fetchUserById(userId!),
    enabled: !!userId,
  });

  const usersQuery = useQuery({
    queryKey: [USER_QUERY_KEY],
    queryFn: fetchUsers,
  });

  return { userQuery, usersQuery };
}
```

Data layer rules:
- Remote functions use `executeRequest` abstraction, never axios/fetch directly
- Mappers convert DataModel → Domain only; never the reverse
- One repository hook per feature
- Query keys exported as constants

---

## Barrel Exports

### Feature barrel (`features/[feature]/index.ts`)

```typescript
export { useGetUserUseCase } from "./domain/useCase/useGetUserUseCase";
export type { User } from "./domain/model/User";
export { createLoginSchema } from "./presentation/validators/loginSchema";
export type { LoginFormData } from "./presentation/validators/loginSchema";
```

**Never** export data-layer internals (remote functions, data models, mappers, repository hooks) directly.

### Monorepo — Root barrel (`src/index.ts`)

```typescript
import { useGetXUseCase } from "@feature/index";
export { useGetXUseCase };
```

Theme, localization, and components accessed via sub-path exports (`@project/shared/theme`, etc.), NOT from root barrel.

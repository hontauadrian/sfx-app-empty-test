# Feature spec — F4 `/admin/company-info` management page

Top-level issue: `sfx-webapp-boilerplate-c33f`. Feature issue: `sfx-webapp-boilerplate-63de`.
Source product-plan: `.overstory/specs/sfx-webapp-boilerplate-c33f.md` (§2 `/admin/company-info surface`, §3 F4, §5 J3 / Sidewide).
F1 spec: `.overstory/specs/sfx-webapp-boilerplate-51de.md` (imports `upsertCompanyInfoSchema`, `CompanyInfo`, `UpsertCompanyInfoInput`).
F2 spec: `.overstory/specs/sfx-webapp-boilerplate-e4c8.md` (consumes `GET` + `PUT /api/v1/company-info`).
F3 spec: `.overstory/specs/sfx-webapp-boilerplate-641b.md` (wraps `AdminRouteGate` from `@/features/admin-shell`).
Mode: direct-builder. Web-only.

F4 is leaf of dependency graph; dispatch blocked on F1 + F2 + F3 close.

---

## 1. Context (files read)

### Networking abstraction (ADR-002)
- `apps/web/src/features/presentation/networking/execute-request.ts` — current shape throws `RequestError { message, status, code? }` from `errorBody.message`. **Gap:** F2's 400 envelope places message at `errorBody.error.message`, per-field array at `errorBody.error.errors`. Current parser drops both. F4 ships envelope-aware patch (T3).
- `apps/web/src/features/presentation/networking/types.ts` — `RequestError` extended.
- `apps/web/src/features/presentation/networking/index.ts` — barrel.
- `apps/web/src/features/presentation/networking/__tests__/execute-request.test.ts` — extension pattern.

### Home feature (template)
- `apps/web/src/features/home/data/remote/fetch-health.ts` — `executeRequest<ApiEnvelope<T>>({path})` → `response.data.data`. F4 mirrors.
- `apps/web/src/features/home/data/repositories/use-health-repository.ts` — `useQuery + select`. F4 adds `useMutation`.
- `apps/web/src/features/home/data/mapper/map-to-health.ts` — DataModel → Domain. F4 maps ISO strings → Date; preserves null on optionals.
- `apps/web/src/features/home/presentation/pages/home/{index,use-home,map-to-home-page-ui-model,types}.ts(x)` — 4-file page template. F4 mirrors. No `useNavigationHandler` (no programmatic nav).
- `apps/web/src/features/home/constants.ts` — `HEALTH_QUERY_KEY = ['health'] as const`. F4 mirrors tuple shape.
- `apps/web/src/features/home/index.ts` — barrel exports page only.

### Auth feature (read-only)
- `apps/web/src/features/auth/data/mapper/map-to-auth-session.ts` — `hasAppAccess = roles.length > 0`.
- `apps/web/src/features/auth/data/repositories/use-auth-session-repository.ts` — F4 may `invalidateQueries({queryKey: AUTH_SESSION_QUERY_KEY})` on 401.
- `apps/web/src/features/auth/index.ts` — F4's wrapper imports `AuthGate`.

### F1 packages
- `packages/validation/src/schemas/company-info.schema.ts` — schema body; F4 resolver imports unchanged.
- `packages/domain/src/index.ts` — `CompanyInfo`, `UpsertCompanyInfoInput`.

### F2 surface (consumed)
- `GET /api/v1/company-info` → `200 { success:true, data: CompanyInfoResponse | null }`; `401`/`403`.
- `PUT /api/v1/company-info` → `200 { success:true, data: CompanyInfoResponse }`; `400 { success:false, error: { statusCode:400, message:'Validation failed', errors:[{field, message}] } }`; `401`; `403`.

### F3 surface (consumed)
- `apps/web/src/features/admin-shell/index.ts` re-exports `AdminRouteGate`. F4 wraps it.

### Form stack
- React Hook Form 7.54.2 + @hookform/resolvers 3.9.1 + zod 3.24.2 + zustand 5.0.3 pinned. NO toast lib (F4 ships in-house tiny module — T2).

### Localization
- `types.ts` — F4 adds `adminCompanyInfo` sub-object next to F3's `nav` + `admin`.
- `en/common.ts` + `ro/common.ts` — TypeScript parity enforced.

### Root composition
- `apps/web/src/app/layout.tsx` — F3 mounts sidebar inside `<Providers>`. F4 adds `<Toaster />` portal sibling.

### Flow file (informational; F4 builder does NOT touch)
- `.overstory/runtime-contract.flows/63de.json` — authored by lead.

---

## 2. Task breakdown

Six task groups. Tests first per group.

### T1 — Translations: extend `CommonTranslations` + EN + RO entries

**Modified files**
- `apps/web/src/features/presentation/localization/types.ts`
- `apps/web/src/features/presentation/localization/languages/en/common.ts`
- `apps/web/src/features/presentation/localization/languages/ro/common.ts`
- `apps/web/src/features/presentation/localization/languages/__tests__/registry.test.ts`

**Test cases**
1. EN: `adminCompanyInfo.{pageTitle, sections.{identity,contact,address,registration}, fields.<name>.{label,placeholder}, validation.<name>, cta.{create,save,saving}, toast.{success,unexpectedError,authError}}` non-empty.
2. RO: same keys non-empty. No diacritics convention.
3. Type parity: existing registry parity test deep-recurses into `adminCompanyInfo`.

**Implementation**
1. Extend `CommonTranslations`:
   ```ts
   readonly adminCompanyInfo: {
     readonly pageTitle: string;
     readonly sections: { identity: string; contact: string; address: string; registration: string };
     readonly fields: Record<UpsertField, { label: string; placeholder: string }>;
     readonly validation: Record<UpsertField, string>;
     readonly cta: { create: string; save: string; saving: string };
     readonly toast: { success: string; unexpectedError: string; authError: string };
   };
   ```
   `UpsertField = 'legalName' | 'tradingName' | 'email' | 'phone' | 'website' | 'addressLine1' | 'addressLine2' | 'city' | 'postalCode' | 'country' | 'taxId' | 'registrationNumber'`.
2. EN: `pageTitle: 'Company Info'`; sections `Identity/Contact/Address/Registration`; `cta: { create: 'Create company info', save: 'Save changes', saving: 'Saving…' }`; `toast: { success: 'Company info saved', unexpectedError: 'We could not save your changes. Try again.', authError: 'Your session expired. Sign in again.' }`.
3. RO mirror.

### T2 — In-house toast (Zustand store + Toaster + useToast)

**Rationale.** No toast lib in deps; CLAUDE.md "no package additions". ~80 LOC in-house module covers requirement.

**New files**
- `apps/web/src/features/presentation/toast/types.ts` — `ToastVariant = 'success' | 'error'`; `Toast { id; variant; message }`; `ToastStore`.
- `apps/web/src/features/presentation/toast/use-toast-store.ts` — Zustand store; auto-dismiss 5000ms inside `pushToast`.
- `apps/web/src/features/presentation/toast/use-toast.ts` — facade `{ success, error, dismiss }`.
- `apps/web/src/features/presentation/toast/Toaster.tsx` — `'use client'` portal-style `aria-live="polite"` region.
- `apps/web/src/features/presentation/toast/index.ts` — barrel.
- `__tests__/{use-toast-store,use-toast,Toaster}.test.{ts,tsx}`

**Modified files**
- `apps/web/src/app/layout.tsx` — mount `<Toaster />` inside `<Providers>`.

**Test cases**
- Store: empty initial; `pushToast` returns id; unique ids; `dismissToast`; `dismissToast('missing')` no-op; `clear()`; auto-dismiss after 5000ms with fake timers; auto-dismiss doesn't remove unrelated toasts.
- Facade: `success/error` push correct variant; `dismiss` calls through.
- Toaster: empty live region renders; toast `<li>` rendered with variant styling; accessible dismiss `<button aria-label>`; `role="status"`, `aria-live="polite"`, `aria-atomic="false"`.

**Notes**
- Auto-dismiss inside store via `setTimeout`; cleared on explicit dismiss.
- Zustand single-field selectors only (CLAUDE.md gotcha — `((state) => state.toasts)` per call).
- Toaster rendered ONCE in layout.

### T3 — `executeRequest` envelope-aware error parsing

**Modified files**
- `apps/web/src/features/presentation/networking/types.ts` — extend `RequestError` with `readonly errors?: ReadonlyArray<{ readonly field: string; readonly message: string }>`.
- `apps/web/src/features/presentation/networking/execute-request.ts` — parse `errorBody.error?.message` BEFORE `errorBody.message`, `errorBody.error?.errors` for field array.
- `__tests__/execute-request.test.ts`

**Test cases**
1. 400 envelope `{ success:false, error:{ statusCode:400, message:'Validation failed', errors:[{field:'legalName',message:'Legal name is required'}] } }` → `RequestError.message === 'Validation failed'`, `status === 400`, `errors[0]` populated.
2. Multi-field 400 → all entries in order.
3. 401 envelope without `errors` → `errors === undefined`; `message === 'Unauthorized'`.
4. 500 empty body → `message === 'Request failed'`, `errors === undefined`, `status === 500`.
5. 200 happy path unchanged.
6. 400 with legacy top-level `message` (no envelope) → still produces `message`; `errors === undefined`.

**Implementation**
```ts
if (!response.ok) {
  const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const envelope = errorBody.error as Record<string, unknown> | undefined;
  const message = (envelope?.message as string | undefined) ?? (errorBody.message as string | undefined) ?? 'Request failed';
  const code = (envelope?.code as string | undefined) ?? (errorBody.code as string | undefined);
  const errors = Array.isArray(envelope?.errors) ? (envelope.errors as Array<{field:string; message:string}>) : undefined;
  const error: RequestError = { message, status: response.status, code, errors };
  throw error;
}
```

**Notes**
- Surgical change. No retry, no logging, no interceptor chain. Existing callers ignore `errors` (TS-optional).

### T4 — Data layer

**New files**
- `apps/web/src/features/company-info/constants.ts` — `COMPANY_INFO_ENDPOINT = 'api/v1/company-info'`; `COMPANY_INFO_QUERY_KEY = ['company-info'] as const`.
- `apps/web/src/features/company-info/data/model/company-info-data-model.ts` — DTO mirroring F2 `data` shape; `createdAt`/`updatedAt: string` (ISO).
- `apps/web/src/features/company-info/data/mapper/map-to-company-info.ts` — `mapToCompanyInfo(data)` (ISO → Date; preserve null); `mapToCompanyInfoOrNull(data | null)`.
- `apps/web/src/features/company-info/data/remote/fetch-company-info.ts` — `executeRequest<ApiEnvelope<CompanyInfoDataModel | null>>({path: COMPANY_INFO_ENDPOINT})` → `response.data.data`.
- `apps/web/src/features/company-info/data/remote/update-company-info.ts` — `executeRequest<ApiEnvelope<CompanyInfoDataModel>>({path, method:'PUT', body: input})` → `response.data.data`.
- `apps/web/src/features/company-info/data/repositories/use-company-info-repository.ts` — `useCompanyInfoRepository(): { companyInfoQuery, upsertMutation }`. Query: keyed `COMPANY_INFO_QUERY_KEY`, `queryFn: fetchCompanyInfo`, `select: mapToCompanyInfoOrNull`, `retry: false`. Mutation: `mutationFn: updateCompanyInfo`, `onSuccess: (dto) => { queryClient.setQueryData(COMPANY_INFO_QUERY_KEY, mapToCompanyInfo(dto)); queryClient.invalidateQueries({queryKey: COMPANY_INFO_QUERY_KEY}); }`.
- `__tests__/` peers for each.

**Test cases**

map-to-company-info:
1. All fields + ISO dates → CompanyInfo with Date instances; deep-equal.
2. All optionals null → CompanyInfo with null preserved (not undefined).
3. `mapToCompanyInfoOrNull(null)` → null.
4. `mapToCompanyInfoOrNull(undefined as any)` → null.

fetch-company-info:
5. `executeRequest` resolves envelope → dto returned.
6. `executeRequest` resolves `{ data: null }` → null.
7. `executeRequest` rejects → propagates.
8. Path: `api/v1/company-info`, method default GET.

update-company-info:
9. Resolves → dto returned.
10. PUT method; path; body verbatim.
11. Rejects 400 with errors → propagates.

use-company-info-repository:
12. Query: dto → `companyInfoQuery.data` deep-equals `mapToCompanyInfo(dto)`.
13. Query: null → `companyInfoQuery.data === null`.
14. Query: reject → `isError === true`.
15. `retry: false` honored.
16. Mutation: `mutateAsync(input)` calls `updateCompanyInfo(input)` once; resolves with mapped.
17. onSuccess writes mapped CompanyInfo into cache (`getQueryData` returns mapped).
18. onSuccess invalidates query.
19. Mutation propagates rejection unchanged.

**Notes**
- Mutation `onSuccess` MUST map DTO via `mapToCompanyInfo` BEFORE `setQueryData` — cache holds domain entity (post-select).
- `setQueryData` + `invalidateQueries` together: immediate render + cross-tab refetch.

### T5 — Presentation (resolver + page hook + mapper + page + types)

**New files**
- `apps/web/src/features/company-info/presentation/validators/upsert-company-info.resolver.ts` — `export const upsertCompanyInfoResolver = zodResolver(upsertCompanyInfoSchema)`. One-line re-export.
- `apps/web/src/features/company-info/presentation/pages/company-info/{types,map-to-company-info-page-ui-model,use-company-info,index}.{ts,tsx}`
- `__tests__/` peers.

**Types** (`types.ts`)
```ts
export type CompanyInfoFormValues = UpsertCompanyInfoInput;
export interface CompanyInfoFieldUIModel {
  readonly name: keyof CompanyInfoFormValues;
  readonly label: string;
  readonly placeholder: string;
  readonly type: 'text' | 'email' | 'url' | 'tel';
  readonly required: boolean;
}
export interface CompanyInfoSectionUIModel {
  readonly key: 'identity' | 'contact' | 'address' | 'registration';
  readonly title: string;
  readonly fields: readonly CompanyInfoFieldUIModel[];
}
export type CompanyInfoPageStatus = 'loading' | 'denied' | 'ready';
export interface CompanyInfoPageUIModel {
  readonly status: CompanyInfoPageStatus;
  readonly title: string;
  readonly sections: readonly CompanyInfoSectionUIModel[];
  readonly submit: { readonly label: string; readonly disabled: boolean; readonly pending: boolean };
  readonly denied: { readonly title: string; readonly message: string; readonly backToHomeLabel: string; readonly backToHomeHref: string };
}
export interface UseCompanyInfoReturn {
  readonly uiModel: CompanyInfoPageUIModel;
  readonly form: UseFormReturn<CompanyInfoFormValues>;
  readonly handleSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
}
```

**Test cases**

upsert-company-info.resolver:
1. Valid input → no errors.
2. Missing `legalName` → `errors.legalName.message` non-empty.
3. Invalid `email` → `errors.email.message` non-empty.
4. Smoke for resolver→RHF shape.

map-to-company-info-page-ui-model:
5. Loading → `status: 'loading'`, placeholder submit.
6. Ready + record → `submit.label === translations.cta.save`.
7. Ready + null record → `submit.label === translations.cta.create`.
8. Ready + pending → `submit.label === translations.cta.saving`, disabled true, pending true.
9. Sections array length 4, keys in order `identity/contact/address/registration`.
10. `identity.fields`: legalName (required), tradingName.
11. `contact.fields`: email (type:'email'), phone ('tel'), website ('url').
12. `address.fields`: addressLine1/addressLine2/city/postalCode/country.
13. `registration.fields`: taxId/registrationNumber.
14. Every field has non-empty label + placeholder from translations.
15. `denied.{title,message,backToHomeLabel}` from F3's `translations.admin.denied.*`.
16. `denied.backToHomeHref === '/'`.

use-company-info:
17. Loading state passthrough.
18. Empty record → `status:'ready'`, `submit.label === create`. Empty defaults.
19. Populated record → `status:'ready'`, `submit.label === save`. `form.reset` called with values.
20. `handleSubmit` calls `form.handleSubmit(onValid)` once; `onValid` calls `mutateAsync(values)`.
21. Mutation success → success toast pushed; `form.reset(saved)` called.
22. Mutation 400 with errors → for each `{field, message}` call `form.setError(field, {type:'server', message})`. NO toast.
23. Mutation 401 → auth toast + `queryClient.invalidateQueries({queryKey: AUTH_SESSION_QUERY_KEY})`.
24. Mutation 403 → auth toast; session NOT invalidated.
25. Mutation 5xx → unexpectedError toast.

CompanyInfoPage:
26. Loading → `<main>` skeleton; no form.
27. Ready empty → form with empty inputs; submit reads 'Create company info'; section `<h2>`s; `<label for>` paired.
28. Ready populated → inputs prefilled (assert via `getByLabelText('Legal name').value`).
29. Submitting → pending: submit shows 'Saving…' + disabled.
30. Validation error → per-field `<p>` with message, `aria-describedby` on input. No success toast.
31. Auth error → no success toast; Toaster contains auth-error copy.
32. A11y: `getByRole('main')`; one `<form>`; every input has label; submit is `<button type="submit">`.
33. Denied state (mocked 403) → renders deny block.

**Implementation**

`upsert-company-info.resolver.ts`:
```ts
import { zodResolver } from '@hookform/resolvers/zod';
import { upsertCompanyInfoSchema } from '@sfx/validation';
export const upsertCompanyInfoResolver = zodResolver(upsertCompanyInfoSchema);
```

`use-company-info.ts`:
```ts
'use client';
export function useCompanyInfo(): UseCompanyInfoReturn {
  const translations = useTranslations('common');
  const { success: pushSuccess, error: pushError } = useToast();
  const queryClient = useQueryClient();
  const { companyInfoQuery, upsertMutation } = useCompanyInfoRepository();
  const form = useForm<CompanyInfoFormValues>({
    resolver: upsertCompanyInfoResolver,
    defaultValues: emptyDefaults(),
  });
  useEffect(() => {
    if (companyInfoQuery.data) form.reset(toFormValues(companyInfoQuery.data));
  }, [companyInfoQuery.data, form]);
  const uiModel = mapToCompanyInfoPageUIModel({
    translations,
    record: companyInfoQuery.data,
    isLoading: companyInfoQuery.isLoading,
    isDenied: extractStatus(companyInfoQuery.error) === 403,
    isPending: upsertMutation.isPending,
  });
  const onValid = useCallback(async (values: CompanyInfoFormValues) => {
    try {
      const saved = await upsertMutation.mutateAsync(valuesForSubmit(values));
      pushSuccess(translations.adminCompanyInfo.toast.success);
      form.reset(toFormValues(saved));
    } catch (caught) {
      const error = caught as RequestError;
      if (error.status === 400 && error.errors) {
        for (const issue of error.errors) form.setError(issue.field as keyof CompanyInfoFormValues, { type: 'server', message: issue.message });
        return;
      }
      if (error.status === 401) {
        await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
        pushError(translations.adminCompanyInfo.toast.authError);
        return;
      }
      if (error.status === 403) { pushError(translations.adminCompanyInfo.toast.authError); return; }
      pushError(translations.adminCompanyInfo.toast.unexpectedError);
    }
  }, [upsertMutation, form, pushSuccess, pushError, queryClient, translations]);
  const handleSubmit = useCallback((event?: BaseSyntheticEvent) => form.handleSubmit(onValid)(event), [form, onValid]);
  return { uiModel, form, handleSubmit };
}
```

`index.tsx`:
```tsx
'use client';
export function CompanyInfoPage() {
  const { uiModel, form, handleSubmit } = useCompanyInfo();
  if (uiModel.status === 'loading') return <CompanyInfoSkeleton />;
  if (uiModel.status === 'denied') return <DeniedSurface uiModel={uiModel.denied} />;
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">{uiModel.title}</h1>
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {uiModel.sections.map((section) => (
          <section key={section.key}>
            <h2 className="mb-4 text-xl font-semibold text-foreground">{section.title}</h2>
            <div className="grid gap-4">
              {section.fields.map((field) => <FormField key={field.name} field={field} form={form} />)}
            </div>
          </section>
        ))}
        <button type="submit" disabled={uiModel.submit.disabled} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {uiModel.submit.label}
        </button>
      </form>
    </main>
  );
}
```

`FormField`: inline `<label>` + `<input>` with `aria-invalid` + `aria-describedby` from `form.formState.errors[field.name]?.message`.

**Notes**
- `emptyDefaults()`: `{ legalName: '', tradingName: null, ... }`. `toFormValues(record)`: strip id/createdAt/updatedAt.
- **`valuesForSubmit(values)` MUST map `'' → null` on optionals BEFORE mutate** — Zod `.strict()` schema rejects `tradingName: ''` with misleading "max 200" error.
- `extractStatus(queryError)`: `(error as RequestError).status`.

### T6 — Thin route wrapper + feature barrel

**New files**
- `apps/web/src/app/admin/company-info/page.tsx`
- `apps/web/src/app/admin/company-info/__tests__/page.test.tsx`
- `apps/web/src/features/company-info/index.ts` — `export { CompanyInfoPage } from './presentation/pages/company-info';`

**Test cases**
1. Renders `<AuthGate><AdminRouteGate><CompanyInfoPage /></AdminRouteGate></AuthGate>`.
2. Zero logic in wrapper.
3. Barrel exposes `CompanyInfoPage`.
4. `pnpm probe:smoke` passes.

**Implementation**
```tsx
// apps/web/src/app/admin/company-info/page.tsx
import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AdminRouteGate } from '@/features/admin-shell';
import { CompanyInfoPage } from '@/features/company-info';

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default function Page(): ReactNode {
  return (
    <AuthGate>
      <AdminRouteGate>
        <CompanyInfoPage />
      </AdminRouteGate>
    </AuthGate>
  );
}
```

Server component composing client components; no `'use client'` at page level.

---

## 3. Acceptance

### Runtime acceptance from product-plan §5

**J2** (admin reaches `/admin/company-info`):
- Mounting `/admin/company-info` issues exactly one `GET /api/v1/company-info` on first render.
- 200 `{data:null}` → empty inputs + 'Create company info' submit label.
- 200 `{data:<record>}` → populated inputs + 'Save changes' label.

**J3** (admin edits + saves — meat of F4):
- Valid submit → ONE `PUT /api/v1/company-info` with form payload (`'' → null` conversion on optionals).
- In-flight → submit disabled + label 'Saving…'.
- 200 → form re-renders with persisted values + success toast in Toaster.
- 400 with `errors[]` → per-field error messages render. No success toast. Submit re-enables.
- 401 → auth-error toast; auth session query invalidated; submit re-enables.
- 403 → auth-error toast; form remains.
- 5xx → unexpected-error toast.

**J4** (non-admin direct URL) — F4 slice:
- AdminRouteGate denies before page mounts.
- If gate fails open + page mounts for non-admin, F4's 403 branch renders deny block.

**J5** (unauth direct URL) — F4 slice:
- AuthGate unauth surface; no `GET` issued; no form mounted.

### Sidewide
- Backend endpoints under `/api/v1/company-info` return per F2 spec.
- `pnpm probe:smoke` passes.

### Close-gate
From worktree root: `pnpm typecheck && pnpm lint && pnpm --filter @sfx/web test:coverage && pnpm probe:smoke`. `worker_done` mail MUST include `## runtime-evidence` JSON summary.

---

## 4. Guard contract

| Surface | Type | Unauth | Authed non-admin | Authed admin |
|---|---|---|---|---|
| `/admin/company-info` | authenticated + role `admin` | AuthGate unauth surface. Sidebar hidden. No GET issued. | AuthGate passes → AdminRouteGate denies → deny surface (F3-owned UI). Sidebar (Home only). | AuthGate passes → AdminRouteGate allows → CompanyInfoPage renders. GET fires. Sidebar (Home + Admin). |
| `GET /api/v1/company-info` (consumed) | F2-owned | 401 | 403 | 200 `{data: CompanyInfo \| null}` |
| `PUT /api/v1/company-info` (consumed) | F2-owned | 401 | 403 | 200/400/401/403 (envelope per F2) |

Auth boundary mechanics:
- AuthGate gates on `session.hasAppAccess`.
- AdminRouteGate (F3) gates on `session.roles.includes(AUTH_ROLE_ADMIN)`.
- Form mutation handler treats 401/403 defensively.

### Contract annotations
- `apps/web/src/app/admin/company-info/page.tsx` — `@routeGuard authenticated` + `@unauthRedirect /login` JSDoc.
- `apps/web/src/features/company-info/presentation/pages/company-info/index.tsx` — `'use client'`; `<main>/<form>/<h2>` landmarks.
- `apps/web/src/features/presentation/networking/types.ts` — extended `RequestError`.
- `apps/web/src/features/presentation/localization/types.ts` + EN/RO — `adminCompanyInfo` keyset.
- F4 does NOT edit: `.runtime-contract.overlay.json`, `.runtime-contract.logical.json`, `.overstory/runtime-contract.flows/**`, `flows.config.json`, `tsconfig*.json`, `next.config.js`, `tailwind.config.*`, `globals.css`, `colors.ts`.

---

## 5. Out of scope

- **No api changes.** F2 owns backend.
- **No Prisma changes.** F2 owns schema.
- **No F1 changes.** Consume packages; NEVER redeclare fields.
- **No F3 changes.** Consume `AdminRouteGate` only.
- **No toast library addition.** In-house module (T2).
- **No new providers.** Zustand only.
- **No `/login` / `/register` surfaces.** AuthGate is the canonical pattern.
- **No removal of Keycloak / oauth2-proxy / OAUTH_*.**
- **No edits to `apps/web/src/features/auth/`** beyond reading constants.
- **No edits to `.overstory/runtime-contract.flows/`** (hook-blocked).
- **No edits to `.runtime-contract.overlay.json` or `.runtime-contract.logical.json`.**
- **No package additions or version bumps.**
- **No new color tokens.** Use existing.
- **No `router.push()` from hooks** (ADR-004). Deny uses `<a href="/">`.
- **No `useToast()` consumers outside F4 + layout's Toaster.**
- **No DOM-level role bypass** (no disabled-but-visible Save for non-admins).
- **No `as any`/`@ts-ignore`/`@ts-expect-error`** in source. Test-only `as any` for `UseQueryResult` mocks allowed (existing pattern).
- **No middleware** (CVE-2025-29927).

---

## 6. Dependencies + handoff

**Depends on:**
- F1 merged. Imports `upsertCompanyInfoSchema`, `UpsertCompanyInfoInput`, `CompanyInfo`.
- F2 merged. Consumes endpoints.
- F3 merged. Wraps `AdminRouteGate`.

**Unblocks:** nothing (leaf).

**Builder handoff:**
- Capability: `builder` direct, one slot.
- File scope:
  - `apps/web/src/features/company-info/**`
  - `apps/web/src/features/presentation/toast/**`
  - `apps/web/src/features/presentation/networking/{types.ts,execute-request.ts,__tests__/execute-request.test.ts,index.ts}`
  - `apps/web/src/features/presentation/localization/{types.ts,languages/en/common.ts,languages/ro/common.ts,languages/__tests__/registry.test.ts}`
  - `apps/web/src/app/admin/company-info/**`
  - `apps/web/src/app/layout.tsx` (mount Toaster)
- Close-gate from worktree root: `pnpm typecheck && pnpm lint && pnpm --filter @sfx/web test:coverage && pnpm probe:smoke`.
- WORKER_DONE: `## runtime-evidence` block with probe JSON summary.

---

## 7. Notable findings

- **foundational** — `executeRequest` currently drops F2's nested error envelope. T3 patch surfaces `error.message` + `error.errors[]`. Any future controller using `BadRequestException({message, errors})` hits the same gap without this patch.
- **foundational** — No toast library in deps. In-house Zustand-backed `useToast` + `<Toaster />` (~80 LOC) satisfies dispatch's success/error toast requirements without lockfile bump.
- **foundational** — RHF resolver receives SAME `upsertCompanyInfoSchema` as F2 backend pipe. Never redeclare field constraints. Resolver is one-line re-export.
- **foundational** — HTML inputs emit `''` for empty text; `@sfx/validation` `.strict()` schema rejects `tradingName: ''` (vs `null`). `valuesForSubmit()` maps `''` → `null` on optionals BEFORE mutate.
- **foundational** — TanStack `invalidateQueries` uses prefix matching. `COMPANY_INFO_QUERY_KEY = ['company-info'] as const` (tuple, never string). `AUTH_SESSION_QUERY_KEY = ['auth','session'] as const`.
- **tactical** — Mutation `onSuccess` MUST map DTO via `mapToCompanyInfo` BEFORE `setQueryData`. Cache holds domain entity (post-select).
- **tactical** — AdminRouteGate (F3) AND F4 page's own 403 branch BOTH render deny. Double-defense intentional for stale-role mid-session.
- **tactical** — `setQueryData` + `invalidateQueries` together: immediate render + cross-tab consistency.
- **tactical** — Zustand single-field selectors only. `useToastStore((state) => state.toasts)` per call. Never compound object selectors.
- **tactical** — Auto-dismiss timeout (5000ms) lives INSIDE store, not component. `vi.useFakeTimers()` for tests.
- **tactical** — RO copy follows no-diacritics convention (per F3 finding).
- **tactical** — `'use client'` boundary: CompanyInfoPage, useCompanyInfo, Toaster, use-toast, use-toast-store. Route wrapper is server component.
- **observational** — `useTranslations('common')` read in page hook; mapper pure, receives `translations` as input.
- **observational** — `companyInfoResponseSchema` parses `z.date()`; frontend NEVER calls `.parse` on wire payload — mapper is canonical conversion.
- **observational** — No `useNavigationHandler` needed (no programmatic nav).
- **observational** — Skeleton convention `animate-pulse rounded-lg bg-muted` (AuthGate).
- **observational** — Toaster portal `fixed bottom-4 right-4 z-50`.

End of spec.

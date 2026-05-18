# F2: Expand frontend Company Info form (sections + repeatable lists)

**Task:** `sfx-webapp-boilerplate-30fe` (parent F2 feature)
**Builder sub-task:** assigned via `ov sling`
**Top-level plan:** `.overstory/specs/sfx-webapp-boilerplate-26a0.md` §3 Chunk A frontend slice + §5 J1
**Branch base:** dev (latest commit `28ef477`)
**Worktree:** `/workspace/.overstory/worktrees/lead-f2-form` (you will receive your own sub-worktree)

---

## 1. Outcome (user-visible)

Authenticated admin on `/admin/company-info` sees the existing form re-organized into **four labeled fieldsets**:

1. **Legal & Registration** — `legalName` (required), `tradingName`, `taxId`, `registrationNumber`
2. **Identity** — `companyName`, `industry`, `foundedYear` (numeric), `teamSize` (numeric)
3. **Key Facts** — `missionStatement` (textarea), `visionStatement` (textarea), `coreValues` (repeatable string list), `certifications` (repeatable string list)
4. **Contact** — `email`, `phone`, `website`, `addressLine1`, `addressLine2`, `city`, `postalCode`, `country`

Each fieldset is a real `<fieldset>` element with a `<legend>` (a11y semantics).

User can:
- Edit any scalar — saved by `PUT /api/v1/company-info`, persisted across hard refresh.
- Click **Add core value** / **Add certification** → new empty row appears at end of the list.
- Click **Remove** on any row → row is removed.
- Type a digit string into `foundedYear` / `teamSize` → coerced to `number | null` on submit.
- Submit with invalid input → Zod resolver fires client-side error before network call.

---

## 2. Existing state (verified by lead)

**F1 backend already merged on `dev` (commit `1a94dec`, recovered as `7645a96`).** This means the Zod schema, NestJS DTO, Prisma columns, and domain entity already carry the new fields. Builder does NOT need to touch backend or shared packages.

**Already correct (do NOT modify):**
- `packages/domain/src/entities/company-info.ts` — `CompanyInfo` + `UpsertCompanyInfoInput` include all 8 new fields (`companyName`, `foundedYear`, `teamSize`, `industry`, `missionStatement`, `visionStatement`, `coreValues: readonly string[]`, `certifications: readonly string[]`).
- `packages/validation/src/schemas/company-info.schema.ts` — `upsertCompanyInfoSchema` mirrors the entity, with bounds: `foundedYear` int 1800..2027, `teamSize` int 0..1_000_000, string scalars ≤200/120/4000 chars, arrays ≤32 items each ≤200 chars.
- `apps/web/src/features/company-info/data/model/company-info-data-model.ts` — data model already includes all new fields.
- `apps/web/src/features/company-info/data/mapper/map-to-company-info.ts` — maps all new fields.
- `apps/api/**` — already exposes the expanded fields on GET/PUT.
- `apps/web/src/features/company-info/presentation/validators/upsert-company-info.resolver.ts` — already wraps the shared schema; do NOT change.

**Builder owns / must change:**

| File | Change |
|---|---|
| `apps/web/src/features/presentation/localization/types.ts` | Extend `CompanyInfoUpsertField` with the 8 new field names. Replace `AdminCompanyInfoSectionsTranslations` keys (`identity`/`contact`/`address`/`registration`) with the new four (`legalRegistration`/`identity`/`keyFacts`/`contact`). Extend `AdminCompanyInfoCtaTranslations` with array-list CTAs. |
| `apps/web/src/features/presentation/localization/languages/en/common.ts` | Replace `sections` + extend `fields` + extend `validation` + extend `cta` with new entries. |
| `apps/web/src/features/presentation/localization/languages/ro/common.ts` | Same for Romanian. |
| `apps/web/src/features/company-info/presentation/pages/company-info/types.ts` | Extend `CompanyInfoFormValues` with the 8 new fields (matching `UpsertCompanyInfoInput` shape: scalars `string \| null` or `number \| null`, arrays `string[]`). Add `'number' \| 'textarea' \| 'array'` to `CompanyInfoFieldInputType`. Replace `CompanyInfoSectionKey` with the new four. Add field names to `CompanyInfoFieldName`. |
| `apps/web/src/features/company-info/presentation/pages/company-info/map-to-company-info-page-ui-model.ts` | Replace `SECTION_SPECS` with the new four sections in the order above. |
| `apps/web/src/features/company-info/presentation/pages/company-info/use-company-info.ts` | Extend `emptyDefaults()`, `toFormValues(record)`, `valuesForSubmit(values)`, `COMPANY_INFO_FIELD_NAMES`. Numeric coercion via `setValueAs` when registering. Submit normalization: trim strings to `null` on empty; drop empty entries from arrays; coerce numerics. |
| `apps/web/src/features/company-info/presentation/pages/company-info/index.tsx` | Render each section as `<fieldset>` + `<legend>`. Add `NumericField`, `TextareaField`, `ArrayField` sub-components. ArrayField: header label + list of `<input>` rows each with a per-row Remove button + an Add button at the bottom. Array control wired via `form.watch` + `form.setValue` (no `useFieldArray` because the Zod schema validates flat `string[]`). |
| `apps/web/src/features/company-info/presentation/pages/company-info/__tests__/*.tsx` | Update existing tests for new sections + add tests for numeric coercion, textarea rendering, array add/remove, array per-item error, max-length per-item error. |
| `apps/web/src/features/company-info/__integration__/company-info.integration-test.tsx` | Add one round-trip test that submits a payload with `coreValues: ['a','b']` + `foundedYear: 1998` and asserts the PUT body matches + the form reflects the persisted values. |

---

## 3. Section layout — authoritative

```ts
// In SECTION_SPECS
{
  key: 'legalRegistration',
  titleSelector: (t) => t.adminCompanyInfo.sections.legalRegistration,
  fields: [
    { name: 'legalName',          type: 'text',     required: true },
    { name: 'tradingName',        type: 'text',     required: false },
    { name: 'taxId',              type: 'text',     required: false },
    { name: 'registrationNumber', type: 'text',     required: false },
  ],
},
{
  key: 'identity',
  titleSelector: (t) => t.adminCompanyInfo.sections.identity,
  fields: [
    { name: 'companyName',  type: 'text',   required: false },
    { name: 'industry',     type: 'text',   required: false },
    { name: 'foundedYear',  type: 'number', required: false },
    { name: 'teamSize',     type: 'number', required: false },
  ],
},
{
  key: 'keyFacts',
  titleSelector: (t) => t.adminCompanyInfo.sections.keyFacts,
  fields: [
    { name: 'missionStatement', type: 'textarea', required: false },
    { name: 'visionStatement',  type: 'textarea', required: false },
    { name: 'coreValues',       type: 'array',    required: false },
    { name: 'certifications',   type: 'array',    required: false },
  ],
},
{
  key: 'contact',
  titleSelector: (t) => t.adminCompanyInfo.sections.contact,
  fields: [
    { name: 'email',        type: 'email', required: false },
    { name: 'phone',        type: 'tel',   required: false },
    { name: 'website',      type: 'url',   required: false },
    { name: 'addressLine1', type: 'text',  required: false },
    { name: 'addressLine2', type: 'text',  required: false },
    { name: 'city',         type: 'text',  required: false },
    { name: 'postalCode',   type: 'text',  required: false },
    { name: 'country',      type: 'text',  required: false },
  ],
},
```

---

## 4. Field-level behavior

### Scalar text / email / url / tel
Existing wiring is correct. Re-use the existing `setValueAs` (`'' → null` except `legalName`).

### Numeric (`foundedYear`, `teamSize`)
```ts
form.register('foundedYear', {
  setValueAs: (raw: unknown): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
})
```
HTML attributes: `type="number" inputMode="numeric" min={…} max={…} step="1"`. Bounds in attrs match the Zod bounds verbatim (1800/2027, 0/1_000_000).

### Textarea (`missionStatement`, `visionStatement`)
Use `<textarea>` with `rows={4}`. Same `setValueAs` as the scalar text path (`'' → null`). `maxLength={4000}` attr.

### Array (`coreValues`, `certifications`)
- Form state stores `string[]` (matches Zod). Initial state is `[]` when no record, otherwise the array from the record.
- Render via `form.watch('coreValues')`.
- Each row: `<input>` registered as `coreValues.${index}` with `setValueAs: (v) => (typeof v === 'string' ? v : '')` (keeps empty strings; submit normalization strips them).
- Add row: `form.setValue('coreValues', [...current, ''], { shouldDirty: true })`.
- Remove row: `form.setValue('coreValues', current.filter((_, i) => i !== index), { shouldDirty: true, shouldValidate: true })`.
- Per-row remove `<button>` carries `aria-label="Remove core value 1"` (1-indexed for human readability) using the translation `removeCoreValue`.
- Add `<button>` text is `addCoreValue` translation, full-width below the list.
- Per-row error: read from `form.formState.errors.coreValues?.[index]?.message`. Render with `role="alert"`.
- Top-level array error (e.g. ≤32 cap): `form.formState.errors.coreValues?.message` rendered once above the list.

### Submit normalization (`valuesForSubmit`)
```ts
return {
  legalName: values.legalName,
  // existing scalars normalize string→null on empty/whitespace
  // …
  // new scalars: same string→null treatment
  companyName: normalize(values.companyName),
  industry: normalize(values.industry),
  missionStatement: normalize(values.missionStatement),
  visionStatement: normalize(values.visionStatement),
  // new numerics: already coerced by setValueAs, but defensively coerce
  foundedYear: typeof values.foundedYear === 'number' ? values.foundedYear : null,
  teamSize:    typeof values.teamSize    === 'number' ? values.teamSize    : null,
  // arrays: trim each, drop empty entries; omit when omitted to preserve PUT-merge semantics? 
  //   The shared schema accepts undefined OR string[]. Sending [] = explicit clear.
  //   For UI: always send the (cleaned) array — user mutations are explicit.
  coreValues:    (values.coreValues ?? []).map((v) => v.trim()).filter((v) => v.length > 0),
  certifications:(values.certifications ?? []).map((v) => v.trim()).filter((v) => v.length > 0),
};
```

### Round-trip from server (`toFormValues`)
Map record arrays through `[...record.coreValues]` (clone the `readonly string[]` so RHF doesn't choke on readonly). Scalars pass through unchanged.

### Reset signature
The existing `lastResetSignatureRef` uses `id::updatedAt` — keep as-is. Arrays do not affect the signature (server bumps `updatedAt` on every PUT).

---

## 5. Translations — keys to add (EN)

```ts
sections: {
  legalRegistration: 'Legal & Registration',
  identity: 'Identity',
  keyFacts: 'Key Facts',
  contact: 'Contact',
},
fields: {
  // existing 12 keep their copy
  companyName:       { label: 'Company name',       placeholder: 'Acme' },
  foundedYear:       { label: 'Founded year',       placeholder: '1998' },
  teamSize:          { label: 'Team size',          placeholder: '42' },
  industry:          { label: 'Industry',           placeholder: 'Manufacturing' },
  missionStatement:  { label: 'Mission statement',  placeholder: 'We exist to…' },
  visionStatement:   { label: 'Vision statement',   placeholder: 'A world where…' },
  coreValues:        { label: 'Core values',        placeholder: 'Integrity' },
  certifications:    { label: 'Certifications',     placeholder: 'ISO 9001' },
},
validation: {
  // existing 12 keep their copy
  companyName:      'Company name must be 200 characters or fewer',
  foundedYear:      'Founded year must be between 1800 and 2027',
  teamSize:         'Team size must be 0 or greater',
  industry:         'Industry must be 120 characters or fewer',
  missionStatement: 'Mission statement must be 4000 characters or fewer',
  visionStatement:  'Vision statement must be 4000 characters or fewer',
  coreValues:       'Each core value must be 200 characters or fewer',
  certifications:   'Each certification must be 200 characters or fewer',
},
cta: {
  create: 'Create company info',
  save: 'Save changes',
  saving: 'Saving...',
  addCoreValue: 'Add core value',
  addCertification: 'Add certification',
  removeCoreValue: 'Remove core value',
  removeCertification: 'Remove certification',
},
```

Romanian translations: mirror keys, idiomatic Romanian. Examples:
- `legalRegistration: 'Juridic & Inregistrare'`
- `keyFacts: 'Repere cheie'`
- `companyName: { label: 'Nume companie', placeholder: 'Acme' }`
- `foundedYear: { label: 'Anul infiintarii', placeholder: '1998' }`
- `teamSize: { label: 'Dimensiune echipa', placeholder: '42' }`
- `industry: { label: 'Industrie', placeholder: 'Productie' }`
- `missionStatement: { label: 'Declaratie de misiune', placeholder: 'Existam pentru…' }`
- `visionStatement: { label: 'Declaratie de viziune', placeholder: 'O lume in care…' }`
- `coreValues: { label: 'Valori fundamentale', placeholder: 'Integritate' }`
- `certifications: { label: 'Certificari', placeholder: 'ISO 9001' }`
- `addCoreValue: 'Adauga valoare'`, `removeCoreValue: 'Sterge valoare'`
- `addCertification: 'Adauga certificare'`, `removeCertification: 'Sterge certificare'`
- Validation messages: literal Romanian translations of EN messages.

---

## 6. Test plan (mandatory — Stop hook enforces co-located tests + 90% coverage)

Existing test files MUST be updated to keep passing; new files are NOT required (the changes fit in existing test files).

### `__tests__/CompanyInfoPage.test.tsx`
- Replace section-headings test to assert four headings: `Legal & Registration`, `Identity`, `Key Facts`, `Contact`.
- Add: renders `<fieldset>` with `<legend>` for each section (use `screen.getAllByRole('group')` — fieldset has implicit `group` role).
- Add: renders numeric input for `foundedYear` with `type="number"` and `min="1800"` / `max="2027"`.
- Add: renders textarea for `missionStatement`.
- Add: renders Add buttons for core values + certifications. Click → array row count increases.
- Add: renders Remove button per row. Click → row removed.
- Update `emptyDefaults()` in the test harness to include new fields (scalars `null`, numerics `null`, arrays `[]`).

### `__tests__/use-company-info.test.tsx`
- Extend `record()` factory's defaults to include new fields (already does — leaves them at the existing `null`/`[]` defaults).
- Update the `mutateAsync` happy-path expected payload to include the 8 new fields (scalars `null`, arrays `[]`).
- Add: submit with `coreValues: ['Integrity', 'Craft', '']` → trimmed + empty dropped → `['Integrity', 'Craft']` in mutateAsync call.
- Add: submit with `foundedYear` set via `form.setValue('foundedYear', 1998)` → mutateAsync called with `foundedYear: 1998`.

### `__tests__/map-to-company-info-page-ui-model.test.ts`
- Replace the `legacy section keys` assertions (`identity/contact/address/registration`) with `legalRegistration/identity/keyFacts/contact`.
- Update field-per-section assertions:
  - `legalRegistration` → `['legalName','tradingName','taxId','registrationNumber']` (only legalName required)
  - `identity` → `['companyName','industry','foundedYear','teamSize']`
  - `keyFacts` → `['missionStatement','visionStatement','coreValues','certifications']`
  - `contact` → `['email','phone','website','addressLine1','addressLine2','city','postalCode','country']` (types: email/tel/url then 5×text)

### `__integration__/company-info.integration-test.tsx`
- Update existing `dto()` factory to include the 8 new fields (default to `null` / `[]`).
- Update the existing round-trip test's expected MSW request body / form state if anything diverges.
- Add ONE new test: PUT with `coreValues: ['Integrity','Craft']`, `foundedYear: 1998`, `missionStatement: 'Build great things'` → assert request body contains those values + form post-success reflects them.

### `presentation/validators/__tests__/upsert-company-info.resolver.test.ts`
- Already passes (resolver is unchanged). Add ONE smoke test that the resolver accepts a full payload with all 8 new fields.

---

## 7. Out of scope
- Backend changes (F1 already merged).
- Version history routes (F5).
- Admin tab shell (F3 already merged).
- Any change to `@sfx/domain`, `@sfx/validation`, `@sfx/database`, `apps/api`.
- Any change to the existing resolver wrapper (`upsert-company-info.resolver.ts`).
- Any new endpoints — F2 flow file (`.overstory/runtime-contract.flows/sfx-webapp-boilerplate-30fe.json`) stays as the existing placeholder; do NOT modify.

---

## 8. Acceptance gates (must all pass before `worker_done`)

1. `pnpm typecheck` — zero errors.
2. `pnpm lint` — zero errors.
3. `pnpm test:coverage` — all tests pass, 90%+ coverage on every touched file.
4. `pnpm test:integration` — passes (includes the new MSW round-trip).
5. `pnpm probe:smoke` — passes. (No new endpoints; the existing GET/PUT flows already cover the surface. If the probe reports `FLOW_NEW_ENDPOINT_UNCOVERED`, you have inadvertently changed something outside scope — revert and ask.)
6. `qa-test` skill — invoke in `full` mode and verify all four sections render, array add/remove behave, numeric inputs reject letters client-side, save → toast.
7. Commit on the worker branch with a conventional `feat(web): expand company-info form with sections + repeatable lists` message.
8. `worker_done` mail to lead-f2-form with `## runtime-evidence` + `## qa-test-evidence` blocks per CLAUDE.md.

---

## 9. Reference

- Top-level plan: `.overstory/specs/sfx-webapp-boilerplate-26a0.md`
- F1 backend spec: `.overstory/specs/sfx-webapp-boilerplate-8907.md`
- F3 spec (routing/layout context): `.overstory/specs/sfx-webapp-boilerplate-1c10.md`
- Shared schema source of truth: `packages/validation/src/schemas/company-info.schema.ts`
- Shared entity: `packages/domain/src/entities/company-info.ts`

# Forms

## Status: stubbed

Form-flow generation is **not currently wired up** in this codebase.
The probe's `detectors/forms.js` finds form markers (`<form>`,
`<Form>`, `useForm()`, `use:enhance`, `@submit`) and records them in
the matrix as stub entries:

```js
{
  file: 'apps/web/src/features/login/components/login-form.tsx',
  submitsTo: null,
  fields: [],
  onSuccessNavigate: null,
  changed: false,
}
```

There is **no consuming emitter** yet — no `form:*` flows are
generated from these records. Until an emitter is added, no form
submission flows run.

## Why this sub-skill exists

A previous version of the detector extracted submit URLs, field names,
and on-success navigation targets via three regex passes:

1. `(fetch|executeRequest)\s*\(\s*['"\`]([^'"\`]+)` — submit URL.
2. `(name=|register\(|control\.register\()['"\`]([\w-]+)` — field
   names.
3. `(router\.push|navigate|redirect)\s*\(\s*['"\`]([^'"\`]+)` —
   on-success navigation.

All three were forbidden source-code heuristics: they matched
unrelated `fetch()` calls in form files, treated `name="csrf"` as a
user input, and picked up `router.push('/login')` from logout
handlers as the form's destination. They were removed in commit
`8c5fddd` along with the field/path-regex pruning across the probe.

The detector emits a single info-level diagnostic
(`FORM_TARGET_UNDECLARED: ${forms.length} form(s) detected …`)
listing the count of detected forms. The message text suggests a
`packages/validation/**/*.form.schema.ts` declaration pattern — that
pattern is **forward-looking, not landed**. There is no current
overlay key, comment annotation, or schema-export convention the
probe consumes. Treat the DIAG as informational only.

## What to do today

If your feature includes a form, do not rely on the probe to exercise
it via a `form:*` flow. Instead, ensure the **submit endpoint** is
covered by the API-side flows the probe already generates from
NestJS controllers (rules 1-5 in `flows-generator.js`). Those flows
exercise the same backend code path the form would call.

When the form-flow emitter ships, this doc will be rewritten with
the actual declaration pattern. Until then, leave forms unannotated
and rely on endpoint-level coverage.

## Source of truth the probe scans (current)

- `matrix.forms[]`: file path + `changed` flag only. All other fields
  are `null`/`[]` and there is no consumer.

If you propose adding a form-flow emitter, the new emitter and its
declaration pattern must land together with this doc rewritten — no
aspirational wiring instructions belong here in the meantime.

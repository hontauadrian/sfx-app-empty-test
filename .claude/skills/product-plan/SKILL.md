---
name: product-plan
description: Use BEFORE any sd create or ov sling. Turns the brief into a product plan with user journeys, app shell spec, and chunk decomposition. The overstory coordinator invokes this once per new top-level objective.
---

# Product Plan

## Overview

Turn the brief into a plan that guarantees a USABLE app. Close the gap between entities/endpoints/URLs and how a real user gets from "just logged in" to "created their first thing". Divide work into chunks one lead can own each.

**Announce:** "I'm using the product-plan skill."

**Save to:** `.overstory/specs/<TOP_LEVEL_ISSUE_ID>.md` — the path leads read via `--spec`.

## When

On a new top-level objective, BEFORE `sd create` for sub-issues, BEFORE `ov sling`, BEFORE dispatch mail.

## Anti-goals

- Decomposing by technical layer (domain → db → backend → frontend). FORBIDDEN.
- Omitting the app shell / global nav from the plan.
- Leaving "create X" flows unspecified (no entry point named for any primary entity).
- Writing chunks that cut across layers for the same feature (e.g. chunk "backend" + chunk "frontend"). Every chunk is a vertical grouping.
- Placeholders: "TBD", "standard CRUD", "similar to previous".
- Inventing a new authentication model. If the brief does not explicitly request
  auth replacement, preserve the existing scaffold's auth provider, login
  surface, session shape, middleware/proxy, and environment model. In the SFX
  boilerplate this means Keycloak + oauth2-proxy + RS256/JWKS remain the default.
  Do not add `/login`, `/register`, email+password auth, local HS256 JWT cookies,
  or remove `OAUTH_*`/Keycloak/oauth2-proxy unless the operator explicitly asks
  for that replacement.
- Carving a chunk so that one chunk's parent module is later marked
  "do not modify" while a downstream chunk introduces children nested under
  that parent. When chunk B's children attach under chunk A's parent path
  (e.g. chunk A delivers `/api/v1/brands`, chunk B delivers
  `/api/v1/brands/:brandId/...`), state explicitly in chunk A's notes that
  chunk A's parent CREATE handler may need additive `@ResourceCaptures`
  tuples added by chunk B's builders. Do NOT lock the parent module behind a
  blanket "do not modify" wall. Without this, builders in chunk B hit
  `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` and have no legal path to fix it.
  Canonical convention: mulch `mx-3bf156`.

## Required sections

### 1. Primary user journeys

3–7 end-to-end flows. Each journey:
- Entry point (URL or state)
- Action sequence (click X → navigates to Y → fills form → submits → sees Z)
- Exit state

### 2. App shell

Concrete, not abstract:
- Global nav items (sidebar / top bar), exact labels, exact URLs
- Empty-state CTA for each landing page (e.g. "Dashboard with 0 teams → button `[+ Create team]` → `/teams/new`")
- Where every primary "Create <Entity>" affordance lives
- User menu / profile / logout, using the existing auth provider. If the scaffold
  already supplies auth (for example Keycloak/oauth2-proxy), treat the user as an
  already-authenticated actor and do not design a replacement login/register flow
  unless explicitly requested.

### 3. Chunk decomposition (the hand-off to leads)

A chunk = a group of related features one lead can own end-to-end. Typical size: 2–5 features per chunk. Order chunks by dependency.

Per chunk:
- **Chunk name** (user-capability-oriented, e.g. "Auth + App shell", "Team management", "Project kanban", NOT "Backend API")
- **Features within** (bullet list — leads will decompose further; don't go deeper here)
- **Domain entities touched**
- **App-shell entries this chunk registers** (nav items, CTAs)
- **"User can ..." demo state at chunk end**
- **Suggested lead capability** (default `lead`)

**Forbidden chunk names:** anything describing a layer ("Domain entities", "Backend modules", "Frontend pages").

### 4. Dispatch plan (slot-aware)

Read `maxConcurrent` from `.overstory/config.yaml`.

**Leads mode (≥4 available slots):** one lead per chunk from §3, dispatched sequentially. Each lead uses the `feature-plan` skill to break their chunk into features.

**Direct-builder mode (≤3 available slots):** coordinator acts as lead; rewrite §3 as flat features (not chunks). Immediately after this plan is written, invoke the `feature-plan` skill — it handles per-feature scout prompts and the scout→builder dispatch sequence for you. The coordinator still cannot Write feature specs directly; scouts produce them.

State the chosen branch + slot math.

### 5. Runtime acceptance criteria

For each journey in §1, write behavioral acceptance statements. DO NOT hardcode
URLs, ports, or implementation details — describe user-visible behavior.

Format: `<actor> <action> <observable outcome>`

Examples (generic — no project-specific names):

- An unauthenticated visitor hitting a protected page is redirected to the
  existing login surface.
- A logged-in user who refreshes any page remains logged in.
- Every CTA named in §2 (app shell) leads somewhere that renders without a
  runtime error.

Only include registration/password acceptance statements when the operator
explicitly requested local account management. Otherwise, keep auth acceptance
provider-neutral and aligned with the existing scaffold.

Each journey must have at least one acceptance statement per boundary crossing
(client → server, server → database, server → response, response → UI).

These statements feed the `derive-test-matrix` generator; the probe translates
them into concrete HTTP assertions automatically.

## Self-review

After drafting, check:
1. Every entity in the brief appears in ≥1 chunk.
2. Every "Create X" button in §2 lives on a page that appears in ≥1 chunk's features.
3. From `/dashboard` (post-login, zero data) a user can reach every chunk's capabilities via nav or CTA without typing a URL.
4. No TBD / "similar to" / "standard CRUD".
5. No chunk named after a layer.
6. Every journey in §1 has ≥1 acceptance statement in §5.
7. Every page / nav item in §2 has an implied acceptance statement in §5.
8. Every auth boundary is named in §5 (protected → unauth behavior; public → access).
9. If the brief did not explicitly request auth replacement, the plan preserves
   the existing auth provider and contains no invented email/password,
   `/login`, `/register`, local JWT-cookie, or auth-stack-removal work.

Fix inline. Don't re-review.

## Handoff

### Leads mode

1. `sd create` the top-level issue (if not already) and one sub-issue per chunk in §3.
2. Rename/move the plan to `.overstory/specs/<top-level-issue-id>.md` if written before the id existed.
3. For each chunk sub-issue: `ov sling --capability lead --task <chunk-id> --spec .overstory/specs/<top-level-issue-id>.md`.
4. Continue normal coordinator workflow (monitor, merge-verify, close).

### Direct-builder mode

1. Ensure the top-level issue exists in {{TRACKER_NAME}} (create if needed).
2. Rename/move the plan to `.overstory/specs/<top-level-issue-id>.md` if written before the id existed.
3. Invoke the `feature-plan` skill. It will handle: per-feature sub-issue creation, scout dispatch for per-feature specs, builder dispatch per feature, and the MAX AGENTS-aware sequence.
4. After `feature-plan` finishes its dispatches and all features are merged, close the top-level issue.

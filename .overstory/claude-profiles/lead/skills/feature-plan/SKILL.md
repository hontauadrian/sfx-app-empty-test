---
name: feature-plan
description: Use when you hold a product-plan spec and need to break an assigned grouping of work into per-feature specs + builders. Applies to leads with a chunk assignment AND to coordinators operating in direct-builder mode. Invoke once per grouping (one chunk for a lead, the full §3 for a coordinator in direct-builder mode).
---

# Feature Plan

## Overview

You hold a product plan at `--spec` (lead) or at `.overstory/specs/<top-level-issue-id>.md` (coordinator in direct-builder mode). Turn a grouping of features into per-feature scout+builder dispatches. Scouts write the per-feature specs; builders integrate them one at a time.

**Announce:** "I'm using the feature-plan skill."

## Your grouping

- **If you are a lead:** your grouping is the single chunk from §3 of the product plan that matches your `--task` issue.
- **If you are the coordinator in direct-builder mode:** your grouping is the entire flat feature list from §3 of the product plan.

Ignore features outside your grouping.

## When

After reading the product-plan spec and identifying your grouping, BEFORE `sd create` for feature sub-issues and BEFORE `ov sling` for scouts or builders.

## Anti-goals

- Re-doing the product plan. Trust §2 (app shell) and §3 as given.
- Expanding scope outside your grouping.
- Writing the feature spec yourself. Scouts own that — you dispatch them.
- Placeholders in scout prompts: "figure out what's needed", "standard CRUD". Scouts need concrete file targets.
- Coordinator-only: using Write for anything other than the top-level product-plan spec (which was already done by the `product-plan` skill).

## Required output (inline — no file write)

### 1. Grouping context

Quote the "User can …" demo state(s) relevant to your grouping from §3. Restate the app-shell entries (§2) your grouping registers. This is your north star.

### 2. Feature list

Each feature is a complete vertical slice one builder can integrate end-to-end. Per feature:

- **Name** (imperative, user-visible: "Create and list teams", not "Team data layer")
- **One-sentence outcome** ("User can create a team, see it in the sidebar nav, and click into it")
- **Target files (rough)** — pages, components, API endpoints, domain entities likely touched
- **App-shell entries this feature registers**
- **Dependencies on earlier features** (order matters)
- **Runtime acceptance** — copied or derived from product-plan §5. State the user-visible
  behavior the builder must satisfy. The probe derives the concrete HTTP checks from this.
- **Guard contract** — for each page / endpoint in this feature: `public`, `protected`,
  or `optional-auth`. If protected, state the expected unauth behavior:
  `redirect:<login-surface-name>`, `401`, or `403`. The surface name is symbolic (e.g.
  "login surface") — the probe detects the actual route via the existing login-page
  signature.

Lead: decompose your chunk into features. Coordinator in direct-builder mode: §3 is already flat, but restate each feature with the five fields above.

### 3. Scout dispatch plan

For each feature, draft the scout prompt that will produce `.overstory/specs/<feature-id>.md`. The prompt must give the scout:

- The product-plan spec path (passed via `--spec`)
- Exactly which feature from §2 to spec
- Files / modules the scout should Read first (concrete paths)
- The spec template the scout must produce (task breakdown grounded in real code, one task per file-group, TDD steps per task)
- Output path: `.overstory/specs/<feature-id>.md`

### 4. Dispatch sequence (respecting MAX AGENTS)

- **MAX AGENTS ≥ 3:** scouts and builders can overlap — while one builder integrates a feature, dispatch the next scout in parallel.
- **MAX AGENTS = 2:** strictly sequential — one scout at a time, then its builder, then the next scout.
- **MAX AGENTS = 1 (lead only):** no sub-spawns — the lead implements each feature themselves one at a time. (Coordinators never hit this; direct-builder mode requires ≥1 builder slot.)

State the mode + math. List the exact dispatch order.

## Self-review

1. Every feature in §2 traces back to a capability in the product plan's §2 (app shell) or §3.
2. Every scout prompt in §3 names specific files to read — no "explore the codebase".
3. Features are ordered so earlier ones unblock later ones.
4. No placeholders anywhere.
5. Every new page declares its guard contract.
6. Every new API endpoint declares whether it is behind auth.
7. Runtime acceptance statements reference only user-visible behavior, never URLs,
   ports, or status codes.

Fix inline. Don't re-review.

## Handoff

1. `sd create` one sub-issue per feature in §2.
2. For each feature, in dispatch-sequence order from §4:
   a. `ov sling --capability scout --task <feature-id> --spec .overstory/specs/<top-level-issue-id>.md` with the scout prompt from §3. Scout writes `.overstory/specs/<feature-id>.md`.
   b. After scout returns its result mail: `ov sling --capability builder --task <feature-id> --spec .overstory/specs/<feature-id>.md`. Builder integrates the feature.
   c. Verify + merge before moving to the next feature (normal lead workflow for leads; direct-merge for coordinators in direct-builder mode).
3. When all features in your grouping are done:
   - **Lead:** close the chunk issue and report to coordinator.
   - **Coordinator:** close the top-level issue.

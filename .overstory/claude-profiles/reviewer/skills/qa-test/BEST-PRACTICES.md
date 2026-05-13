# QA Testing Agent - Complete Best Practices Reference

Comprehensive guide for the QA testing agent covering all modes: standard, discovery, and adversary.

---

## 1. Agent Architecture

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| **Planner** | Maps criteria to user flows | Parse criteria file, build test sequence |
| **Executor** | Runs UI actions resiliently | Browser automation with retries |
| **Verifier** | Checks assertions | DOM inspection, text matching, URL checks |
| **Reporter** | Generates actionable output | Markdown with screenshots, logs |
| **State Manager** | Tracks app state | Current page, auth status, test progress |

---

## 2. Handling Dynamic Content & Timing

| Issue | Bad Approach | Good Approach |
|-------|--------------|---------------|
| Page loading | `sleep(3000)` | `waitUntil: "networkidle"` |
| Element appears | Fixed delay | `waitForSelector` with timeout |
| SPA navigation | Assume instant | Wait for URL change + content |
| AJAX updates | Hope it's done | Wait for specific element/text |
| Animations | Ignore | Wait for animation end or element stable |
| Lazy loading | Scroll once | Scroll + wait for content repeatedly |

### Wait Strategies (Priority Order)

1. **Element visible** - `element.isVisible()`
2. **Text present** - `page.waitForText("Success")`
3. **URL contains** - `page.waitForURL(/dashboard/)`
4. **Network idle** - `waitUntil: "networkidle"`
5. **Custom condition** - Poll for specific state
6. **Fixed timeout** - LAST RESORT, with clear reason

---

## 3. Element Selection Strategy

| Priority | Selector Type | Example | Stability |
|----------|---------------|---------|-----------|
| 1 | data-testid | `[data-testid="submit-btn"]` | Excellent |
| 2 | ID attribute | `#login-form` | Good |
| 3 | Semantic role | `role="button"` | Good |
| 4 | Accessible name | `button:has-text("Submit")` | Good |
| 5 | Form labels | `label:has-text("Email") + input` | Medium |
| 6 | CSS class | `.btn-primary` | Poor |
| 7 | XPath | `//div[3]/button` | Very Poor |

### Selector Best Practices

| Do | Don't |
|----|-------|
| Use stable attributes | Rely on auto-generated classes |
| Prefer user-visible text | Use positional selectors |
| Combine selectors for specificity | Chain fragile selectors |
| Add data-testid to your app | Scrape dynamic IDs |

---

## 4. Success Criteria Structure

| Field | Purpose | Example |
|-------|---------|---------|
| **ID** | Unique reference | AC-001, FORM-003 |
| **Priority** | Testing importance | P0 (critical) to P3 (low) |
| **Precondition** | Required starting state | "User logged in, on dashboard" |
| **Steps** | Actions to perform | Numbered list of interactions |
| **Expected** | Observable outcomes | Specific text, URL, element state |
| **Viewport** | Screen size (optional) | mobile, tablet, desktop |
| **Tags** | Categorization | regression, smoke, feature-x |

### Criteria Quality Checklist

| Characteristic | Bad Example | Good Example |
|----------------|-------------|--------------|
| **Specific** | "Form works" | "Submit shows 'Saved' toast" |
| **Observable** | "Data saves correctly" | "Name appears in list after refresh" |
| **Atomic** | "Login and create project" | Separate: "Login" + "Create project" |
| **Deterministic** | "Fast enough" | "Loads in < 3 seconds" |
| **Independent** | "After test 5..." | Each test sets own preconditions |

---

## 5. Common Pitfalls & Solutions

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| **Flaky selectors** | Tests fail randomly | Use data-testid, avoid CSS classes |
| **Race conditions** | "Element not found" intermittently | Add explicit waits before interactions |
| **Stale elements** | "Element detached from DOM" | Re-query element after page changes |
| **Hidden elements** | Click does nothing | Scroll into view, check visibility |
| **Iframe content** | Can't find known elements | Switch to iframe context first |
| **Shadow DOM** | Selectors don't work | Use pierce selectors or JS evaluation |
| **Test pollution** | Tests affect each other | Reset state between tests |
| **Auth expiration** | Random failures mid-suite | Check auth status, re-login if needed |
| **Popups/modals** | Block other interactions | Dismiss or wait for them explicitly |
| **Viewport issues** | Elements off-screen | Set consistent viewport, scroll as needed |

---

## 6. Authentication Handling

| Approach | When to Use | Pros | Cons |
|----------|-------------|------|------|
| **API auth** | Most tests | Fast, reliable | Requires API access |
| **Stored session** | Test suite runs | No repeated logins | Can expire |
| **UI login once** | Per test run | Tests real login | Slower |
| **UI login per test** | Login testing only | Complete isolation | Very slow |
| **Bypass/mock** | Development | Fastest | Not realistic |

### Auth Best Practices

| Do | Don't |
|----|-------|
| Store credentials in env vars | Hardcode passwords |
| Pre-authenticate via API when possible | Login through UI for every test |
| Handle MFA with test bypass tokens | Skip MFA testing entirely |
| Check session validity before tests | Assume auth persists forever |
| Isolate auth setup from test logic | Mix login steps with feature tests |

---

## 7. Screenshot & Evidence Strategy

| When | What to Capture | Naming Convention |
|------|-----------------|-------------------|
| Test start | Initial page state | `001-start-homepage.png` |
| Before action | Pre-interaction state | `002-before-click-submit.png` |
| After action | Post-interaction result | `003-after-click-submit.png` |
| On failure | Error state | `FAIL-004-form-validation.png` |
| On pass | Success confirmation | `PASS-005-created-item.png` |
| Viewport test | Each breakpoint | `mobile-375x667-nav.png` |

### Additional Evidence

| Artifact | When to Capture | Format |
|----------|-----------------|--------|
| Console logs | Always | JSON array |
| Network requests | On failure | HAR file |
| DOM snapshot | On failure | HTML file |
| Video recording | Complex flows | WebM/MP4 |
| Accessibility tree | Debugging | Text dump |

---

## 8. Automation Coverage Expectations

| Test Type | Automation Rate | Notes |
|-----------|-----------------|-------|
| **Happy path regression** | 80-95% | Highest ROI |
| **Form validation** | 70-90% | Clear pass/fail |
| **Navigation** | 85-95% | Straightforward |
| **CRUD operations** | 75-90% | Need data setup |
| **Error handling** | 60-80% | Some hard to trigger |
| **Responsive layouts** | 50-70% | Basic checks easy |
| **Cross-browser** | 40-60% | Setup complexity |
| **Visual regression** | 30-50% | Needs specialized tools |
| **Exploratory** | 10-20% | Human intuition needed |
| **Usability** | 5-10% | Subjective assessment |

### What Humans Do Better

| Area | Why Automation Struggles |
|------|-------------------------|
| Exploratory testing | Requires intuition, creativity |
| Visual design review | Subjective aesthetic judgment |
| Usability assessment | Needs empathy, context |
| Edge case discovery | Humans think of "what if" |
| A11y for cognitive needs | Beyond automated checks |
| Performance perception | "Feels slow" is subjective |

---

## 9. Reporting Best Practices

| Report Section | Content | Purpose |
|----------------|---------|---------|
| **Executive Summary** | Pass/Fail counts, status | Quick decision making |
| **Results Table** | Each criterion with status | Overview at a glance |
| **Failure Details** | Steps, expected vs actual, screenshot | Debug failures |
| **Environment Info** | Browser, viewport, URL, timestamp | Reproduce issues |
| **Recommendations** | Actionable next steps | Guide fixes |

### Result Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| **PASS** | Criterion met | None |
| **FAIL** | Criterion not met | Investigate, fix |
| **SKIP** | Could not test | Check preconditions |
| **BLOCKED** | Dependency failed | Fix blocker first |
| **FLAKY** | Inconsistent results | Stabilize test |

---

## 10. Integration Patterns

### CI/CD Integration

| Trigger | Use Case | Configuration |
|---------|----------|---------------|
| PR opened | Smoke tests | Fast, critical paths only |
| PR labeled | Full QA | On `qa-verify` label |
| Merge to main | Regression | Complete suite |
| Scheduled | Monitoring | Daily health checks |
| Manual | On-demand | Specific scenarios |

### Reporting Integration

| Target | Method | Content |
|--------|--------|---------|
| PR comment | GitHub API | Summary + failures |
| Slack | Webhook | Pass/fail notification |
| Dashboard | JSON export | Metrics over time |
| Bug tracker | API | Auto-create issues |

---

## 11. Discovery Phase Best Practices

### Systematic Navigation Discovery

| Step | What to Check | How |
|------|--------------|-----|
| 1 | Top nav / header | `browser_snapshot` the header region |
| 2 | Sidebar / left nav | Check for collapsible menus, expand all |
| 3 | Dropdown menus | Hover or click to expand, inventory items |
| 4 | Footer links | Scroll to bottom, check for additional nav |
| 5 | Breadcrumbs | Note hierarchy relationships |
| 6 | In-page links | "View All", "See More", "Details" links |
| 7 | Action buttons | "Add", "New", "Create" - these open modals |

### SPA Discovery Strategy

| Do | Don't |
|----|-------|
| Click links to navigate (preserves SPA state) | Use `page.goto()` for internal routes |
| Wait for content to change after clicks | Assume navigation is instant |
| Re-snapshot after each navigation | Reuse stale element refs |
| Track visited URLs to avoid loops | Revisit pages already inventoried |
| Open and inventory modals/drawers | Skip "Add/New" buttons |
| Check for sub-navigation on each page | Only inventory top-level routes |

### Discovery Depth Guidelines

| App Size | Recommended Depth | Time Estimate |
|----------|-------------------|---------------|
| Small (5-10 pages) | Full discovery, every modal | 5-10 min |
| Medium (10-30 pages) | All pages, sample modals | 10-20 min |
| Large (30+ pages) | Top nav + 2 levels deep | 15-30 min |

### What to Record Per Page

For every discovered page, capture:
1. **Route/URL** - The path (e.g., `/settings/notifications`)
2. **Title** - The main heading or page title
3. **Content type** - List, form, dashboard, detail view, empty state
4. **Interactive elements** - Count of forms, buttons, links, inputs
5. **Modals/drawers** - What opens when you click action buttons
6. **Data dependencies** - Does it need existing data to show content?

---

## 12. Adversary Testing Patterns

### Attack Categories by Element Type

#### Text Inputs
| Attack | Input | What to Watch For |
|--------|-------|-------------------|
| Max length | 1000+ characters | Overflow, layout break, truncation |
| Unicode | `日本語テスト` `مرحبا` `🎉🔥💯` | Rendering issues, encoding errors |
| Special chars | `<script>alert(1)</script>` | Displayed as-is (not executed) |
| Whitespace | `   ` (only spaces) | Accepted as valid? Trimmed? |
| Zero-width | `\u200B\u200C\u200D` | Invisible chars accepted as valid input? |
| SQL-like | `'; DROP TABLE users--` | Error messages leaking info |
| Template | `{{constructor.constructor('return this')()}}` | Template injection |
| Negative numbers | `-1`, `-999999` | In quantity/age/count fields |
| Future dates | `2099-12-31` | In date pickers |
| Past dates | `1899-01-01` | In birth date fields |

#### Buttons & Actions
| Attack | Action | What to Watch For |
|--------|--------|-------------------|
| Rapid click | Click 5+ times in 1 second | Duplicate submissions, race conditions |
| Double submit | Submit form, immediately submit again | Duplicate records created |
| Click during load | Click while page/modal is loading | JS errors, partial state |
| Right-click | Right-click action buttons | Context menu interference |
| Keyboard submit | Enter key while not focused on form | Unexpected submission |

#### Navigation
| Attack | Action | What to Watch For |
|--------|--------|-------------------|
| Back during save | Browser back while saving | Data loss, partial save |
| Direct URL | Type authenticated URL directly | Access without auth? |
| URL tampering | Change `/user/123` to `/user/999` | Access other users' data? |
| Refresh mid-flow | F5 during multi-step wizard | State lost? Step reset? |
| Deep link | Share URL of modal/dialog state | Does it restore correctly? |

#### Forms
| Attack | Action | What to Watch For |
|--------|--------|-------------------|
| All empty | Submit with nothing filled | Proper validation messages |
| Clear prefills | Delete pre-populated required fields | Validation catches it? |
| Paste overflow | Paste 10KB of text into a field | Layout break, error handling |
| File inputs | Upload wrong file type, oversized file | Error message quality |
| Select fields | Inspect for hidden options | Only valid options available |

#### Layout
| Attack | Action | What to Watch For |
|--------|--------|-------------------|
| Extreme narrow | Resize to 320px width | Content overflow, horizontal scroll |
| Extreme wide | Resize to 5000px width | Stretched layout, empty space |
| Zoom in | Browser zoom to 200% | Overlap, truncation, scroll issues |
| Zoom out | Browser zoom to 50% | Tiny text, lost elements |
| Landscape mobile | 667x375 (rotated) | Layout adaptation |

### Severity Classification

| Severity | Definition | Examples |
|----------|-----------|----------|
| **Critical** | Data loss, app crash, complete failure | Blank page, infinite loop, data corruption |
| **High** | Feature broken, major UX issue | Form won't submit, nav broken, modal stuck |
| **Medium** | Degraded experience, workaround exists | Layout breaks at one viewport, truncated text |
| **Low** | Cosmetic, minor annoyance | Alignment off, tooltip clipped, animation glitch |

### When to Stop Testing a Page

Move on to the next page when you've:
- Tested all visible form inputs with at least 3 attack types
- Tried rapid-clicking every action button
- Attempted navigation attacks (back, refresh, direct URL)
- Checked the page at mobile and desktop viewports
- Found OR verified no issues in each attack category

---

## Quick Reference Card

```
BEFORE EACH TEST:
1. Check auth status
2. Navigate to start page
3. Wait for ready state
4. Take baseline screenshot

DURING TEST:
1. Announce criterion being tested
2. Wait for element before interacting
3. Use stable selectors (data-testid first)
4. Verify outcomes explicitly
5. Screenshot on pass AND fail

AFTER EACH TEST:
1. Record result with evidence
2. Don't stop on failure - continue
3. Reset state if needed for next test

REPORTING:
- Every criterion gets explicit PASS/FAIL
- Every failure gets screenshot + details
- Include repro steps for failures
- Make recommendations actionable

DISCOVERY MODE:
1. Snapshot the page for navigation elements
2. Click each nav item (don't use goto)
3. Record URL, title, content, elements
4. Open modals/drawers and inventory them
5. Output PAGE-INVENTORY.md

ADVERSARY MODE:
1. No criteria needed - just break things
2. Test every input with extreme values
3. Rapid-click every action button
4. Try navigation attacks on every page
5. Check every page at extreme viewports
6. Report every issue with severity rating
```

# qa-test

A Claude Code skill for automated front-end QA testing. It drives a real browser through Playwright MCP, testing your application the way a user would - clicking buttons, filling forms, navigating pages, and verifying that everything works.

## What It Does

The qa-test skill gives Claude Code two personas and five testing modes to thoroughly test any web application through its UI:

- **Quinn** - A veteran QA engineer who methodically tests against your success criteria, documenting every pass and failure with screenshots
- **Jinx** - A chaos tester who receives only a URL and systematically tries to break everything, with no knowledge of how the app is "supposed" to work

## Testing Modes

| Mode | Flag | Description |
|------|------|-------------|
| **Standard** | *(default)* | Quinn tests against a provided success criteria file, verifying each criterion with screenshots and detailed reporting |
| **Discovery** | `--discover` | Quinn crawls the application, clicking through every nav item, sidebar link, and modal to build a complete page inventory |
| **Adversary** | `--adversary` | Jinx tries to break the app with extreme inputs, rapid clicks, navigation attacks, and viewport abuse |
| **Full** | `--full` | Runs all three modes in sequence: discover the site, test criteria, then try to break it |
| **Parallel** | `--parallel` | Spawns multiple agents with dedicated browser instances for large apps - Quinn agents test criteria concurrently while Jinx runs adversary testing |

## Installation

Copy the skill files to your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/qa-test
cp SKILL.md SUCCESS-CRITERIA-TEMPLATE.md RESEARCH.md BEST-PRACTICES.md ~/.claude/skills/qa-test/
```

Or clone this repo directly:

```bash
git clone https://github.com/adampaulwalker/qa-test.git ~/.claude/skills/qa-test
```

## MCP Dependencies

**Required:**

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

**Recommended:**

```bash
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

Provides network request monitoring, console error capture, and performance traces.

**Optional:**

```bash
claude mcp add lighthouse -- npx @danielsogl/lighthouse-mcp@latest
```

Provides performance audits, accessibility scoring, SEO analysis, and Core Web Vitals.

**For parallel mode** (multiple agents with dedicated browsers):

Register multiple Playwright instances in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "playwright-1": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "playwright-2": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "playwright-3": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "playwright-4": { "command": "npx", "args": ["@playwright/mcp@latest"] }
  }
}
```

## Usage

```
/qa-test <URL> [criteria-file.md]            # Standard mode (Quinn)
/qa-test <URL> --discover                     # Discovery mode - inventory all pages
/qa-test <URL> --adversary                    # Adversary mode (Jinx) - try to break it
/qa-test <URL> --full [criteria-file.md]      # All three: discover + test + adversary
/qa-test <URL> --parallel [criteria-file.md]  # Parallel agents for large apps
```

### Standard Mode

Provide a URL and a success criteria file. Quinn tests each criterion systematically, taking before/after screenshots and generating a detailed report with pass/fail status for every item.

```
/qa-test https://myapp.com ./qa-criteria.md
```

### Discovery Mode

Point it at a URL and it crawls the entire application - clicking through navigation, expanding dropdowns, opening modals - and outputs a structured `PAGE-INVENTORY.md` with every route, interactive element, and form it finds.

```
/qa-test https://myapp.com --discover
```

### Adversary Mode

Jinx receives only a URL and a brief description, discovers all pages, then attacks each one with extreme inputs (1000+ character strings, Unicode, emoji, special characters), rapid interactions (button mashing, double-clicks during loading), navigation attacks (back button during saves, direct URL access), and layout stress tests (320px width, 200% zoom).

```
/qa-test https://myapp.com --adversary
```

### Full Mode

Runs discovery, standard testing, and adversary testing in sequence, then merges everything into a combined report.

```
/qa-test https://myapp.com --full ./qa-criteria.md
```

## Included Files

| File | Purpose |
|------|---------|
| `SKILL.md` | The main skill definition - personas, modes, browser interaction patterns, report formats, and parallel agent coordination |
| `SUCCESS-CRITERIA-TEMPLATE.md` | Template for writing testable success criteria with examples covering auth, navigation, forms, data display, error handling, and responsive design |
| `BEST-PRACTICES.md` | Comprehensive reference for element selection, timing strategies, screenshot evidence, authentication handling, and adversary attack patterns |
| `RESEARCH.md` | Survey of MCP servers for testing (Playwright, Chrome DevTools, Lighthouse, accessibility, visual regression, mobile), AI QA agent architectures, and multi-agent testing patterns |

## Authentication

The skill supports two authentication patterns:

- **Auto-login** - Provide credentials via environment variables and the agent fills the login form automatically. Best for standard username/password forms and essential for parallel mode.
- **Manual login pause** - For complex auth (SSO, 2FA, captcha), the agent opens the browser and waits for you to log in manually before continuing.

## Writing Success Criteria

Use `SUCCESS-CRITERIA-TEMPLATE.md` as a starting point. Each criterion should have:

- A unique ID (e.g., `AC-001`, `FORM-003`)
- A priority level (P0 critical through P3 low)
- Clear preconditions, steps, and expected outcomes
- Specific text or elements to verify - not vague language like "works correctly"

## License

MIT

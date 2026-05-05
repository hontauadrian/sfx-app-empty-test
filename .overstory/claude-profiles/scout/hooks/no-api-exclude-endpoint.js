#!/usr/bin/env node
/**
 * PreToolUse hook — block writes that hide endpoints from public Swagger.
 *
 * Fires on Write / Edit / MultiEdit / NotebookEdit. Inspects the proposed
 * file content for the `@ApiExcludeEndpoint` decorator (or its bare
 * `ApiExcludeEndpoint` import). When present, blocks with a reason that
 * routes the agent to the supported escape hatch:
 *
 *   - The standard envelope-aware Swagger schema:
 *       @ApiResponse({ status: 200, type: ApiEnvelopeDto(MyDataDto) })
 *
 * Background. The route-contract probe in `verify-full-contract.js`
 * compares declared OpenAPI response shape against the runtime response
 * shape that `TransformInterceptor` actually produces (`{success, data}`
 * envelope). When an endpoint declared a raw return type via
 * `@ApiResponse({ status: 200 })` without `type: ApiEnvelopeDto(...)`,
 * the probe correctly flagged a mismatch — but builders historically
 * reached for `@ApiExcludeEndpoint()` to hide the route from the OpenAPI
 * spec entirely so the probe didn't see it. That side-stepped the gate
 * AND removed the endpoint from public Swagger docs that humans /
 * downstream consumers rely on (k8s readiness probes, monitoring
 * dashboards, frontend SDKs, support runbooks).
 *
 * The supported fix is to declare the response shape correctly via
 * `ApiEnvelopeDto(DataDto)` so OpenAPI matches runtime — never hide the
 * endpoint. This hook enforces that mechanically.
 *
 * Read access is unrestricted: agents may grep / cat the decorator to
 * understand existing usage. Only Write/Edit are gated.
 */

'use strict';

const fs = require('node:fs');

let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw ? JSON.parse(raw) : {};
} catch {
  input = {};
}

const toolName = input?.tool_name || '';
const toolInput = input?.tool_input || {};

// Extract the candidate text from tool_input. Each write tool packs the
// new content under a different field; we union them so a single regex
// pass below covers every case.
function extractCandidateText() {
  if (toolName === 'Write') {
    return String(toolInput.content ?? '');
  }
  if (toolName === 'Edit') {
    return String(toolInput.new_string ?? '');
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    return edits.map((e) => String(e?.new_string ?? '')).join('\n');
  }
  if (toolName === 'NotebookEdit') {
    return String(toolInput.new_source ?? '');
  }
  return '';
}

const candidate = extractCandidateText();
if (!candidate) {
  process.exit(0);
}

// Match either the decorator invocation `@ApiExcludeEndpoint(...)` or the
// imported symbol on its own. Bare imports of unrelated `Api*` decorators
// are common, so anchor strictly on the full identifier.
const PATTERN = /@?ApiExcludeEndpoint\b/;
if (!PATTERN.test(candidate)) {
  process.exit(0);
}

// Block. Emit the standard Stop / PreToolUse decision envelope so Claude
// surfaces the reason to the agent and refuses the tool call.
const filePath = String(toolInput.file_path ?? '<unknown>');
const reason =
  `BLOCKED: ${toolName} on ${filePath} introduces @ApiExcludeEndpoint, ` +
  `which hides the route from public Swagger docs. That decorator is the ` +
  `wrong escape hatch — it tends to be used to bypass route-contract probe ` +
  `mismatches between the declared @ApiResponse shape and the runtime ` +
  `envelope produced by TransformInterceptor.\n\n` +
  `Fix the declaration instead of hiding the route. The supported pattern:\n\n` +
  `  import { ApiEnvelopeDto } from 'apps/api/src/common/dto/envelope.dto';\n` +
  `  import { MyDataDto } from './dto/my-response.dto';\n\n` +
  `  @ApiResponse({\n` +
  `    status: 200,\n` +
  `    type: ApiEnvelopeDto(MyDataDto),\n` +
  `  })\n\n` +
  `MyDataDto must be a class (NOT an interface) with @ApiProperty on every ` +
  `field, including type:. ApiEnvelopeDto wraps it so OpenAPI declares ` +
  `{success: true, data: MyDataDto} which exactly matches what the global ` +
  `TransformInterceptor produces at runtime.\n\n` +
  `If the endpoint genuinely should not appear in OpenAPI (internal ` +
  `webhook from a known peer, debug-only route gated by env), escalate ` +
  `via 'ov mail send --type question --to <parent>' and let the lead ` +
  `decide — do not silently exclude.`;

process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
process.exit(0);

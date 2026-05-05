const fs = require('fs');
const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const tool = input.tool_name;

const AUTO_APPROVE = ['Bash', 'Edit', 'Write', 'Glob', 'Grep', 'Read', 'Agent'];

if (AUTO_APPROVE.includes(tool)) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PermissionRequest", allow: true }
  }));
}

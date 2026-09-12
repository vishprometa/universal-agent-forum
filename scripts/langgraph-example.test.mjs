import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const path = 'public/examples/langgraph/agent.py';
const source = readFileSync(path, 'utf8');

execFileSync('python3', [
  '-c',
  `compile(open(${JSON.stringify(path)}, encoding="utf-8").read(), ${JSON.stringify(path)}, "exec")`,
]);
assert.match(source, /StateGraph\(ForumState\)/);
assert.match(source, /builder\.add_edge\(START, "discover"\)/);
assert.match(source, /builder\.add_edge\("verify", END\)/);
assert.match(source, /state\["operation"\] != "read"/);
assert.match(source, /Redirect refused/);
assert.match(source, /urllib\.parse\.urljoin/);
assert.match(source, /Inspect the thread before retrying a write/);
assert.doesNotMatch(source, /print\([^\n]*UAF_API_KEY/);

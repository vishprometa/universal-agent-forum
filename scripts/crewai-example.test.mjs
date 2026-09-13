import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const path = 'public/examples/crewai/flow.py';
const source = readFileSync(path, 'utf8');

execFileSync('python3', [
  '-c',
  `compile(open(${JSON.stringify(path)}, encoding="utf-8").read(), ${JSON.stringify(path)}, "exec")`,
]);
assert.match(source, /class PublicForumFlow\(Flow\[ForumState\]\)/);
assert.match(source, /@start\(\)[\s\S]*def discover/);
assert.match(source, /@router\(discover\)[\s\S]*def choose_path/);
assert.match(
  source,
  /return "write" if self\.state\.operation != "read" else "read"/,
);
assert.match(source, /@listen\("write"\)[\s\S]*def publish/);
assert.match(source, /@listen\(publish\)[\s\S]*def verify/);
assert.match(source, /PublicForumFlow\(suppress_flow_events=True\)/);
assert.match(source, /CREWAI_TRACING_ENABLED", "false"/);
assert.match(source, /CREWAI_DISABLE_TELEMETRY", "true"/);
assert.match(source, /contextlib\.redirect_stdout\(io\.StringIO\(\)\)/);
assert.match(source, /urllib\.parse\.urljoin/);
assert.match(source, /Redirect refused/);
assert.match(source, /Inspect the thread before retrying a write/);
assert.doesNotMatch(source, /print\([^\n]*UAF_API_KEY/);

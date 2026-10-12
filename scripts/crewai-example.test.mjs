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

// Exercise the transport and output methods without installing model runtimes.
execFileSync('python3', ['-c', `
import ast, json, sys, types, urllib.parse
source = ast.parse(open("public/examples/crewai/flow.py").read())
selected = []
for node in source.body:
    if isinstance(node, ast.FunctionDef) and node.name in ("discover", "route_after_discovery", "parse_args", "main"):
        selected.append(node)
    if isinstance(node, ast.ClassDef) and node.name == "PublicForumFlow":
        node.bases = []
        for method in node.body:
            if isinstance(method, ast.FunctionDef): method.decorator_list = []
        selected.append(node)
ns = {"__name__": "test", "argparse": __import__("argparse"), "urllib": __import__("urllib"), "Literal": __import__("typing").Literal, "ForumState": dict, "END": "__end__"}
exec(compile(ast.Module(body=selected, type_ignores=[]), "example", "exec"), ns)
fixture = [{"id": "msg_question", "title": "A useful question", "body": "Public preview", "reply_count": 0}]
requests = []
def read(origin, path, body=None):
    assert body is None, "Discovery must never publish"
    requests.append(urllib.parse.parse_qs(urllib.parse.urlsplit(path).query))
    return {"threads": fixture}
ns["request_json"] = read
for focus in ("all", "needs_reply"):
    state = {"origin": "https://example.com", "operation": "read", "input": {}, "focus": focus}
    if "PublicForumFlow" in ns:
        flow = ns["PublicForumFlow"]()
        flow.state = types.SimpleNamespace(**state, recent_threads=[], message_id="", thread_url="", verified=False)
        assert flow.discover() == 1
        assert flow.choose_path(1) == "read"
        output = flow.result()
        assert output["threads"] == fixture and output["recent_threads"] == 1 and output["focus"] == focus
    else:
        result = ns["discover"](state)
        assert result["recent_threads"] == fixture
        assert ns["route_after_discovery"](state) == "__end__"
    assert requests[-1]["focus"] == [focus] and requests[-1]["limit"] == ["10"]
for parent_id in (None, "msg_root"):
    if "PublicForumFlow" in ns:
        flow.state.parent_id = parent_id or ""
        flow.state.message_id = "msg_written"
        output = flow.result()
    else:
        ns.update({"json": json, "forum_origin": lambda: "https://example.com", "load_input": lambda _: {}, "parse_args": lambda: types.SimpleNamespace(publish="message.json" if parent_id is None else None, reply=[parent_id, "reply.json"] if parent_id else None, needs_reply=False)})
        ns["build_graph"] = lambda: types.SimpleNamespace(invoke=lambda state: {**state, "message": {"id": "msg_written"}, "thread": {}})
        import contextlib, io
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured): ns["main"]()
        output = json.loads(captured.getvalue())
        ns["parse_args"] = None
        exec(compile(ast.Module(body=[n for n in selected if isinstance(n, ast.FunctionDef) and n.name == "parse_args"], type_ignores=[]), "args", "exec"), ns)
    assert output["thread_id"] == (parent_id or "msg_written")
    assert output["after_message_id"] == "msg_written"
sys.argv = ["example", "--needs-reply"]
assert ns["parse_args"]().needs_reply
sys.argv = ["example", "--needs-reply", "--publish", "private.json"]
try: ns["parse_args"]()
except SystemExit as error: assert error.code == 2
else: raise AssertionError("Read and write flags must be mutually exclusive")
`], { stdio: ['pipe', 'pipe', 'pipe'] });

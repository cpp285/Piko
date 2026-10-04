import test from "node:test";
import assert from "node:assert/strict";
import { selectCodexRuntime } from "../codex-runtime.js";
import { getBackend } from "../backends.js";

test("Codex selection prefers the newer installed CLI, including desktop-only installs", () => {
  const versions: Record<string, string> = { "/bin/codex": "0.135.0", "/Applications/ChatGPT App/codex": "0.159.2", "/new/codex": "0.160.0" };
  const probe = (command: string) => versions[command];
  assert.equal(selectCodexRuntime(["/bin/codex", "/missing", "/Applications/ChatGPT App/codex"], undefined, probe)?.version, "0.159.2");
  assert.equal(selectCodexRuntime(["/new/codex", "/Applications/ChatGPT App/codex"], undefined, probe)?.command, "/new/codex");
  assert.equal(selectCodexRuntime(["/missing", "/Applications/ChatGPT App/codex"], undefined, probe)?.version, "0.159.2");
  assert.equal(selectCodexRuntime(["/missing"], undefined, probe), undefined);
});

test("an explicit Codex path wins and invalid overrides do not fall back silently", () => {
  const probe = (command: string) => command === "/pinned/codex" ? "0.135.0" : command === "/new/codex" ? "0.159.2" : undefined;
  assert.equal(selectCodexRuntime(["/new/codex"], "/pinned/codex", probe)?.command, "/pinned/codex");
  assert.throws(() => selectCodexRuntime(["/new/codex"], "/missing", probe), /无法运行/);
  assert.throws(() => selectCodexRuntime([], "codex", probe), /绝对路径/);
});

test("Codex version ordering is numeric and equal versions preserve PATH preference", () => {
  const versions: Record<string, string> = { "/old": "0.99.0", "/new": "0.159.2", "/same": "0.159.2", "/beta": "0.159.2-beta.1" };
  const probe = (command: string) => versions[command];
  assert.equal(selectCodexRuntime(["/old", "/new", "/same"], undefined, probe)?.command, "/new");
  assert.equal(selectCodexRuntime(["/beta", "/new"], undefined, probe)?.command, "/new");
});

test("Codex exec retains model choice and runs unattended inside the configured sandbox", () => {
  const codex = getBackend("codex")!;
  const prompt = "你好；$(原样传递)";
  const args = codex.buildArgs(prompt, { model: "gpt-6-astra", fullAccess: false });
  assert.equal(args[1], prompt);
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(args[args.indexOf("--model") + 1], "gpt-6-astra");
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(!args.includes("--full-auto"));
  assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
  const leader = codex.buildArgs(prompt, { noTools: true, fullAccess: true });
  assert.equal(leader[leader.indexOf("--sandbox") + 1], "read-only");
  assert.ok(!leader.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.ok(!codex.buildArgs(prompt, {}).includes("--model"), "no override keeps the user's Codex model setting");
});

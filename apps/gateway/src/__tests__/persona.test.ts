import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CommandSchema, DEFAULT_AGENT_DEFS, createDefaultPersona, formatPersonaPrompt, mergeAgentDefinitions, ROLE_PERSONAS } from "@piko/shared";
import { Orchestrator, setSessionDir, setStorageRoot } from "@piko/orchestrator";
import { PersonaStore } from "../persona-store.js";

test("defaults cover every built-in and catalog specialist with real role-specific responsibilities", () => {
  const identities = new Set<string>();
  for (const person of DEFAULT_AGENT_DEFS) {
    const docs = createDefaultPersona(person);
    assert.ok(docs.identity.includes(person.name));
    identities.add(docs.identity);
    assert.ok(docs.soul.includes("对结果负责"));
  }
  assert.equal(identities.size, 8);
  assert.ok(createDefaultPersona({ name: "王欣", role: "Product Manager — PRD" }).soul.includes("日报"));
  assert.ok(createDefaultPersona({ name: "许琳", role: "UI Designer" }).soul.includes("实际渲染"));
  const catalog = readFileSync(new URL("../../../web/src/components/office/ui/office-constants.ts", import.meta.url), "utf8");
  for (const match of catalog.matchAll(/\{ name: "([^"]+)", desc:/g)) assert.ok(ROLE_PERSONAS[match[1]], `Missing role ${match[1]}`);
  const custom = createDefaultPersona({ name: "小林", role: "采购助理", personality: "先比较三份报价" });
  assert.ok(custom.identity.includes("采购助理"));
  assert.ok(custom.soul.includes("先比较三份报价"));
});

test("persona files survive restart, preserve manual edits and stay independent across people", t => {
  const root = mkdtempSync(path.join(tmpdir(), "piko-persona-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const roots = { definition: path.join(root, "definitions"), agent: path.join(root, "people") };
  const store = new PersonaStore(roots);
  const subject = { name: "王欣", role: "Product Manager" };
  const first = { kind: "agent" as const, id: "first" }, second = { kind: "agent" as const, id: "second" };
  const initial = store.read(first, subject);
  store.read(second, subject);
  store.save(first, subject, { identity: "我的独立身份", soul: "每次优先查看进度表" }, initial.version);
  const restarted = new PersonaStore(roots);
  assert.equal(restarted.read(first, subject).soul, "每次优先查看进度表");
  assert.notEqual(restarted.read(second, subject).identity, "我的独立身份");
  writeFileSync(path.join(store.directory(first), "SOUL.md"), "通过外部编辑器修改", "utf8");
  const manual = restarted.read(first, subject);
  assert.equal(manual.soul, "通过外部编辑器修改");
  assert.throws(() => store.save(first, subject, initial, initial.version), /其他窗口或编辑器/);
  store.save(first, subject, { identity: "", soul: "" }, manual.version);
  assert.equal(new PersonaStore(roots).read(first, subject).identity, "", "An intentionally empty document must not be reset");
  assert.equal(new PersonaStore(roots).read(first, subject).soul, "");
});

test("persona API rejects traversal, accepts Chinese definition IDs and protects linked files", t => {
  const root = mkdtempSync(path.join(tmpdir(), "piko-persona-paths-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new PersonaStore({ definition: path.join(root, "defs"), agent: path.join(root, "agents") });
  for (const id of ["../outside", "/tmp/escape", "foo/bar", "foo\\bar", ".", ".."]) {
    assert.equal(CommandSchema.safeParse({ type: "GET_AGENT_PERSONA", requestId: "r", target: { kind: "agent", id } }).success, false);
    assert.throws(() => store.directory({ kind: "agent", id }));
  }
  const target = { kind: "definition" as const, id: "采购助理-123" };
  assert.equal(CommandSchema.safeParse({ type: "GET_AGENT_PERSONA", requestId: "r", target }).success, true);
  const dir = store.directory(target);
  const outside = path.join(root, "private.txt"); writeFileSync(outside, "private");
  symlinkSync(outside, path.join(dir, "IDENTITY.md"));
  assert.throws(() => store.read(target, { name: "林", role: "采购助理" }), /符号链接/);
  assert.equal(readFileSync(outside, "utf8"), "private");
});

test("built-in definition edits survive merging on restart", () => {
  const customBuiltin = { ...DEFAULT_AGENT_DEFS[0], personality: "我先复现问题", skillFiles: ["debugging"], name: "阿伟" };
  const merged = mergeAgentDefinitions([customBuiltin]);
  assert.equal(merged[0].name, "阿伟");
  assert.equal(merged[0].personality, "我先复现问题");
  assert.deepEqual(merged[0].skillFiles, ["debugging"]);
  assert.equal(merged.length, 8);
});

test("real task dispatch reloads persona files on every turn for any backend", { timeout: 12000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "piko-persona-task-"));
  const store = new PersonaStore({ definition: path.join(root, "defs"), agent: path.join(root, "agents") });
  setSessionDir(path.join(root, "sessions")); setStorageRoot(path.join(root, "memory"));
  const prompts: string[] = [];
  const orc = new Orchestrator({ workspace: root, retry: false, worktree: false, sandboxMode: "safe",
    getAgentPersona: person => formatPersonaPrompt(store.read({ kind: "agent", id: person.agentId }, person)),
    backends: [{ id: "fixture", name: "Fixture", command: process.execPath, buildArgs(prompt) {
      prompts.push(prompt); return ["-e", 'console.log("SUMMARY: 已完成校验")'];
    } }],
  });
  t.after(() => { orc.destroy(); rmSync(root, { recursive: true, force: true }); });
  orc.createAgent({ agentId: "product", name: "王欣", role: "Product Manager" });
  const run = (task: string) => new Promise<void>((resolve, reject) => {
    const done = () => { orc.off("task:failed", failed); resolve(); };
    const failed = () => { orc.off("task:done", done); reject(new Error("Task failed")); };
    orc.once("task:done", done); orc.once("task:failed", failed);
    orc.runTask("product", task, "校验身份文件");
  });
  await run("first");
  assert.ok(prompts[0].includes("agent/IDENTITY.md"));
  assert.ok(prompts[0].includes("优先级"));
  writeFileSync(path.join(store.directory({ kind: "agent", id: "product" }), "SOUL.md"), "先读取本项目进度表 PERSONA_SECOND_TURN");
  await run("second");
  assert.ok(prompts[1].includes("PERSONA_SECOND_TURN"));
  assert.ok(!prompts[0].includes("PERSONA_SECOND_TURN"));
});

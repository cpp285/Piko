import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_AGENT_DEFS, getDefaultTeamMemberIds, getTeamSpecialty } from "@piko/shared";
import { Orchestrator, setSessionDir, setStorageRoot, type OrchestratorEvent } from "@piko/orchestrator";

test("default team includes product, design and development without confusing skills with job titles", () => {
  const ids = getDefaultTeamMemberIds(DEFAULT_AGENT_DEFS);
  assert.deepEqual(ids, ["luna", "nova", "rex"]);
  assert.equal(getTeamSpecialty("Backend Architect — APIs, system design"), "development");
  assert.equal(getTeamSpecialty("产品经理"), "product");
  assert.equal(getTeamSpecialty("界面设计师"), "design");
  assert.deepEqual(getDefaultTeamMemberIds([]), []);
});

test("five-person team hands product and design files to development before code review", { timeout: 15000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), "office-specialists-"));
  const prompts: Array<{ prompt: string; cwd?: string }> = [];
  const events: OrchestratorEvent[] = [];
  const directories = Object.fromEntries(["lead", "product", "design", "dev", "review"].map(id => [id, path.join(root, id)]));
  for (const dir of Object.values(directories)) mkdirSync(dir);
  setSessionDir(path.join(root, "sessions")); setStorageRoot(path.join(root, "memory"));
  let leaderRound = 0;
  const orc = new Orchestrator({ workspace: root, sandboxMode: "safe", worktree: false, retry: false,
    backends: [{ id: "fixture", name: "Fixture", command: process.execPath, buildArgs(prompt) {
      prompts.push({ prompt });
      let output: string;
      let setup = "";
      if (prompt.startsWith("You are 陈峰")) {
        output = ["@王欣: 输出需求与验收标准", "@许琳: 根据产品需求制作界面规范", "@张伟: 根据产品和设计文档实现游戏", "@李敏: 检查开发实现", "ENTRY_FILE: index.html\nSUMMARY: 产品、设计、开发和审查均完成"][leaderRound++];
      } else if (prompt.startsWith("Your name is 王欣")) {
        setup = 'require("fs").writeFileSync("product.md", "PRODUCT_ACCEPTANCE: pause and restart");';
        output = "FILES_CHANGED: product.md\nENTRY_FILE: product.md\nSUMMARY: 产品需求已明确，见 product.md";
      } else if (prompt.startsWith("Your name is 许琳")) {
        assert.ok(prompt.includes(directories.product));
        assert.ok(prompt.includes("product.md"));
        setup = `const fs=require("fs"); if(!fs.readFileSync(${JSON.stringify(path.join(directories.product, "product.md"))},"utf8").includes("PRODUCT_ACCEPTANCE")) process.exit(1); fs.writeFileSync("design.md", "DESIGN: cream background, green snake");`;
        output = "FILES_CHANGED: design.md\nENTRY_FILE: design.md\nSUMMARY: 界面规范已完成，见 design.md";
      } else if (prompt.startsWith("Your name is 张伟")) {
        assert.ok(prompt.includes(directories.product));
        assert.ok(prompt.includes(directories.design));
        assert.ok(prompt.includes("product.md"));
        assert.ok(prompt.includes("design.md"));
        setup = `const fs=require("fs"); fs.readFileSync(${JSON.stringify(path.join(directories.product, "product.md"))}); fs.readFileSync(${JSON.stringify(path.join(directories.design, "design.md"))}); fs.writeFileSync("index.html", "<h1>Game</h1>");`;
        output = "FILES_CHANGED: index.html\nENTRY_FILE: index.html\nSUMMARY: 已按产品与设计实现游戏";
      } else {
        output = "VERDICT: PASS\nSUMMARY: 实现符合需求与设计";
      }
      assert.ok(output, prompt.slice(0, 250));
      return ["-e", `${setup} console.log(${JSON.stringify(output)});`];
    } }],
  });
  t.after(() => { orc.destroy(); rmSync(root, { recursive: true, force: true }); });
  for (const type of ["task:delegated", "task:done", "task:failed", "team:phase"] as const) orc.on(type, (event: OrchestratorEvent) => events.push(event));
  orc.setTeamLead("lead");
  for (const [id, name, role] of [["lead", "陈峰", "Team Lead"], ["product", "王欣", "Product Manager"], ["design", "许琳", "UI Designer"], ["dev", "张伟", "Senior Developer"], ["review", "李敏", "Code Reviewer"]]) {
    orc.createAgent({ agentId: id, name, role, teamId: "team", workDir: directories[id] });
    orc.setAgentAutoMerge(id, false);
  }
  orc.setTeamPhase("team", "execute", "lead");
  orc.setOriginalTask("lead", "制作完整小游戏：产品需求、界面设计、开发实现、审查验收。");
  const finished = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("team workflow did not complete")), 12000);
    orc.on("task:done", event => { if (event.agentId === "lead" && event.isFinalResult) { clearTimeout(timer); resolve(); } });
    orc.on("task:failed", event => { clearTimeout(timer); reject(new Error(event.error)); });
  });
  orc.runTask("lead", "start", "开始执行", { phaseOverride: "execute" });
  await finished;
  assert.deepEqual(events.filter(e => e.type === "task:delegated").map(e => e.toAgentId), ["product", "design", "dev", "review"]);
  assert.equal(events.filter(e => e.type === "task:done" && e.agentId === "lead" && e.isFinalResult).length, 1);
  assert.equal(orc.getTeamPhase("lead"), "complete");
  assert.equal(readFileSync(path.join(directories.dev, "index.html"), "utf8"), "<h1>Game</h1>");
  const afterDesign = prompts.filter(item => item.prompt.startsWith("You are 陈峰"))[2].prompt;
  assert.ok(afterDesign.includes("产品需求已明确"));
  assert.ok(afterDesign.includes("界面规范已完成"));
  assert.ok(!afterDesign.match(/LAST KNOWN PREVIEW FIELDS[\s\S]*?ENTRY_FILE: (?:product|design)\.md/));
});

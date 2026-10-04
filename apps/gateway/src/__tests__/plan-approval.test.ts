import test from "node:test";
import assert from "node:assert/strict";
import { PhaseMachine, PromptEngine } from "@piko/orchestrator";
import { isPlanApproval } from "../plan-approval.js";

test("explicit Chinese and English plan approvals are recognized, feedback and questions are not", () => {
  for (const message of ["可以，你安排人去做吧，检查完了之后给我说", "你分配下去呀", "开始执行", "好的", "按这个方案执行吧", "请分配任务", "Approve the plan", "go ahead", "start development"]) {
    assert.equal(isPlanApproval(message), true, message);
  }
  for (const message of ["这个负责人为什么分配不下去？", "可以先解释一下吗", "可以，但先修改颜色", "开始执行前先解释一下", "不要开始执行", "先检查再开始执行", "等我确认再分配下去", "如果没问题就开始执行", "“开始执行”是什么意思", "请把按钮改成开始执行", "还不可以", "Don't start development", "Go ahead if the plan is approved", "Can you start development?", "批准方案了吗？", "方案不错，但增加排行榜"]) {
    assert.equal(isPlanApproval(message), false, message);
  }
});

test("approval transitions only a planned team once, never a worker or incomplete plan", () => {
  const phases = new PhaseMachine();
  phases.setPhase("team", "create", "lead");
  assert.equal(phases.approvePlan("lead"), null);
  assert.equal(phases.checkPlanDetected("lead", "[PLAN] unfinished"), null);
  assert.equal(phases.checkPlanDetected("lead", "[PLAN]game[/PLAN]")?.phase, "design");
  assert.equal(phases.approvePlan("worker"), null);
  assert.equal(phases.approvePlan("lead")?.phase, "execute");
  assert.equal(phases.approvePlan("lead"), null);
  phases.checkFinalResult("lead");
  assert.equal(phases.approvePlan("lead"), null);
});

test("every planning and execution turn includes the real team roster", () => {
  const prompts = new PromptEngine();
  for (const template of ["leader-create", "leader-create-continue", "leader-design", "leader-design-continue", "leader-initial", "leader-continue", "leader-result"] as const) {
    const prompt = prompts.render(template, { name: "陈峰", teamRoster: "张伟 (Developer)\n李敏 (Reviewer)" });
    assert.ok(prompt.includes("张伟 (Developer)\n李敏 (Reviewer)"), template);
    assert.ok(prompt.includes("Use ONLY the exact names"), template);
  }
});

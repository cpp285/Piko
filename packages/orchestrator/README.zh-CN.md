# @piko/orchestrator 编排引擎

[English](README.md) · [中文文档目录](../../DOCUMENTATION.zh-CN.md)

多成员团队协作引擎，通过带类型的事件 API 管理成员生命周期、任务分派、阶段切换、预览识别和结果收尾。

> 本文介绍编排引擎的流程与代码示例。默认团队包含负责人、产品经理、设计师、开发者和审查者，下文开发—审查流程描述的是其中的实施环节。原生会话续接示例适用于 Claude；当前 Codex 接入采用新执行加摘要注入。模块行数为概略说明。

## 架构

```
                        +-----------------------+
                        |    Orchestrator        |
                        |  (EventEmitter)        |
                        +-----------+-----------+
                                    |
          +------------+------------+------------+------------+
          |            |            |            |            |
   AgentManager  DelegationRouter PhaseMachine ResultFinalizer PreviewResolver
   (sessions)    (task routing)   (phases)     (team merge)   (URL resolve)
          |            |
     AgentSession  PromptEngine
     (process mgr) (templates)
```

**核心设计：**

- 编排器提供带类型的逻辑 API，网关负责通信通道和应用状态持久化；成员进程、记忆、预览和工作树模块会执行进程及文件 I/O。
- 所有通信通过 `EventEmitter<OrchestratorEventMap>` 这样的带类型事件完成，使用方订阅事件并转发到 WebSocket、Ably 等通道。
- 不绑定某一种 AI：能接收提示词并输出文本的 CLI，都可以封装成 `AIBackend`。

## 模块地图

```
src/
  orchestrator.ts      700 lines  Core engine: lifecycle, events, finalization, memory hooks
  agent-session.ts     715 lines  Process management: spawn, stream parse, timeout
  delegation.ts        585 lines  Task routing: depth/budget limits, result batching, direct fix
  prompt-templates.ts  450 lines  15 typed templates (leader/worker/reviewer/direct-fix phases)
  memory.ts            210 lines  Persistent learning: review patterns, tech prefs, project history
  phase-machine.ts     169 lines  State machine: CREATE -> DESIGN -> EXECUTE -> COMPLETE
  result-finalizer.ts  155 lines  Team-level merge: changedFiles, preview, entryFile
  preview-resolver.ts  116 lines  7-step cascading preview URL resolution
  preview-server.ts    128 lines  Static serve (npx serve) + command execution
  output-parser.ts     101 lines  Structured field extraction from agent stdout
  config.ts             58 lines  Centralized constants (delegation, timing, preview)
  types.ts             264 lines  All event types, options, payloads
  retry.ts             111 lines  Auto-retry with leader escalation
  worktree.ts          ~930 lines Git worktree isolation: create/merge/remove/cleanup/undo/revert/owner
  agent-manager.ts      80 lines  Session registry + team lead tracking
  resolve-path.ts       36 lines  4-strategy path resolution for agent-reported paths
  ai-backend.ts         29 lines  AIBackend interface
  index.ts              63 lines  Public exports + factory
```

主要职责分别是：核心生命周期、成员进程管理、任务路由、提示词模板、记忆桥接、阶段状态机、团队结果合并、预览解析、预览服务、输出解析、配置、事件类型、重试、工作树、成员注册、路径解析、后端接口和公共导出。

## 团队协作流程

```
User: "Build a pixel art snake game"
  |
  v
+----------+     [PLAN] detected     +----------+     User approves     +-----------+
|  CREATE  | ----------------------> |  DESIGN  | ------------------->  |  EXECUTE  |
| (vision) |  Leader outputs plan    | (refine) |  approvePlan()        | (build)   |
+----------+                         +----------+                       +-----------+
                                          ^                                  |
                                          |                    isFinalResult |
                                          |                                  v
                                     User sends                       +----------+
                                     feedback                         | COMPLETE |
                                     (loops back)                     | (report) |
                                                                      +----------+
```

用户提出需求后，负责人生成 `[PLAN]`，进入设计阶段；用户批准后进入执行阶段；最终结果触发完成阶段。反馈可引发下一轮调整。

### 执行阶段详情

```
Leader (no tools, delegates only)
  |
  | @Dev: Build the game with PixiJS...
  v
Developer (full tools)
  |  writes code, runs build, reports ENTRY_FILE
  v
Leader receives result
  |
  | @Reviewer: Check the code, verify features...
  v
Code Reviewer (full tools)
  |  VERDICT: PASS or FAIL + ISSUES
  |
  +-- PASS --> Leader --> FINAL SUMMARY (isFinalResult = true)
  |
  +-- FAIL (1st time) --> Direct Fix: Dev fixes issues, Reviewer re-reviews
  |                       (skips Leader — saves time and tokens)
  |
  +-- FAIL (2nd time) --> Escalate to Leader for strategic decision
```

负责人组织分派，开发者实现、构建并报告入口文件，审查者给出 `VERDICT: PASS` 或 `FAIL` 与问题列表。通过后负责人汇总交付。第一次失败优先直接修复，再次失败交给负责人决策。

负责人在 Claude 后端禁用工具，在 Codex 后端使用只读沙箱；只读不等于没有工具。

### 直接修复捷径：审查者 → 开发者

审查失败后采用分级处理，减少负责人无必要的往返：

1. **第一次 FAIL**：把审查者完整反馈 `fullOutput` 交给开发者，修复后自动复审，不经过负责人。
2. **第二次 FAIL**：升级给负责人，由其决定更换方案、重新分派或接受当前结果。

成功的直接修复循环可减少两次负责人调用。`maxDirectFixes` 控制升级前允许的直接修复次数，默认为 1。

`DelegationRouter` 从完整输出识别 `VERDICT: FAIL`，避免截断摘要遗漏结论。`maxReviewRounds=3`、`budgetRounds=7` 和 `hardCeilingRounds=10` 仍限制循环次数。

### 分派限制

| 参数 | 默认值 | 用途 |
|---|---|---|
| `maxDepth` | 5 | 分派链最大跳数 |
| `maxTotal` | 20 | 单次团队会话总分派次数 |
| `budgetRounds` | 7 | 强制收尾前的负责人调用轮数 |
| `hardCeilingRounds` | 10 | 绝对上限，到达后合成 task:done |
| `maxReviewRounds` | 3 | 接受当前结果前的最大审查轮数 |
| `maxDirectFixes` | 1 | 升级给负责人前的直接修复次数 |

## 成员记忆

跨项目持久学习机制记录既往模式，使后续任务能够参考过去的经验。

### 记录哪些内容

| 记忆类型 | 记录时机 | 注入位置 |
|---|---|---|
| 审查模式 | 审查者给出 FAIL 和编号问题 | 同类问题出现至少两次后加入开发提示词 |
| 技术偏好 | 项目完成，批准的计划中包含 TECH 行 | 开发提示词展示最近三个偏好 |
| 项目历史 | 团队完成触发 isFinalResult | 保存备查，原有机制不直接注入完整项目历史 |

### 工作方式

- 原有存储路径示例为 `~/.piko[-dev]/data/memory/memory.json`；当前网关通过 `setStorageRoot()` 将记忆放到实例目录下。
- 本节介绍的旧版项目记忆是共享的；当前记忆包还包含每位成员的会话、个人事实和共享知识。
- 只注入重复至少两次的审查模式，避免单次问题不断累积到提示词。
- 审查模式保留前 20 条、技术偏好保留最近 10 条、项目历史保留最近 50 条。

### 记忆注入示例

若多个项目反复出现“缺少构建步骤”和“fetch 调用缺少错误处理”，后续开发提示词会加入以下内容。协议与输出示例保留英文，便于对照实现：

```
===== LEARNED FROM PREVIOUS PROJECTS =====
COMMON REVIEW ISSUES (avoid these):
- missing build step (flagged 2x)
- no error handling in fetch calls (flagged 3x)

USER'S PREFERRED TECH: Vanilla JS + Canvas, React + Tailwind
```

### API

```typescript
import { getMemoryStore, clearMemory } from "@piko/orchestrator";

// Inspect current memory
const store = getMemoryStore();
console.log(store.reviewPatterns);  // [{ pattern: "...", count: 3, lastSeen: ... }]
console.log(store.techPreferences); // ["Vanilla JS + Canvas", "React + Tailwind"]
console.log(store.projectHistory);  // [{ summary: "...", tech: "...", completedAt: ... }]

// Reset all memory
clearMemory();
```

`getMemoryStore()` 用于查看审查模式、技术偏好和项目历史；`clearMemory()` 用于清空记忆。

## 工作树隔离

多人在同一仓库工作时，每个成员拥有独立的 Git worktree：工作目录不同，关联同一仓库，使用不同分支，减少相互覆盖。

### 设计原则

- 一个成员对应一棵工作树和一个分支，以 `agentId` 而非 `taskId` 标识，保持跨任务目录稳定，便于 Claude 使用 `--resume`。
- 工作树放在仓库外：`~/.piko[-dev]/worktrees/<repo-hash>/<agentId>/`。已有旧路径保持兼容，避免破坏 Git 的绝对引用。
- 分支命名为 `agent/<agentName>-<shortId>`，例如 `agent/nova-pTTERq`，每位成员唯一。
- 分支默认仅在本地，不推送远程；SourceTree 等 Git 工具可以通过共享 `.git` 查看。

### 生命周期

```
Agent gets task
  │
  ├─ worktree exists? ──yes──> syncWorktreeToMain (rebase onto latest main)
  │                             skipped if pendingMerge=true
  │
  └─ no ──> git worktree add ~/.piko[-dev]/worktrees/<repo>/<agentId>
            creates branch agent/<name>-<id>
            session.clearHistory() (can't --resume in new CWD)
  │
  v
Agent works in worktree (commits on its branch)
  │
  v
Task completes (task:done)
  ├─ autoMerge=true (default):
  │    auto-commit → squash-merge → main
  │    reset branch to main HEAD (keepAlive)
  │    commitHash pushed to mergeCommitStack (for undo)
  │
  ├─ autoMerge=false (deferred):
  │    auto-commit → set pendingMerge=true
  │    UI shows merge/revert buttons, user decides when to merge
  │
  └─ Team worker: merge all at once when team finalizes
  │
  v
Agent removed (fired)
  └─ git worktree remove + git branch -D (full cleanup)
```

已有工作树在任务前同步主分支，存在待合并工作时跳过同步。新工作树创建后清除旧会话续接信息，避免在不同目录恢复旧会话。完成后根据自动或人工合并策略处理；团队成员可在团队收尾时统一合并。移除成员时才清理工作树和分支。

### 每位成员的合并控制

聊天区提供独立的 `autoMerge` 开关，库默认值为 true；review 启动器默认关闭自动合并。

**自动合并流程：**

1. 完成任务后自动提交，压缩合并到主分支，记录 commitHash。
2. 在运行中的应用中检查结果。
3. 有问题时点击“撤销合并”，确认框会展示提交哈希和说明。
4. 可以连续撤销，每次弹出提交栈中的一条记录。

**延迟合并流程：**

1. 完成后提交到成员分支，并标记 `pendingMerge=true`。
2. 界面展示“合并到主分支”和“回退”按钮。
3. 回退在成员分支执行 `git reset --hard HEAD~1`，可以多次回退最近提交。
4. 准备好后将成员分支压缩合并到主分支。
5. 合并后出现“撤销合并”，行为与自动合并相同。

**界面控制：**

- 绿色合并按钮：把成员分支压缩合并到主分支。
- 黄色回退按钮：撤销成员分支上尚未合并的最近提交。
- 红色撤销合并按钮：在主分支执行 `git revert <commitHash>`，需要确认。
- 自动合并复选框：设置当前成员的合并偏好。
- 成员工作期间禁用这些操作。

### 冲突处理

系统先尝试自动处理冲突，无法完成时报告错误。

| 场景 | 策略 | 原因 |
|---|---|---|
| 任务前同步 | `-X theirs`，主分支优先 | 新任务尚未开始，以主分支为基准 |
| 合并到主分支 | `-X ours`，成员修改优先 | 目标是整合成员本轮产出 |

两类操作都依次尝试：无策略的干净 rebase → 有冲突时加入对应策略 → 仍然失败则报告错误。

### 未提交文件保护

合并或撤销前暂存主分支上未提交的文件，结束后恢复：

- `mergeWorktree`：stash → merge → pop，成功或失败都恢复。
- `undoMergeCommit`：stash → revert → pop，通过 try/finally 确保恢复。

### 清理

仅在移除成员（`removeAgent`）时清理工作树，不在启动时执行垃圾回收。工作树可能包含尚未合并的成果，必须跨重启保留。

重启后 `detectPendingMerges()` 扫描未提交修改和领先主分支的提交，并重建 `pendingMerge`。

### 命令与事件

| 命令 | 参数 | 含义 |
|---|---|---|
| `MERGE_WORKTREE` | agentId | 手动合并成员工作树 |
| `REVERT_WORKTREE` | agentId | 撤销成员分支最近提交 |
| `UNDO_MERGE` | agentId | 撤销主分支最近一次合并 |
| `TOGGLE_AUTO_MERGE` | agentId, autoMerge | 切换自动合并 |

| 事件 | 关键字段 | 含义 |
|---|---|---|
| `worktree:created` | agentId, worktreePath, branch | 已创建工作树 |
| `worktree:merged` | agentId, success, commitHash?, commitMessage? | 已尝试压缩合并 |
| `worktree:ready` | agentId, branch | 有修改等待人工合并 |
| `autoMerge:updated` | agentId, autoMerge, lastMergeCommit? | 合并偏好变化 |

状态持久化：`autoMerge` 存入 `team-state.json`；`pendingMerge` 从 Git 状态恢复；`mergeCommitStack` 通过 `getMergeHistory()` 从 Git 日志重建，因此重启后仍可撤销。

### 配置

```typescript
const orc = createOrchestrator({
  worktree: {
    mergeOnComplete: true,    // enable worktree merge infrastructure
    alwaysIsolate: true,      // create worktree even for solo agents
  },
  // or: worktree: false      // disable worktree isolation entirely
});
// Per-agent: session.autoMerge (default: true)
```

### 目录布局

```
~/.piko-dev/              # dev mode (release: ~/.piko/)
├── config.json
├── machine-id
├── data/
│   ├── instances/               # per-gateway state (logs, sessions, memory)
│   ├── memory/                  # global memory
│   ├── project-history/         # archived project records
│   ├── prompts/                 # custom prompt templates
│   └── agents.json              # agent definitions
├── projects/                    # agent working directories (default workspace)
└── worktrees/                   # centralized worktree storage
    └── piko-a3f2b1/       # grouped by source repo
        ├── agent-pTTERq/        # one dir per agent (stable across tasks)
        ├── agent-1gZQUa/
        └── .owners/             # ownership metadata for GC
```

`config.json` 保存配置，`machine-id` 标识机器，`data/instances/` 保存各实例状态，`projects/` 为默认项目目录，`worktrees/` 集中保存成员工作树，`.owners/` 存放归属元数据。

## 预览解析

完成任务后依次尝试七种方式：

```
1. PREVIEW_CMD + PREVIEW_PORT  -->  Run server, proxy via port
2. PREVIEW_CMD (no port)       -->  Desktop/CLI app (user launches manually)
3. ENTRY_FILE (.html)          -->  Static serve via npx serve:9199
4. "PREVIEW: http://..." in stdout  -->  Explicit URL from agent
5. .html path mentioned in stdout   -->  Regex extraction
6. .html in changedFiles       -->  Static serve
7. Build output scan           -->  dist/index.html, build/index.html, etc.
```

对应顺序：带端口的预览命令 → 不带端口的桌面/CLI 命令 → HTML 入口 → 明确报告的 URL → 输出中的 HTML 路径 → 改动文件中的 HTML → 常见构建目录。

团队级 `ResultFinalizer` 在此之前增加两层依据：优先采用开发成员实际返回的预览字段，避免负责人误报文件名；再扫描各成员输出寻找预览地址。

## 使用方法

### 基础配置

```typescript
import { createOrchestrator } from "@piko/orchestrator";
import type { AIBackend } from "@piko/orchestrator";

const claude: AIBackend = {
  id: "claude",
  name: "Claude",
  command: "claude",
  buildArgs(prompt, opts) {
    const args = ["-p", prompt, "--output-format", "stream-json"];
    if (opts.continue && opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    if (opts.fullAccess) args.push("--dangerously-skip-permissions");
    if (opts.noTools) args.push("--allowedTools", "");
    return args;
  },
};

const orc = createOrchestrator({
  workspace: "/path/to/workspace",
  backends: [claude],
  retry: { maxRetries: 2, escalateToLeader: true },
  promptsDir: "~/.my-app/prompts",  // optional: override prompt templates on disk
});
```

定义后端如何把提示词转换为 CLI 参数，传入工作目录、后端列表、重试策略和可选提示词目录。

### 事件处理

```typescript
// All 16 event types are fully typed
orc.on("task:started", (e) => {
  console.log(`${e.agentId} started task ${e.taskId}`);
});

orc.on("task:done", (e) => {
  if (e.isFinalResult) {
    console.log("Team finished!", e.result?.previewUrl);
  }
});

orc.on("team:phase", (e) => {
  console.log(`${e.teamId}: phase -> ${e.phase}`);
});

orc.on("team:chat", (e) => {
  // messageType: "delegation" | "result" | "status"
  console.log(`[${e.messageType}] ${e.fromAgentId}: ${e.message}`);
});
```

订阅任务开始、完成、阶段变化和团队聊天；`isFinalResult` 表示团队最终交付。

### 单个成员

```typescript
orc.createAgent({
  agentId: "agent-1",
  name: "Dev",
  role: "Developer",
});

orc.runTask("agent-1", "task-1", "Build a landing page");
```

### 团队工作流

```typescript
// 1. Create agents
orc.createAgent({ agentId: "lead-1", name: "PM", role: "Team Lead" });
orc.createAgent({ agentId: "dev-1",  name: "赵凯", role: "Developer" });
orc.createAgent({ agentId: "rev-1",  name: "李敏", role: "Code Reviewer" });
orc.setTeamLead("lead-1");

// 2. Start in CREATE phase — leader produces a [PLAN]
orc.setTeamPhase("team-1", "create", "lead-1");
orc.runTask("lead-1", "task-1", "Build a pixel snake game", {
  phaseOverride: "create",
});

// 3. Leader outputs [PLAN] -> auto-transitions to DESIGN phase
// 4. User reviews plan, provides feedback or approves

// 5. Approve plan -> transitions to EXECUTE phase
orc.approvePlan("lead-1");
orc.setTeamProjectDir("/workspace/snake-game");
orc.runTask("lead-1", "task-2", "Start building", {
  phaseOverride: "execute",
});

// 6. Leader delegates to Dev, Dev builds, Reviewer reviews
//    All handled automatically by DelegationRouter

// 7. isFinalResult fires on task:done -> COMPLETE phase
// 8. User sends feedback -> auto-transitions back to EXECUTE
```

该示例展示最小开发审查链。当前产品也可以创建产品经理和设计师，让负责人按依赖分派前置交付。

### 使用方保存与恢复状态

```typescript
// Save
const agents = orc.getAllAgents();
const phases = orc.getAllTeamPhases();
const projectDir = orc.getTeamProjectDir();
fs.writeFileSync("state.json", JSON.stringify({ agents, phases, projectDir }));

// Restore
const state = JSON.parse(fs.readFileSync("state.json", "utf-8"));
for (const agent of state.agents) {
  orc.createAgent({ ...agent, resumeHistory: true });
  if (agent.isTeamLead) orc.setTeamLead(agent.agentId);
}
for (const phase of state.phases) {
  orc.setTeamPhase(phase.teamId, phase.phase, phase.leadAgentId);
}
if (state.projectDir) orc.setTeamProjectDir(state.projectDir);
```

保存成员、阶段和项目目录；恢复时重新注册成员，设置负责人、阶段和目录，并在适用时恢复历史。

## 事件参考

| 事件 | 关键字段 | 触发时机 |
|---|---|---|
| `task:started` | agentId, taskId, prompt | 开始任务 |
| `task:done` | agentId, result, isFinalResult? | 完成任务 |
| `task:failed` | agentId, error | 任务失败 |
| `task:delegated` | fromAgentId, toAgentId, prompt | 负责人分派 |
| `task:result-returned` | fromAgentId, toAgentId, summary | 返回成员结果 |
| `task:retrying` | agentId, attempt, maxRetries | 自动重试 |
| `task:queued` | agentId, position | 忙碌时排队 |
| `agent:status` | agentId, status | 成员状态变化 |
| `agent:created` | agentId, name, role, isTeamLead? | 新成员注册 |
| `agent:fired` | agentId | 成员被移除 |
| `approval:needed` | approvalId, riskLevel | 请求审批 |
| `log:append` | agentId, stream, chunk | 实时输出 |
| `team:chat` | fromAgentId, message, messageType | 团队通信 |
| `team:phase` | teamId, phase, leadAgentId | 阶段切换 |
| `worktree:created` | agentId, worktreePath, branch | 工作树创建 |
| `worktree:merged` | agentId, success, commitHash?, commitMessage? | 工作树合并 |
| `worktree:ready` | agentId, branch | 等待手动合并 |
| `autoMerge:updated` | agentId, autoMerge, lastMergeCommit? | 合并偏好更新 |

## 配置常量

运行参数集中在 `config.ts` 中：

```typescript
import { CONFIG } from "@piko/orchestrator";

CONFIG.delegation.maxDepth          // 5
CONFIG.delegation.maxTotal          // 20
CONFIG.delegation.budgetRounds      // 7
CONFIG.delegation.hardCeilingRounds // 10
CONFIG.delegation.maxReviewRounds   // 3
CONFIG.delegation.maxDirectFixes    // 1 (direct reviewer→dev fix attempts before leader)

CONFIG.timing.leaderTimeoutMs       // 3 min
CONFIG.timing.workerTimeoutMs       // 30 min
CONFIG.timing.resultBatchWindowMs   // 20s (safety net for batch flushing)
CONFIG.timing.idleDoneDelayMs       // 5s
CONFIG.timing.idleErrorDelayMs      // 3s

CONFIG.preview.staticPort           // 9199
CONFIG.preview.buildOutputCandidates // ["dist/index.html", ...]
CONFIG.preview.runners              // { ".py": "python3", ".js": "node", ... }
```

负责人超时为 3 分钟，工作成员为 30 分钟，批量结果等待窗口为 20 秒，静态预览默认端口为 9199。以实际 `CONFIG` 为准。

## 提示词模板

原有 15 个模板加上后端专用成员模板，通过 `TemplateName` 联合类型检查名称，内置默认内容并支持从磁盘重新读取。

| 模板 | 阶段 | 用途 |
|---|---|---|
| `leader-create` | CREATE | 首轮需求沟通 |
| `leader-create-continue` | CREATE | 后续沟通 |
| `leader-design` | DESIGN | 接收计划反馈 |
| `leader-design-continue` | DESIGN | 持续修改计划 |
| `leader-initial` | EXECUTE | 首次执行，包含完整分派规则 |
| `leader-continue` | EXECUTE | 后续执行 |
| `leader-result` | EXECUTE | 接收成员和审查结果 |
| `leader-complete` | COMPLETE | 展示交付 |
| `leader-complete-continue` | COMPLETE | 处理交付后的反馈 |
| `worker-initial` | EXECUTE | 工作成员的首次任务 |
| `worker-reviewer-initial` | EXECUTE | 审查任务 |
| `worker-continue` | EXECUTE | 成员后续任务 |
| `worker-direct-fix` | EXECUTE | 审查失败后的直接修复 |
| `delegation-prefix` | EXECUTE | 包装分派提示词 |
| `delegation-hint` | EXECUTE | 提供分派语法提示 |

模板使用 `{{variable}}` 替换变量，例如记忆 `{{memory}}` 和单人模式说明 `{{soloHint}}`。

模板会写到 `promptsDir/<template-name>.md`。当前每次启动都会用内置内容覆盖这些文件，因此只修改生成的 Markdown 不能跨重启保存。

## 归属元数据与多实例安全

每棵工作树在 `<worktreeDir>/.owners/<agentId>.json` 保存归属信息：

```typescript
interface WorktreeOwnerInfo {
  gatewayId: string;
  machineId: string;
  instanceDir: string;
  pid: number;
  startedAt: number;
  agentId: string;
  agentName: string;
  branch: string;
  repoRoot: string;
}
```

清理逻辑通过 PID 和心跳有效期识别 Tauri、网页、CLI 等不同网关。`shouldCleanWorktree()` 检查同一网关与启动时间、拥有者是否已退出或心跳过期；其他活跃实例拥有的工作树会跳过。此机制用于判断是否可清理，不代表启动时自动清理所有工作树。

## 实时活动信息

并发成员需要了解其他人的工作状态。

### 事件协议

```typescript
interface AgentActivityEvent {
  type: "agent:activity";
  agentId: string;
  agentName: string;
  intent: string;       // Task description (first CONFIG.limits.intentChars chars)
  phase: "started" | "completed";
}
```

### 广播时机

- `delegation.ts` 在成员接到任务时广播开始。
- 成员返回结果时广播完成。

### 工作成员的团队上下文

`buildWorkerTeamContext()` 为每个同事注入约 30 tokens 的简要信息：

```
===== TEAM AWARENESS =====
Your teammates (for context -- do NOT delegate or coordinate with them):
- 赵凯 (Developer) [working] -- feat: implement game loop...
- 李敏 (Code Reviewer) [idle]
```

包含姓名、岗位、状态和最近结果，帮助成员避免冲突，而不传递其他人的全部聊天记录。产品和设计的交接内容会另行传给后续成员。

## 持久化

### 成员状态

文件：`~/.piko[-dev]/data/instances/<id>/team-state.json`，按网关实例隔离。

```typescript
interface PersistedAgent {
  agentId: string;
  name: string;
  role: string;
  personality?: string;
  backend?: string;
  palette?: number;
  teamId?: string;
  isTeamLead?: boolean;
  workDir?: string;
  worktreePath?: string | null;
  worktreeBranch?: string | null;
  autoMerge?: boolean;
}

interface PersistedTeam {
  teamId: string;
  leadAgentId: string;
  phase: "create" | "design" | "execute" | "complete";
  projectDir: string | null;
  originalTask?: string | null;  // Leader's approved plan -- survives restart
}
```

- 创建成员、移除成员、团队阶段变化及网关退出时保存。
- 使用临时文件加重命名进行原子写入，减少进程中断导致截断的风险。
- 启动时通过 `loadTeamState()` 恢复全部成员。
- 创建团队不会删除独立成员。

### 会话上下文

- 保存 agentId 到 Claude 会话 ID 的映射。
- Claude 的聊天记录位于其管理的 `~/.claude/projects/`。
- Claude 重启后可通过指定 `--resume <sessionId>` 续接。
- 不应无故清空会话 ID，否则会丢失上下文连续性。
- 当前 Codex 适配器没有原生续接，依赖应用注入的任务、摘要和记忆。

### 项目历史

历史路径示例：`~/.piko[-dev]/data/project-history/<startedAt>-<name>.json`。

归档包含事件、成员、团队状态、预览、token 使用和评分。实例级 `project-events.jsonl` 保存事件缓冲，确保重启后仍可形成归档。

## 外部成员输出

进程扫描器发现的外部成员不经过编排器执行：

- `external-output-reader.ts` 从 `~/.claude/projects/` 读取 JSONL。
- 文本通过 `LOG_APPEND` 发送，不截断，节流 500 毫秒。
- 前端按 10 秒窗口将输出块累计成消息。
- 没有 `TASK_DONE`，流式消息本身就是最终展示。

## 控制台模式

原界面设计采用终端风格与 CRT 效果；当前产品已改为浅色主题。保留的交互说明如下：

- 布局：左侧“成员／团队／外部”标签、顶部横向成员条和全高聊天区。
- 历史视觉：JetBrains Mono、绿色终端色 `#18ff62`、扫描线和闪烁。
- 消息：带时间戳和 `[陈峰]` 等姓名标签的日志。
- 输入：持续可见的 `>` 输入区，ESC 停止工作，输入继续沟通。
- 流式：通过 `LOG_APPEND` 实时显示，支持逐字展示。
- 完成：展示耗时，例如 1 分 45 秒。
- 工作指示：工作时显示动态 `...`，空闲时显示 `>_`。
- 控制台切换：可扩展聊天到全屏，并卸载 PixiJS 场景。

## 团队执行说明

- 执行阶段中，负责人没有分派任务的回复可能被视为最终对话，标记 `isFinalResult` 并进入完成阶段。
- `-stream` 流式消息在任务完成、失败、开始新任务及负责人中间结果时清理。
- 直接修复流程：审查失败 → 开发修复 → 自动复审 → 再失败时升级负责人。

## 实现状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | workDir、PICK_FOLDER 与工作目录持久化 | 已完成 |
| 2 | 集中存储、团队与单人模式、alwaysIsolate | 已完成 |
| 3 | git merge-tree 预检、rebase 后重试 | 已完成 |
| 4 | agent:activity 与团队上下文注入 | 已完成 |
| 5 | Exports/Needs 依赖图及提示词注入 | 规划中 |

## 关键文件索引

| 文件 | 职责 |
|---|---|
| `src/worktree.ts` | 工作树增删改查、Git 环境隔离；createWorktree、mergeWorktree、removeWorktree、checkConflicts、cleanupStaleWorktrees、getIsolatedGitEnv、syncWorktreeToMain、undoMergeCommit、resetWorktreeToMain、revertWorktreeCommit、getMergeHistory、initGitRepo |
| `src/delegation.ts` | DelegationRouter、prepareWorktree 回调、批量结果转发、直接修复、预算与上限、团队上下文 |
| `src/orchestrator.ts` | prepareWorktree、hasSoloNeighbor、alwaysIsolate、mergeAllWorktrees、detectPendingMerges、undoMerge、setAutoMerge、manualMerge、revertLastCommit |
| `src/agent-session.ts` | 进程管理、worktreePath/worktreeBranch、按工作树→repoPath→workspace 选择目录、过期工作树处理与失败清理 |
| `src/memory.ts` | 审查模式、技术偏好、项目历史的记忆桥接 |
| `src/phase-machine.ts` | CREATE → DESIGN → EXECUTE → COMPLETE 状态机 |
| `src/result-finalizer.ts` | 汇总 changedFiles、preview 和 entryFile |
| `src/preview-resolver.ts` | 七级预览地址解析 |
| `src/prompt-templates.ts` | 负责人、工作成员、审查和直接修复模板 |
| `src/config.ts` | 分派、时间、预览和长度限制 |
| `apps/gateway/src/index.ts` | agentWorkDirs、APPROVE_PLAN 时初始化 Git、事件转发与 worktreeEnabled |
| `apps/gateway/src/team-state.ts` | 实例级原子状态保存和项目归档 |
| `apps/gateway/src/external-output-reader.ts` | JSONL 读取与 500 毫秒节流 |
| `apps/web/src/app/office/page.tsx` | 控制台布局、消息和逐字展示 |
| `apps/web/src/store/office-store.ts` | 流式消息生命周期和外部输出累计 |

## 未采用的方案

| 方案 | 原因 |
|---|---|
| CRDT（Yjs/Automerge） | AI 通常修改整个文件，与逐字符协作的抽象不同 |
| Python 框架（MetaGPT/CrewAI） | 不是 Node.js 原生，也不能直接解决文件冲突 |
| 仅文件锁、不用工作树 | 模型可能忽略约定并直接写文件 |
| 自制合并算法 | Git 已提供三方合并 |
| 外部 clash CLI | 原生 git merge-tree 可实现相关检查 |
| 出错时清空会话 | 会丢失重试所需上下文 |
| 仓库内 .worktrees/ | 向上查找根目录时容易与工作树目录相互干扰 |
| 启动时回收过期工作树 | 可能破坏未合并修改，应先确认归属与状态 |

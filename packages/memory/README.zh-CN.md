# Piko 记忆系统

[English](README.md) · [中文文档目录](../../DOCUMENTATION.zh-CN.md)

> 持久记忆架构。核心实现位于 `packages/memory/`，已投入使用。包名为 `@piko/memory`，实现位于 `src/`，单元测试位于 `src/__tests__/`。
>
> 文中包含重构前的问题、设计目标和示例。token 数值为设计估算，不代表实测基准。代码、正则表达式和协议字段保留原文。

## 概览

| 层次 | 范围 | 存储内容 |
|---|---|---|
| **L0：临时上下文** | 当前对话 | 内存中的滑动窗口；跨成员交流使用短摘要 |
| **L1：会话** | 每次任务 | 工作、原因、文件、决策、提交等结构化摘要 |
| **L2：成员** | 单个成员长期使用 | 最多 50 条事实与偏好，自动去重 |
| **L3：共享** | 多成员 | 从个人事实提升的项目知识 |

会话中断后，通过任务摘要、修改文件、提交和决策恢复上下文。事实提取采用规则解析，不增加模型调用；去重使用 Jaccard 相似度；多次确认的个人事实可提升为共享知识。

原有审查模式、技术偏好和项目评分也会保留。开发提示词可通过 `===== LEARNED FROM PREVIOUS PROJECTS =====` 注入历史经验，例如反复出现的审查问题，或根据视觉评分调整交付重点。

## 1. 问题说明

### 重构前的系统分析

重构前存在两套彼此分离的记忆机制，以及底层 Claude 自己的记忆。

#### A. 恢复上下文：agent-session.ts

```typescript
// What we save on task success:
interface RecoveryContext {
  originalTask?: string;       // truncated to 300 chars
  phase?: string;
  lastResult?: string;         // truncated to 200 chars
  recentMessages?: Array<{     // last 6 messages, each 400 chars max
    role: "user" | "assistant";
    text: string;
  }>;
}
```

任务成功后，原任务仅保留 300 字符、最近结果 200 字符，最近六条消息每条最多 400 字符。

**问题：**

- `recentMessages` 是原始滑动窗口，缺乏语义组织。
- 按字符截断可能切断句子和关键信息。
- 没有结构化事实，只有对话片段。
- 恢复时可能只看到“让我检查构建”，却不知道此前在做什么。
- 原例中的林悦 2 只恢复两条消息，无法回忆具体工作及原因。

#### B. 长期记忆：memory.ts

```typescript
interface MemoryStore {
  reviewPatterns: ReviewPattern[];  // from reviewer FAIL verdicts
  techPreferences: string[];        // from approved plan TECH lines
  projectHistory: ProjectRecord[];  // summary + ratings
}
```

**问题：**

- 只记录审查、批准计划和完成项目等团队事件。
- 没有成员级学习，例如用户偏好虚线边框、项目使用 TERM_HOVER 变量。
- 缺少跨成员知识共享。
- 缺少每次工作完成了什么、做了哪些决策的摘要。

#### C. Claude 自身的 MEMORY.md

```markdown
# Memory Index
- [feedback_edit_visibility.md](feedback_edit_visibility.md) — After code edits, explicitly state what changed
```

**问题：**

- 由 Claude Code 自身读取，编排器不能直接依赖其内部机制。
- 编排器无法直接以统一方式查询、组织或在成员之间共享。
- 原描述中的条目不断积累，缺少本项目自己的去重管理。

### 能力缺口

```
What we HAVE:                    What we NEED:
┌──────────────┐                ┌──────────────────────────┐
│ Raw messages │                │ Structured work summary  │
│ (6 x 400ch) │                │ (what/why/files/decisions)│
├──────────────┤                ├──────────────────────────┤
│ Project-level│                │ Session-level learning   │
│ history only │                │ (per-task facts)         │
├──────────────┤                ├──────────────────────────┤
│ Single agent │                │ Cross-agent context      │
│ context only │                │ (L0 summaries)           │
└──────────────┘                └──────────────────────────┘
```

需要从零散消息、项目级历史和单人上下文，扩展到结构化工作摘要、任务级学习和跨成员短摘要。

## 2. 设计目标

| 编号 | 目标 | 衡量方式 |
|---|---|---|
| G1 | 会话丢失后恢复可继续执行的上下文 | 恢复提示词包含结构化事实 |
| G2 | 获得团队感知，同时控制 token 开销 | 其他成员只提供 1–2 行 L0 摘要，约 50 tokens |
| G3 | 积累成员级经验 | 用户与代码库偏好跨会话保存 |
| G4 | 不依赖外部记忆服务 | 无向量数据库、额外模型调用或新服务 |
| G5 | 向后兼容 | 原 memory.ts 与 RecoveryContext 继续可用 |
| G6 | 控制 token 成本 | 任务结束时通过规则提取，不额外调用模型 |
| G7 | 崩溃后可恢复 | 执行期间保存工作状态 |

## 3. 架构

### 3.1 四层记忆模型

按使用范围与生命周期，将记忆划分为四层：

```
┌─────────────────────────────────────────────────────────────┐
│                    Piko Memory                        │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│   Layer 0   │   Layer 1    │   Layer 2    │    Layer 3      │
│  EPHEMERAL  │   SESSION    │    AGENT     │    SHARED       │
├─────────────┼──────────────┼──────────────┼─────────────────┤
│ Current     │ Per-task     │ Per-agent    │ Cross-agent     │
│ conversation│ structured   │ long-term    │ project-wide    │
│ sliding     │ summary      │ facts &      │ knowledge       │
│ window      │ + facts      │ preferences  │                 │
├─────────────┼──────────────┼──────────────┼─────────────────┤
│ In-memory   │ JSON file    │ JSON file    │ JSON file       │
│ (volatile)  │ (persisted)  │ (persisted)  │ (persisted)     │
├─────────────┼──────────────┼──────────────┼─────────────────┤
│ ~6 turns    │ Last 30      │ Up to 50     │ Up to 20        │
│ (~2400 tok) │ sessions     │ facts/agent  │ facts total     │
│             │ (~200 tok ea)│ (~1000 tok)  │ (~500 tok)      │
├─────────────┼──────────────┼──────────────┼─────────────────┤
│ NOW         │ IMPROVE      │ NEW          │ NEW             │
│ (keep as-is)│ (upgrade)    │              │                 │
└─────────────┴──────────────┴──────────────┴─────────────────┘
```

原设计为临时对话、每次任务摘要、成员长期事实和团队共享知识四层。会话历史最多 30 条、个人事实最多 50 条、共享知识最多 20 条。

### 3.2 数据流

```
                    Agent running task...
                           │
                           ▼
                ┌─────────────────────┐
                │  L0: conversationLog │ ← sliding window (existing)
                │  (raw messages, 6)   │
                └──────────┬──────────┘
                           │ periodic progress snapshots
                           ▼
               ┌───────────────────────┐
               │  Work State Snapshot  │ ← persisted while task runs
               │  (summary/next/files) │
               └──────────┬───────────┘
                          │ task completes / interrupts
                          ▼
               ┌───────────────────────┐
               │  Fact Extraction      │ ← extract structured data
               │  (parse agent output) │   from stdoutBuffer, no LLM needed
               └──────────┬───────────┘
                          │
              ┌───────────┼───────────────┐
              ▼           ▼               ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────┐
    │ L1: Session  │ │ L2: Agent│ │ L3: Shared   │
    │ Summary      │ │ Facts    │ │ Knowledge    │
    │ (what/why/   │ │ (prefs,  │ │ (project     │
    │  files/next) │ │  patterns│ │  conventions)│
    └──────────────┘ │  learned)│ └──────────────┘
                     └──────────┘
```

执行期间保存工作快照；任务完成或中断时解析已有输出，分别形成会话摘要、个人事实和共享知识，不需要新增模型调用。

### 3.3 存储布局

```
~/.piko/data/instances/<gatewayId>/memory/
├── memory.json              # Legacy project-level memory
├── sessions/
│   └── {agentId}.json       # L1: latest + 30-item history ring buffer
├── agents/
│   └── {agentId}.json       # L2: per-agent learned facts
├── work-state/
│   └── {agentId}.json       # Crash-safe in-progress snapshot
└── shared.json              # L3: cross-agent project knowledge
```

当前网关将根目录设为实例下的 `memory/`；独立使用该包时也可以通过 `setStorageRoot()` 指定目录。新安装使用 Piko 目录，已有旧安装保留兼容路径。

## 4. 详细设计

### 4.1 L1：会话摘要

以结构化摘要代替原始 `recentMessages` 作为主要恢复依据。

#### 数据结构

```typescript
interface SessionSummary {
  /** ISO timestamp */
  timestamp: string;

  /** One-line description: "Optimized MultiPaneView pagination UI" */
  what: string;

  /** Key decisions made during this session */
  decisions: string[];

  /** Files created or modified */
  filesChanged: string[];

  /** Unfinished work or known issues */
  unfinished: string[];

  /** Git commits created */
  commits: string[];

  /** Token usage for this session */
  tokens: { input: number; output: number };
}
```

字段涵盖时间、完成事项、关键决策、改动文件、未完成工作、提交和 token 用量。

#### 生成方式

不需要额外模型调用，数据已存在于 `AgentSession`：

| 字段 | 来源 |
|---|---|
| `what` | extractResult().summary 或输出中的 SUMMARY 行 |
| `filesChanged` | 已从工具事件收集的 taskChangedFiles 集合 |
| `commits` | 从 stdoutBuffer 解析提交哈希 |
| `unfinished` | TODO、unfinished、remaining 后的内容 |
| `decisions` | changed from、chose、because 等决策表达 |
| `tokens` | 已跟踪的 taskInputTokens 和 taskOutputTokens |

实际实现会把路径缩短到最后三个层级，控制恢复提示词长度。

### 4.1.1 实时工作状态：已实现

除完成摘要外，还保存 `WorkState`，确保尚未运行 `commitSession()` 就中断的任务能够恢复。

```typescript
interface WorkState {
  startedAt: string;
  updatedAt: string;
  status: "running" | "interrupted" | "failed" | "cancelled";
  taskId?: string;
  taskPrompt?: string;
  cwd?: string;
  summary: string;
  nextSteps: string[];
  unfinished: string[];
  filesTouched: string[];
  lastActivity?: string;
}
```

当前行为：

- `updateWorkState()` 在执行期间持久保存快照。
- `buildRecoveryContext()` 恢复时优先使用正在进行的工作状态。
- 干净完成后通过 `clearAgentWorkState()` 清除快照。

#### 恢复注入格式

**重构前：原始片段**

```
[Session recovered] Your previous session was lost. Here's what you were doing:
- Last result: There are changes in two files, but the `agent-session.ts` changes are from a different task
- Recent conversation:
  [You]: Let me verify the build compiles:
  [You]: Those errors are pre-existing `@types/node` version conflicts, not from my changes.
```

片段只说明检查构建、部分改动属于其他任务，难以明确下一步。

**重构后：结构化摘要**

```
[Session recovered] Your previous session was lost. Here's what you were doing:
- Task: Optimize MultiPaneView pagination UI
- What you did: Redesigned pagination arrows as styled buttons, changed borders from dashed to solid, added hover scale animation
- Files changed: apps/web/src/components/MultiPaneView.tsx
- Commits: ad8ed51
- Decisions: Used TERM_HOVER/TERM_BORDER theme tokens instead of hardcoded rgba values
- Unfinished: agent-session.ts changes remain unstaged (separate task)
Note: You don't have full conversation history. Ask the user if unsure about details.
```

摘要明确记录目标、已完成事项、文件、提交、主题变量决策和未完成工作，并提示没有完整聊天历史。

原文估算为约 400 tokens 降至 150 tokens，并称信息密度提升约 2.5 倍；这属于设计示例，不是本次重新测量的结果。

### 4.2 L2：个人事实

长期记录该成员工作环境中的事实，包括用户和代码库偏好。

#### 数据结构

```typescript
interface AgentFact {
  /** Unique ID for dedup */
  id: string;

  /** Category for grouping */
  category: "user_preference" | "codebase_pattern" | "workflow_habit" | "lesson_learned";

  /** The fact itself: "User prefers solid borders over dashed" */
  fact: string;

  /** How many sessions this fact has been relevant */
  reinforceCount: number;

  /** When first observed */
  createdAt: string;

  /** When last reinforced */
  lastSeen: string;
}
```

包含唯一标识、分类、事实内容、确认次数、首次发现和最近确认时间。

#### 事实提取

当前 v1 使用规则解析，不调用模型。示例模式如下：

```typescript
const FACT_PATTERNS: Array<{ regex: RegExp; category: AgentFact["category"] }> = [
  // User preferences
  { regex: /(?:user|you)\s+(?:prefer|like|want|asked for)\s+(.{10,80})/i, category: "user_preference" },

  // Codebase patterns
  { regex: /(?:this|the)\s+(?:codebase|project|repo)\s+(?:uses?|has)\s+(.{10,80})/i, category: "codebase_pattern" },

  // Lessons learned
  { regex: /(?:note|important|remember|caution):\s*(.{10,80})/i, category: "lesson_learned" },
];
```

实际规则还覆盖 `TERM_*` 等主题变量、提交前必须或禁止的操作，以及已存在的错误和已知问题。

#### 去重策略

在加入事实前检查已有条目，避免重复记录：

```typescript
function isDuplicate(newFact: string, existing: AgentFact[]): AgentFact | null {
  const normalized = normalize(newFact);
  for (const fact of existing) {
    // Simple similarity: Jaccard on word sets
    const similarity = jaccardSimilarity(normalized, normalize(fact.fact));
    if (similarity > 0.6) return fact; // duplicate — reinforce instead of add
  }
  return null;
}

function normalize(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
}
```

- 相似度大于 0.6：强化已有事实，增加 `reinforceCount`，更新 `lastSeen`。
- 相似度不大于 0.6：新增事实。
- 每位成员最多 50 条，达到上限时优先保留确认次数多的内容。

#### 注入格式

```
===== AGENT KNOWLEDGE =====
Codebase: Uses TERM_HOVER/TERM_BORDER/TERM_SURFACE theme tokens for all interactive elements
Codebase: MultiPaneView uses PixiJS v8 with custom pagination component
Preference: User prefers solid borders with low opacity over dashed borders
Lesson: @types/node version conflicts are pre-existing; don't try to fix them
```

示例包括代码库主题约定、MultiPaneView 结构、用户边框偏好，以及无需在当前任务修复的既有类型冲突。

### 4.3 L3：共享知识

可供团队使用的知识，从多次确认的 L2 事实提升而来。

#### 数据结构

```typescript
interface SharedKnowledge {
  /** The knowledge item */
  fact: string;

  /** Which agent first discovered this */
  source: string;

  /** How many agents have confirmed this */
  confirmedBy: string[];

  /** Timestamp */
  createdAt: string;
}
```

记录知识内容、首次发现者、确认该知识的成员，以及创建时间。

#### 提升规则

L2 事实达到 `reinforceCount >= 3` 时，可提升到 L3。其他成员独立确认时，通过 `crossConfirmShared()` 加入 `confirmedBy`。

#### 共享注入格式

```
===== PROJECT KNOWLEDGE =====
- This monorepo uses pnpm workspaces with apps/web (Next.js 15) and apps/gateway (Node.js daemon)
- Theme tokens are defined in packages/shared; always use TERM_* constants, never hardcode colors
- User rates projects on 5 axes: creativity, visual, interaction, completeness, engagement
```

示例包括 monorepo 的目录与技术栈、主题变量约定，以及项目评价维度。

### 4.4 跨成员上下文：L0 摘要

成员 A 需要了解成员 B 的工作时，注入一句摘要，不传入 B 的全部历史：

```typescript
function getAgentL0(agentId: string): string {
  const session = loadLatestSession(agentId);
  if (!session) return "idle (no recent activity)";
  return session.what; // e.g. "Optimized MultiPaneView pagination UI (commit ad8ed51)"
}

// Inject into team roster:
// [林悦 2] Last: "Optimized MultiPaneView pagination UI" (commit ad8ed51) — 10 min ago
// [林悦 3] Last: "Validated memory extraction and deduplication" — just now
```

原设计估算为每位成员约 30 tokens，原始消息则可能达到约 2400 tokens。

## 5. 当前实现状态

实现位于 `packages/memory/src/`：

- `index.ts`：提交、恢复、上下文和存储相关公共 API。
- `memory.ts`：L1/L2/L3 编排、工作状态、旧接口封装和手工事实注入。
- `extract.ts`：基于规则提取摘要、决策、未完成项、下一步和候选事实。
- `storage.ts`：可配置根目录、临时文件与原子写入的 JSON 存储。
- `format.ts`：恢复信息、会话历史、个人事实、共享知识和旧上下文格式化。
- `dedup.ts`：Jaccard 去重和知识提升。
- `types.ts`：包括 WorkState 与 TaskCompletionData 的类型定义。

导出的 API：

```typescript
commitSession()
buildRecoveryContext()
getMemoryContext()
getRecoveryString()
getAgentL0()
getWorkState()
updateWorkState()
clearAgentWorkState()
crossConfirmShared()
addManualFact()
```

以下能力尚未实现：基于模型的事实提取、事实衰减与 TTL、用于查看记忆的界面面板。

## 6. Token 预算

以下是原设计估算，实际长度受内容和 tokenizer 影响：

| 层次 | 注入位置 | 估算 tokens | 频率 |
|---|---|---|---|
| L0 跨成员摘要 | 团队名单 | 每人约 30 | 团队模式每次任务 |
| L1 会话摘要 | 恢复上下文 | 约 150 | 会话丢失时 |
| 实时工作状态 | 恢复上下文 | 约 100–180 | 中断或崩溃恢复 |
| L2 个人事实 | 任务提示词 | 前 10 条约 200 | 每次任务 |
| L3 共享知识 | 任务提示词 | 前 5 条约 100 | 每次任务 |
| **新增常态开销** | | **约 330** | 每次任务 |

与旧机制比较：原 `recentMessages` 在恢复时约 400 tokens；旧 `getMemoryContext()` 约 200 tokens。新方案原文估算每次任务约 530 tokens，但能提供更完整的工作依据。当前实现也会注入近期会话简史，具体以 `getMemoryContext()` 为准。

## 7. 演进路线

```
v1 (legacy)           v2 (implemented)       v3 (possible future)
┌──────────┐         ┌──────────────┐        ┌──────────────────┐
│recentMsg │ ──────► │SessionSummary│ ──────► │SessionSummary    │
│(raw 6x   │         │(structured)  │        │+ richer extraction│
│ 400ch)   │         │              │        │+ memory tooling   │
├──────────┤         ├──────────────┤        │+ L0 Cross-Agent   │
│memory.ts │         │memory.ts     │        ├──────────────────┤
│(project  │         │+ work-state  │        │memory.ts         │
│ level)   │         │+ L2/L3       │        │(further extended)│
└──────────┘         └──────────────┘        └──────────────────┘
     100%                  100%                     100%
  compatible            compatible               compatible
```

从旧版消息片段和项目级记忆，演进为结构化会话摘要、工作快照和 L2/L3；将来可以增加更丰富的提取和记忆工具。图中间一列对应已实现的核心方案。

## 8. 示例：重构前后

### 场景：林悦 2 完成界面工作后会话中断

#### 重构前

```json
{
  "recovery": {
    "originalTask": "优化 MultiPaneView 翻页按钮",
    "lastResult": "There are changes in two files, but the agent-session.ts changes are from a different task",
    "recentMessages": [
      { "role": "assistant", "text": "Let me verify the build compiles:" },
      { "role": "assistant", "text": "Those errors are pre-existing @types/node version conflicts, not from my changes. Let me verify my file specifically has no issu" }
    ]
  }
}
```

恢复后只能模糊记得曾经做过构建检查，需要重新翻 Git 日志。

#### 重构后

```json
{
  "sessionSummary": {
    "timestamp": "2026-03-17T14:30:00Z",
    "what": "Redesigned MultiPaneView pagination bar with styled arrow buttons and hover animations",
    "decisions": [
      "Changed borders from dashed to solid with lower opacity",
      "Used TERM_HOVER and TERM_BORDER theme tokens instead of hardcoded rgba",
      "Added scale(1.02) hover animation for interactive feel"
    ],
    "filesChanged": ["apps/web/src/components/MultiPaneView.tsx"],
    "commits": ["ad8ed51"],
    "unfinished": ["agent-session.ts recovery context improvements remain unstaged"],
    "tokens": { "input": 45000, "output": 12000 }
  },
  "agentFacts": [
    { "fact": "MultiPaneView uses PixiJS-rendered pagination with TERM_* theme tokens", "category": "codebase_pattern" },
    { "fact": "User prefers solid borders over dashed borders", "category": "user_preference" }
  ]
}
```

恢复后能明确知道：已重新设计翻页栏，提交 ad8ed51 包含按钮与悬停动效；`agent-session.ts` 的相关改动仍未暂存，需要确认后续处理。

## 9. 决策记录

| 决策 | 采用方案 | 考虑过的替代方案 | 原因 |
|---|---|---|---|
| 不使用向量数据库 | JSON 文件 | Qdrant、Chroma、FAISS | 每人不足 50 条事实，无需近似最近邻检索或外部服务 |
| 提取不调用模型 | 规则解析 | GPT-4o-mini、Ollama | 无额外 token 成本，现有输出已有可解析结构 |
| 使用 Jaccard 去重 | 词集合重合度 | 余弦相似度、模型比较 | 小规模事实足够使用，无嵌入模型依赖 |
| 30 条会话环形缓冲 | 固定大小 | 无限历史、LRU、TTL | 存储成本可预测，并保留恢复依据 |
| 确认 3 次后提升 | 阈值规则 | 手工提升、投票 | 简单，优先保留反复确认的事实；时间衰减尚未实现 |
| 保存执行中状态 | JSON 快照 | 仅保留内存 | 成功提交之前也能从崩溃中恢复 |

## 10. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 规则提取遗漏重要事实 | 中 | 已提供 addManualFact()，未来可增加可选模型提取 |
| Jaccard 去重误判 | 低 | 使用 0.6 阈值，关注误合并和重复条目 |
| 事实过多导致提示词变长 | 低 | 个人最多 50 条、共享最多 20 条，按确认次数选前 N 条 |
| 摘要过短 | 中 | 可使用 recentMessages 作为结构化摘要之外的兼容补充 |
| 破坏已有恢复流程 | 高 | 保留 RecoveryContext.recentMessages，采用增量扩展 |

## 11. 未来扩展

- **可选模型提取**：使用 Ollama 等小型本地模型，在任务结束后提取更丰富的事实。
- **事实衰减**：过期事实的确认权重随时间降低。
- **语义检索**：事实超过 200 条等更大规模时，考虑 TF-IDF 等检索方式。
- **记忆面板**：在 Piko 界面中查看、编辑和删除成员记忆。
- **导出和导入**：通过 JSON 在机器之间迁移。

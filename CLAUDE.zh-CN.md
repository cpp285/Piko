# Piko 项目协作约定

[English](CLAUDE.md) · [中文文档目录](DOCUMENTATION.zh-CN.md)

这是 `CLAUDE.md` 的中文阅读副本。工具仍按约定读取原文件，避免两个入口产生不一致的规则。

## 项目结构

- `apps/web`：Next.js 15 PWA，可部署到 Vercel。
- `apps/gateway`：Mac 后台服务，负责 Node.js、多通道通信和 AI CLI 控制。
- `packages/shared`：共享事件协议与 Zod 校验。
- `packages/orchestrator`：多成员编排引擎，处理工作树、分派和阶段。
- `packages/memory`：持久记忆，包括会话、事实和共享知识。

## Git

所有 Git 提交说明必须使用英文。

## 常用命令

- `pnpm dev:web`：启动网页开发服务。
- `pnpm dev:gateway`：启动网关。

## 架构

- **通信通道**：WebSocket 始终启用；飞书可选，是国内推荐入口；Ably 和 Telegram 保留可选兼容。
- **界面**：PixiJS v8 像素办公室，加关键事件模式的成员卡片。

## 数据目录

- 新安装开发模式：`~/.piko-dev/`；正式模式：`~/.piko/`。已有旧目录通过兼容逻辑继续使用。
- `config.json`：全局配置。
- `data/instances/<id>/`：各网关实例的日志、会话和记忆。
- `data/agents.json`：成员定义。
- `projects/`：默认工作空间，团队项目在此创建。
- `worktrees/<repo-hash>/<agentId>/`：集中管理的隔离工作树。

## 工作树隔离

- 一个成员对应一棵工作树和一个分支，以 agentId 而非 taskId 标识。
- 工作树存于仓库外的 `~/.piko[-dev]/worktrees/`，减少向上查找项目根目录时的干扰。
- `task:done` 后可自动合并到主分支；全局默认启用，每位成员可切换，也可撤销合并。本地 review 启动配置默认人工合并。
- 每次任务前同步主分支并尝试自动处理冲突。
- 清理仅在移除成员时进行，不在启动时自动回收工作树。
- 完整说明见 [编排引擎中文说明](packages/orchestrator/README.zh-CN.md)。

## 关键事件模式

界面主要展示四类关键事件：`TASK_STARTED`、`APPROVAL_NEEDED`、`TASK_DONE`、`TASK_FAILED`。

成员状态为 `idle`、`working`、`waiting_approval`、`done`、`error`。`TASK_DONE` 包含 `changedFiles`、`diffStat`、`testResult` 等结构化结果。

## 团队执行流程

阶段：CREATE → DESIGN → EXECUTE → COMPLETE → 继续迭代或结束。

执行：负责人 → 产品与设计（按需）→ 开发与自修复 → 审查者给出 VERDICT → 修复循环，最多三轮审查。

开发者报告 `ENTRY_FILE` 或 `PREVIEW_CMD` + `PREVIEW_PORT`；审查者报告 `VERDICT: PASS/FAIL`；负责人组织分派。

预览支持静态 HTML（npx serve:9199）、构建产物（dist/index.html），以及通过 `PREVIEW_CMD` 在 `PREVIEW_PORT` 启动的服务。

项目目录在 `APPROVE_PLAN` 时创建，每个项目独立。团队使用同一个项目根目录，启用工作树后各成员在各自分支目录执行。

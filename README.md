<div align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" width="96" alt="Piko 图标">
  <h1>Piko · 皮可</h1>
  <p><strong>你的 AI 同事，都在一个聊天窗口里。</strong></p>
  <p>个人 Agent · 办公 Agent · Personal Agent · AI Workspace</p>
  <p>
    <a href="README.en.md">English</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="apps/desktop/README.zh-CN.md">macOS 桌面版</a> ·
    <a href="DOCUMENTATION.zh-CN.md">使用文档</a> ·
    <a href="https://github.com/cpp285/Piko/issues">反馈问题</a>
  </p>
</div>

---

**Piko 是一个开源的个人 Agent（Personal Agent）与办公 Agent 工作台。** 你可以创建产品经理、文章编辑、研究助理、设计师或开发者，为每个人配置身份、技能、资料与执行引擎。平时单聊，需要协作时拉进群里，通过消息和 `@成员` 安排工作。

Piko 将多个 AI Agent、聊天记录、任务进度和交付结果放在同一个桌面里。它适合个人日常办公、独立开发和小团队协作，提供 macOS 桌面应用与本地网页界面。

## 能帮你做什么

| 使用场景 | 可以怎样安排 |
| --- | --- |
| **个人办公 / Personal Assistant** | 让助理整理指定资料、总结文档，按设定时间汇报工作。 |
| **产品与项目管理** | 让产品经理梳理需求、写验收条件，汇总成员进展和阻塞问题。 |
| **写作与内容运营** | 新建文章编辑、营销运营等角色，为它们配置品牌资料、写作规范和内容计划。 |
| **研究与信息整理** | 让研究助理围绕任务查阅资料、整理出处，形成可继续修改的报告。 |
| **设计与开发** | 将产品、设计、开发和审查成员拉进项目群，分工完成页面、工具或小游戏。 |
| **多 Agent 协作 / Multi-agent Workspace** | 不同成员使用不同的执行引擎，在同一界面中派发任务、查看过程和接收结果。 |

实际可执行的操作取决于所选 Agent、它的工具、账号和权限。网页、外部系统及文件访问由对应引擎完成。

## 像聊天一样安排工作

1. **创建 AI 同事**：选择人物形象，填写姓名、岗位与职责。内置岗位可以直接使用，也可以创建自己的角色。
2. **设置做事方式**：编辑身份与工作习惯，添加这个成员需要的技能和参考资料，选择已安装的 Agent。
3. **单聊或拉群**：直接发消息，或按项目、功能创建群聊。同一位成员可以参与多个群。
4. **查看结果**：群里看分工和关键动态，进入成员会话查看具体执行过程、回复与交付文件。

例如，一个「个人网站」群可以这样开始：

> **你：** @王欣 先整理个人网站的需求，明确首页要展示什么。
>
> **你：** @许琳 根据确认后的需求给出视觉方案。
>
> **你：** @张伟 按方案实现，并说明如何本地预览。

可以选择一位成员担任群协调人。协调人也能通过 `@姓名: 任务` 继续分派，应用将分派转成实际任务，并记录返回结果。

## 功能一览

- **单聊与群聊**：固定的成员联系人、项目群、功能群、协调人和 `@` 派发。群里看进展，成员会话看细节。
- **可自定义的身份**：每个人都有可编辑的 `agent/IDENTITY.md`（我是谁）与 `agent/SOUL.md`（我怎么做事）。新角色的初稿由本地模板生成，无需等待模型。
- **按成员配置技能与资料**：支持从电脑上传文件或整个文件夹，也可填写内容与网页链接；技能包保留脚本和参考资料，按成员分别启用和停用。
- **主动联系**：每天或按间隔检查，有新进展或建议再私聊，支持无事静默；群聊结束后的私聊汇报可单独开关。
- **聊天内阅读文档**：点击 Markdown 交付链接直接在 Piko 内预览，支持表格、目录跳转、关联文档与源码切换。
- **按成员管理浏览器授权**：Codex 会话支持交互式授权；可为成员保存允许持续访问的站点，并随时撤回。站点访问授权不等于批准发布、上传或其他操作。
- **Agent 与模型配置**：选择本机检测到的执行引擎；支持模型参数的引擎可以指定模型名称，留空则沿用默认设置。
- **任务管理**：查看队列、执行状态和审批，停止任务、重试失败任务，回看协作记录与项目交付。
- **上下文按会话区分**：同一人物在不同群中使用独立执行上下文；角色设定和成员资料可复用。
- **本地保存**：人物、会话、身份文档和工作记录保存在本机，重启后恢复。
- **macOS 桌面端**：本地服务随应用启动，支持菜单栏入口、通知和快捷键。
- **飞书入口**：可配置飞书双向机器人，从手机接收进展、发送任务。
- **像素办公室**：14 款预制人物、12 个场景、浅色主题，以及中英文界面切换。

详细说明：[成员与会话](MEMBER_WORKSPACE.zh-CN.md) · [身份与做事方式](PERSONAS.zh-CN.md) · [飞书接入](DOMESTIC_SETUP.md)

<details>
<summary>查看像素办公室场景</summary>

下图为内置「花园工作室」场景素材。聊天工作台和办公室视图共用成员形象。

![Piko 花园工作室像素场景](apps/web/public/offices/garden-studio.png)

</details>

## Agent 接入状态

Piko 负责人物、聊天和工作调度，实际工作由本机的 Agent 执行。请先安装并登录你要使用的工具。

| Agent | 当前接入状态 |
| --- | --- |
| **Codex CLI、Claude Code** | 主要执行后端，已实现任务调用。 |
| **Qwen Code、Gemini CLI** | Beta 适配，具体能力与所装版本有关。 |
| **Pi、OpenCode、GitHub Copilot、Cursor CLI、Aider、Sapling** | 实验性适配，需要按工具版本与账号配置验证。 |
| **Kimi Code、DeepSeek Harness（DSH）、ZCode** | 后续接入计划，当前版本尚未提供完整适配。 |

目前模型设置使用名称输入，尚未提供所有引擎统一的动态模型目录。不同引擎的工具、权限、会话续接及模型选择能力不同；例如当前 Codex 适配使用新的任务执行并注入上下文摘要，未接入原生会话续接。

## 快速开始

### 方式一：macOS 桌面版

当前桌面构建目标为 **Apple Silicon，macOS 13.5+**。源码构建需要 Node.js 20+、pnpm、Rust 和 Xcode Command Line Tools。

```sh
git clone https://github.com/cpp285/Piko.git
cd Piko
pnpm install --frozen-lockfile --ignore-scripts
pnpm install:desktop
```

安装完成后打开 `~/Applications/Piko.app`。应用内置本地服务与 Node.js 运行时；执行任务仍需本机已安装、已登录的 Agent。

只构建安装包可运行 `pnpm build:desktop`，输出位于 `apps/desktop/src-tauri/target/release/bundle/`。当前构建采用本地临时签名，尚未经过 Apple 公证。完整说明见[桌面版指南](apps/desktop/README.zh-CN.md)。

### 方式二：本地网页

需要 Node.js 20+ 和 pnpm。在仓库根目录运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:release
pnpm review
```

打开 **http://localhost:9096/office/**。首次进入后添加成员，配置执行引擎，再开始单聊或建群。只查看界面不会调用模型。

这个启动方式将数据保存在仓库内的 `.review-runtime/local`，默认使用 Codex，启用工作分支隔离并保留人工合并检查。停止服务可在终端按 `Ctrl+C`。

## 数据与运行方式

- **本地存储，使用自己的账号**：Piko 无需单独的云账号。模型调用使用你配置的 Agent 账号或 API，可能产生对应费用；执行所需的内容会发送给所选模型服务。
- **人物设定可以自己改**：身份文档、技能和参考资料分别保存，修改从下一次任务开始生效。
- **定时汇报需要应用运行**：关闭应用期间不会执行；重新启动后，到期任务合并补执行一次。时间采用本机时区。
- **上下文与权限分别管理**：会话上下文区分不等于操作系统沙箱隔离；文件访问和工具权限取决于当前引擎及运行设置。
- **技能和知识库是工作资料入口**：添加一个链接不会自动接通外部账号或建立检索索引。成员按任务需要使用已有工具读取资料。
- **个人资料与源码分开**：你配置的知识库、Skill 文件、成员身份与账号授权保存在本地运行目录；源码发布不包含这些资料、聊天记录、模型凭据或飞书密钥。提交前可运行 `pnpm check:public` 检查暂存文件。

## 开发与文档

```sh
pnpm dev             # 启动开发环境
pnpm typecheck       # 类型检查
pnpm test            # 记忆系统与网关测试
pnpm test:chat       # 聊天数据模型测试
pnpm test:scene      # 场景资源检查
pnpm test:characters # 人物素材检查
```

| 目录 | 用途 |
| --- | --- |
| `apps/web` | Next.js 界面、单聊群聊、成员设置、像素办公室 |
| `apps/desktop` | Tauri macOS 应用与本地服务打包 |
| `apps/gateway` | Agent 接入、消息路由、会话持久化与调度 |
| `packages/orchestrator` | 任务执行、分派、工作分支与审查流程 |
| `packages/memory` | 持久记忆 |
| `packages/shared` | 共享协议、人物设定、数据类型与多语言文本 |

更多内容：[中文文档目录](DOCUMENTATION.zh-CN.md) · [团队工作流](team-workflow.zh-CN.md) · [人物素材](CHARACTERS.md) · [场景制作](SCENE.md)

欢迎通过 [Issues](https://github.com/cpp285/Piko/issues) 提交问题与建议，或提交 Pull Request。报告问题时，请附上系统版本、所用 Agent、复现步骤及已去除密钥和私人内容的日志。

## License

[MIT](LICENSE)。第三方依赖与素材的许可说明见 [NOTICE.md](NOTICE.md)。

---

**Piko — A personal agent workspace for everyday work.**

个人智能体 · 办公智能体 · AI 助手 · Personal Agent · Office Agent · Work Agent · AI Assistant · Multi-agent Collaboration

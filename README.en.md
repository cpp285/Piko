<div align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" width="96" alt="Piko icon">
  <h1>Piko</h1>
  <p><strong>Your AI coworkers, together in one chat workspace.</strong></p>
  <p>Personal Agent · Office Agent · AI Workspace · Multi-agent Collaboration</p>
  <p>
    <a href="README.md">简体中文</a> ·
    <a href="#quick-start">Quick start</a> ·
    <a href="apps/desktop/README.md">macOS app</a> ·
    <a href="https://github.com/cpp285/Piko/issues">Issues</a>
  </p>
</div>

---

**Piko is an open-source personal agent and office agent workspace.** Create AI coworkers such as a product manager, editor, researcher, designer or developer. Give each one an identity, working style, skills, reference material and an execution engine. Chat individually, or bring them into a group and assign work with messages and `@mentions`.

Piko brings multiple AI agents, conversations, task progress and deliverables into one desktop. It supports everyday personal work, independent projects and small-team collaboration through a macOS app and a local web interface.

## What can you use it for?

| Workflow | Example |
| --- | --- |
| **Personal assistance** | Summarize selected documents, organize reference material and receive scheduled updates. |
| **Product and project work** | Ask a product manager to clarify requirements, write acceptance criteria and report blockers. |
| **Writing and content operations** | Create an editor or marketing role with its own brand material and writing guidelines. |
| **Research** | Gather information, track sources and produce an editable report using the selected agent's tools. |
| **Design and development** | Bring product, design, development and review roles into a project group to build a site, tool or small game. |
| **Multi-agent collaboration** | Assign different engines to different coworkers while managing their work from the same interface. |

Available actions depend on the selected agent, its tools, account and permissions.

## Work through conversations

1. **Create a coworker.** Choose an appearance, name and role, or define a new role.
2. **Set how they work.** Edit their identity, add skills and reference material, then select an installed agent.
3. **Chat or form a group.** Start a direct conversation or create a group for a project or function. One coworker can join multiple groups.
4. **Review progress and results.** Follow assignments and updates in the group; open a member's conversation for execution details and deliverables.

Groups can have a coordinator. A member can delegate with `@Name: task`, which the app turns into a real task and tracks through the returned result.

## Features

- **Direct messages and group chats:** persistent contacts, project groups, functional groups, coordinators and mention-based assignment.
- **Editable identities:** each coworker has `agent/IDENTITY.md` for who they are and `agent/SOUL.md` for how they work. Local templates generate new role drafts without a model call.
- **Per-member skills and reference material:** upload files or entire folders from your computer, or add text and web links. Skill bundles retain scripts and reference files; enable or disable each entry per coworker.
- **Proactive updates:** check daily or at intervals and send a direct message when there is a useful update; quiet checks stay out of the chat feed. Group-completion reports are optional.
- **In-app document reading:** open Markdown deliverables directly in Piko, with tables, heading links, linked documents and a source view.
- **Per-member browser approvals:** Codex conversations support interactive approval and revocable site access grants. A site connection grant does not approve publishing, uploads or other actions.
- **Agent and model settings:** choose detected local engines; specify a model name for adapters that support it, or keep the engine default.
- **Task management:** queues, execution status, approvals, cancellation, failed-task retry and project recaps.
- **Conversation-specific context:** separate execution contexts for each conversation and participating member, with reusable identity and member settings.
- **Local persistence:** members, conversations, persona documents and work records survive restarts.
- **macOS desktop app:** bundled local service, menu bar access, notifications and keyboard shortcuts.
- **Feishu integration:** an optional two-way bot for receiving updates and sending tasks.
- **Pixel office:** 14 ready-made character appearances, 12 scenes, light themes and Chinese/English UI.

Detailed guides in Chinese: [Members and conversations](MEMBER_WORKSPACE.zh-CN.md) · [Identity and working style](PERSONAS.zh-CN.md) · [Feishu setup](DOMESTIC_SETUP.md)

<details>
<summary>View a pixel office scene</summary>

The built-in Garden Studio scene asset. The chat workspace and office view use the same character appearances.

![Piko Garden Studio pixel scene](apps/web/public/offices/garden-studio.png)

</details>

## Agent integration status

Piko manages coworkers, conversations and task routing. Installed agents perform the actual work. Install and authenticate the tools you want to use first.

| Agent | Current status |
| --- | --- |
| **Codex CLI, Claude Code** | Primary execution backends with implemented task invocation. |
| **Qwen Code, Gemini CLI** | Beta adapters; capabilities depend on the installed version. |
| **Pi, OpenCode, GitHub Copilot, Cursor CLI, Aider, Sapling** | Experimental adapters requiring validation with your tool version and account. |
| **Kimi Code, DeepSeek Harness (DSH), ZCode** | Planned integrations; complete adapters are not yet available. |

Model settings currently accept a name; there is no unified dynamic model catalog across all engines. Tool access, permissions, native session continuation and model selection vary by adapter. The current Codex adapter starts fresh executions with injected context summaries rather than resuming native sessions.

## Quick start

### macOS desktop app

The current build targets **Apple Silicon, macOS 13.5+**. Building from source requires Node.js 20+, pnpm, Rust and Xcode Command Line Tools.

```sh
git clone https://github.com/cpp285/Piko.git
cd Piko
pnpm install --frozen-lockfile --ignore-scripts
pnpm install:desktop
```

Open `~/Applications/Piko.app`. The app bundles its local service and Node.js runtime. Task execution still requires an installed, authenticated agent.

To build without installing, run `pnpm build:desktop`. Outputs are under `apps/desktop/src-tauri/target/release/bundle/`. Current builds use an ad-hoc local signature and are not Apple-notarized. See the [desktop guide](apps/desktop/README.md).

### Local web app

Requires Node.js 20+ and pnpm. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:release
pnpm review
```

Open **http://localhost:9096/office/**. Add coworkers, configure an engine, then start a direct chat or create a group. Viewing the interface does not call a model.

This launcher stores data in `.review-runtime/local`, defaults to Codex, enables worktree isolation and keeps manual merge review. Press `Ctrl+C` in the terminal to stop it.

## Data and runtime behavior

- **Local storage, your own accounts:** no separate Piko cloud account is required. Agent or API accounts provide model access and may incur usage charges. Content needed for execution is sent to your selected model service.
- **Editable personas:** identity documents, skills and reference material are stored separately. Changes apply from the next task.
- **Scheduling requires a running app:** tasks do not execute while the app is closed. On restart, overdue triggers are coalesced into one catch-up run. Times use the local device timezone.
- **Context separation is distinct from permissions:** independent conversation context does not itself provide an operating-system sandbox. File and tool access depend on engine and runtime settings.
- **Skills and knowledge are reference inputs:** adding a URL does not connect an external account or build a search index. Members read material as needed using their existing tools.
- **Personal resources stay separate from source code:** configured knowledge libraries, skills, member identities and account grants stay in the local runtime profile. Source releases exclude these resources, chat history, model credentials and Feishu secrets. Run `pnpm check:public` before committing to check staged files.

## Development

```sh
pnpm dev             # Development environment
pnpm typecheck       # Type checks
pnpm test            # Memory and gateway tests
pnpm test:chat       # Conversation model tests
pnpm test:scene      # Scene asset checks
pnpm test:characters # Character asset checks
```

| Directory | Purpose |
| --- | --- |
| `apps/web` | Next.js UI, chats, member settings and pixel office |
| `apps/desktop` | Tauri macOS app and bundled local runtime |
| `apps/gateway` | Agent adapters, message routing, persistence and scheduling |
| `packages/orchestrator` | Execution, delegation, worktrees and review flows |
| `packages/memory` | Persistent memory |
| `packages/shared` | Protocols, persona definitions, types and UI translations |

More documentation: [Documentation index](DOCUMENTATION.zh-CN.md) · [Team workflow](team-workflow.md) · [Orchestration](packages/orchestrator/README.md) · [Memory](packages/memory/README.md)

Issues and pull requests are welcome. Include your operating system, selected agent, reproduction steps and logs with credentials and private content removed.

## License

[MIT](LICENSE). See [NOTICE.md](NOTICE.md) for third-party license notes.

---

**Piko — A personal agent workspace for everyday work.**

Personal Agent · Office Agent · Work Agent · AI Assistant · Multi-agent Collaboration · 个人智能体 · 办公智能体

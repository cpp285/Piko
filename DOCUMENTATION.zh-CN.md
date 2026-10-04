# Piko 中文文档目录

[项目首页](README.md) · [English](README.en.md)

英文说明保留，并提供对应的中文阅读版。可运行代码、协议字段、路径和第三方产品名保持原义。岗位中文说明集中在 `agents/zh-CN/`，不参与自动角色注册。

## 中英文对照

| 内容 | 中文版 | 英文版 |
|---|---|---|
| 项目介绍与运行 | [阅读](README.md) | [English](README.en.md) |
| macOS 桌面版 | [阅读](apps/desktop/README.zh-CN.md) | [English](apps/desktop/README.md) |
| 项目协作约定 | [阅读](CLAUDE.zh-CN.md) | [English](CLAUDE.md) |
| 团队工作流 | [阅读](team-workflow.zh-CN.md) | [English](team-workflow.md) |
| 编排引擎 | [阅读](packages/orchestrator/README.zh-CN.md) | [English](packages/orchestrator/README.md) |
| 持久记忆系统 | [阅读](packages/memory/README.zh-CN.md) | [English](packages/memory/README.md) |
| 场景开发指南 | [阅读](apps/web/src/components/office/scene/README.zh-CN.md) | [English](apps/web/src/components/office/scene/README.md) |
| 代码审查者 | [阅读](packages/orchestrator/agents/zh-CN/code-reviewer.md) | [English](packages/orchestrator/agents/code-reviewer.md) |
| 数据工程师 | [阅读](packages/orchestrator/agents/zh-CN/data-engineer.md) | [English](packages/orchestrator/agents/data-engineer.md) |
| DevOps 工程师 | [阅读](packages/orchestrator/agents/zh-CN/devops-engineer.md) | [English](packages/orchestrator/agents/devops-engineer.md) |
| 游戏音频工程师 | [阅读](packages/orchestrator/agents/zh-CN/game-audio-engineer.md) | [English](packages/orchestrator/agents/game-audio-engineer.md) |
| 游戏设计师 | [阅读](packages/orchestrator/agents/zh-CN/game-designer.md) | [English](packages/orchestrator/agents/game-designer.md) |
| Godot 开发者 | [阅读](packages/orchestrator/agents/zh-CN/godot-developer.md) | [English](packages/orchestrator/agents/godot-developer.md) |
| 关卡设计师 | [阅读](packages/orchestrator/agents/zh-CN/level-designer.md) | [English](packages/orchestrator/agents/level-designer.md) |
| 叙事设计师 | [阅读](packages/orchestrator/agents/zh-CN/narrative-designer.md) | [English](packages/orchestrator/agents/narrative-designer.md) |
| PixiJS 开发者 | [阅读](packages/orchestrator/agents/zh-CN/pixijs-developer.md) | [English](packages/orchestrator/agents/pixijs-developer.md) |
| 产品经理 | [阅读](packages/orchestrator/agents/zh-CN/product-manager.md) | [English](packages/orchestrator/agents/product-manager.md) |
| 测试工程师 | [阅读](packages/orchestrator/agents/zh-CN/qa-engineer.md) | [English](packages/orchestrator/agents/qa-engineer.md) |
| 安全工程师 | [阅读](packages/orchestrator/agents/zh-CN/security-engineer.md) | [English](packages/orchestrator/agents/security-engineer.md) |
| 软件架构师 | [阅读](packages/orchestrator/agents/zh-CN/software-architect.md) | [English](packages/orchestrator/agents/software-architect.md) |
| 站点可靠性工程师（SRE） | [阅读](packages/orchestrator/agents/zh-CN/sre.md) | [English](packages/orchestrator/agents/sre.md) |
| 技术文档工程师 | [阅读](packages/orchestrator/agents/zh-CN/technical-writer.md) | [English](packages/orchestrator/agents/technical-writer.md) |
| Three.js 开发者 | [阅读](packages/orchestrator/agents/zh-CN/threejs-developer.md) | [English](packages/orchestrator/agents/threejs-developer.md) |
| 界面设计师 | [阅读](packages/orchestrator/agents/zh-CN/ui-designer.md) | [English](packages/orchestrator/agents/ui-designer.md) |
| Unity 开发者 | [阅读](packages/orchestrator/agents/zh-CN/unity-developer.md) | [English](packages/orchestrator/agents/unity-developer.md) |

## 原有中文文档

- [成员、会话、技能与主动联系](MEMBER_WORKSPACE.zh-CN.md)
- [人物身份与做事方式](PERSONAS.zh-CN.md)
- [国内使用与飞书接入](DOMESTIC_SETUP.md)
- [人物素材与动作制作](CHARACTERS.md)
- [像素场景制作](SCENE.md)
- [许可说明](NOTICE.md)

## 命名约定

产品名为 **Piko**；命令名为 `piko`；内部包名为 `@piko/shared`、`@piko/orchestrator`、`@piko/memory`。

新配置变量以 `PIKO_` 开头。兼容代码仍识别旧安装的环境变量与数据目录；历史日志和备份保存原始记录，不改写历史。第三方依赖、工具约定文件名和 `/office/` 这样的功能路由保持不变。

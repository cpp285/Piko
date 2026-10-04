# Piko macOS 桌面版

[English](README.md)

桌面版把群聊、成员私聊、本地服务和 Node.js 运行环境打包到一个 Tauri 应用中。界面在本机运行，AI 任务使用这台 Mac 已安装并登录的编程工具。

## 使用

双击 `Piko.app` 即可自动启动服务并连接。关闭窗口后，任务继续在后台运行；点击程序坞或菜单栏图标即可重新显示窗口。`⌘,` 打开设置，`⌘Q` 退出应用并停止服务；还有任务运行时会先确认。

当前安装包适用于 Apple Silicon 芯片、macOS 13.5 及以上系统。应用已内置 Node.js，无须先启动终端服务。实际执行 AI 任务仍需要安装并登录 Codex 等受支持的编程工具。应用从访达启动时也会补齐这些工具的搜索路径。

## 构建与安装

开发环境需要 Node.js、pnpm、Rust 和 Xcode 命令行工具。在仓库根目录执行：

```sh
pnpm install
pnpm build:desktop
```

产物位于 `apps/desktop/src-tauri/target/release/bundle/`，包括 `macos/Piko.app` 和 `dmg/*.dmg`。退出桌面应用后，运行 `pnpm install:desktop` 可构建并安装到 `~/Applications`；安装脚本将已有版本保存在安装目录下的 `.piko-backups/`，再安装 Piko。可通过 `PIKO_INSTALL_DIR` 指定其他安装位置。

构建脚本复制当前 `PATH` 中的 Node 可执行文件，其芯片架构和最低系统要求需与目标安装包匹配。目前使用本地临时签名，适合本机测试；面向其他用户正式分发，还需要 Apple Developer ID 签名、强化运行时检查及苹果公证。普通本地构建不会自动完成公证。

## 数据与故障恢复

桌面版数据保存在 `~/Library/Application Support/com.crewloom.desktop/runtime`，可从应用菜单打开。应用标识与数据目录保持稳定，更新为 Piko 后直接沿用已有成员、聊天、身份文档和偏好设置。它与网页版、命令行版本的数据目录相互独立，避免一个版本启动时停止另一个版本的服务。项目源文件仍保存在各自选择的项目文件夹。

每次启动由系统分配可用端口，只允许本机连接。应用始终连接自己启动的服务，避免缓存端口导致串连。服务异常停止时，界面会提供重新启动按钮。网页只可调用明确注册的桌面功能，没有任意执行系统命令的入口。

测试时可用 `PIKO_DESKTOP_DATA_DIR` 指定独立数据目录；不要让两个运行中的应用共用一个目录。替换应用安装包不会删除已有数据。

## 开发与验证

```sh
pnpm --filter piko-desktop dev
pnpm --filter piko exec node --import tsx --test src/__tests__/desktop-runtime.test.ts
```

开发模式连接网页开发服务器和开发用本地服务；发布版本自动管理打包在应用中的服务。集成测试覆盖随机端口、独立数据目录、连接鉴权及仅限本机监听，不会调用 AI 模型。

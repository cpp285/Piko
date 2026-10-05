#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SIDECAR="$MONOREPO/apps/desktop/src-tauri/sidecar"

# Keep both packaged copies of the interface on the same build, without touching a running gateway.
echo "[1/3] 构建聊天界面"
cd "$MONOREPO"
pnpm --filter web build

echo "[2/3] 打包本地服务"
cd "$MONOREPO/apps/gateway"
BUNDLE_ALL=1 pnpm exec tsup --out-dir "$MONOREPO/.review-runtime/desktop-gateway"

echo "[3/3] 准备应用运行环境"
mkdir -p "$SIDECAR"
cp "$(command -v node)" "$SIDECAR/node"
chmod +x "$SIDECAR/node"
cp "$MONOREPO/.review-runtime/desktop-gateway/index.js" "$SIDECAR/gateway.js"
# These are generated resources; replace them so removed files cannot leak into a release.
rm -rf "$SIDECAR/web" "$SIDECAR/agents"
cp -R "$MONOREPO/apps/web/out" "$SIDECAR/web"
cp -R "$MONOREPO/packages/orchestrator/agents" "$SIDECAR/agents"
# Node is a nested executable, so give local development packages an integrity signature.
if [ "$(uname)" = "Darwin" ]; then
  codesign --force --sign - "$SIDECAR/node"
fi
node "$SCRIPT_DIR/smoke-sidecar.mjs" "$SIDECAR"
printf '运行环境已准备：%s\n' "$SIDECAR"

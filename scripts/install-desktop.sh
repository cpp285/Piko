#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if pgrep -x piko-desktop >/dev/null || pgrep -x crewloom-desktop >/dev/null; then
  echo "请先退出正在运行的桌面应用，再安装更新。"
  exit 1
fi
pnpm --filter piko-desktop build
APP_PATH="$ROOT/apps/desktop/src-tauri/target/release/bundle/macos/Piko.app"
DEST="${PIKO_INSTALL_DIR:-${CREWLOOM_INSTALL_DIR:-$HOME/Applications}}"
[ -d "$APP_PATH" ] || { echo "未找到构建的 Piko.app"; exit 1; }
mkdir -p "$DEST"
BACKUP_DIR="$DEST/.piko-backups"
for PREVIOUS_NAME in Piko CrewLoom; do
  if [ -e "$DEST/$PREVIOUS_NAME.app" ]; then
    mkdir -p "$BACKUP_DIR"
    mv "$DEST/$PREVIOUS_NAME.app" "$BACKUP_DIR/$PREVIOUS_NAME-$(date +%Y%m%d-%H%M%S).app"
  fi
done
ditto "$APP_PATH" "$DEST/Piko.app"
printf '已安装到 %s/Piko.app\n' "$DEST"

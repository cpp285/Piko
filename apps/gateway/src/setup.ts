import { createInterface } from "readline";
import { saveConfig } from "./config.js";
import { detectBackends, getBackend } from "./backends.js";

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise(resolve => {
    const onClose = () => resolve("");
    rl.once("close", onClose);
    rl.question(question, answer => { rl.removeListener("close", onClose); resolve(answer.trim()); });
  });
}

export async function runSetup(): Promise<void> {
  console.log("[设置] 正在检测已安装的 AI 编程工具…");
  const detected = detectBackends();
  const names = detected.map(id => getBackend(id)?.name ?? id).join("、");
  console.log(`[设置] 已检测到：${names || "暂无，请先安装并登录 Qwen Code 或其他支持的工具"}`);
  let defaultBackend = detected[0] ?? "qwen";
  if (!process.stdin.isTTY) {
    saveConfig({ detectedBackends: detected, defaultBackend, sandboxMode: "full" });
    console.log("✓ 本地配置已保存。可在网页“设置”中接入飞书，或使用 --setup 重新配置。\n");
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  console.log("\nPiko · 首次设置\n直接回车使用默认值。\n");
  if (detected.length > 1) {
    const choices = detected.map((id, i) => `${i + 1}=${getBackend(id)?.name ?? id}`).join("，");
    const pick = await ask(rl, `默认 AI 工具（${choices}）：`);
    const index = Number.parseInt(pick, 10) - 1;
    if (index >= 0 && index < detected.length) defaultBackend = detected[index];
  }
  console.log("\n成员权限：1=完整访问；2=沙箱（需要对应工具支持并完成沙箱配置）。");
  const mode = await ask(rl, "权限模式（1/2，默认 1）：");
  rl.close();
  saveConfig({ detectedBackends: detected, defaultBackend, sandboxMode: mode === "2" ? "safe" : "full" });
  console.log(`\n✓ 已保存，默认工具：${getBackend(defaultBackend)?.name ?? defaultBackend}`);
  console.log("网页默认直连本地服务，无需 Ably 或内网穿透。");
  console.log("飞书：打开网页 → 设置 → 飞书机器人，按中文步骤填写应用凭据。");
  console.log("国内模型：Qwen Code 的中文配置指南见 DOMESTIC_SETUP.md。\n");
}

import * as Lark from "@larksuiteoapi/node-sdk";
import { config } from "./config.js";
import { FeishuRouter, type FeishuMember } from "./feishu-router.js";
import type { Channel } from "./transport.js";

export function createFeishuChannel(members: () => FeishuMember[]) {
  let ws: Lark.WSClient | undefined;
  let router: FeishuRouter | undefined;
  let lastError = "";
  let pendingCancel: (() => void) | undefined;
  const channel: Channel & { status: () => { connected: boolean; error: string } } = {
    name: "飞书",
    status: () => ({ connected: ws?.getConnectionStatus().state === "connected", error: lastError }),
    async init(commandHandler) {
      lastError = "";
      if (!config.feishuEnabled) return false;
      if (!config.feishuAppId || !config.feishuAppSecret) {
        lastError = "请填写飞书 App ID 和 App Secret。";
        return false;
      }
      const credentials = { appId: config.feishuAppId, appSecret: config.feishuAppSecret, domain: Lark.Domain.Feishu };
      // SDK errors can contain HTTP request objects. Surface sanitized messages,
      // never serialize credential-bearing requests into the gateway log.
      const logger: Lark.Logger = { error() {}, warn() {}, info() {}, debug() {}, trace() {} };
      const client = new Lark.Client({ ...credentials, appType: Lark.AppType.SelfBuild, logger });
      const outbound = new Map<string, Promise<void>>();
      const currentRouter: FeishuRouter = new FeishuRouter({
        allowedUsers: [...config.feishuAllowedUsers], members, command: commandHandler,
        send: async (chat, text) => {
          const queued = (outbound.get(chat) ?? Promise.resolve()).catch(() => {}).then(async () => {
            if (router !== currentRouter) return;
            const result = await client.im.message.create({
              params: { receive_id_type: "chat_id" },
              data: { receive_id: chat, msg_type: "text", content: JSON.stringify({ text }) },
            });
            if (result.code !== 0) throw new Error("飞书消息发送失败，请检查机器人发消息权限。");
          });
          outbound.set(chat, queued);
          try { await queued; } finally { if (outbound.get(chat) === queued) outbound.delete(chat); }
        },
      });
      router = currentRouter;
      const dispatcher = new Lark.EventDispatcher({}).register({
        "im.message.receive_v1": data => {
          // ACK immediately; task startup and HTTP replies must not delay the SDK's event ACK.
          void currentRouter.receive(data).catch(() => { lastError = "飞书消息处理失败，请检查应用权限与网络。"; });
        },
      });
      return await new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (ok: boolean, error = "") => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pendingCancel = undefined;
          if (!ok) { lastError = error; ws?.close({ force: true }); currentRouter.destroy(); }
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false, "飞书连接超时，请检查凭据、网络及长连接设置。"), 15_000);
        pendingCancel = () => finish(false, "连接已取消。");
        ws = new Lark.WSClient({
          ...credentials, logger, handshakeTimeoutMs: 10_000,
          onReady: () => finish(true),
          onError: () => finish(false, "飞书连接失败，请检查应用凭据和长连接设置。"),
        });
        void ws.start({ eventDispatcher: dispatcher }).catch(() => finish(false, "飞书启动失败。"));
      });
    },
    broadcast(event) { void router?.broadcast(event).catch(() => { lastError = "飞书通知发送失败，请检查机器人权限与网络。"; }); },
    destroy() { pendingCancel?.(); ws?.close({ force: true }); ws = undefined; router?.destroy(); router = undefined; },
  };
  return channel;
}

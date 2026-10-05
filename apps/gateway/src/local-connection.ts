import type { IncomingMessage } from "node:http";

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "[::1]" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** Only local clients may bootstrap an owner session; remote clients must pair. */
export function permitsQuickConnect(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress?.replace(/^::ffff:/, "") || "";
  if (!isLoopback(address)) return false;
  try {
    // Reject DNS rebinding even when the TCP peer is the local machine.
    if (!req.headers.host || !isLoopback(new URL(`http://${req.headers.host}`).hostname)) return false;
    const origin = req.headers.origin;
    if (!origin) return req.headers["sec-fetch-site"] !== "cross-site";
    if (["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"].includes(origin)) return true;
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && isLoopback(url.hostname) && origin === url.origin;
  } catch {
    return false;
  }
}

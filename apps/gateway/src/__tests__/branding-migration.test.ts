import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readRuntimeEnv, resolveConfigDir, resolveHomeDataDir } from "@piko/shared/node";
import { migrateBrowserStorage } from "@piko/shared";

test("renaming preserves existing data paths, with explicit new settings taking precedence", () => {
  const home = mkdtempSync(path.join(tmpdir(), "piko-migration-"));
  try {
    assert.equal(resolveHomeDataDir(home, false), path.join(home, ".piko"));
    mkdirSync(path.join(home, ".open-office"));
    assert.equal(resolveHomeDataDir(home, false), path.join(home, ".open-office"));
    mkdirSync(path.join(home, ".crewloom"));
    assert.equal(resolveHomeDataDir(home, false), path.join(home, ".crewloom"));
    assert.equal(resolveHomeDataDir(home, true), path.join(home, ".piko-dev"));
    mkdirSync(path.join(home, ".crewloom-dev"));
    assert.equal(resolveHomeDataDir(home, true), path.join(home, ".crewloom-dev"));
    mkdirSync(path.join(home, ".piko"));
    assert.equal(resolveHomeDataDir(home, false), path.join(home, ".piko"));
    assert.equal(resolveConfigDir({ OPEN_OFFICE_CONFIG_DIR: "/old/config" }, home), "/old/config");
    assert.equal(resolveConfigDir({ PIKO_CONFIG_DIR: "/new/config", OPEN_OFFICE_CONFIG_DIR: "/old/config" }, home), "/new/config");
    assert.equal(resolveConfigDir({ CREWLOOM_CONFIG_DIR: "/existing/profile" }, home), "/existing/profile");
    assert.equal(resolveConfigDir({ PIKO_CONFIG_DIR: "/new/profile", CREWLOOM_CONFIG_DIR: "/existing/profile" }, home), "/new/profile");
    assert.equal(readRuntimeEnv("CODEX_PATH", { CREWLOOM_CODEX_PATH: "/existing/codex" }), "/existing/codex");
    assert.equal(readRuntimeEnv("CODEX_PATH", { OPEN_OFFICE_CODEX_PATH: "/cli/codex" }), "/cli/codex");
    assert.equal(readRuntimeEnv("GATEWAY_ID", { BIT_OFFICE_GATEWAY_ID: "existing" }), "existing");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("Piko upgrade carries forward the latest chats and settings, preserving both existing namespaces", () => {
  const data = new Map([
    ["office_connection", "obsolete-session"],
    ["office-chat-history:desktop", "obsolete-chat"],
    ["crewloom_connection", "current-session"],
    ["crewloom-chat-history:desktop", "current-chat"],
    ["crewloom-team-messages:desktop", "group-updates"],
    ["crewloom-projects:desktop", "current-projects"],
    ["crewloom-ui-language", "zh"],
    ["crewloom-theme", "linen"],
    ["crewloom-selected-id", "Modern"],
    ["piko-ui-language", "en"],
  ]);
  const storage = {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  migrateBrowserStorage(storage);
  assert.equal(data.get("piko_connection"), "current-session");
  assert.equal(data.get("piko-chat-history:desktop"), "current-chat");
  assert.equal(data.get("piko-team-messages:desktop"), "group-updates");
  assert.equal(data.get("piko-projects:desktop"), "current-projects");
  assert.equal(data.get("piko-ui-language"), "en");
  assert.equal(data.get("piko-theme"), "linen");
  assert.equal(data.get("piko-selected-id"), "Modern");
  assert.equal(data.get("crewloom-chat-history:desktop"), "current-chat");
  data.delete("piko_connection");
  migrateBrowserStorage(storage);
  assert.equal(data.has("piko_connection"), false);
});

test("an upgrade never restores deleted chats or logged-out sessions from an obsolete snapshot", () => {
  const data = new Map([
    ["office_connection", "logged-out-session"],
    ["office-chat-history:desktop", "deleted-chat"],
    ["crewloom-storage-migrated-v1", "1"],
    ["crewloom-theme", "mist"],
  ]);
  const storage = {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  migrateBrowserStorage(storage);
  assert.equal(data.has("piko_connection"), false);
  assert.equal(data.has("piko-chat-history:desktop"), false);
  assert.equal(data.get("piko-theme"), "mist");
});

test("browser migration preserves scoped history and preferences without overwriting data or reviving logout", () => {
  const data = new Map([
    ["office_connection", "owner-session"], ["office-chat-history:gateway-a", "history"],
    ["office-ui-language", "zh"], ["piko-ui-language", "en"],
    ["open-office-theme", "linen"], ["unrelated", "keep"],
  ]);
  const storage = {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  migrateBrowserStorage(storage);
  assert.equal(data.get("piko_connection"), "owner-session");
  assert.equal(data.get("piko-chat-history:gateway-a"), "history");
  assert.equal(data.get("piko-ui-language"), "en");
  assert.equal(data.get("piko-theme"), "linen");
  assert.equal(data.get("office-chat-history:gateway-a"), "history");
  assert.equal(data.get("unrelated"), "keep");
  data.delete("piko_connection");
  migrateBrowserStorage(storage);
  assert.equal(data.has("piko_connection"), false);
});

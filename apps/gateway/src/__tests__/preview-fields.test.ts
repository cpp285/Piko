import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { localArtifactPath, normalizePreviewCommand } from "@piko/shared";
import { parseAgentOutput, resolvePreview } from "@piko/orchestrator";

test("Chinese static HTML delivery resolves a playable file instead of a prose launch command", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "office-preview-"));
  try {
    writeFileSync(path.join(cwd, "index.html"), "<!doctype html><title>贪吃蛇</title>");
    const result = parseAgentOutput("STATUS: done\nENTRY_FILE: index.html\nPREVIEW_CMD: 无需命令，直接打开文件\nPREVIEW_PORT: 不适用\nSUMMARY: 完成");
    assert.equal(result.previewCmd, undefined);
    assert.equal(result.entryFile, "index.html");
    assert.equal(resolvePreview({ ...result, cwd, workspace: cwd }).previewPath, path.join(cwd, "index.html"));
    // Previously saved results must also recover a preview.
    assert.equal(resolvePreview({ entryFile: "index.html", previewCmd: "无需命令，直接打开文件", cwd, workspace: cwd }).previewPath, path.join(cwd, "index.html"));
    assert.equal(normalizePreviewCommand("**`npx vite --host 0.0.0.0`**"), "npx vite --host 0.0.0.0");
    assert.equal(resolvePreview({ entryFile: "index.html", previewCmd: "npx vite", previewPort: 5173, cwd, workspace: cwd }).previewPath, undefined);
    for (const placeholder of ["None", "N/A", "不适用", "无需启动命令", "[not provided]"]) assert.equal(normalizePreviewCommand(placeholder), undefined);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("Chinese local artifact links are decoded without hijacking web links", () => {
  assert.equal(localArtifactPath("/Users/test/" + encodeURIComponent("贪吃蛇") + "/index.html"), "/Users/test/贪吃蛇/index.html");
  assert.equal(localArtifactPath("file:///Users/test/game.html"), "/Users/test/game.html");
  assert.equal(localArtifactPath("https://example.com/Users/test/game.html"), undefined);
  assert.equal(localArtifactPath("/docs/game.html"), undefined);
  assert.equal(localArtifactPath("/Users/%broken"), undefined);
});

test("multiline changed files retain the test file and stop at the next result field", () => {
  const result = parseAgentOutput("FILES_CHANGED:\nindex.html\ntests/game.test.cjs\nENTRY_FILE: index.html\nSUMMARY: 两个文件");
  assert.deepEqual(result.changedFiles, ["index.html", "tests/game.test.cjs"]);
  assert.deepEqual(parseAgentOutput("FILES_CHANGED: none\nSUMMARY: 无改动").changedFiles, []);
  assert.deepEqual(parseAgentOutput("FILES_CHANGED: index.html, game.js\nSUMMARY: 完成").changedFiles, ["index.html", "game.js"]);
});

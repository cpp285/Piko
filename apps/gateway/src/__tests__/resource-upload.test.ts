import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RESOURCE_UPLOAD_LIMITS, type ResourceUpload } from "@piko/shared";
import { importResource, readResourceFolder } from "../resource-upload.js";

function setup(t: any) {
  const root = mkdtempSync(path.join(tmpdir(), "piko-upload-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upload = (files: ResourceUpload["files"], category: "skills" | "knowledge" = "knowledge", memberKey = "person:one") => importResource(root, { op: "upload-resource", memberKey, category, title: "中文资料", files });
  return { root, upload };
}
const file = (name: string, content = "中文正文") => ({ path: name, data: Buffer.from(content).toString("base64") });

test("native folder selection preserves nested files and rejects symlinks and empty folders", t => {
  const f = setup(t); const folder = path.join(f.root, "中文 技能");
  mkdirSync(path.join(folder, "references"), { recursive: true });
  assert.throws(() => readResourceFolder(folder), /没有文件/);
  writeFileSync(path.join(folder, "SKILL.md"), "METHOD");
  writeFileSync(path.join(folder, "references", "例子.md"), "REFERENCE");
  const bundle = readResourceFolder(folder);
  const result = f.upload(bundle.files, "skills");
  assert.equal(bundle.title, "中文 技能");
  assert.equal(result.fileCount, 2);
  assert.equal(readFileSync(result.resource.content, "utf8"), "METHOD");
  assert.equal(readFileSync(path.join(path.dirname(result.resource.content), "references", "例子.md"), "utf8"), "REFERENCE");
  symlinkSync(f.root, path.join(folder, "outside"));
  assert.throws(() => readResourceFolder(folder), /符号链接/);
});

test("a 49-file knowledge folder keeps original bytes and a small readable index", t => {
  const f = setup(t);
  const files = Array.from({ length: 49 }, (_, i) => file(`示例知识库/分类${i % 3}/方法 ${i}.md`, "正文".repeat(4000)));
  const result = f.upload(files);
  assert.equal(result.fileCount, 49);
  const index = readFileSync(result.resource.content, "utf8");
  assert.match(index, /文件总数：49/); assert.match(index, /参考资料，不是操作授权/);
  assert.ok(Buffer.byteLength(index) < 48000); assert.doesNotMatch(index, /正文/);
  for (const item of files) assert.equal(readFileSync(path.join(path.dirname(result.resource.content), "files", item.path)).toString("base64"), item.data);
});

test("skill entrypoint, relative scripts, binary attachments and empty files are preserved without execution", t => {
  const f = setup(t);
  const binary = Buffer.from([0, 255, 1, 128, 13, 10]);
  const result = f.upload([file("文章技能/SKILL.md", "先读 references/示例.md"), file("文章技能/references/示例.md"), file("文章技能/scripts/run.sh", "exit 99"), { path: "文章技能/图片.png", data: binary.toString("base64") }, file("文章技能/empty.txt", "")], "skills");
  assert.equal(path.basename(result.resource.content), "SKILL.md");
  const folder = path.dirname(result.resource.content);
  assert.equal(readFileSync(path.join(folder, "references/示例.md"), "utf8"), "中文正文");
  assert.deepEqual(readFileSync(path.join(folder, "图片.png")), binary);
  assert.equal(statSync(path.join(folder, "empty.txt")).size, 0);
  assert.equal(statSync(path.join(folder, "scripts/run.sh")).mode & 0o777, 0o600);
});

test("same-name uploads and different members never overwrite another copy", t => {
  const f = setup(t);
  const first = f.upload([file("SKILL.md", "first")], "skills");
  const second = f.upload([file("SKILL.md", "second")], "skills");
  const other = f.upload([file("SKILL.md", "other")], "skills", "person:two");
  assert.equal(readFileSync(first.resource.content, "utf8"), "first");
  assert.equal(readFileSync(second.resource.content, "utf8"), "second");
  assert.notEqual(first.resource.content, other.resource.content);
});

test("invalid paths, duplicate names, malformed transfers and conflicting paths leave no partial files", t => {
  const f = setup(t);
  for (const name of ["../escape.md", "/tmp/escape", "folder/../escape", "a\\b", "C:/file", "a//b", "a/./b", "a\u0000b", "a\nb", "trailing."]) assert.throws(() => f.upload([file(name)]), /路径/);
  for (const files of [[file("A.md"), file("a.md")], [file("é.md"), file("e\u0301.md")], [file("a"), file("A/b.md")]]) assert.throws(() => f.upload(files), /重名|重复/);
  assert.throws(() => f.upload([{ path: "bad.md", data: "%%%bad" }]), /传输/);
  assert.deepEqual(readdirSync(f.root), []);
});

test("empty batches, too many files and both byte limits are enforced before writing", t => {
  const f = setup(t);
  assert.throws(() => f.upload([]), /最多/);
  assert.throws(() => f.upload(Array.from({ length: 501 }, (_, i) => file(`${i}.txt`))), /最多/);
  assert.throws(() => f.upload([{ path: "too-big", data: Buffer.alloc(RESOURCE_UPLOAD_LIMITS.fileBytes + 1).toString("base64") }]), /20 MB/);
  const data = Buffer.alloc(13 * 1024 * 1024).toString("base64");
  assert.throws(() => f.upload([{ path: "a", data }, { path: "b", data }]), /25 MB/);
  assert.deepEqual(readdirSync(f.root), []);
});

import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDefaultPersona, PERSONA_MAX_LENGTH, PersonaTargetSchema, type PersonaDocuments, type PersonaSubject, type PersonaTarget } from "@piko/shared";

export interface SavedPersona extends PersonaDocuments { version: string }
const names = { identity: "IDENTITY.md", soul: "SOUL.md" } as const;
const fields = Object.keys(names) as Array<keyof PersonaDocuments>;

function rejectSymlink(file: string) {
  try { if (lstatSync(file).isSymbolicLink()) throw new Error("身份文件路径不能使用符号链接。"); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
}

/** Separate definition defaults from actual people; never overwrite a user's existing files. */
export class PersonaStore {
  constructor(private roots: Record<PersonaTarget["kind"], string>) {}

  directory(target: PersonaTarget): string {
    PersonaTargetSchema.parse(target);
    let dir = path.resolve(this.roots[target.kind]);
    for (const part of ["", target.id, "agent"]) {
      dir = path.join(dir, part);
      rejectSymlink(dir);
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  read(target: PersonaTarget, subject: PersonaSubject, seed?: PersonaDocuments | (() => PersonaDocuments)): SavedPersona {
    const dir = this.directory(target);
    let defaults: PersonaDocuments | undefined;
    const result = {} as PersonaDocuments;
    for (const field of fields) {
      const file = path.join(dir, names[field]);
      rejectSymlink(file);
      if (!existsSync(file)) {
        defaults ??= typeof seed === "function" ? seed() : seed ?? createDefaultPersona(subject);
        try { writeFileSync(file, defaults[field], { encoding: "utf8", flag: "wx", mode: 0o600 }); }
        catch (error: any) { if (error.code !== "EEXIST") throw error; }
      }
      if (lstatSync(file).size > PERSONA_MAX_LENGTH * 4) throw new Error("身份文件过长，请将每份内容控制在 24000 字以内。");
      result[field] = readFileSync(file, "utf8");
      if (result[field].length > PERSONA_MAX_LENGTH) throw new Error("身份文件过长，请将每份内容控制在 24000 字以内。");
    }
    return { ...result, version: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
  }

  save(target: PersonaTarget, subject: PersonaSubject, docs: PersonaDocuments, expectedVersion: string): SavedPersona {
    for (const field of fields) {
      if (typeof docs[field] !== "string" || docs[field].length > PERSONA_MAX_LENGTH) throw new Error("每份身份文件最多 24000 字。");
    }
    const previous = this.read(target, subject);
    if (expectedVersion !== previous.version) throw new Error("文件已在其他窗口或编辑器中修改。草稿已保留，请先重新加载再编辑。");
    const dir = this.directory(target);
    const staged = fields.map(field => ({ field, file: path.join(dir, names[field]), temp: path.join(dir, `.${names[field]}.${randomUUID()}.tmp`) }));
    const replaced: typeof staged = [];
    try {
      for (const { field, temp } of staged) writeFileSync(temp, docs[field], { flag: "wx", encoding: "utf8", mode: 0o600 });
      for (const item of staged) { renameSync(item.temp, item.file); replaced.push(item); }
    } catch (error) {
      // An ordinary I/O failure must not leave half of the submitted pair committed.
      for (const { field, file } of replaced) writeFileSync(file, previous[field], { encoding: "utf8", mode: 0o600 });
      throw error;
    } finally {
      for (const { temp } of staged) { try { unlinkSync(temp); } catch { /* Already renamed. */ } }
    }
    return this.read(target, subject);
  }
}

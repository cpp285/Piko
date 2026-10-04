/** A human-readable skill filename, including Chinese; never a filesystem path. */
export function normalizeSkillName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function isSafeSkillName(name: string): boolean {
  return /^[\p{L}\p{N}_-]{1,80}$/u.test(name);
}

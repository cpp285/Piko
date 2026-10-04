interface BrowserStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Copy legacy preferences/history once; never overwrite current data or revive a logout. */
export function migrateBrowserStorage(storage: BrowserStorage): void {
  const marker = "piko-storage-migrated-v1";
  if (storage.getItem(marker)) return;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  const predecessorMigrated = storage.getItem("crewloom-storage-migrated-v1") !== null;
  // Copy the most recent namespace first; older snapshots must not revive deleted data.
  const ordered = [
    ...keys.filter(key => key?.startsWith("crewloom")),
    ...keys.filter(key => !key?.startsWith("crewloom")),
  ];
  for (const key of ordered) {
    if (!key) continue;
    const fromPredecessor = key === "crewloom_connection" ? "piko_connection"
      : /^crewloom-(theme|ui-language|layout|chat-history|team-messages|projects|team-phase|active-project|sound-enabled|console-cols|console-rows|view-mode|selected-id)(:|$)/.test(key)
        ? key.replace(/^crewloom-/, "piko-") : null;
    const fromOlder = predecessorMigrated ? null
      : key === "open-office-theme" ? "piko-theme"
      : key === "office_connection" ? "piko_connection"
      : /^office-(ui-language|layout|chat-history|team-messages|projects|team-phase|active-project|sound-enabled|console-cols|console-rows|view-mode|selected-id)(:|$)/.test(key)
        ? key.replace(/^office-/, "piko-") : null;
    const next = fromPredecessor ?? fromOlder;
    if (!next || storage.getItem(next) !== null) continue;
    const value = storage.getItem(key);
    if (value !== null) storage.setItem(next, value);
  }
  storage.setItem(marker, "1");
}

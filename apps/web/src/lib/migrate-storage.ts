import { migrateBrowserStorage } from "@piko/shared";

if (typeof window !== "undefined") {
  // A browser may disallow one storage surface while permitting the other.
  try { migrateBrowserStorage(window.localStorage); } catch { /* Storage unavailable. */ }
  try { migrateBrowserStorage(window.sessionStorage); } catch { /* Storage unavailable. */ }
}

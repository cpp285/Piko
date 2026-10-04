"use client";
import { tr, trNode, useLocale } from "@/lib/ui-language";
export default function NotFound() {
  useLocale();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <h1 style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.2rem" }}>{tr("404 — Not Found")}</h1>
    </div>
  );
}

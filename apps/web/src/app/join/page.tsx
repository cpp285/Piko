"use client";
import { tr, trNode, useLocale } from "@/lib/ui-language";


import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function JoinContent() {
  useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Joining...");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Missing share token in URL.");
      return;
    }

    validateToken(token);
  }, [searchParams]);

  async function validateToken(token: string) {
    try {
      const gatewayParam = searchParams.get("gateway");
      const baseUrl = gatewayParam
        ? (gatewayParam.includes("://") ? gatewayParam : `http://${gatewayParam}`)
        : window.location.origin;

      setStatus("Validating share link...");

      const res = await fetch(`${baseUrl}/share/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Invalid share link");
        return;
      }

      const { saveConnection } = await import("@/lib/storage");
      saveConnection({
        mode: data.hasAbly ? "ably" : "ws",
        machineId: data.machineId,
        wsUrl: data.wsUrl,
        role: data.role,
        sessionToken: data.sessionToken,
      });

      router.push("/office");
    } catch {
      setError("Cannot reach gateway. The share link may be invalid.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{tr("Piko")}</h1>
      {!error && <p style={{ color: "#666", fontSize: 14 }}>{trNode(status)}</p>}
      {error && (
        <>
          <p style={{ color: "#ef4444", fontSize: 14, marginTop: 16 }}>{trNode(error)}</p>
          <button
            onClick={() => router.push("/pair")}
            style={{
              marginTop: 24, padding: "12px 24px", borderRadius: 8, border: "none",
              backgroundColor: "var(--term-panel)", color: "#fff", fontSize: 16, cursor: "pointer",
            }}
          >
            {tr("Go to Pair Page")}</button>
        </>
      )}
    </div>
  );
}

export default function JoinPage() {
  useLocale();
  return (
    <Suspense fallback={
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{tr("Piko")}</h1>
        <p style={{ color: "#666", fontSize: 14 }}>{tr("Loading...")}</p>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}

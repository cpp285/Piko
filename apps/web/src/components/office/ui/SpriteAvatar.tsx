"use client";

import { useEffect, useRef, useState } from "react";
import { loadCharacterSprite } from "@/components/office/sprites/characterLoader";
import { tr, useLocale } from "@/lib/ui-language";

function SpriteAvatar({ palette, zoom = 3, ready }: { palette: number; zoom?: number; ready?: boolean }) {
  useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    canvas.width = 16 * zoom;
    canvas.height = 32 * zoom;
    const draw = async (canRetry = true) => {
      setFailed(false);
      try {
        const { portrait } = await loadCharacterSprite(palette);
        if (cancelled) return;
        canvas.width = portrait.width;
        canvas.height = portrait.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Avatar canvas unavailable");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(portrait, 0, 0);
      } catch {
        if (cancelled) return;
        setFailed(true);
        if (canRetry) retry = setTimeout(() => { void draw(false); }, 1_000);
      }
    };
    const reconnect = () => {
      clearTimeout(retry);
      void draw();
    };
    void draw();
    window.addEventListener("online", reconnect);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      window.removeEventListener("online", reconnect);
    };
  }, [palette, zoom, ready]);

  const label = tr(failed ? "Avatar failed to load" : "Member avatar");
  return (
    <span role="img" aria-label={label} title={failed ? label : undefined} style={{ position: "relative", display: "inline-block", width: 16 * zoom, height: 32 * zoom, flexShrink: 0 }}>
      <canvas ref={canvasRef} width={16 * zoom} height={32 * zoom} aria-hidden="true" style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }} />
      {failed && <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--term-dim)" }}>!</span>}
    </span>
  );
}

export default SpriteAvatar;

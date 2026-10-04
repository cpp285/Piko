"use client";

import { tr, useLocale } from "@/lib/ui-language";

export default function OfficeSplash({ onComplete }: { onComplete: () => void }) {
  useLocale();
  return <main className="welcome-page">
    <div className="welcome-nav"><span className="office-brand-mark">◈</span><strong>{tr("Piko")}</strong></div>
    <div className="welcome-grid">
      <section className="welcome-copy">
        <span className="welcome-kicker">{tr("Welcome to your office")}</span>
        <h1>{tr("Your workspace, in daylight.")}</h1>
        <p>{tr("A calm workspace for your AI team.")}</p>
        <button className="welcome-start" onClick={onComplete}>{tr("Start working")} <span>↗</span></button>
        <div className="welcome-steps">
          {["Plan together", "Assign clear tasks", "Review every delivery"].map((step, i) => <div key={step}><span>0{i + 1}</span>{tr(step)}</div>)}
        </div>
      </section>
      <div className="welcome-art"><div className="welcome-art-tag">{tr("Office")}</div><img src="/offices/garden-studio.png" alt={tr("花园工作室")} /><span className="welcome-art-caption">{tr("Local tools. Shared progress. Clear outcomes.")}</span></div>
    </div>
  </main>;
}

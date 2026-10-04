"use client";

import { useEffect } from "react";
import { usePreferences } from "@/lib/ui-language";

export default function AppPreferences() {
  const language = usePreferences(state => state.language);
  const setLanguage = usePreferences(state => state.setLanguage);
  useEffect(() => {
    const saved = localStorage.getItem("piko-ui-language");
    if (saved === "en" || saved === "zh") setLanguage(saved);
  }, [setLanguage]);
  return <div className="language-switch" role="group" aria-label="界面语言 / Interface language">
    <button aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文</button>
    <button aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
  </div>;
}

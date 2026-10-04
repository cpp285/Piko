"use client";

import "@/lib/migrate-storage";


import { create } from "zustand";
import type { ReactNode } from "react";
import { translateUI, type UILanguage } from "@piko/shared";

export const usePreferences = create<{ language: UILanguage; setLanguage: (language: UILanguage) => void }>(set => ({
  language: "zh",
  setLanguage: language => {
    set({ language });
    if (typeof window !== "undefined") {
      localStorage.setItem("piko-ui-language", language);
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    }
  },
}));

export function useLocale(): UILanguage {
  return usePreferences(state => state.language);
}

export function tr<T extends string | undefined>(text: T): T {
  if (typeof text !== "string") return text;
  return translateUI(text, usePreferences.getState().language) as T;
}

/** Translate UI strings only; structured React nodes remain untouched. */
export function trNode(node: ReactNode): ReactNode {
  return typeof node === "string" ? tr(node) : node;
}

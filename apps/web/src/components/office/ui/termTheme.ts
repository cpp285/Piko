export type TermTheme = {
  name: string;
  accent: string;
  accentRgb: string;
  dim: string;
  text: string;
  textBright: string;
  bg: string;
  panel: string;
  surface: string;
  hover: string;
  border: string;
  borderDim: string;
  codeBg: string;
  codeText: string;
  scrollThumb: string;
  clean?: boolean;
  // Semantic colors — for status indicators, warnings, etc.
  green: string;   // success / working
  yellow: string;  // warning / approval
  red: string;     // error / danger
  blue: string;    // info / working
  purple: string;  // secondary accent
  cyan: string;    // highlights / role name
};

export const TERM_THEMES: Record<string, TermTheme> = {
  daylight: { name: "Daylight", accent: "#39755f", accentRgb: "57,117,95", dim: "#738078", text: "#44564e", textBright: "#213b2f", bg: "#f5f7f2", panel: "#ffffff", surface: "#edf2ec", hover: "#e3ece3", border: "#d9e2d7", borderDim: "#e9eee6", codeBg: "#f0f4ed", codeText: "#425b49", scrollThumb: "#a4b4a4", clean: true, green: "#348362", yellow: "#ac772a", red: "#b65543", blue: "#477a92", purple: "#827598", cyan: "#37837c" },
  linen: { name: "Linen", accent: "#956c43", accentRgb: "149,108,67", dim: "#738078", text: "#44564e", textBright: "#213b2f", bg: "#faf6ef", panel: "#ffffff", surface: "#f3eee5", hover: "#eee4d7", border: "#e1d8cc", borderDim: "#e9eee6", codeBg: "#f0f4ed", codeText: "#425b49", scrollThumb: "#a4b4a4", clean: true, green: "#348362", yellow: "#ac772a", red: "#b65543", blue: "#477a92", purple: "#827598", cyan: "#37837c" },
  mist: { name: "Mist", accent: "#47768f", accentRgb: "71,118,143", dim: "#738078", text: "#44564e", textBright: "#213b2f", bg: "#f3f7fa", panel: "#ffffff", surface: "#eaf1f6", hover: "#e1ebf2", border: "#d6e2ea", borderDim: "#e9eee6", codeBg: "#f0f4ed", codeText: "#425b49", scrollThumb: "#a4b4a4", clean: true, green: "#348362", yellow: "#ac772a", red: "#b65543", blue: "#477a92", purple: "#827598", cyan: "#37837c" },
};

// Mutable theme variables — reassigned by applyTermTheme()
// Defaults match the light daylight theme
export let TERM_GREEN = TERM_THEMES.daylight.accent;
export let TERM_DIM = TERM_THEMES.daylight.dim;
export let TERM_TEXT = TERM_THEMES.daylight.text;
export let TERM_TEXT_BRIGHT = TERM_THEMES.daylight.textBright;
export let TERM_ERROR = TERM_THEMES.daylight.red;
export let TERM_GLOW = "none";
export let TERM_BG = TERM_THEMES.daylight.bg;
export let TERM_PANEL = TERM_THEMES.daylight.panel;
export let TERM_SURFACE = TERM_THEMES.daylight.surface;
export let TERM_HOVER = TERM_THEMES.daylight.hover;
export let TERM_BORDER = TERM_THEMES.daylight.border;
export let TERM_BORDER_DIM = TERM_THEMES.daylight.borderDim;
export let TERM_GLOW_BORDER = "none";
export let TERM_GLOW_FOCUS = "none";
// Semantic color exports
export let TERM_SEM_GREEN = TERM_THEMES.daylight.green;
export let TERM_SEM_YELLOW = TERM_THEMES.daylight.yellow;
export let TERM_SEM_RED = TERM_THEMES.daylight.red;
export let TERM_SEM_BLUE = TERM_THEMES.daylight.blue;
export let TERM_SEM_PURPLE = TERM_THEMES.daylight.purple;
export let TERM_SEM_CYAN = TERM_THEMES.daylight.cyan;

export function applyTermTheme(key: string) {
  const t = TERM_THEMES[key] ?? TERM_THEMES["daylight"];
  TERM_GREEN = t.accent;
  TERM_DIM = t.dim;
  TERM_TEXT = t.text;
  TERM_TEXT_BRIGHT = t.textBright;
  TERM_ERROR = t.red;
  TERM_BG = t.bg;
  TERM_PANEL = t.panel;
  TERM_SURFACE = t.surface;
  TERM_HOVER = t.hover;
  TERM_BORDER = t.border;
  TERM_BORDER_DIM = t.borderDim;
  // All themes are clean — no glow effects
  TERM_GLOW = t.clean ? "none" : `0 0 8px rgba(${t.accentRgb},0.25)`;
  TERM_GLOW_BORDER = t.clean ? "none" : `0 0 6px ${t.accent}15, inset 0 0 6px ${t.accent}08`;
  TERM_GLOW_FOCUS = t.clean ? "none" : `0 0 12px ${t.accent}30, 0 0 4px ${t.accent}20`;
  // Semantic colors
  TERM_SEM_GREEN = t.green;
  TERM_SEM_YELLOW = t.yellow;
  TERM_SEM_RED = t.red;
  TERM_SEM_BLUE = t.blue;
  TERM_SEM_PURPLE = t.purple;
  TERM_SEM_CYAN = t.cyan;
  // Update CSS variables for layout.tsx CSS rules
  if (typeof document !== "undefined") {
    const s = document.documentElement.style;
    s.setProperty("--term-bg", t.bg);
    s.setProperty("--term-panel", t.panel);
    s.setProperty("--term-surface", t.surface);
    s.setProperty("--term-hover", t.hover);
    s.setProperty("--term-border", t.border);
    s.setProperty("--term-border-dim", t.borderDim);
    s.setProperty("--term-text", t.text);
    s.setProperty("--term-text-bright", t.textBright);
    s.setProperty("--term-dim", t.dim);
    s.setProperty("--term-accent", t.accent);
    s.setProperty("--term-accent-rgb", t.accentRgb);
    s.setProperty("--term-green", t.accent);
    s.setProperty("--term-yellow", t.yellow);
    s.setProperty("--term-red", t.red);
    s.setProperty("--term-blue", t.blue);
    s.setProperty("--term-purple", t.purple);
    s.setProperty("--term-cyan", t.cyan);
    // Semantic aliases used by Tailwind (sem-green, sem-yellow, etc.)
    s.setProperty("--term-sem-green", t.green);
    s.setProperty("--term-sem-yellow", t.yellow);
    s.setProperty("--term-sem-red", t.red);
    s.setProperty("--term-sem-blue", t.blue);
    s.setProperty("--term-sem-purple", t.purple);
    s.setProperty("--term-sem-cyan", t.cyan);
    s.setProperty("--term-code-bg", t.codeBg);
    s.setProperty("--term-code-text", t.codeText);
    s.setProperty("--term-scroll-thumb", t.scrollThumb);
  }
}

export const TERM_FONT = `"Berkeley Mono", "JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", "Menlo", monospace`;
export const TERM_SIZE = 13;

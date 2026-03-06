export interface ThemePreset {
  key: string;
  name: string;
  description: string;
  colors: Record<string, string>;
}

const STORAGE_KEY = "tenso-theme";
const COLORS_KEY = "tenso-theme-colors";
const CUSTOM_THEMES_KEY = "tenso-custom-themes";

export const themes: ThemePreset[] = [
  {
    key: "tokyo-night",
    name: "Tokyo Night",
    description: "Cool blue tones",
    colors: {
      "--bg-primary": "#16161e",
      "--bg-secondary": "#1a1b26",
      "--bg-tertiary": "#24283b",
      "--bg-surface": "#1f2335",
      "--bg-hover": "#292e42",
      "--bg-active": "#33384f",
      "--text-primary": "#c0caf5",
      "--text-secondary": "#a9b1d6",
      "--text-muted": "#565f89",
      "--text-dim": "#3b4261",
      "--border": "#292e42",
      "--border-subtle": "#1f2335",
      "--accent": "#7aa2f7",
      "--accent-hover": "#89b4fa",
      "--accent-dim": "rgba(122, 162, 247, 0.12)",
      "--accent-glow": "rgba(122, 162, 247, 0.25)",
      "--success": "#9ece6a",
      "--success-dim": "rgba(158, 206, 106, 0.12)",
      "--warning": "#e0af68",
      "--warning-dim": "rgba(224, 175, 104, 0.12)",
      "--error": "#f7768e",
      "--error-dim": "rgba(247, 118, 142, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
    },
  },
  {
    key: "catppuccin",
    name: "Catppuccin Mocha",
    description: "Warm pastels",
    colors: {
      "--bg-primary": "#1e1e2e",
      "--bg-secondary": "#181825",
      "--bg-tertiary": "#313244",
      "--bg-surface": "#24243a",
      "--bg-hover": "#393950",
      "--bg-active": "#45475a",
      "--text-primary": "#cdd6f4",
      "--text-secondary": "#bac2de",
      "--text-muted": "#6c7086",
      "--text-dim": "#45475a",
      "--border": "#313244",
      "--border-subtle": "#24243a",
      "--accent": "#cba6f7",
      "--accent-hover": "#d4b8fa",
      "--accent-dim": "rgba(203, 166, 247, 0.12)",
      "--accent-glow": "rgba(203, 166, 247, 0.25)",
      "--success": "#a6e3a1",
      "--success-dim": "rgba(166, 227, 161, 0.12)",
      "--warning": "#f9e2af",
      "--warning-dim": "rgba(249, 226, 175, 0.12)",
      "--error": "#f38ba8",
      "--error-dim": "rgba(243, 139, 168, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
    },
  },
  {
    key: "dracula",
    name: "Dracula",
    description: "Purple & pink",
    colors: {
      "--bg-primary": "#282a36",
      "--bg-secondary": "#21222c",
      "--bg-tertiary": "#343746",
      "--bg-surface": "#2c2e3a",
      "--bg-hover": "#3c3f52",
      "--bg-active": "#454862",
      "--text-primary": "#f8f8f2",
      "--text-secondary": "#c0c0d0",
      "--text-muted": "#6272a4",
      "--text-dim": "#44475a",
      "--border": "#343746",
      "--border-subtle": "#2c2e3a",
      "--accent": "#bd93f9",
      "--accent-hover": "#caa4fc",
      "--accent-dim": "rgba(189, 147, 249, 0.12)",
      "--accent-glow": "rgba(189, 147, 249, 0.25)",
      "--success": "#50fa7b",
      "--success-dim": "rgba(80, 250, 123, 0.12)",
      "--warning": "#f1fa8c",
      "--warning-dim": "rgba(241, 250, 140, 0.12)",
      "--error": "#ff5555",
      "--error-dim": "rgba(255, 85, 85, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
    },
  },
  {
    key: "synthwave",
    name: "Synthwave",
    description: "Neon retro",
    colors: {
      "--bg-primary": "#13111a",
      "--bg-secondary": "#1a1726",
      "--bg-tertiary": "#261f38",
      "--bg-surface": "#1f1a2e",
      "--bg-hover": "#2e2544",
      "--bg-active": "#382d52",
      "--text-primary": "#f0e8ff",
      "--text-secondary": "#c4b5e0",
      "--text-muted": "#7a6b99",
      "--text-dim": "#4d4066",
      "--border": "#2e2544",
      "--border-subtle": "#1f1a2e",
      "--accent": "#ff7edb",
      "--accent-hover": "#ff9fe4",
      "--accent-dim": "rgba(255, 126, 219, 0.14)",
      "--accent-glow": "rgba(255, 126, 219, 0.30)",
      "--success": "#72f1b8",
      "--success-dim": "rgba(114, 241, 184, 0.12)",
      "--warning": "#fede5d",
      "--warning-dim": "rgba(254, 222, 93, 0.12)",
      "--error": "#fe4450",
      "--error-dim": "rgba(254, 68, 80, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.4)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.5)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.6)",
    },
  },
  {
    key: "nord",
    name: "Nord",
    description: "Arctic frost",
    colors: {
      "--bg-primary": "#2e3440",
      "--bg-secondary": "#272c36",
      "--bg-tertiary": "#3b4252",
      "--bg-surface": "#333a47",
      "--bg-hover": "#434c5e",
      "--bg-active": "#4c566a",
      "--text-primary": "#eceff4",
      "--text-secondary": "#d8dee9",
      "--text-muted": "#7b88a1",
      "--text-dim": "#4c566a",
      "--border": "#3b4252",
      "--border-subtle": "#333a47",
      "--accent": "#88c0d0",
      "--accent-hover": "#8fbcbb",
      "--accent-dim": "rgba(136, 192, 208, 0.12)",
      "--accent-glow": "rgba(136, 192, 208, 0.25)",
      "--success": "#a3be8c",
      "--success-dim": "rgba(163, 190, 140, 0.12)",
      "--warning": "#ebcb8b",
      "--warning-dim": "rgba(235, 203, 139, 0.12)",
      "--error": "#bf616a",
      "--error-dim": "rgba(191, 97, 106, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.25)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.35)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.45)",
    },
  },
  {
    key: "ayu-dark",
    name: "Ayu Dark",
    description: "Warm amber",
    colors: {
      "--bg-primary": "#0b0e14",
      "--bg-secondary": "#0f1119",
      "--bg-tertiary": "#1a1e29",
      "--bg-surface": "#141820",
      "--bg-hover": "#1f2430",
      "--bg-active": "#272d3a",
      "--text-primary": "#bfbdb6",
      "--text-secondary": "#9da5b4",
      "--text-muted": "#565b66",
      "--text-dim": "#3d424d",
      "--border": "#1a1e29",
      "--border-subtle": "#141820",
      "--accent": "#e6b450",
      "--accent-hover": "#f0c366",
      "--accent-dim": "rgba(230, 180, 80, 0.12)",
      "--accent-glow": "rgba(230, 180, 80, 0.25)",
      "--success": "#7fd962",
      "--success-dim": "rgba(127, 217, 98, 0.12)",
      "--warning": "#ffb454",
      "--warning-dim": "rgba(255, 180, 84, 0.12)",
      "--error": "#d95757",
      "--error-dim": "rgba(217, 87, 87, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.4)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.5)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.6)",
    },
  },
  {
    key: "vesper",
    name: "Vesper",
    description: "Golden dusk",
    colors: {
      "--bg-primary": "#101010",
      "--bg-secondary": "#141414",
      "--bg-tertiary": "#1e1e1e",
      "--bg-surface": "#191919",
      "--bg-hover": "#252525",
      "--bg-active": "#2c2c2c",
      "--text-primary": "#d4d4d4",
      "--text-secondary": "#a1a1a1",
      "--text-muted": "#5a5a5a",
      "--text-dim": "#404040",
      "--border": "#1e1e1e",
      "--border-subtle": "#191919",
      "--accent": "#ffc799",
      "--accent-hover": "#ffd4b0",
      "--accent-dim": "rgba(255, 199, 153, 0.10)",
      "--accent-glow": "rgba(255, 199, 153, 0.20)",
      "--accent-fg": "#101010",
      "--success": "#6bdfb8",
      "--success-dim": "rgba(107, 223, 184, 0.12)",
      "--warning": "#ffc799",
      "--warning-dim": "rgba(255, 199, 153, 0.12)",
      "--error": "#f07178",
      "--error-dim": "rgba(240, 113, 120, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.5)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.6)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.7)",
    },
  },
  {
    key: "cyberpunk",
    name: "Cyberpunk",
    description: "Electric neon",
    colors: {
      "--bg-primary": "#0a0a12",
      "--bg-secondary": "#0e0e1a",
      "--bg-tertiary": "#1a1a2e",
      "--bg-surface": "#131322",
      "--bg-hover": "#222240",
      "--bg-active": "#2a2a4e",
      "--text-primary": "#e0f0ff",
      "--text-secondary": "#a0c4e8",
      "--text-muted": "#5570a0",
      "--text-dim": "#3a4a70",
      "--border": "#1a1a2e",
      "--border-subtle": "#131322",
      "--accent": "#00f0ff",
      "--accent-hover": "#40f8ff",
      "--accent-dim": "rgba(0, 240, 255, 0.10)",
      "--accent-glow": "rgba(0, 240, 255, 0.30)",
      "--success": "#0dff72",
      "--success-dim": "rgba(13, 255, 114, 0.10)",
      "--warning": "#ffe600",
      "--warning-dim": "rgba(255, 230, 0, 0.10)",
      "--error": "#ff2060",
      "--error-dim": "rgba(255, 32, 96, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.5)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.6)",
      "--shadow-lg": "0 8px 32px rgba(0,240,255,0.08)",
    },
  },
  {
    key: "rose-pine",
    name: "Rose Pine",
    description: "Muted rose",
    colors: {
      "--bg-primary": "#191724",
      "--bg-secondary": "#1f1d2e",
      "--bg-tertiary": "#26233a",
      "--bg-surface": "#222038",
      "--bg-hover": "#2e2b44",
      "--bg-active": "#36334e",
      "--text-primary": "#e0def4",
      "--text-secondary": "#c4c0e0",
      "--text-muted": "#6e6a86",
      "--text-dim": "#524f67",
      "--border": "#26233a",
      "--border-subtle": "#222038",
      "--accent": "#c4a7e7",
      "--accent-hover": "#d0b8ed",
      "--accent-dim": "rgba(196, 167, 231, 0.12)",
      "--accent-glow": "rgba(196, 167, 231, 0.25)",
      "--success": "#9ccfd8",
      "--success-dim": "rgba(156, 207, 216, 0.12)",
      "--warning": "#f6c177",
      "--warning-dim": "rgba(246, 193, 119, 0.12)",
      "--error": "#eb6f92",
      "--error-dim": "rgba(235, 111, 146, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
    },
  },
  {
    key: "kanagawa",
    name: "Kanagawa",
    description: "Japanese ink",
    colors: {
      "--bg-primary": "#1f1f28",
      "--bg-secondary": "#1a1a22",
      "--bg-tertiary": "#2a2a37",
      "--bg-surface": "#232330",
      "--bg-hover": "#32323f",
      "--bg-active": "#3a3a4a",
      "--text-primary": "#dcd7ba",
      "--text-secondary": "#c8c093",
      "--text-muted": "#727169",
      "--text-dim": "#54546d",
      "--border": "#2a2a37",
      "--border-subtle": "#232330",
      "--accent": "#7e9cd8",
      "--accent-hover": "#9cb4e4",
      "--accent-dim": "rgba(126, 156, 216, 0.12)",
      "--accent-glow": "rgba(126, 156, 216, 0.25)",
      "--success": "#98bb6c",
      "--success-dim": "rgba(152, 187, 108, 0.12)",
      "--warning": "#e6c384",
      "--warning-dim": "rgba(230, 195, 132, 0.12)",
      "--error": "#c34043",
      "--error-dim": "rgba(195, 64, 67, 0.12)",
      "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
      "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
      "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
    },
  },
];

export function applyTheme(key: string) {
  const theme = themes.find(t => t.key === key);
  if (theme) {
    applyThemeColors(theme.colors, key);
    return;
  }

  // Check custom themes
  const custom = getCustomThemes().find(t => t.key === key);
  if (custom) {
    applyThemeColors(custom.colors, key);
    return;
  }

  // Restore community theme from persisted colors
  try {
    const stored = localStorage.getItem(COLORS_KEY);
    if (stored) {
      const colors = JSON.parse(stored) as Record<string, string>;
      applyThemeColors(colors, key);
      return;
    }
  } catch {
    // Fall through to default
  }

  // Fallback to default theme
  const fallback = themes[0];
  applyThemeColors(fallback.colors, fallback.key);
}

export function applyThemeColors(colors: Record<string, string>, key: string) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(colors)) {
    root.style.setProperty(prop, value);
  }

  root.removeAttribute("data-theme");

  localStorage.setItem(STORAGE_KEY, key);
  // Persist color map for community themes so they survive app restart
  localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
}

export function getStoredTheme(): string {
  return localStorage.getItem(STORAGE_KEY) || "tokyo-night";
}

const FAVORITES_KEY = "tenso-theme-favorites";

export function getFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleFavorite(key: string): string[] {
  const favs = getFavorites();
  const idx = favs.indexOf(key);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(key);
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  return favs;
}

// ===== Custom Themes =====

export function getCustomThemes(): ThemePreset[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCustomTheme(theme: ThemePreset): void {
  const customs = getCustomThemes();
  const idx = customs.findIndex(t => t.key === theme.key);
  if (idx >= 0) {
    customs[idx] = theme;
  } else {
    customs.push(theme);
  }
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customs));
}

export function deleteCustomTheme(key: string): void {
  const customs = getCustomThemes().filter(t => t.key !== key);
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customs));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

function lighten(hex: string, pct: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const f = pct / 100;
  const r = Math.min(255, Math.round(c.r + (255 - c.r) * f));
  const g = Math.min(255, Math.round(c.g + (255 - c.g) * f));
  const b = Math.min(255, Math.round(c.b + (255 - c.b) * f));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darken(hex: string, pct: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const f = 1 - pct / 100;
  const r = Math.round(c.r * f);
  const g = Math.round(c.g * f);
  const b = Math.round(c.b * f);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function withAlpha(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

export function deriveFullColors(base: Record<string, string>): Record<string, string> {
  const accent = base["--accent"] || "#7aa2f7";
  const bgPrimary = base["--bg-primary"] || "#16161e";
  const bgSurface = base["--bg-surface"] || base["--bg-tertiary"] || "#1f2335";
  const textMuted = base["--text-muted"] || "#565f89";
  const border = base["--border"] || "#292e42";
  const success = base["--success"] || "#9ece6a";
  const warning = base["--warning"] || "#e0af68";
  const error = base["--error"] || "#f7768e";

  return {
    "--bg-primary": bgPrimary,
    "--bg-secondary": base["--bg-secondary"] || "#1a1b26",
    "--bg-tertiary": base["--bg-tertiary"] || "#24283b",
    "--bg-surface": bgSurface,
    "--bg-hover": lighten(bgPrimary, 8),
    "--bg-active": lighten(bgPrimary, 12),
    "--text-primary": base["--text-primary"] || "#c0caf5",
    "--text-secondary": base["--text-secondary"] || "#a9b1d6",
    "--text-muted": textMuted,
    "--text-dim": darken(textMuted, 30),
    "--border": border,
    "--border-subtle": bgSurface,
    "--accent": accent,
    "--accent-hover": lighten(accent, 15),
    "--accent-dim": withAlpha(accent, 0.12),
    "--accent-glow": withAlpha(accent, 0.25),
    "--success": success,
    "--success-dim": withAlpha(success, 0.12),
    "--warning": warning,
    "--warning-dim": withAlpha(warning, 0.12),
    "--error": error,
    "--error-dim": withAlpha(error, 0.12),
    "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
    "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
    "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
  };
}

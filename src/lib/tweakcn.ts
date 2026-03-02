import type { ThemePreset } from "./themes";

const REGISTRY_URL = "https://tweakcn.com/r/themes/registry.json";

let cachedThemes: ThemePreset[] | null = null;

interface TweakcnEntry {
  name: string;
  title: string;
  description?: string;
  cssVars: {
    dark?: Record<string, string>;
    light?: Record<string, string>;
    theme?: Record<string, string>;
  };
}

/**
 * Pure-math OKLCH → hex conversion (no DOM access needed).
 * oklch(L C H) where L=0..1, C=0..0.4, H=0..360
 */
function oklchToHex(oklch: string): string {
  if (!oklch || !oklch.startsWith("oklch(")) {
    if (oklch?.startsWith("#")) return oklch;
    if (oklch?.startsWith("rgb")) return rgbStringToHex(oklch);
    return oklch || "#888888";
  }

  const match = oklch.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) return "#888888";

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);

  // OKLCH → OKLab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → linear LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // Linear LMS → linear sRGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // Linear sRGB → sRGB (gamma)
  const toSrgb = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };

  const r = Math.round(toSrgb(lr) * 255);
  const g = Math.round(toSrgb(lg) * 255);
  const bv = Math.round(toSrgb(lb) * 255);

  return `#${((1 << 24) + (r << 16) + (g << 8) + bv).toString(16).slice(1)}`;
}

function rgbStringToHex(rgb: string): string {
  const match = rgb.match(/(\d+),?\s*(\d+),?\s*(\d+)/);
  if (!match) return "#888888";
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, r + Math.round((255 - r) * amount));
  const lg = Math.min(255, g + Math.round((255 - g) * amount));
  const lb = Math.min(255, b + Math.round((255 - b) * amount));
  return `#${((1 << 24) + (lr << 16) + (lg << 8) + lb).toString(16).slice(1)}`;
}

function ensureMinBrightness(hex: string, minBrightness: number): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness >= minBrightness) return hex;
  // Blend toward white until we reach minimum brightness
  const deficit = minBrightness - brightness;
  const boost = deficit / (255 - brightness || 1);
  r = Math.min(255, Math.round(r + (255 - r) * boost));
  g = Math.min(255, Math.round(g + (255 - g) * boost));
  b = Math.min(255, Math.round(b + (255 - b) * boost));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mapTweakcnToTenso(dark: Record<string, string>): Record<string, string> {
  const get = (key: string) => {
    const val = dark[key];
    return val ? oklchToHex(val) : null;
  };

  const bg = get("background") || "#1a1a2e";
  const card = get("card") || "#1e1e32";
  const muted = get("muted") || "#252540";
  const popover = get("popover") || "#1f1f35";
  const accent = get("accent") || "#2a2a4e";
  const secondary = get("secondary") || "#2e2e50";
  const foreground = get("foreground") || "#e0e0f0";
  const mutedFg = get("muted-foreground") || "#7a7a9a";
  const border = get("border") || "#333355";
  const input = get("input") || "#2a2a4a";
  const primary = get("primary") || "#7a7af0";
  const destructive = get("destructive") || "#f06060";

  // Ensure all text colors have sufficient contrast against the background
  const textPrimary = ensureMinBrightness(foreground, 170);
  const textSecondary = ensureMinBrightness(lightenHex(foreground, -0.15), 140);
  const textMuted = ensureMinBrightness(mutedFg, 100);
  const textDim = ensureMinBrightness(lightenHex(textMuted, -0.3), 60);

  return {
    "--bg-primary": bg,
    "--bg-secondary": card,
    "--bg-tertiary": muted,
    "--bg-surface": popover,
    "--bg-hover": accent,
    "--bg-active": secondary,
    "--text-primary": textPrimary,
    "--text-secondary": textSecondary,
    "--text-muted": textMuted,
    "--text-dim": textDim,
    "--border": border,
    "--border-subtle": input,
    "--accent": primary,
    "--accent-hover": lightenHex(primary, 0.15),
    "--accent-dim": hexToRgba(primary, 0.12),
    "--accent-glow": hexToRgba(primary, 0.25),
    "--success": "#9ece6a",
    "--success-dim": "rgba(158, 206, 106, 0.12)",
    "--warning": "#e0af68",
    "--warning-dim": "rgba(224, 175, 104, 0.12)",
    "--error": destructive,
    "--error-dim": hexToRgba(destructive, 0.12),
    "--shadow-sm": "0 1px 2px rgba(0,0,0,0.3)",
    "--shadow": "0 4px 12px rgba(0,0,0,0.4)",
    "--shadow-lg": "0 8px 32px rgba(0,0,0,0.5)",
  };
}

export async function fetchTweakcnThemes(): Promise<ThemePreset[]> {
  if (cachedThemes) return cachedThemes;

  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`Failed to fetch themes: ${res.status}`);

  const json = await res.json();
  const entries: TweakcnEntry[] = json.items || json;

  const themes: ThemePreset[] = [];
  for (const entry of entries) {
    const dark = entry.cssVars?.dark;
    if (!dark) continue;

    try {
      const colors = mapTweakcnToTenso(dark);
      themes.push({
        key: `tweakcn-${entry.name}`,
        name: entry.title || entry.name,
        description: entry.description || "Community theme",
        colors,
      });
    } catch {
      // Skip themes that fail conversion
    }
  }

  cachedThemes = themes;
  return themes;
}

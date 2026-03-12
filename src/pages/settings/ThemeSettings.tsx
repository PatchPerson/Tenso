import { Component, For, Show, createSignal, onMount } from "solid-js";
import { themes, applyTheme, applyThemeColors, getStoredTheme, getFavorites, toggleFavorite, getCustomThemes, saveCustomTheme, deleteCustomTheme, deriveFullColors } from "../../lib/themes";
import { fetchTweakcnThemes } from "../../lib/tweakcn";
import type { ThemePreset } from "../../lib/themes";

const ThemeCard = (props: {
  theme: ThemePreset;
  active: boolean;
  favorited: boolean;
  onSelect: () => void;
  onFavorite: (e: MouseEvent) => void;
}) => (
  <div
    class={`theme-card ${props.active ? "active" : ""}`}
    onClick={props.onSelect}
    style={{ "border-color": props.active ? undefined : props.theme.colors["--border"] }}
  >
    <div class="theme-preview">
      <div
        class="theme-preview-window"
        style={{ background: props.theme.colors["--bg-primary"] }}
      >
        <div
          class="theme-preview-sidebar"
          style={{ background: props.theme.colors["--bg-secondary"], "border-right": `1px solid ${props.theme.colors["--border"]}` }}
        >
          <div class="theme-preview-nav-dot" style={{ background: props.theme.colors["--text-dim"] }} />
          <div class="theme-preview-nav-dot" style={{ background: props.theme.colors["--text-dim"] }} />
          <div class="theme-preview-nav-dot" style={{ background: props.theme.colors["--accent"] }} />
        </div>
        <div class="theme-preview-content">
          <div
            class="theme-preview-tab-bar"
            style={{ background: props.theme.colors["--bg-secondary"], "border-bottom": `1px solid ${props.theme.colors["--border"]}` }}
          >
            <div class="theme-preview-tab" style={{ background: props.theme.colors["--bg-primary"], "border-bottom": `2px solid ${props.theme.colors["--accent"]}` }}>
              <div class="theme-preview-dot" style={{ background: props.theme.colors["--success"] }} />
              <div class="theme-preview-line-sm" style={{ background: props.theme.colors["--text-primary"], opacity: "0.6" }} />
            </div>
            <div class="theme-preview-tab" style={{ background: "transparent" }}>
              <div class="theme-preview-dot" style={{ background: props.theme.colors["--warning"] }} />
              <div class="theme-preview-line-sm" style={{ background: props.theme.colors["--text-muted"], opacity: "0.4" }} />
            </div>
          </div>
          <div class="theme-preview-body">
            <div class="theme-preview-url-row">
              <div class="theme-preview-method" style={{ background: props.theme.colors["--accent"], opacity: "0.9" }} />
              <div
                class="theme-preview-url-bar"
                style={{ background: props.theme.colors["--bg-tertiary"], border: `1px solid ${props.theme.colors["--border"]}` }}
              />
            </div>
            <div class="theme-preview-rows">
              <div class="theme-preview-row" style={{ background: props.theme.colors["--bg-surface"] }} />
              <div class="theme-preview-row" style={{ background: props.theme.colors["--bg-surface"], width: "80%" }} />
              <div class="theme-preview-row" style={{ background: props.theme.colors["--bg-surface"], width: "60%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      class="theme-meta"
      style={{
        background: props.theme.colors["--bg-secondary"],
        "border-top": `1px solid ${props.theme.colors["--border"]}`,
      }}
    >
      <span class="theme-name" style={{ color: props.theme.colors["--text-primary"] }}>{props.theme.name}</span>
      <span class="theme-desc" style={{ color: props.theme.colors["--text-muted"] }}>{props.theme.description}</span>
      <button
        class={`favorite-btn ${props.favorited ? "active" : ""}`}
        onClick={props.onFavorite}
        title={props.favorited ? "Remove from favorites" : "Add to favorites"}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={props.favorited ? "currentColor" : "none"} stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </div>
  </div>
);

const BASE_COLOR_FIELDS = [
  { group: "Backgrounds", fields: [
    { key: "--bg-primary", label: "Primary" },
    { key: "--bg-secondary", label: "Secondary" },
    { key: "--bg-tertiary", label: "Tertiary" },
    { key: "--bg-surface", label: "Surface" },
  ]},
  { group: "Text", fields: [
    { key: "--text-primary", label: "Primary" },
    { key: "--text-secondary", label: "Secondary" },
    { key: "--text-muted", label: "Muted" },
  ]},
  { group: "Accent", fields: [
    { key: "--accent", label: "Accent" },
  ]},
  { group: "Status", fields: [
    { key: "--success", label: "Success" },
    { key: "--warning", label: "Warning" },
    { key: "--error", label: "Error" },
  ]},
  { group: "Border", fields: [
    { key: "--border", label: "Border" },
  ]},
];

function extractBaseColors(colors: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const group of BASE_COLOR_FIELDS) {
    for (const f of group.fields) {
      base[f.key] = colors[f.key] || "#000000";
    }
  }
  return base;
}

export const ThemeSettings: Component = () => {
  const [activeTheme, setActiveTheme] = createSignal(getStoredTheme());
  const [communityThemes, setCommunityThemes] = createSignal<ThemePreset[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [filter, setFilter] = createSignal<"all" | "favorites">("all");
  const [favorites, setFavorites] = createSignal<string[]>(getFavorites());
  const [customThemes, setCustomThemes] = createSignal<ThemePreset[]>(getCustomThemes());
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [editorName, setEditorName] = createSignal("My Theme");
  const [editorColors, setEditorColors] = createSignal<Record<string, string>>(extractBaseColors(themes[0].colors));
  const [editingKey, setEditingKey] = createSignal<string | null>(null);
  const previousTheme = { key: getStoredTheme() };

  onMount(async () => {
    setLoading(true);
    try {
      const fetched = await fetchTweakcnThemes();
      setCommunityThemes(fetched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load community themes");
    } finally {
      setLoading(false);
    }
  });

  const selectBuiltinTheme = (key: string) => {
    applyTheme(key);
    setActiveTheme(key);
  };

  const selectCommunityTheme = (theme: ThemePreset) => {
    applyThemeColors(theme.colors, theme.key);
    setActiveTheme(theme.key);
  };

  const handleFavorite = (e: MouseEvent, key: string) => {
    e.stopPropagation();
    const updated = toggleFavorite(key);
    setFavorites([...updated]);
  };

  const openEditor = (baseTheme?: ThemePreset, editing?: boolean) => {
    const base = baseTheme || themes[0];
    setEditorColors(extractBaseColors(base.colors));
    if (editing && baseTheme) {
      setEditorName(baseTheme.name);
      setEditingKey(baseTheme.key);
    } else {
      setEditorName("My Theme");
      setEditingKey(null);
    }
    previousTheme.key = getStoredTheme();
    setEditorOpen(true);
  };

  const editorPreviewColors = () => deriveFullColors(editorColors());

  const updateEditorColor = (key: string, value: string) => {
    setEditorColors(prev => ({ ...prev, [key]: value }));
    // Live preview
    const full = deriveFullColors({ ...editorColors(), [key]: value });
    applyThemeColors(full, "custom-preview");
  };

  const handleBaseThemeChange = (key: string) => {
    const all = [...themes, ...communityThemes(), ...customThemes()];
    const t = all.find(th => th.key === key);
    if (t) {
      setEditorColors(extractBaseColors(t.colors));
      const full = deriveFullColors(extractBaseColors(t.colors));
      applyThemeColors(full, "custom-preview");
    }
  };

  const handleEditorApply = () => {
    const full = deriveFullColors(editorColors());
    applyThemeColors(full, "custom-preview");
  };

  const handleEditorSave = () => {
    const key = editingKey() || `custom-${Date.now()}`;
    const theme: ThemePreset = {
      key,
      name: editorName() || "Untitled",
      description: "Custom theme",
      colors: deriveFullColors(editorColors()),
    };
    saveCustomTheme(theme);
    setCustomThemes(getCustomThemes());
    applyThemeColors(theme.colors, key);
    setActiveTheme(key);
    setEditorOpen(false);
  };

  const handleEditorCancel = () => {
    setEditorOpen(false);
    applyTheme(previousTheme.key);
    setActiveTheme(previousTheme.key);
  };

  const handleDeleteCustom = (e: MouseEvent, key: string) => {
    e.stopPropagation();
    deleteCustomTheme(key);
    setCustomThemes(getCustomThemes());
    if (activeTheme() === key) {
      applyTheme("tokyo-night");
      setActiveTheme("tokyo-night");
    }
  };

  const selectCustomTheme = (theme: ThemePreset) => {
    applyThemeColors(theme.colors, theme.key);
    setActiveTheme(theme.key);
  };

  const filteredCommunity = () => {
    const all = communityThemes();
    if (filter() === "favorites") {
      return all.filter(t => favorites().includes(t.key));
    }
    return all;
  };

  const visibleCommunity = () => filteredCommunity();

  return (
    <>
      {/* Built-in themes */}
      <div class="settings-card">
        <div class="settings-card-header">
          <span class="settings-card-title">Theme</span>
          <span class="settings-card-desc">Choose your color scheme</span>
        </div>
        <div class="theme-grid">
          <For each={themes}>
            {(theme) => (
              <ThemeCard
                theme={theme}
                active={activeTheme() === theme.key}
                favorited={favorites().includes(theme.key)}
                onSelect={() => selectBuiltinTheme(theme.key)}
                onFavorite={(e) => handleFavorite(e, theme.key)}
              />
            )}
          </For>
        </div>
      </div>

      {/* Custom themes */}
      <div class="settings-card">
        <div class="settings-card-header">
          <span class="settings-card-title">Custom Themes</span>
          <span class="settings-card-desc">Create and manage your own color schemes</span>
        </div>
        <div class="theme-grid">
          <For each={customThemes()}>
            {(theme) => (
              <div class="theme-card-wrapper">
                <ThemeCard
                  theme={theme}
                  active={activeTheme() === theme.key}
                  favorited={false}
                  onSelect={() => selectCustomTheme(theme)}
                  onFavorite={() => {}}
                />
                <div class="theme-card-actions">
                  <button
                    class="theme-card-action-btn"
                    title="Edit theme"
                    onClick={(e) => { e.stopPropagation(); openEditor(theme, true); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    class="theme-card-action-btn delete"
                    title="Delete theme"
                    onClick={(e) => handleDeleteCustom(e, theme.key)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </For>
          <div class="theme-card create-theme-card" onClick={() => openEditor()}>
            <div class="create-theme-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span class="create-theme-label">Create Theme</span>
          </div>
        </div>
        <Show when={editorOpen()}>
          <div class="theme-editor">
            <div class="theme-editor-top-row">
              <div class="form-field" style={{ flex: "1" }}>
                <label class="form-label">Theme Name</label>
                <input
                  class="form-input"
                  type="text"
                  value={editorName()}
                  onInput={(e) => setEditorName(e.currentTarget.value)}
                  placeholder="My Theme"
                />
              </div>
              <div class="form-field" style={{ flex: "1" }}>
                <label class="form-label">Base Theme</label>
                <select
                  class="form-input"
                  onChange={(e) => handleBaseThemeChange(e.currentTarget.value)}
                >
                  <For each={themes}>
                    {(t) => <option value={t.key}>{t.name}</option>}
                  </For>
                  <Show when={communityThemes().length > 0}>
                    <optgroup label="Community">
                      <For each={communityThemes()}>
                        {(t) => <option value={t.key}>{t.name}</option>}
                      </For>
                    </optgroup>
                  </Show>
                </select>
              </div>
            </div>
            <div class="theme-editor-preview-row">
              <div class="theme-editor-colors">
                <For each={BASE_COLOR_FIELDS}>
                  {(group) => (
                    <div class="color-group">
                      <span class="color-group-label">{group.group}</span>
                      <div class="color-group-fields">
                        <For each={group.fields}>
                          {(field) => (
                            <div class="color-field">
                              <label class="color-field-label">{field.label}</label>
                              <div class="color-field-input-wrapper">
                                <input
                                  type="color"
                                  class="color-input"
                                  value={editorColors()[field.key] || "#000000"}
                                  onInput={(e) => updateEditorColor(field.key, e.currentTarget.value)}
                                />
                                <span class="color-field-hex">{editorColors()[field.key] || "#000000"}</span>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </div>
              <div class="theme-editor-live-preview">
                <span class="color-group-label">Preview</span>
                <ThemeCard
                  theme={{ key: "preview", name: editorName() || "Preview", description: "Live preview", colors: editorPreviewColors() }}
                  active={false}
                  favorited={false}
                  onSelect={() => {}}
                  onFavorite={() => {}}
                />
              </div>
            </div>
            <div class="theme-editor-actions">
              <button class="btn btn-ghost" onClick={handleEditorCancel}>Cancel</button>
              <button class="btn btn-ghost" onClick={handleEditorApply}>Apply</button>
              <button class="btn btn-primary" onClick={handleEditorSave}>Save</button>
            </div>
          </div>
        </Show>
      </div>

      {/* Community themes */}
      <div class="settings-card">
        <div class="settings-card-header">
          <div class="community-header-row">
            <div>
              <span class="settings-card-title">Community Themes</span>
              <span class="settings-card-desc">Themes from tweakcn.com</span>
            </div>
            <Show when={communityThemes().length > 0}>
              <div class="community-filter">
                <button
                  class={`filter-btn ${filter() === "all" ? "active" : ""}`}
                  onClick={() => setFilter("all")}
                >All</button>
                <button
                  class={`filter-btn ${filter() === "favorites" ? "active" : ""}`}
                  onClick={() => setFilter("favorites")}
                >Favorites</button>
              </div>
            </Show>
          </div>
        </div>

        <Show when={loading()}>
          <div class="community-loading">
            <div class="spinner" />
            <span>Loading community themes...</span>
          </div>
        </Show>

        <Show when={error()}>
          <div class="community-error">{error()}</div>
        </Show>

        <Show when={!loading() && !error() && communityThemes().length > 0}>
          <div class="theme-grid">
            <For each={visibleCommunity()}>
              {(theme) => (
                <ThemeCard
                  theme={theme}
                  active={activeTheme() === theme.key}
                  favorited={favorites().includes(theme.key)}
                  onSelect={() => selectCommunityTheme(theme)}
                  onFavorite={(e) => handleFavorite(e, theme.key)}
                />
              )}
            </For>
          </div>
          <Show when={filter() === "favorites" && filteredCommunity().length === 0}>
            <div class="community-empty">No favorited themes yet. Click the heart icon to favorite a theme.</div>
          </Show>
        </Show>
      </div>
    </>
  );
};

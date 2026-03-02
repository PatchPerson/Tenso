import { Component, Show, createSignal } from "solid-js";
import { importPostman, type ImportedCollection, createCollection, createRequest, updateRequest, type SavedRequest } from "../../lib/api";
import { loadCollections, activeTeam } from "../../stores/collections";

interface Props {
  onClose: () => void;
}

export const PostmanImport: Component<Props> = (props) => {
  const [jsonContent, setJsonContent] = createSignal("");
  const [error, setError] = createSignal("");
  const [result, setResult] = createSignal<ImportedCollection | null>(null);
  const [importing, setImporting] = createSignal(false);

  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    setJsonContent(text);
    setError("");
  };

  const persistImportedTree = async (
    imported: ImportedCollection,
    teamId: string,
    parentId: string | null
  ) => {
    const collection = await createCollection(teamId, parentId, imported.name);

    for (const req of imported.requests) {
      const created = await createRequest(collection.id, req.name, req.method, req.url);
      const full: SavedRequest = {
        ...created,
        headers: req.headers || [],
        params: req.params || [],
        body: req.body || { type: "none" },
        auth: req.auth || { type: "none" },
        pre_script: req.pre_script || "",
        post_script: req.post_script || "",
      };
      await updateRequest(full);
    }

    for (const child of imported.children) {
      await persistImportedTree(child, teamId, collection.id);
    }
  };

  const handleImport = async () => {
    const content = jsonContent().trim();
    if (!content) {
      setError("Please paste JSON or select a file");
      return;
    }

    const teamId = activeTeam();
    if (!teamId) {
      setError("No active team");
      return;
    }

    try {
      setError("");
      setImporting(true);
      const collection = await importPostman(content);
      setResult(collection);

      await persistImportedTree(collection, teamId, null);
      await loadCollections(teamId);

      props.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const countRequests = (): number => {
    try {
      const parsed = JSON.parse(jsonContent());
      return countItems(parsed.item || []);
    } catch {
      return 0;
    }
  };

  const countItems = (items: any[]): number => {
    let count = 0;
    for (const item of items) {
      if (item.item) {
        count += countItems(item.item);
      } else if (item.request) {
        count++;
      }
    }
    return count;
  };

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()} style={{ width: "640px" }}>
        <div class="modal-header">
          <h3>Import Postman Collection</h3>
          <button class="icon-btn" onClick={props.onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div style={{ "margin-bottom": "12px" }}>
            <label
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "8px",
                padding: "8px 16px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                "border-radius": "var(--radius-md)",
                cursor: "pointer",
                "font-size": "13px",
                color: "var(--text-secondary)",
                transition: "all 200ms",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Choose .json file
              <input
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </label>
          </div>

          <div style={{ position: "relative" }}>
            <textarea
              class="curl-input"
              placeholder='Or paste your Postman collection JSON here...&#10;&#10;Export from Postman: Collection > ... > Export > Collection v2.1'
              value={jsonContent()}
              onInput={(e) => { setJsonContent(e.currentTarget.value); setError(""); }}
              rows={12}
              style={{ "font-size": "11px" }}
            />
          </div>

          <Show when={jsonContent() && !error()}>
            <div style={{
              "margin-top": "10px",
              padding: "8px 12px",
              background: "var(--success-dim)",
              "border-radius": "var(--radius-sm)",
              "font-size": "12px",
              color: "var(--success)",
              display: "flex",
              "align-items": "center",
              gap: "6px",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {countRequests()} requests found
            </div>
          </Show>

          <Show when={error()}>
            <div class="import-error">{error()}</div>
          </Show>
        </div>
        <div class="modal-footer">
          <button class="btn-sm" onClick={props.onClose}>Cancel</button>
          <button
            class="btn-primary"
            onClick={handleImport}
            disabled={importing() || !jsonContent().trim()}
            style={{ opacity: importing() || !jsonContent().trim() ? "0.5" : "1" }}
          >
            {importing() ? "Importing..." : "Import Collection"}
          </button>
        </div>
      </div>
    </div>
  );
};

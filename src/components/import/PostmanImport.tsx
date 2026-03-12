import { Component, Show, createSignal } from "solid-js";
import { importPostman, type ImportedCollection } from "../../lib/api";
import { loadCollections, activeTeam } from "../../stores/collections";
import { triggerPush } from "../../lib/sync";
import { persistImportedTree } from "../../lib/import-utils";
import { readJsonFile, FilePickerDropzone, ImportModalWrapper } from "./shared";

interface Props {
  onClose: () => void;
  embedded?: boolean;
}

export const PostmanImport: Component<Props> = (props) => {
  const [jsonContent, setJsonContent] = createSignal("");
  const [error, setError] = createSignal("");
  const [result, setResult] = createSignal<ImportedCollection | null>(null);
  const [importing, setImporting] = createSignal(false);

  const handleFileSelect = async (e: Event) => {
    const text = await readJsonFile(e);
    if (!text) return;
    setJsonContent(text);
    setError("");
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
      triggerPush();

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

  const content = () => (
    <>
      <div class="modal-body">
        <FilePickerDropzone onChange={handleFileSelect} />

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
    </>
  );

  return (
    <ImportModalWrapper title="Import Postman Collection" embedded={props.embedded} onClose={props.onClose}>
      {content()}
    </ImportModalWrapper>
  );
};

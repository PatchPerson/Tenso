import { Component, Show, createSignal } from "solid-js";
import { importTenso, listEnvironments, createEnvironment, updateEnvironment } from "../../lib/api";
import { loadCollections, activeTeam } from "../../stores/collections";
import { triggerPush } from "../../lib/sync";
import { persistImportedTree } from "../../lib/import-utils";
import { readJsonFile, FilePickerDropzone, ImportModalWrapper } from "./shared";

interface Props {
  onClose: () => void;
  embedded?: boolean;
}

export const TensoImport: Component<Props> = (props) => {
  const [jsonContent, setJsonContent] = createSignal("");
  const [error, setError] = createSignal("");
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

      const [collection, environments] = await importTenso(content);

      await persistImportedTree(collection, teamId, null);

      if (environments.length > 0) {
        const existing = await listEnvironments(teamId);
        const existingByName = new Map(existing.map((e) => [e.name, e]));

        for (const env of environments) {
          const found = existingByName.get(env.name);
          if (found) {
            await updateEnvironment({ ...found, variables: env.variables });
          } else {
            const created = await createEnvironment(teamId, env.name);
            await updateEnvironment({ ...created, variables: env.variables });
          }
        }
      }

      await loadCollections(teamId);
      triggerPush();
      props.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const getPreview = () => {
    try {
      const parsed = JSON.parse(jsonContent());
      if (parsed.format !== "tenso") return null;
      const reqCount = countRequests(parsed.collection);
      const envCount = parsed.environments?.length || 0;
      return { name: parsed.collection?.name, reqCount, envCount };
    } catch {
      return null;
    }
  };

  const countRequests = (col: any): number => {
    if (!col) return 0;
    let count = col.requests?.length || 0;
    for (const child of col.children || []) {
      count += countRequests(child);
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
            placeholder='Paste your Tenso export JSON here...'
            value={jsonContent()}
            onInput={(e) => { setJsonContent(e.currentTarget.value); setError(""); }}
            rows={12}
            style={{ "font-size": "11px" }}
          />
        </div>

        <Show when={jsonContent() && !error()}>
          {(() => {
            const preview = getPreview();
            return preview ? (
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
                {preview.name}: {preview.reqCount} request{preview.reqCount !== 1 ? "s" : ""}
                {preview.envCount > 0 && `, ${preview.envCount} environment${preview.envCount !== 1 ? "s" : ""}`}
              </div>
            ) : null;
          })()}
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
          {importing() ? "Importing..." : "Import"}
        </button>
      </div>
    </>
  );

  return (
    <ImportModalWrapper title="Import Tenso Collection" embedded={props.embedded} onClose={props.onClose}>
      {content()}
    </ImportModalWrapper>
  );
};

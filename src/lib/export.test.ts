import { vi, describe, it, expect } from "vitest";

// Mock Tauri plugins (imported at module level by export.ts, though buildExportJson doesn't use them)
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));

import { buildExportJson } from "./export";
import type { CollectionNode } from "../stores/collections";
import type { SavedRequest, Environment, Collection } from "./api";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: "col-1", team_id: "team-1", parent_id: null,
    name: "Test Collection", sort_order: 1,
    created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRequest(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: "req-1", collection_id: "col-1", name: "Test Request",
    method: "GET", url: "https://example.com",
    headers: [], params: [],
    body: { type: "none" }, auth: { type: "none" },
    pre_script: "", post_script: "", ws_messages: [],
    sort_order: 1, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeNode(overrides: Partial<CollectionNode> = {}): CollectionNode {
  return {
    collection: makeCollection(),
    children: [],
    requests: [makeRequest()],
    expanded: false,
    ...overrides,
  };
}

describe("buildExportJson", () => {
  it("produces valid tenso export format", () => {
    const result = JSON.parse(buildExportJson(makeNode()));
    expect(result.format).toBe("tenso");
    expect(result.version).toBe(1);
    expect(result.exported_at).toBeDefined();
    expect(result.collection.name).toBe("Test Collection");
    expect(result.collection.requests).toHaveLength(1);
  });

  it("strips internal fields from requests", () => {
    const node = makeNode({ requests: [makeRequest({ id: "should-strip", collection_id: "should-strip" })] });
    const result = JSON.parse(buildExportJson(node));
    const req = result.collection.requests[0];

    // These should be present
    expect(req.name).toBe("Test Request");
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://example.com");

    // These should NOT be present (stripped by stripRequest)
    expect(req.id).toBeUndefined();
    expect(req.collection_id).toBeUndefined();
    expect(req.created_at).toBeUndefined();
    expect(req.updated_at).toBeUndefined();
  });

  it("handles nested children", () => {
    const child = makeNode({
      collection: makeCollection({ name: "Child" }),
      requests: [makeRequest({ name: "Child Request" })],
    });
    const parent = makeNode({ collection: makeCollection({ name: "Parent" }), children: [child], requests: [] });

    const result = JSON.parse(buildExportJson(parent));
    expect(result.collection.name).toBe("Parent");
    expect(result.collection.children).toHaveLength(1);
    expect(result.collection.children[0].name).toBe("Child");
    expect(result.collection.children[0].requests).toHaveLength(1);
  });

  it("includes environments when provided", () => {
    const envs: Environment[] = [{
      id: "env-1", team_id: "team-1", name: "Dev",
      variables: [{ key: "base_url", value: "http://localhost", enabled: true }],
      created_at: "2024-01-01", updated_at: "2024-01-01",
    }];
    const result = JSON.parse(buildExportJson(makeNode(), envs));
    expect(result.environments).toHaveLength(1);
    expect(result.environments[0].name).toBe("Dev");
    expect(result.environments[0].variables[0].key).toBe("base_url");
  });

  it("omits environments when undefined", () => {
    const result = JSON.parse(buildExportJson(makeNode()));
    expect(result.environments).toBeUndefined();
  });

  it("omits environments when empty array", () => {
    const result = JSON.parse(buildExportJson(makeNode(), []));
    expect(result.environments).toBeUndefined();
  });

  it("preserves all request data fields", () => {
    const req = makeRequest({
      headers: [{ key: "Accept", value: "application/json", enabled: true }],
      params: [{ key: "q", value: "test", enabled: true }],
      body: { type: "json", data: { content: '{"a":1}' } },
      auth: { type: "bearer", config: { token: "tok" } },
      pre_script: "console.log('pre')",
      post_script: "console.log('post')",
    });
    const result = JSON.parse(buildExportJson(makeNode({ requests: [req] })));
    const exported = result.collection.requests[0];
    expect(exported.headers).toHaveLength(1);
    expect(exported.params).toHaveLength(1);
    expect(exported.body.type).toBe("json");
    expect(exported.auth.type).toBe("bearer");
    expect(exported.pre_script).toBe("console.log('pre')");
    expect(exported.post_script).toBe("console.log('post')");
  });
});

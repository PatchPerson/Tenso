import { vi, describe, it, expect } from "vitest";

// Mock modules imported by history.ts that have Tauri/side-effect dependencies
vi.mock("../lib/api", () => ({}));
vi.mock("./collections", () => ({
  triggerRefresh: vi.fn(),
  expandFolder: vi.fn(),
  setLastUsedCollectionId: vi.fn(),
}));
vi.mock("../lib/sync", () => ({
  triggerPush: vi.fn(),
}));

import { parseHistoryRequestData } from "./history";
import type { HistoryEntry } from "../lib/api";

function makeEntry(requestData: string): HistoryEntry {
  return {
    id: "h-1",
    team_id: "t-1",
    method: "GET",
    url: "https://example.com",
    status: 200,
    duration_ms: 100,
    response_size: 0,
    timestamp: "2024-01-01T00:00:00Z",
    request_data: requestData,
    response_headers: "[]",
    response_body_preview: "",
  };
}

describe("parseHistoryRequestData", () => {
  it("parses valid request data with all fields", () => {
    const data = JSON.stringify({
      headers: [{ key: "Accept", value: "application/json", enabled: true }],
      params: [{ key: "q", value: "test", enabled: true }],
      body: { type: "json", data: { content: "{}" } },
      auth: { type: "bearer", config: { token: "tok" } },
    });
    const result = parseHistoryRequestData(makeEntry(data));
    expect(result.headers).toHaveLength(1);
    expect(result.headers[0].key).toBe("Accept");
    expect(result.params).toHaveLength(1);
    expect(result.body.type).toBe("json");
    expect(result.auth.type).toBe("bearer");
  });

  it("defaults missing headers to empty array", () => {
    const data = JSON.stringify({ body: { type: "none" }, auth: { type: "none" } });
    const result = parseHistoryRequestData(makeEntry(data));
    expect(result.headers).toEqual([]);
    expect(result.params).toEqual([]);
  });

  it("defaults non-array headers to empty array", () => {
    const data = JSON.stringify({ headers: "not an array" });
    const result = parseHistoryRequestData(makeEntry(data));
    expect(result.headers).toEqual([]);
  });

  it("defaults body without type to none", () => {
    const data = JSON.stringify({ body: {} });
    const result = parseHistoryRequestData(makeEntry(data));
    expect(result.body).toEqual({ type: "none" });
  });

  it("defaults auth without type to none", () => {
    const data = JSON.stringify({ auth: {} });
    const result = parseHistoryRequestData(makeEntry(data));
    expect(result.auth).toEqual({ type: "none" });
  });

  it("returns all defaults for invalid JSON", () => {
    const result = parseHistoryRequestData(makeEntry("not json at all"));
    expect(result.headers).toEqual([]);
    expect(result.params).toEqual([]);
    expect(result.body).toEqual({ type: "none" });
    expect(result.auth).toEqual({ type: "none" });
  });

  it("returns all defaults for empty string", () => {
    const result = parseHistoryRequestData(makeEntry(""));
    expect(result.headers).toEqual([]);
    expect(result.params).toEqual([]);
    expect(result.body).toEqual({ type: "none" });
    expect(result.auth).toEqual({ type: "none" });
  });
});

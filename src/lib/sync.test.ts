import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so mockInvoke is available in factories
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("solid-js", () => ({
  createSignal: () => [() => null, vi.fn()],
}));
vi.mock("./convex", () => ({ getConvexClient: vi.fn() }));
vi.mock("../../convex/_generated/api", () => ({ api: {} }));
vi.mock("./auth", () => ({
  activeTeamId: () => null,
  isAuthenticated: () => false,
}));
vi.mock("../stores/collections", () => ({ activeTeam: () => null }));
vi.mock("../stores/request", () => ({
  tabs: () => [],
  updateTab: vi.fn(),
}));
vi.mock("./api", () => ({}));
vi.mock("../stores/toast", () => ({ showToast: vi.fn() }));
vi.mock("./telemetry", () => ({ captureError: vi.fn() }));

import { applyRemoteChanges } from "./sync";

describe("applyRemoteChanges", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // Default: get_sync_state returns zeros
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_sync_state") return { lastPullAt: 0, lastPushAt: 0 };
      return undefined;
    });
  });

  it("truncates float updatedAt timestamps before calling set_sync_state", async () => {
    const result = {
      collections: [
        { clientId: "c1", name: "Col", sortOrder: 0, updatedAt: 1773151912654.695, _creationTime: 1773151912654.695 },
      ],
      requests: [],
      environments: [],
      history: [],
    };

    await applyRemoteChanges(result, "team-1");

    const setSyncCall = mockInvoke.mock.calls.find(([cmd]: string[]) => cmd === "set_sync_state");
    expect(setSyncCall).toBeDefined();
    const args = setSyncCall![1];
    expect(Number.isInteger(args.lastPull)).toBe(true);
    expect(args.lastPull).toBe(1773151912654);
    expect(Number.isInteger(args.lastPush)).toBe(true);
  });

  it("passes integer timestamps through unchanged", async () => {
    const result = {
      collections: [
        { clientId: "c1", name: "Col", sortOrder: 0, updatedAt: 1700000000000, _creationTime: 1700000000000 },
      ],
      requests: [],
      environments: [],
      history: [],
    };

    await applyRemoteChanges(result, "team-1");

    const setSyncCall = mockInvoke.mock.calls.find(([cmd]: string[]) => cmd === "set_sync_state");
    expect(setSyncCall).toBeDefined();
    expect(setSyncCall![1].lastPull).toBe(1700000000000);
  });

  it("does not call set_sync_state when result has no items", async () => {
    const result = { collections: [], requests: [], environments: [], history: [] };

    await applyRemoteChanges(result, "team-1");

    const setSyncCall = mockInvoke.mock.calls.find(([cmd]: string[]) => cmd === "set_sync_state");
    expect(setSyncCall).toBeUndefined();
  });

  it("uses max updatedAt across collections, requests, and environments", async () => {
    const result = {
      collections: [{ clientId: "c1", name: "A", sortOrder: 0, updatedAt: 100.5 }],
      requests: [
        {
          clientId: "r1", collectionClientId: "c1", name: "R", method: "GET", url: "https://x.com",
          headers: "[]", params: "[]", body: '{"type":"none"}', auth: '{"type":"none"}',
          sortOrder: 0, updatedAt: 300.9, _creationTime: 300.9,
        },
      ],
      environments: [{ clientId: "e1", name: "Dev", variables: "[]", updatedAt: 200.3 }],
      history: [],
    };

    await applyRemoteChanges(result, "team-1");

    const setSyncCall = mockInvoke.mock.calls.find(([cmd]: string[]) => cmd === "set_sync_state");
    expect(setSyncCall).toBeDefined();
    expect(setSyncCall![1].lastPull).toBe(300); // Math.floor(300.9)
  });

  it("considers history _creationTime for max timestamp", async () => {
    const result = {
      collections: [{ clientId: "c1", name: "A", sortOrder: 0, updatedAt: 100 }],
      requests: [],
      environments: [],
      history: [
        {
          clientId: "h1", method: "GET", url: "https://x.com", status: 200,
          durationMs: 50, responseSize: 100, timestamp: "2024-01-01T00:00:00Z",
          requestData: "{}", responseHeaders: "{}", responseBodyPreview: "",
          _creationTime: 500.7,
        },
      ],
    };

    await applyRemoteChanges(result, "team-1");

    const setSyncCall = mockInvoke.mock.calls.find(([cmd]: string[]) => cmd === "set_sync_state");
    expect(setSyncCall).toBeDefined();
    // max(100, 500.7) = 500.7 → Math.floor → 500
    expect(setSyncCall![1].lastPull).toBe(500);
  });
});

import { describe, it, expect } from "vitest";
import { buildCurlCommand } from "./curl";
import type { KeyValue, RequestBody, AuthConfig } from "./api";

const noBody: RequestBody = { type: "none" };
const noAuth: AuthConfig = { type: "none" };
const url = "https://example.com/api";

function kv(key: string, value: string, enabled = true): KeyValue {
  return { key, value, enabled };
}

describe("buildCurlCommand", () => {
  it("generates GET with no body, headers, or auth", () => {
    const result = buildCurlCommand("GET", url, [], noBody, noAuth);
    expect(result).toContain("curl -X GET");
    expect(result).toContain(url);
    expect(result).not.toContain("-d");
    expect(result).not.toContain("-H");
    expect(result).not.toContain("-u");
  });

  it("includes JSON body with Content-Type header", () => {
    const body: RequestBody = { type: "json", data: { content: '{"key":"val"}' } };
    const result = buildCurlCommand("POST", url, [], body, noAuth);
    expect(result).toContain("-H 'Content-Type: application/json'");
    expect(result).toContain("-d '{\"key\":\"val\"}'");
  });

  it("includes raw body with custom content type", () => {
    const body: RequestBody = { type: "raw", data: { content: "<xml/>", content_type: "text/xml" } };
    const result = buildCurlCommand("POST", url, [], body, noAuth);
    expect(result).toContain("Content-Type: text/xml");
    expect(result).toContain("-d '<xml/>'");
  });

  it("URL-encodes form_urlencoded params", () => {
    const body: RequestBody = {
      type: "form_urlencoded",
      data: { params: [kv("a b", "c&d"), kv("x", "y")] },
    };
    const result = buildCurlCommand("POST", url, [], body, noAuth);
    expect(result).toContain("a%20b=c%26d");
    expect(result).toContain("x=y");
  });

  it("skips disabled form_urlencoded params", () => {
    const body: RequestBody = {
      type: "form_urlencoded",
      data: { params: [kv("enabled", "yes", true), kv("disabled", "no", false)] },
    };
    const result = buildCurlCommand("POST", url, [], body, noAuth);
    expect(result).toContain("enabled=yes");
    expect(result).not.toContain("disabled");
  });

  it("omits -d when all form_urlencoded params disabled", () => {
    const body: RequestBody = {
      type: "form_urlencoded",
      data: { params: [kv("key", "val", false)] },
    };
    const result = buildCurlCommand("POST", url, [], body, noAuth);
    expect(result).not.toContain("-d");
  });

  it("adds Bearer auth header", () => {
    const auth: AuthConfig = { type: "bearer", config: { token: "mytoken" } };
    const result = buildCurlCommand("GET", url, [], noBody, auth);
    expect(result).toContain("Authorization: Bearer mytoken");
  });

  it("adds Basic auth with -u flag", () => {
    const auth: AuthConfig = { type: "basic", config: { username: "user", password: "pass" } };
    const result = buildCurlCommand("GET", url, [], noBody, auth);
    expect(result).toContain("-u 'user:pass'");
  });

  it("adds API key as header when add_to is header", () => {
    const auth: AuthConfig = { type: "api_key", config: { key: "X-API-Key", value: "secret", add_to: "header" } };
    const result = buildCurlCommand("GET", url, [], noBody, auth);
    expect(result).toContain("-H 'X-API-Key: secret'");
  });

  it("does not add API key header when add_to is query", () => {
    const auth: AuthConfig = { type: "api_key", config: { key: "X-API-Key", value: "secret", add_to: "query" } };
    const result = buildCurlCommand("GET", url, [], noBody, auth);
    expect(result).not.toContain("X-API-Key");
  });

  it("skips disabled headers", () => {
    const headers = [kv("X-Enabled", "yes", true), kv("X-Disabled", "no", false)];
    const result = buildCurlCommand("GET", url, headers, noBody, noAuth);
    expect(result).toContain("X-Enabled: yes");
    expect(result).not.toContain("X-Disabled");
  });

  it("skips headers with empty key", () => {
    const headers = [kv("", "val", true)];
    const result = buildCurlCommand("GET", url, headers, noBody, noAuth);
    expect(result).not.toContain("-H");
  });

  it("combines method, body, auth, and headers", () => {
    const body: RequestBody = { type: "json", data: { content: "{}" } };
    const auth: AuthConfig = { type: "bearer", config: { token: "tok" } };
    const headers = [kv("Accept", "application/json")];
    const result = buildCurlCommand("POST", url, headers, body, auth);
    expect(result).toContain("curl -X POST");
    expect(result).toContain("-d '{}'");
    expect(result).toContain("Bearer tok");
    expect(result).toContain("Accept: application/json");
  });
});

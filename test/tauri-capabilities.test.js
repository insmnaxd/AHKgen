import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("window close interception can destroy the window after confirmation", async () => {
  const capabilityUrl = new URL(
    "../src-tauri/capabilities/default.json",
    import.meta.url
  );
  const capability = JSON.parse(await readFile(capabilityUrl, "utf8"));

  assert.ok(capability.permissions.includes("core:window:allow-close"));
  assert.ok(capability.permissions.includes("core:window:allow-destroy"));
});

test("production CSP allows only local assets and Tauri IPC", async () => {
  const configUrl = new URL("../src-tauri/tauri.conf.json", import.meta.url);
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  const csp = config.app.security.csp;

  assert.equal(csp["default-src"], "'self'");
  assert.equal(csp["connect-src"], "'self' ipc: http://ipc.localhost");
  assert.equal(csp["script-src"], "'self'");
  assert.ok(!csp["script-src"].includes("'unsafe-inline'"));
  assert.equal(csp["object-src"], "'none'");
  assert.equal(csp["form-action"], "'none'");
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const rootPath = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(rootPath, "connection.js"), "utf8");
const origin = "https://ulsa-it.github.io";

function fixture(hash = "", onData = () => {}) {
  const messages = [];
  const states = [];
  const timers = new Map();
  const listeners = {};
  let sequence = 0;
  const context = vm.createContext({
    URLSearchParams, location: { origin, hash },
    crypto: { randomUUID: () => `request-${++sequence}` },
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    postMessage(data, targetOrigin) { messages.push({ ...data, targetOrigin }); },
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
    options: { onState: (state) => states.push(state), onData }, listeners,
  });
  vm.runInContext(source, context);
  vm.runInContext("globalThis.client = ChamGpaConnection.createClient(options)", context);
  const receive = (data, eventOrigin = origin, ownWindow = true) => {
    context.data = { source: "ULSA_GPA_EXTENSION", ...data };
    context.eventOrigin = eventOrigin;
    vm.runInContext(`listeners.message({ data, origin: eventOrigin, source: ${ownWindow ? "globalThis" : "{}"} })`, context);
  };
  const ready = (capabilities = ["connectFromWeb"]) => receive({
    type: "CHAM_GPA_STATUS", requestId: messages.findLast((m) => m.type === "CHAM_GPA_PING").requestId,
    version: "2.1.0", capabilities,
  });
  const tick = (ms) => {
    for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); }
  };
  return { client: context.client, messages, states, receive, ready, tick, listeners };
}

test("probe only; absent/disabled/old nonresponding extension becomes unavailable, not definitely uninstalled", () => {
  const f = fixture();
  assert.equal(f.messages[0].type, "CHAM_GPA_PING");
  assert.equal(f.messages.filter((m) => m.type === "CHAM_GPA_CONNECT").length, 0);
  f.tick(2000);
  assert.equal(f.client.getState().status, "unavailable");
  assert.match(f.client.getState().message, /Có thể/);
  f.client.check();
  f.ready();
  assert.equal(f.client.getState().status, "ready");
});

test("status accepts only matching nonce from own window and origin; missing capability requires update", () => {
  const f = fixture();
  const response = { type: "CHAM_GPA_STATUS", requestId: f.messages[0].requestId, version: "2.0.1", capabilities: [] };
  f.receive(response, "https://evil.test");
  f.receive(response, origin, false);
  f.receive({ ...response, requestId: "wrong-nonce" });
  assert.equal(f.client.getState().status, "checking");
  f.receive(response);
  assert.equal(f.client.getState().status, "outdated");
  f.client.connect();
  assert.equal(f.messages.filter((m) => m.type === "CHAM_GPA_CONNECT").length, 0);
});

test("data is delivered and ACKed only after explicit connect and successful import", () => {
  const imported = [];
  const f = fixture("", (payload) => imported.push(payload));
  f.ready();
  f.receive({ type: "ULSA_GPA_DATA", payload: { unrelated: true } });
  assert.equal(imported.length, 0);
  f.client.connect();
  f.client.connect();
  assert.equal(f.messages.filter((m) => m.type === "CHAM_GPA_CONNECT").length, 1);
  const request = f.messages.at(-1).requestId;
  f.receive({ type: "ULSA_GPA_DATA", requestId: request, payload: { schemaVersion: 1 } });
  assert.equal(imported.length, 1);
  assert.equal(f.client.getState().status, "success");
  assert.equal(f.messages.at(-1).type, "ULSA_GPA_IMPORT_ACK");
  assert.equal(f.messages.at(-1).requestId, request);
});

test("malformed imported data is not acknowledged", () => {
  const f = fixture("", () => { throw new Error("Bad schema"); });
  f.ready(); f.client.connect();
  f.receive({ type: "ULSA_GPA_DATA", requestId: f.messages.at(-1).requestId, payload: {} });
  assert.equal(f.client.getState().status, "error");
  assert.equal(f.messages.filter((m) => m.type === "ULSA_GPA_IMPORT_ACK").length, 0);
});

test("login-required stays visible after tab focus; check never automatically reads grades", () => {
  const f = fixture(); f.ready(); f.client.connect();
  f.receive({ type: "ULSA_GPA_IMPORT_ERROR", requestId: f.messages.at(-1).requestId, code: "AUTH_REQUIRED", message: "Đăng nhập" });
  f.listeners.focus(); f.ready();
  assert.equal(f.client.getState().status, "auth");
  assert.equal(f.messages.filter((m) => m.type === "CHAM_GPA_CONNECT").length, 1);
  f.client.connect();
  assert.equal(f.messages.filter((m) => m.type === "CHAM_GPA_CONNECT").length, 2);
});

test("timeout ignores stale response; cancel for Excel import also prevents late overwrites", () => {
  let count = 0;
  const f = fixture("", () => { count++; }); f.ready(); f.client.connect();
  const oldRequest = f.messages.at(-1).requestId;
  f.tick(30000);
  assert.equal(f.client.getState().status, "error");
  f.client.connect();
  const newRequest = f.messages.at(-1).requestId;
  f.receive({ type: "ULSA_GPA_DATA", requestId: oldRequest, payload: {} });
  assert.equal(count, 0);
  f.client.cancel();
  f.receive({ type: "ULSA_GPA_DATA", requestId: newRequest, payload: {} });
  assert.equal(count, 0);
});

test("legacy handoff works without version probing and clears only on successful import", () => {
  let count = 0;
  const f = fixture("#handoff=test-handoff", () => { count++; });
  assert.equal(f.messages[0].type, "ULSA_GPA_WEB_READY");
  f.receive({ type: "ULSA_GPA_DATA", payload: { schemaVersion: 1 } });
  assert.equal(count, 1);
  assert.equal(f.messages.at(-1).type, "ULSA_GPA_IMPORT_ACK");
  f.receive({ type: "ULSA_GPA_DATA", payload: {} });
  assert.equal(count, 1);
});

test("install page has five illustrated steps, both platforms and a copy-only chrome URL", () => {
  const html = fs.readFileSync(path.join(rootPath, "install.html"), "utf8");
  for (let i = 1; i <= 5; i++) assert.match(html, new RegExp(`id="step-${i}"`));
  for (const platform of ["windows", "macos"]) assert.match(html, new RegExp(`data-platform="${platform}"`));
  assert.doesNotMatch(html, /href="chrome:\/\//);
  assert.match(html, /id="extensionsAddress"[^>]*readonly/);
  assert.match(html, /id="copyAddressButton"/);
  assert.match(html, /id="update"/);
  assert.match(html, /không tự cập nhật/);
  assert.match(html, /releases\/latest\/download\/ChamGPA.zip/);
  assert.match(html, /manifest.json/);
  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/g)) {
    assert.ok(fs.existsSync(path.join(rootPath, match[1])), match[1]);
    if (match[1].includes("onboarding")) assert.match(match[0], /alt="Minh họa/);
  }
  const allScripts = fs.readFileSync(path.join(rootPath, "onboarding.js"), "utf8") + source;
  assert.doesNotMatch(allScripts, /innerHTML|localStorage|sessionStorage/);
});

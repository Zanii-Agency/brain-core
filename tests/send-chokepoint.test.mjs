import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sendWithAudit } from "../dist/send-chokepoint.js";

function mockAdapters(overrides = {}) {
  return {
    persistOutbound: async () => ({ id: "msg-123" }),
    devPhone: () => null,
    sendFn: async () => ({ id: "wamid-456" }),
    ...overrides,
  };
}

test("normal send: persists then sends, returns ok", async () => {
  const calls = [];
  const adapters = mockAdapters({
    persistOutbound: async (to, body) => {
      calls.push(["persist", to, body]);
      return { id: "msg-123" };
    },
    sendFn: async (to, body) => {
      calls.push(["send", to, body]);
      return { id: "wamid-456" };
    },
  });

  const r = await sendWithAudit("+27123456789", "hello", adapters);
  assert.equal(r.ok, true);
  assert.equal(r.id, "msg-123");
  assert.deepEqual(calls, [
    ["persist", "+27123456789", "hello"],
    ["send", "+27123456789", "hello"],
  ]);
});

test("dev mode: reroutes to dev phone, skips persistence", async () => {
  const calls = [];
  const adapters = mockAdapters({
    devPhone: () => "+27dev",
    persistOutbound: async (to, body) => {
      calls.push(["persist", to, body]);
      return { id: "msg-123" };
    },
    sendFn: async (to, body) => {
      calls.push(["send", to, body]);
      return { id: "wamid-456" };
    },
  });

  const r = await sendWithAudit("+27123456789", "hello", adapters, { dev: true });
  assert.equal(r.ok, true);
  assert.equal(r.id, "wamid-456");
  assert.deepEqual(calls, [
    ["send", "+27dev", "[DEV] hello"],
  ]);
});

test("dev mode with no dev phone: returns error", async () => {
  const adapters = mockAdapters({
    devPhone: () => null,
  });

  const r = await sendWithAudit("+27123456789", "hello", adapters, { dev: true });
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_dev_phone");
});

test("send failure: returns error but persistence still happened", async () => {
  const calls = [];
  const adapters = mockAdapters({
    persistOutbound: async (to, body) => {
      calls.push(["persist", to, body]);
      return { id: "msg-123" };
    },
    sendFn: async (to, body) => {
      calls.push(["send", to, body]);
      return { error: "rate_limited" };
    },
  });

  const r = await sendWithAudit("+27123456789", "hello", adapters);
  assert.equal(r.ok, false);
  assert.equal(r.error, "rate_limited");
  assert.deepEqual(calls, [
    ["persist", "+27123456789", "hello"],
    ["send", "+27123456789", "hello"],
  ]);
});

test("party and trace_id passed to persistOutbound", async () => {
  let capturedOpts;
  const adapters = mockAdapters({
    persistOutbound: async (to, body, opts) => {
      capturedOpts = opts;
      return { id: "msg-123" };
    },
  });

  await sendWithAudit("+27123456789", "hello", adapters, {
    party: "jensen",
    trace_id: "trace-789",
  });

  assert.deepEqual(capturedOpts, {
    party: "jensen",
    trace_id: "trace-789",
  });
});

test("force option passed to sendFn", async () => {
  let capturedOpts;
  const adapters = mockAdapters({
    sendFn: async (to, body, opts) => {
      capturedOpts = opts;
      return { id: "wamid-456" };
    },
  });

  await sendWithAudit("+27123456789", "hello", adapters, { force: true });
  assert.deepEqual(capturedOpts, { force: true });
});

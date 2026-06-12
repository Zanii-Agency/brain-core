// runClaude — contract pins. No real Anthropic call; we mock fetch and verify:
//   - retries on 429/529, respects retry-after, gives up after maxAttempts
//   - does NOT retry on 400/401/etc
//   - gym hook short-circuits with _via:"gym"
//   - cache shaping applied to last tool + system block
//   - onFailure hook fires on terminal failure

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runClaude } from "../dist/claude-client.js";

const origFetch = global.fetch;

function mockFetch(seq) {
  let i = 0;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const r = seq[Math.min(i, seq.length - 1)];
    i++;
    if (r instanceof Error) throw r;
    return {
      ok: r.ok,
      status: r.status,
      headers: { get: (h) => r.headers?.[h.toLowerCase()] ?? null },
      json: async () => r.body,
    };
  };
  return calls;
}

const OK = { ok: true, status: 200, body: { content: [{ type: "text", text: "hi" }] } };
const RATE = { ok: false, status: 429, headers: { "retry-after": "0" }, body: { error: { message: "rate" } } };
const OVER = { ok: false, status: 529, headers: {}, body: { error: { message: "overloaded" } } };
const BAD = { ok: false, status: 400, body: { error: { message: "bad request" } } };
const DEAD = { ok: false, status: 401, body: { error: { message: "dead key" } } };

const BASE = {
  model: "claude-sonnet-4-5",
  anthropicKey: "test-key",
  system: "you are a test bot",
  messages: [{ role: "user", content: "hi" }],
  tools: [],
};

test("happy path returns the parsed JSON", async () => {
  const calls = mockFetch([OK]);
  const out = await runClaude(BASE);
  assert.equal(out.content[0].text, "hi");
  assert.equal(calls.length, 1);
});

test("retries on 429 then succeeds; respects retry-after=0", async () => {
  mockFetch([RATE, RATE, OK]);
  const out = await runClaude({ ...BASE, maxAttempts: 4 });
  assert.equal(out.content[0].text, "hi");
});

test("retries on 529 then succeeds", async () => {
  mockFetch([OVER, OK]);
  const out = await runClaude({ ...BASE, maxAttempts: 4 });
  assert.equal(out.content[0].text, "hi");
});

test("does NOT retry on 400 — throws immediately", async () => {
  const calls = mockFetch([BAD, OK]);
  await assert.rejects(() => runClaude(BASE), /bad request/);
  assert.equal(calls.length, 1, "should not have retried");
});

test("does NOT retry on 401 — throws immediately", async () => {
  const calls = mockFetch([DEAD]);
  await assert.rejects(() => runClaude(BASE), /dead key/);
  assert.equal(calls.length, 1);
});

test("gives up after maxAttempts on persistent 429", async () => {
  const calls = mockFetch([RATE, RATE, RATE, RATE, RATE]);
  await assert.rejects(() => runClaude({ ...BASE, maxAttempts: 3 }), /rate/);
  assert.equal(calls.length, 3, "should retry exactly 3 times");
});

test("gym hook short-circuits and tags _via:gym", async () => {
  mockFetch([OK]); // fetch must NOT be called
  let gymCalled = false;
  const out = await runClaude({
    ...BASE,
    gym: {
      active: () => true,
      call: async (args) => {
        gymCalled = true;
        assert.equal(args.model, BASE.model);
        assert.equal(typeof args.system, "string", "gym receives flat string");
        return { content: [{ type: "text", text: "from gym" }] };
      },
    },
  });
  assert.ok(gymCalled);
  assert.equal(out._via, "gym");
  assert.equal(out.content[0].text, "from gym");
});

test("gym hook is bypassed when gym.active() returns false", async () => {
  mockFetch([OK]);
  let gymCalled = false;
  const out = await runClaude({
    ...BASE,
    gym: {
      active: () => false,
      call: async () => { gymCalled = true; return {}; },
    },
  });
  assert.equal(gymCalled, false);
  assert.equal(out.content[0].text, "hi");
});

test("system string is wrapped to a cache_control block in the request body", async () => {
  const calls = mockFetch([OK]);
  await runClaude(BASE);
  const sent = JSON.parse(calls[0].init.body);
  assert.ok(Array.isArray(sent.system), "system should be array of blocks");
  assert.equal(sent.system[0].type, "text");
  assert.deepEqual(sent.system[0].cache_control, { type: "ephemeral" });
});

test("system blocks pass through unchanged", async () => {
  const calls = mockFetch([OK]);
  const blocks = [
    { type: "text", text: "stable", cache_control: { type: "ephemeral" } },
    { type: "text", text: "dynamic" },
  ];
  await runClaude({ ...BASE, system: blocks });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.system, blocks);
});

test("last tool gets cache_control breakpoint; earlier tools do not", async () => {
  const calls = mockFetch([OK]);
  const tools = [
    { name: "a", input_schema: {} },
    { name: "b", input_schema: {} },
    { name: "c", input_schema: {} },
  ];
  await runClaude({ ...BASE, tools });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.tools[0].cache_control, undefined);
  assert.equal(sent.tools[1].cache_control, undefined);
  assert.deepEqual(sent.tools[2].cache_control, { type: "ephemeral" });
});

test("onFailure hook fires once on terminal failure with the final error", async () => {
  mockFetch([BAD]);
  const errs = [];
  await assert.rejects(() => runClaude({ ...BASE, onFailure: async (m) => { errs.push(m); } }));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /bad request/);
});

test("onFailure NOT fired on successful retry", async () => {
  mockFetch([RATE, OK]);
  const errs = [];
  await runClaude({ ...BASE, onFailure: async (m) => { errs.push(m); } });
  assert.equal(errs.length, 0);
});

// Restore real fetch after tests in case the runner reuses the process.
test.after(() => { global.fetch = origFetch; });

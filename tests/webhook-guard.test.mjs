import { test } from "node:test";
import { strict as assert } from "node:assert";
import { shouldProcess, mediaArrived, _resetForTest } from "../dist/webhook-guard.js";

function adapters(overrides = {}) {
  return {
    seenByWamid: async () => false,
    logToChat: async () => {},
    ...overrides,
  };
}

test("fresh message with wamid: process", async () => {
  _resetForTest();
  const r = await shouldProcess("test", "+27123456789", "wamid.1", "hello", adapters());
  assert.deepEqual(r, { action: "process" });
});

test("duplicate wamid: skip", async () => {
  _resetForTest();
  const seen = new Set();
  const a = adapters({
    seenByWamid: async (id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    },
  });
  const r1 = await shouldProcess("test", "+27dup", "wamid.dup", "first", a);
  assert.deepEqual(r1, { action: "process" });
  const r2 = await shouldProcess("test", "+27dup", "wamid.dup", "second", a);
  assert.equal(r2.action, "skip");
  assert.equal(r2.reason, "duplicate_wamid");
});

test("concurrent duplicate (same sender, within 2s): skip", async () => {
  _resetForTest();
  const r1 = await shouldProcess("test", "+27con", "wamid.a", "first", adapters());
  assert.deepEqual(r1, { action: "process" });
  const r2 = await shouldProcess("test", "+27con", "wamid.b", "second", adapters());
  assert.equal(r2.action, "skip");
  assert.equal(r2.reason, "concurrent_duplicate");
});

test("different sender, same time: both process", async () => {
  _resetForTest();
  const r1 = await shouldProcess("test", "+27a", "wamid.a", "hello a", adapters());
  const r2 = await shouldProcess("test", "+27b", "wamid.b", "hello b", adapters());
  assert.deepEqual(r1, { action: "process" });
  assert.deepEqual(r2, { action: "process" });
});

test("media-ref text waits then processes if no image arrives", async () => {
  _resetForTest();
  const r = await shouldProcess("test", "+27media", null, "this", adapters());
  assert.deepEqual(r, { action: "process" });
});

test("mediaArrived clears the buffer and returns the text", async () => {
  _resetForTest();
  const sender = "+27merge";
  const p1 = shouldProcess("test", sender, "wamid.m1", "this", adapters());
  await new Promise((r) => setTimeout(r, 50));
  const text = mediaArrived(sender);
  assert.ok(text !== null, "mediaArrived should return buffered text");
  assert.equal(text, "this");
  const r = await p1;
  assert.equal(r.action, "skip");
  assert.equal(r.reason, "merged_with_media");
});

test("mediaArrived returns null for unknown sender", async () => {
  _resetForTest();
  const r = mediaArrived("+27nobody");
  assert.equal(r, null);
});

test("shouldProcess with no wamid: still processes", async () => {
  _resetForTest();
  const r = await shouldProcess("test", "+27nowamid", null, "direct", adapters());
  assert.deepEqual(r, { action: "process" });
});

test("shouldProcess empty text, no wamid: processes", async () => {
  _resetForTest();
  const r = await shouldProcess("test", "+27empty", null, "", adapters());
  assert.deepEqual(r, { action: "process" });
});

test("non-media-ref text processes immediately (no wait)", async () => {
  _resetForTest();
  const start = Date.now();
  const r = await shouldProcess("test", "+27fast", null, "hello world", adapters());
  assert.deepEqual(r, { action: "process" });
  assert.ok(Date.now() - start < 100, "should not wait for non-media-ref text");
});

test("two DISTINCT media within 2s: BOTH process (lock exempt for media)", async () => {
  _resetForTest();
  // Stalia 2026-09-01: a portal screenshot then the real bank proof, seconds
  // apart. Distinct images => distinct wamids; both must reach the handler.
  const r1 = await shouldProcess("test", "+27img", "wamid.img1", "[image]", adapters(), { hasMedia: true });
  const r2 = await shouldProcess("test", "+27img", "wamid.img2", "[image]", adapters(), { hasMedia: true });
  assert.deepEqual(r1, { action: "process" });
  assert.deepEqual(r2, { action: "process" });
});

test("two rapid TEXT within 2s: second skips (lock still guards text)", async () => {
  _resetForTest();
  const r1 = await shouldProcess("test", "+27txt", "wamid.t1", "hello", adapters());
  const r2 = await shouldProcess("test", "+27txt", "wamid.t2", "hello again", adapters());
  assert.deepEqual(r1, { action: "process" });
  assert.equal(r2.action, "skip");
  assert.equal(r2.reason, "concurrent_duplicate");
});

test("same-wamid media: still deduped by wamid", async () => {
  _resetForTest();
  const seen = new Set();
  const a = adapters({
    seenByWamid: async (id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    },
  });
  const r1 = await shouldProcess("test", "+27redup", "wamid.same", "[image]", a, { hasMedia: true });
  const r2 = await shouldProcess("test", "+27redup", "wamid.same", "[image]", a, { hasMedia: true });
  assert.deepEqual(r1, { action: "process" });
  assert.equal(r2.action, "skip");
  assert.equal(r2.reason, "duplicate_wamid");
});

test("processing lock expires after 2s", async () => {
  _resetForTest();
  const r1 = await shouldProcess("test", "+27lock", "wamid.x", "first", adapters());
  assert.deepEqual(r1, { action: "process" });
  await new Promise((r) => setTimeout(r, 2100));
  const r2 = await shouldProcess("test", "+27lock", "wamid.y", "second", adapters());
  assert.deepEqual(r2, { action: "process" });
});

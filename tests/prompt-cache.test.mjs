// Prompt cache split — behavior parity with the inline version that
// shipped in Sasa's arch2 commit (c8e510f). These tests pin the contract
// so future v0.2 work (adding the Anthropic client, dispatch loop) cannot
// silently regress the primitive every Adapter already depends on.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { splitForCache } from "../dist/prompt-cache.js";

const SYSTEM_SAMPLE = `You are Sasa.
[laws & persona — long stable prefix]
What you know about Nisria (Brain grounding):
- founded 2019
- 12 active beneficiaries
`;
const SPLIT_MARKER = "What you know about Nisria";
const CLOCK = "\n\nCurrent clock: 19:07 (Asia/Dubai).";

test("splits into 2 blocks at the marker, cache_control on prefix only", () => {
  const out = splitForCache(SYSTEM_SAMPLE, CLOCK, SPLIT_MARKER);
  assert.ok(Array.isArray(out), "should return an array");
  assert.equal(out.length, 2);
  assert.equal(out[0].type, "text");
  assert.deepEqual(out[0].cache_control, { type: "ephemeral" }, "prefix block must be cache-controlled");
  assert.ok(!out[1].cache_control, "tail block must NOT be cache-controlled");
});

test("prefix block ends just before the marker", () => {
  const out = splitForCache(SYSTEM_SAMPLE, CLOCK, SPLIT_MARKER);
  assert.ok(out[0].text.endsWith("[laws & persona — long stable prefix]\n"));
  assert.ok(!out[0].text.includes(SPLIT_MARKER), "marker stays in the tail block");
});

test("tail block starts at the marker and ends with the clock line", () => {
  const out = splitForCache(SYSTEM_SAMPLE, CLOCK, SPLIT_MARKER);
  assert.ok(out[1].text.startsWith(SPLIT_MARKER));
  assert.ok(out[1].text.endsWith(CLOCK));
});

test("disabled flag returns a single string (rollback semantics)", () => {
  const out = splitForCache(SYSTEM_SAMPLE, CLOCK, SPLIT_MARKER, { disabled: true });
  assert.equal(typeof out, "string");
  assert.equal(out, SYSTEM_SAMPLE + CLOCK);
});

test("marker not present in system returns a single string (graceful fallback)", () => {
  const out = splitForCache("No marker anywhere in here.", CLOCK, "MISSING_MARKER");
  assert.equal(typeof out, "string");
  assert.equal(out, "No marker anywhere in here." + CLOCK);
});

test("marker at index 0 returns a single string (no useful cache split)", () => {
  // splitAt === 0 means the entire system IS the dynamic tail. Returning
  // a single string is the right call: there's nothing stable to cache.
  const sys = SPLIT_MARKER + " starts immediately";
  const out = splitForCache(sys, CLOCK, SPLIT_MARKER);
  assert.equal(typeof out, "string");
  assert.equal(out, sys + CLOCK);
});

test("byte-parity reconstruction: concatenating both blocks gives system + clock", () => {
  const out = splitForCache(SYSTEM_SAMPLE, CLOCK, SPLIT_MARKER);
  const reconstructed = out[0].text + out[1].text;
  assert.equal(reconstructed, SYSTEM_SAMPLE + CLOCK, "split must be lossless");
});

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { discriminatorMismatch } from "../dist/discriminator.js";

// Mock adapters factory. Each test wires the names + last-inbound shape it
// needs without dragging in a real DB.
function adapters({ team = [], lastInbound = "" } = {}) {
  return {
    getActiveTeamFirstNames: async () => team,
    getLastUserInbound: async () => lastInbound,
  };
}

test("ok when title has no team-member name", async () => {
  const r = await discriminatorMismatch("Pay the supplier invoice", adapters({
    team: ["taona", "sara", "haneen"],
    lastInbound: "is the supplier paid",
  }));
  assert.deepEqual(r, { ok: true });
});

test("ok when user named the SAME person as title", async () => {
  const r = await discriminatorMismatch("Meeting with Taona", adapters({
    team: ["taona", "haneen", "sara"],
    lastInbound: "the meeting with taona is done",
  }));
  assert.deepEqual(r, { ok: true });
});

test("REFUSE: user said Taona, candidate is Haneen (KT #293 canonical bug)", async () => {
  const r = await discriminatorMismatch("Meeting with Haneen", adapters({
    team: ["taona", "haneen", "sara"],
    lastInbound: "meeting taona done",
  }));
  assert.equal(r.ok, false);
  assert.equal(r.expected, "haneen");
  assert.equal(r.got, "taona");
});

test("REFUSE: 'Sara done' vs candidate 'Meeting with Dinesh'", async () => {
  const r = await discriminatorMismatch("Meeting with Dinesh", adapters({
    team: ["sara", "toana", "dinesh"],
    lastInbound: "sara done",
  }));
  assert.equal(r.ok, false);
  assert.equal(r.expected, "dinesh");
  assert.equal(r.got, "sara");
});

test("ok when title has TWO names (ambiguous title, different bug class)", async () => {
  const r = await discriminatorMismatch("Meeting with Taona and Haneen", adapters({
    team: ["taona", "haneen"],
    lastInbound: "the one with taona done",
  }));
  // Two names in title means the wall has no single target to discriminate.
  // The check returns ok; the ambiguous-title bug belongs elsewhere.
  assert.deepEqual(r, { ok: true });
});

test("ok when user inbound is empty (no comparison possible)", async () => {
  const r = await discriminatorMismatch("Meeting with Haneen", adapters({
    team: ["taona", "haneen"],
    lastInbound: "",
  }));
  assert.deepEqual(r, { ok: true });
});

test("ok when team list is empty (no names to match against)", async () => {
  const r = await discriminatorMismatch("Meeting with Haneen", adapters({
    team: [],
    lastInbound: "taona done",
  }));
  assert.deepEqual(r, { ok: true });
});

test("short names (< 3 chars) are filtered: 'al' does not over-match", async () => {
  const r = await discriminatorMismatch("All the meetings", adapters({
    team: ["al", "taona"],
    lastInbound: "taona done",
  }));
  // "al" gets filtered as < 3 chars; "taona" not in title. No single target.
  assert.deepEqual(r, { ok: true });
});

test("case-insensitive: 'TAONA done' vs 'Meeting with Haneen'", async () => {
  const r = await discriminatorMismatch("Meeting with Haneen", adapters({
    team: ["taona", "haneen"],
    lastInbound: "TAONA DONE",
  }));
  assert.equal(r.ok, false);
});

test("word-boundary safe: 'haneengate' does not match 'haneen'", async () => {
  const r = await discriminatorMismatch("haneengate inquiry", adapters({
    team: ["taona", "haneen"],
    lastInbound: "taona done",
  }));
  // "haneen" is INSIDE "haneengate" but bounded by 'g' (a-z), so no match.
  // Title has no single team-name → ok.
  assert.deepEqual(r, { ok: true });
});

test("adapter throws → fail-open (safety net behavior)", async () => {
  const a = {
    getActiveTeamFirstNames: async () => { throw new Error("DB down"); },
    getLastUserInbound: async () => "taona done",
  };
  const r = await discriminatorMismatch("Meeting with Haneen", a);
  // Flaky DB at check time must not block a legitimate close.
  assert.deepEqual(r, { ok: true });
});

test("user named one team-member but NOT the expected → refuse with expected/got", async () => {
  const r = await discriminatorMismatch("Call Bashir back", adapters({
    team: ["bashir", "eliza", "taona"],
    lastInbound: "eliza done",
  }));
  assert.equal(r.ok, false);
  assert.equal(r.expected, "bashir");
  assert.equal(r.got, "eliza");
});

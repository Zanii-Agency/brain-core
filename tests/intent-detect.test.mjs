import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isAmbiguousReference, isCapabilityQuestion, isHedge, isHedgeLoop } from "../dist/intent-detect.js";

// isAmbiguousReference
test("ambiguous: 'the thing we talked about' matches", () => {
  assert.equal(isAmbiguousReference("the thing we talked about"), true);
});
test("ambiguous: 'do that one' matches", () => {
  assert.equal(isAmbiguousReference("do that one"), true);
});
test("ambiguous: 'pay Captain Express 44,000 KSH' does NOT match", () => {
  assert.equal(isAmbiguousReference("pay Captain Express 44,000 KSH"), false);
});
test("ambiguous: long command (>80 chars) does NOT match", () => {
  assert.equal(isAmbiguousReference("do that thing we talked about earlier when we discussed the donor outreach for Q3"), false);
});
test("ambiguous: empty/whitespace returns false", () => {
  assert.equal(isAmbiguousReference(""), false);
  assert.equal(isAmbiguousReference("   "), false);
});

// isCapabilityQuestion
test("capability: 'what can you do' matches", () => {
  assert.equal(isCapabilityQuestion("what can you do"), true);
});
test("capability: 'list your tools' matches", () => {
  assert.equal(isCapabilityQuestion("list your tools please"), true);
});
test("capability: 'pay the rent' does NOT match", () => {
  assert.equal(isCapabilityQuestion("pay the rent"), false);
});

// isHedge
test("hedge: 'should I go ahead?' matches", () => {
  assert.equal(isHedge("should I go ahead?"), true);
});
test("hedge: 'want me to log that?' matches", () => {
  assert.equal(isHedge("want me to log that?"), true);
});
test("hedge: 'Logged. Anything else?' does NOT match", () => {
  assert.equal(isHedge("Logged. Anything else?"), false);
});

// isHedgeLoop
test("hedgeLoop: two consecutive hedges return true", () => {
  const out = isHedgeLoop("Want me to log that?", [
    { role: "user", content: "log the receipt" },
    { role: "assistant", content: "Should I log it under Maisha or general?" },
  ]);
  assert.equal(out, true);
});

test("hedgeLoop: current hedge but no prior hedge returns false", () => {
  const out = isHedgeLoop("Want me to log that?", [
    { role: "user", content: "log the receipt" },
    { role: "assistant", content: "Logged: KSH 44,000 to Captain Express." },
  ]);
  assert.equal(out, false);
});

test("hedgeLoop: guard-rewrite turn is SKIPPED when matching guardRewriteMark", () => {
  const guardMark = /^I keep landing on the same hedge/;
  const out = isHedgeLoop(
    "Want me to log that?",
    [
      { role: "assistant", content: "Should I log it?" }, // real hedge
      { role: "assistant", content: "I keep landing on the same hedge. Try saying it a different way." }, // guard rewrite — skip
    ],
    guardMark,
  );
  assert.equal(out, true, "should reach back past the guard rewrite to the real prior hedge");
});

test("hedgeLoop: current reply not a hedge returns false fast", () => {
  const out = isHedgeLoop("Logged.", [
    { role: "assistant", content: "Want me to log that?" },
  ]);
  assert.equal(out, false);
});

// override hook
test("override regex replaces default detector", () => {
  const arabic = /^هل/; // toy: Arabic "should I?"
  assert.equal(isHedge("Should I go?"), true, "default still works");
  assert.equal(isHedge("هل أمضي قدمًا", { override: arabic }), true, "override matches");
  assert.equal(isHedge("Should I go?", { override: arabic }), false, "override does NOT match default phrasing");
});

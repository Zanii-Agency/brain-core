import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  makeCompletionGuard,
  makeSendGuard,
  makeStagingGuard,
  makeSympathyGuard,
} from "../dist/honesty-guards.js";

// ── Test config mirrors Sasa's real shape (Nisria policy as the test bench) ──
const SHAPE_MONEY = /\b(?:KES|USD|\$|KSh|Ksh)\s*[\d,\.]+|[\d,]+(?:\.\d+)?\s*(?:KES|USD|\$|KSh)\b/i;
const SHAPE_TASK = /\b(?:task|reminder|todo)\b/i;

const completion = makeCompletionGuard({
  agentCompletion: /\b(?:i'?ve|i\s+have|i|we)\s+(?:marked|logged|recorded|created|completed|scheduled|sent|updated|saved|noted|added|removed|deleted|set|moved|tracked|reassigned)\b/i,
  doneSimple: /\b(?:i'?(?:m|ve)|i\s+(?:have|am)|we'?ve|we\s+have|we|i|it'?s|that'?s)\s+(?:(?:mark(?:ed)?|set)(?:\s+(?:it|that|them|those|as))*\s+)?(?:done|complete|completed|crossed off|ticked off|checked off)\b/i,
  futureClaim: /\b(?:i will|i'?ll|let me|should i|shall i|do you want me|want me to|would you like me|can i)\b/i,
  aboutUserComplete: /\b(?:when |once |after |if )?you(?:'?re| are| have| 've)?\s+(?:done|complete|completed|finished?)\b/i,
  agentSelfMark: /\b(?:i'?ve|i have|marked|logged|recorded|created|that'?s done|it'?s done)\b/i,
  completionTools: new Set(["complete_task", "create_task", "record_payment", "remember_fact"]),
  shapes: [
    { name: "money", regex: SHAPE_MONEY, requiredTools: new Set(["record_payment"]) },
    { name: "task", regex: SHAPE_TASK, requiredTools: new Set(["create_task", "complete_task"]), readTools: new Set(["list_tasks"]) },
  ],
  parseTasksSucceeded: (toolRuns) =>
    toolRuns.some((t) => t.name === "create_task" && t.result?.ok === true && t.result?.detail?.source_kind === "parsed_task"),
  globalReadExemptTools: new Set(["list_tasks"]),
});

test("completion: 'I logged KES 44,000' with NO record_payment success → guard fires", () => {
  assert.equal(completion("I logged KES 44,000 for Captain Express.", []), true);
});

test("completion: 'I logged KES 44,000' WITH record_payment ok → passes", () => {
  assert.equal(
    completion("I logged KES 44,000 for Captain Express.", [
      { name: "record_payment", result: { ok: true } },
    ]),
    false,
  );
});

test("completion: future phrasing 'I will log that' passes", () => {
  assert.equal(completion("I will log that for you.", []), false);
});

test("completion: 'you completed the task' is about user, not agent → passes", () => {
  assert.equal(completion("Once you completed the task, ping me.", []), false);
});

test("completion: 'I've logged' (agent self-mark) with no tool → guard fires", () => {
  assert.equal(completion("I've logged that task.", []), true);
});

test("completion: 'I logged a task' backed by parseTasks create_task → passes (parseTasksExempt? no, generic catch-all)", () => {
  // generic catch-all: completionTools contains create_task? No here.
  // Use a parseTasks-shaped tool.
  const out = completion("I logged your task.", [
    { name: "create_task", result: { ok: true, detail: { source_kind: "parsed_task" } } },
  ]);
  // Generic catch-all has create_task in completionTools? Our config doesn't include it.
  // But shapes.task.requiredTools does include create_task → ok via shape.
  assert.equal(out, false);
});

test("completion: list_tasks ran successfully → global read exempt", () => {
  assert.equal(
    completion("I've noted your open tasks: 1. Send the brief 2. Review Maisha.", [
      { name: "list_tasks", result: { count: 2, open_tasks: [{}, {}] } },
    ]),
    false,
  );
});

test("completion: no claim of done at all → passes", () => {
  assert.equal(completion("How are things going?", []), false);
});

// ── send guard ──
const send = makeSendGuard({
  sendClaim: /\b(?:sent\s+(?:it|them|the\s+(?:task|message|reminder|note))?\s*(?:to|him|her|them)|i'?ve\s+sent|i\s+have\s+sent|message\s+sent|messaged|texted|pinged|notified|told\s+(?:him|her|them|\w+)|let\s+(?:him|her|them|\w+)\s+know|reached\s+out\s+to)\b/i,
  futureOrHonest: /\b(?:i will|i'?ll|let me|should i|shall i|do you want me|want me to|would you like me|can i|haven'?t|have not|not yet)\b/i,
  sendTools: new Set(["message_person", "post_to_group", "send_newsletter"]),
});

test("send: 'Sent to Mark' with NO message_person → guard fires", () => {
  assert.equal(send("Sent to Mark.", []), true);
});

test("send: 'Sent to Mark' WITH message_person ok → passes", () => {
  assert.equal(send("Sent to Mark.", [{ name: "message_person", result: { ok: true } }]), false);
});

test("send: 'Want me to send to Mark?' (future) passes", () => {
  assert.equal(send("Want me to send to Mark?", []), false);
});

// ── staging guard ──
const staging = makeStagingGuard({
  stagingClaim: /\bready\s+to\s+(?:log|record|stage)\b|\bi\s+have\s+it\s+staged\b/i,
  stagingTools: new Set(["record_payment", "draft_email"]),
});

test("staging: 'Ready to log this payment' WITHOUT record_payment → fires", () => {
  assert.equal(staging("Ready to log this payment.", []), true);
});

test("staging: 'Ready to log this payment' WITH record_payment ok → passes", () => {
  assert.equal(staging("Ready to log this payment.", [{ name: "record_payment", result: { ok: true } }]), false);
});

// ── sympathy guard ──
const sympathy = makeSympathyGuard({
  sympathyOpener: /^(?:i'?m\s+(?:so|really|truly)?\s*sorry,?\s+(?:Nur|to\s+hear|for\s+your|about)[^.!?]{0,80}[.!?]\s*|that(?:'s|\s+is)\s+(?:so\s+)?(?:heartbreaking|awful|terrible|tragic)[^.!?]{0,40}[.!?]\s*)+/i,
});

test("sympathy: prior assistant turn opened with sympathy → returns true", () => {
  const out = sympathy([
    { role: "user", content: "more bad news" },
    { role: "assistant", content: "I'm so sorry, Nur. That's heartbreaking. Tell me what happened." },
  ]);
  assert.equal(out, true);
});

test("sympathy: prior assistant turn did NOT open with sympathy → returns false", () => {
  const out = sympathy([
    { role: "assistant", content: "Logged that task." },
  ]);
  assert.equal(out, false);
});

test("sympathy: empty history → returns false", () => {
  assert.equal(sympathy([]), false);
});

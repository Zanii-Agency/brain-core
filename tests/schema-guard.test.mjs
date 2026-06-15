import { test } from "node:test";
import { strict as assert } from "node:assert";
import { checkSchema, formatSchemaResult } from "../dist/schema-guard.js";

// Mock Supabase-shape DB. Each entry maps a (table, cols-string) to the
// PostgrestError the real client would return, or null on success.
function makeMockDb(plan) {
  return {
    from(table) {
      return {
        select(cols) {
          return {
            async limit(_n) {
              const key = `${table}::${cols}`;
              const e = plan[key];
              return { error: e ?? null };
            },
          };
        },
      };
    },
  };
}

// Helper: shape of a 42703-style PostgrestError.
const err = (code, message) => ({ code, message });

test("ok when every table/columns query succeeds", async () => {
  const db = makeMockDb({}); // every probe returns no error
  const r = await checkSchema({
    db,
    manifest: { messages: ["id", "body"], tasks: ["id", "title"] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.missing.length, 0);
  assert.equal(r.driftCodes.length, 0);
  assert.equal(r.checkedTables, 2);
  assert.equal(r.checkedColumns, 4);
});

test("detects single missing column via 42703 (KT #295 today's bug)", async () => {
  // First-pass select-all errors with 42703. Then per-column probe identifies
  // which one is missing.
  const db = makeMockDb({
    "messages::id,body,reply_to_external_id": err("42703", "reply_to_external_id does not exist"),
    "messages::id": null,
    "messages::body": null,
    "messages::reply_to_external_id": err("42703", "reply_to_external_id does not exist"),
  });
  const r = await checkSchema({
    db,
    manifest: { messages: ["id", "body", "reply_to_external_id"] },
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ table: "messages", column: "reply_to_external_id" }]);
});

test("detects multiple missing columns in one table", async () => {
  const db = makeMockDb({
    "tasks::id,title,due_date,assignee_id": err("42703", "due_date does not exist"),
    "tasks::id": null,
    "tasks::title": null,
    "tasks::due_date": err("42703", "due_date does not exist"),
    "tasks::assignee_id": err("42703", "assignee_id does not exist"),
  });
  const r = await checkSchema({
    db,
    manifest: { tasks: ["id", "title", "due_date", "assignee_id"] },
  });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 2);
  assert.ok(r.missing.some((m) => m.column === "due_date"));
  assert.ok(r.missing.some((m) => m.column === "assignee_id"));
});

test("detects missing table via 42P01", async () => {
  const db = makeMockDb({
    "vanished::id,col": err("42P01", "relation \"vanished\" does not exist"),
  });
  const r = await checkSchema({ db, manifest: { vanished: ["id", "col"] } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ table: "vanished", column: "(table itself)" }]);
});

test("ignores transient errors (08000 connection_exception)", async () => {
  // A flaky DB at boot must not crash a healthy app.
  const db = makeMockDb({
    "messages::id": err("08000", "connection failed"),
  });
  const r = await checkSchema({ db, manifest: { messages: ["id"] } });
  assert.equal(r.ok, true);
  assert.equal(r.missing.length, 0);
  assert.equal(r.driftCodes.length, 0);
});

test("ignores transient errors (57014 statement_timeout)", async () => {
  const db = makeMockDb({
    "messages::id": err("57014", "canceling statement due to statement timeout"),
  });
  const r = await checkSchema({ db, manifest: { messages: ["id"] } });
  assert.equal(r.ok, true);
});

test("records 23502 (not_null_violation) as drift", async () => {
  // A NOT NULL column added without a default means the code path will
  // structurally fail on every insert that does not set it. Drift.
  const db = makeMockDb({
    "messages::id,body": err("23502", "null value in column body"),
  });
  const r = await checkSchema({ db, manifest: { messages: ["id", "body"] } });
  assert.equal(r.ok, false);
  assert.equal(r.driftCodes.length, 1);
  assert.equal(r.driftCodes[0].code, "23502");
});

test("records 42883 (undefined_function) as drift", async () => {
  const db = makeMockDb({
    "messages::id": err("42883", "function f(int) does not exist"),
  });
  const r = await checkSchema({ db, manifest: { messages: ["id"] } });
  assert.equal(r.ok, false);
  assert.equal(r.driftCodes[0].code, "42883");
});

test("skips empty column list (no probe, no count)", async () => {
  const db = makeMockDb({});
  const r = await checkSchema({ db, manifest: { messages: [] } });
  assert.equal(r.ok, true);
  assert.equal(r.checkedTables, 0);
  assert.equal(r.checkedColumns, 0);
});

test("formatSchemaResult: ok shape", () => {
  const s = formatSchemaResult({ ok: true, missing: [], driftCodes: [], checkedTables: 3, checkedColumns: 22 });
  assert.match(s, /schema OK: 22 columns/);
});

test("formatSchemaResult: missing shape", () => {
  const s = formatSchemaResult({
    ok: false,
    missing: [{ table: "messages", column: "reply_to_external_id" }],
    driftCodes: [],
    checkedTables: 1,
    checkedColumns: 3,
  });
  assert.match(s, /MISSING: messages\.reply_to_external_id/);
});

test("formatSchemaResult: drift shape", () => {
  const s = formatSchemaResult({
    ok: false,
    missing: [],
    driftCodes: [{ table: "tasks", code: "23502", message: "null value in column due_on" }],
    checkedTables: 1,
    checkedColumns: 4,
  });
  assert.match(s, /DRIFT: tasks 23502 null value/);
});

test("partial drift: some tables ok, some not", async () => {
  const db = makeMockDb({
    // tasks ok
    "tasks::id,title": null,
    // messages drifted on reply_to_external_id
    "messages::id,body,reply_to_external_id": err("42703", "reply_to_external_id does not exist"),
    "messages::id": null,
    "messages::body": null,
    "messages::reply_to_external_id": err("42703", "reply_to_external_id does not exist"),
  });
  const r = await checkSchema({
    db,
    manifest: { tasks: ["id", "title"], messages: ["id", "body", "reply_to_external_id"] },
  });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].column, "reply_to_external_id");
  assert.equal(r.checkedTables, 2);
});

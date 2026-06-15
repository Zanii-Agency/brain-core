import { test } from "node:test";
import { strict as assert } from "node:assert";
import { register, list, get, _resetForTest } from "../dist/tool-registry.js";

test("register + list + get round-trip", () => {
  _resetForTest();
  register({
    name: "test.guard",
    category: "guard",
    description: "test guard",
    registeredAt: "2026-06-16",
    kt: 293,
    run: async () => ({ ok: true }),
  });
  const all = list();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, "test.guard");
  const got = get("test.guard");
  assert.equal(got?.category, "guard");
});

test("list returns alphabetically sorted by name", () => {
  _resetForTest();
  register({ name: "z.tool", category: "guard", description: "z", registeredAt: "2026-06-16", run: async () => null });
  register({ name: "a.tool", category: "guard", description: "a", registeredAt: "2026-06-16", run: async () => null });
  register({ name: "m.tool", category: "guard", description: "m", registeredAt: "2026-06-16", run: async () => null });
  const names = list().map((p) => p.name);
  assert.deepEqual(names, ["a.tool", "m.tool", "z.tool"]);
});

test("get returns undefined for missing name", () => {
  _resetForTest();
  assert.equal(get("never.registered"), undefined);
});

test("double-register throws", () => {
  _resetForTest();
  register({ name: "dup", category: "guard", description: "x", registeredAt: "2026-06-16", run: async () => null });
  assert.throws(() => {
    register({ name: "dup", category: "guard", description: "y", registeredAt: "2026-06-16", run: async () => null });
  }, /already registered/);
});

test("primitive can be invoked via the registry", async () => {
  _resetForTest();
  register({
    name: "add",
    category: "resolver",
    description: "adds two numbers",
    registeredAt: "2026-06-16",
    run: async (input, adapters) => {
      const { a, b } = input;
      return a + b + adapters.bonus;
    },
  });
  const p = get("add");
  const r = await p.run({ a: 1, b: 2 }, { bonus: 10 });
  assert.equal(r, 13);
});

test("all 5 categories accepted", () => {
  _resetForTest();
  const categories = ["guard", "resolver", "chokepoint", "persistence", "introspection"];
  for (const c of categories) {
    register({ name: `p.${c}`, category: c, description: c, registeredAt: "2026-06-16", run: async () => null });
  }
  assert.equal(list().length, 5);
});

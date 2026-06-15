// @sinanagency/brain-core/tool-registry
//
// Cross-bot tool primitive contract. Started 2026-06-16 as the foundation
// for [[KT #229]] wall-at-primitive scaled across the fleet.
//
// The pattern: brain-core ships PURE LOGIC primitives (regex-only honesty
// guards, the discriminator, schema-drift detection). Each bot supplies
// adapters that wire the primitive to its own DB shape, persona, and
// audience rules. Today's first registered primitive is the discriminator;
// future commits add complete-target resolution, send chokepoint shape,
// honesty-guard composition.
//
// The registry itself is intentionally MINIMAL today — just the contract
// + a register/list pair for introspection. Tomorrow's dream cycle (KT
// follow-up, the C-half of Pete-style self-improvement) reads from the
// registry to know what primitives exist and which ones a transcript
// could improve.

export type ToolPrimitiveCategory =
  | "guard"          // refuses an action that would corrupt state
  | "resolver"       // turns ambiguous user intent into a concrete target
  | "chokepoint"     // single-door egress
  | "persistence"    // canonical write surface
  | "introspection"; // reads the bot's own state for the operator

export type ToolPrimitive<TInput = unknown, TOutput = unknown, TAdapters = unknown> = {
  name: string;
  category: ToolPrimitiveCategory;
  // One-line human description. The dream cycle (C) reads this to know
  // what a transcript "should have" used. Be specific, not generic.
  description: string;
  // ISO date the primitive was registered. Helps the dream cycle correlate
  // bug ages with primitive ages: a bug from before a primitive existed
  // is not a primitive failure.
  registeredAt: string;
  // Optional ref to the KT node that motivated the primitive. Helps reasoning
  // when the dream cycle proposes changes.
  kt?: number;
  // The actual callable. The bot wires this with its own adapters at call
  // time. brain-core never owns a DB connection; the adapter pattern
  // (TAdapters generic) is how the bot stays in control of access scope.
  run: (input: TInput, adapters: TAdapters) => Promise<TOutput>;
};

// In-memory registry. Bots that want to enumerate their wired primitives
// (e.g. for /tools introspection or the dream cycle) call list().
const REGISTRY = new Map<string, ToolPrimitive<any, any, any>>();

export function register<I, O, A>(primitive: ToolPrimitive<I, O, A>): void {
  if (REGISTRY.has(primitive.name)) {
    throw new Error(`tool-registry: primitive "${primitive.name}" already registered`);
  }
  REGISTRY.set(primitive.name, primitive as ToolPrimitive<any, any, any>);
}

export function list(): ToolPrimitive<any, any, any>[] {
  return Array.from(REGISTRY.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function get(name: string): ToolPrimitive<any, any, any> | undefined {
  return REGISTRY.get(name);
}

// Test-only escape hatch. Production code never calls this.
export function _resetForTest(): void {
  REGISTRY.clear();
}

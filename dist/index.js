// @sinanagency/brain-core — public API.
//
// Empty machinery for sinanagency bots. Each Adapter brings its own
// persona text, tool implementations, DB connection, and audience rules.
// The package itself ships zero tenant-specific knowledge.
//
// v0.1 surface: prompt cache split primitive (the first piece extracted
// from Sasa's runSasa, arch2 c8e510f). Subsequent versions add the
// Anthropic client wrapper, tool dispatch loop, and honesty guards.
export { splitForCache } from "./prompt-cache.js";
export { runClaude } from "./claude-client.js";
export { isAmbiguousReference, isCapabilityQuestion, isHedge, isHedgeLoop } from "./intent-detect.js";
export { makeCompletionGuard, makeSendGuard, makeStagingGuard, makeSympathyGuard } from "./honesty-guards.js";
//# sourceMappingURL=index.js.map
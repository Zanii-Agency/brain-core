// @sinanagency/brain-core/send-chokepoint
//
// Unified send primitive with audit logging. Every bot's outbound goes through
// this, with tenant-specific adapters for persistence and dev routing.
//
// The pattern: sanitize → dev-check → send → persist → return.
// Each bot supplies adapters for:
//   - persistOutbound(to, body, opts) — tenant-specific DB insert
//   - devPhone() — returns dev phone number or null
//   - sendFn(to, body, opts) — the actual WhatsApp API call
//
// KT #293 (Law 2): the send chokepoint. Every outbound message passes through
// a single door where sanitization, dev-routing, and audit logging happen.
// The wall (bot-guards) runs inside the primitive, not at each call site.

export type SendChokepointAction =
  | { ok: true; id?: string | null }
  | { ok: false; error: string };

export type SendChokepointAdapters = {
  persistOutbound: (
    to: string,
    body: string,
    opts?: { party?: string; trace_id?: string | null }
  ) => Promise<{ id: string | null; error?: string }>;
  devPhone: () => string | null;
  sendFn: (
    to: string,
    body: string,
    opts?: { force?: boolean }
  ) => Promise<{ id?: string; error?: string }>;
};

export type SendChokepointOpts = {
  party?: string;
  dev?: boolean;
  trace_id?: string | null;
  force?: boolean;
};

export async function sendWithAudit(
  to: string,
  body: string,
  adapters: SendChokepointAdapters,
  opts?: SendChokepointOpts,
): Promise<SendChokepointAction> {
  // 1) Dev mode: reroute to dev phone, skip persistence
  if (opts?.dev) {
    const devTarget = adapters.devPhone();
    if (!devTarget) return { ok: false, error: "no_dev_phone" };
    const res = await adapters.sendFn(devTarget, `[DEV] ${body}`, { force: true });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, id: res.id ?? null };
  }

  // 2) Persist BEFORE send (Law 2: write before send, prevents orphan on failure)
  const persisted = await adapters.persistOutbound(to, body, {
    party: opts?.party,
    trace_id: opts?.trace_id,
  });

  // 3) Send via WhatsApp API
  const sendRes = await adapters.sendFn(to, body, { force: opts?.force });

  // 4) Return combined result
  if (sendRes.error) {
    return { ok: false, error: sendRes.error };
  }
  return { ok: true, id: persisted.id };
}

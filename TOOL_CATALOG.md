# Tool Catalog — @sinanagency/brain-core

The master registry every Adapter picks from. One catalog, many bots.
Adding a tool here makes it available to every Adapter. Each Adapter
chooses which tools to expose to its own Brain.

## The Contract

```ts
import type { Tool } from "@sinanagency/brain-core";

interface Tool {
  name: string;                    // unique kebab_snake — used in tool_use
  description: string;             // what the Brain reads to decide
  intent: ToolIntent;              // semantic class (see below)
  audience: ToolAudience;          // who is permitted to call it
  input_schema: JSONSchema;        // Anthropic-compatible
  // The execution function is NOT in the catalog. Each Adapter wires
  // its own implementation against its DB. The catalog is the
  // CONTRACT; the Adapter is the IMPLEMENTATION.
}

type ToolIntent =
  | "read"           // pure read, no side effect, no approval needed
  | "write"          // creates/updates/deletes data
  | "send"           // sends a message/email/notification (real-world action)
  | "money";         // touches money (records payment, refunds, payouts)

type ToolAudience =
  | "owner"          // only the bot's owner principal (e.g. Nur, Jensen)
  | "team"           // owner + delegated team members
  | "public"         // any authenticated end user (e.g. CTH vendors)
  | "internal";      // bot-to-bot / cron-only, never user-facing
```

## Selection Rules

An Adapter picks tools like this:

```ts
// nisria-techops/lib/adapter.ts
import { selectTools, TOOL_CATALOG } from "@sinanagency/brain-core";

export const SASA_TOOLS = selectTools(TOOL_CATALOG, {
  audience: { owner: "all", team: ["read", "write"] },   // money only for owner
  pickByName: [
    "list_tasks", "create_task", "complete_task", "reopen_task",
    "lookup_donor", "query_donations", "finance_summary", "record_payment",
    "team_detail", "lookup_contact", "list_campaigns", "remember_fact",
    // ...
  ],
});
```

Rules the selector enforces at startup:

1. **Audience honors money wall.** `money`-intent tools are blocked for non-owner audiences regardless of `pickByName`.
2. **No duplicates.** Tool name uniqueness checked across the picked set.
3. **No silent drops.** If a name in `pickByName` doesn't exist in the catalog, startup throws (typos can't silently disable a tool).
4. **Manifest stamping.** Each Adapter's selected set is hashed and logged at boot; mismatch between expected and actual = startup failure.

## The Catalog (initial seed, mirrors Sasa's 106 tools)

> **Status:** spec only. Implementation lives in Adapter; catalog declares the contract.

### Read — money & donors (owner-only by default)

| name | intent | audience | one-line |
|---|---|---|---|
| `query_donations` | read | owner | Sum/count/list donations by date range, status, recurring filter |
| `lookup_donor` | read | owner | Find donor by name/email, lifetime value, gift history |
| `newest_donor` | read | owner | Most recently added donor |
| `finance_summary` | read | owner | Money in vs out for a month |
| `list_grants` | read | owner | Grant opportunities or applications |
| `list_payroll` | read | owner | Payroll snapshot |
| `list_bank_transactions` | read | owner | Bank ledger reads |
| `latest_gift` | read | owner | Most recent successful donation |
| `donor_activity` | read | owner | Donor recent activity |

### Read — operations (team + owner)

| name | intent | audience | one-line |
|---|---|---|---|
| `list_tasks` | read | team | Open/done tasks, by assignee or status |
| `inbox_status` | read | team | New/needs-reply message counts |
| `list_team` | read | team | Team roster |
| `team_detail` | read | team | One team member's contact + role |
| `lookup_contact` | read | team | Find a person by name/phone/email |
| `read_contact_thread` | read | team | Last N messages for a contact |
| `search_inbox` | read | team | Free-text inbox search |
| `list_groups` | read | team | WhatsApp groups the bot is in |
| `group_activity` | read | team | Group's recent traffic |
| `member_activity` | read | team | One member's recent activity |
| `agent_activity` | read | team | Bot's recent autonomous actions |
| `search_history` | read | team | Free-text history search |
| `query_memory` | read | team | Brain memory lookup |
| `list_learned` | read | team | What the Brain has learned recently |

### Read — beneficiaries & cases

| name | intent | audience | one-line |
|---|---|---|---|
| `find_beneficiary` | read | owner | Find a child by name (PII-walled in groups) |
| `list_beneficiaries` | read | owner | Roster of active beneficiaries |

### Read — content & assets

| name | intent | audience | one-line |
|---|---|---|---|
| `search_documents` | read | team | Search the library by content |
| `read_document` | read | team | Fetch one document's text |
| `summarize_document` | read | team | LLM summarize a doc |
| `find_studio_doc` | read | team | Find a doc in the studio library |
| `list_assets` | read | team | List media assets |
| `list_inventory` | read | team | Inventory rows |
| `list_wishlist` | read | team | Wishlist items |
| `list_content` | read | team | Published content posts |
| `list_campaigns` | read | team | Active campaigns (names only at team tier) |
| `read_brief` | read | team | Read the daily brief |

### Read — calendar

| name | intent | audience | one-line |
|---|---|---|---|
| `query_calendar` | read | team | Events in a window |
| `check_conflicts` | read | team | Conflicts at a proposed time |

### Write — tasks (universal)

| name | intent | audience | one-line |
|---|---|---|---|
| `create_task` | write | team | Create a task (assignee, due date) |
| `complete_task` | write | team | Mark a task done |
| `reopen_task` | write | team | Move a done task back to to-do |
| `update_task` | write | team | Edit fields on a task |
| `delete_task` | write | team | Remove a task (audit-logged) |
| `add_task_comment` | write | team | Append a comment to a task |
| `list_task_comments` | read | team | Read a task's comments |
| `link_task_dependency` | write | team | Mark task A blocked by B |
| `list_task_dependencies` | read | team | Read a task's blockers |

### Write — beneficiaries & cases

| name | intent | audience | one-line |
|---|---|---|---|
| `add_beneficiary` | write | owner | Add an active beneficiary |
| `update_beneficiary` | write | owner | Edit a beneficiary record |
| `set_beneficiary_funding` | write | owner | Set funding status |
| `approve_case` | write | owner | Approve a pending case |
| `decline_case` | write | owner | Decline a pending case |
| `edit_case` | write | owner | Edit a case |
| `merge_case` | write | owner | Merge duplicate cases |
| `move_case` | write | owner | Change case status |
| `delete_case` | write | owner | Remove a case (audit-logged) |

### Money (owner-only, always)

| name | intent | audience | one-line |
|---|---|---|---|
| `record_payment` | money | owner | Log an outbound payment |
| `update_payment` | money | owner | Edit a payment row |
| `delete_payment` | money | owner | Remove a payment (audit) |
| `mark_payment_paid` | money | owner | Mark a scheduled payment as paid |
| `schedule_payment` | money | owner | Schedule a future payment |
| `log_payout` | money | owner | Log a payout to a team member |
| `log_team_payment` | money | owner | Log a payment to a team member |
| `fund_wishlist_item` | money | owner | Fund a wishlist item |
| `extract_invoice` | read | owner | Parse an invoice PDF into structured fields (Jensen) |

### Send (real-world actions)

| name | intent | audience | one-line |
|---|---|---|---|
| `message_person` | send | team | Send a WhatsApp/email to one contact (gated) |
| `post_to_group` | send | team | Post to a WhatsApp group (gated) |
| `send_file_to_person` | send | team | Send a doc/image to a contact (gated) |
| `draft_email` | write | team | Draft an email (does NOT send) |
| `send_newsletter` | send | owner | Send a campaign (heavy gate) |
| `draft_thank_you` | write | team | Draft a thank-you for one donor |
| `draft_all_thank_yous` | write | owner | Bulk draft thank-yous |
| `post_to_social` | send | owner | Publish a social post (gated) |
| `publish_social_post` | send | owner | Confirm + publish a queued social post |
| `draft_post` | write | team | Draft a social post (does NOT publish) |

### Calendar writes

| name | intent | audience | one-line |
|---|---|---|---|
| `create_event` | write | team | Add a calendar event |
| `move_event` | write | team | Reschedule an event |
| `delete_event` | write | team | Remove an event |

### People & contacts

| name | intent | audience | one-line |
|---|---|---|---|
| `add_team_member` | write | owner | Add a team member |
| `update_team_member` | write | owner | Edit a team member |
| `activate_member` | write | owner | Set active status |
| `set_bot_access` | write | owner | Grant/revoke bot access |
| `add_contact` | write | team | Add a contact |
| `update_contact` | write | team | Edit a contact |
| `delete_contact` | write | owner | Remove a contact (audit) |
| `add_donor` | write | owner | Add a donor |
| `update_donor` | write | owner | Edit a donor |
| `import_contacts` | write | owner | Bulk import |

### Inventory / wishlist / campaigns

| name | intent | audience | one-line |
|---|---|---|---|
| `add_inventory_item` | write | team | Add an inventory row |
| `update_inventory_item` | write | team | Edit inventory |
| `add_wishlist_item` | write | team | Add a wishlist item |
| `update_wishlist_item` | write | team | Edit a wishlist item |
| `add_campaign` | write | owner | Create a campaign |
| `update_campaign` | write | owner | Edit a campaign |

### Grants

| name | intent | audience | one-line |
|---|---|---|---|
| `add_grant` | write | owner | Add a grant opportunity |
| `pursue_opportunity` | write | owner | Move opportunity → application |
| `update_grant_status` | write | owner | Update application status |
| `prepare_grants` | write | owner | Auto-prepare draft application |
| `refresh_grants` | write | owner | Trigger grant hunter sweep |

### Brain / memory

| name | intent | audience | one-line |
|---|---|---|---|
| `remember_fact` | write | team | Promote a durable fact into the Brain |
| `edit_brain_section` | write | owner | Edit an org_profile section |
| `set_public_profile` | write | owner | Toggle a brain section's public flag |
| `set_monthly_goal` | write | owner | Set the org's monthly money goal |

### Documents

| name | intent | audience | one-line |
|---|---|---|---|
| `file_document` | write | team | File a document into the library |
| `delete_document` | write | owner | Remove a document (audit) |
| `transfer_drive_file` | write | owner | Move a Google Drive file |
| `run_group_digest` | write | owner | Trigger a group digest |
| `mark_handled` | write | team | Mark an inbox item handled |

## Per-Bot Selection (initial port)

### Sasa Adapter (Nisria) — full owner set
Pick **all** tools. Audience filter does the rest:
- Group surface: audience=`team`, money tools auto-stripped, beneficiary names walled.
- 727 DM (Nur): audience=`owner`, full access.

### Jensen Adapter — owner-only, full money + intake tools
Pick: all read/write tools that touch Upaya/Quiqup + invoice/PDF intake + `record_payment`, `extract_invoice`, `draft_email`, `create_event`, `move_event`, `query_calendar`, `check_conflicts`, `remember_fact`, `query_memory`, `list_tasks`, `create_task`, `complete_task`, `lookup_contact`, `read_contact_thread`. NO donor/grant/beneficiary tools (not his domain).

### CTH Adapter — minimal comms set
Pick: `lookup_contact`, `read_contact_thread`, `query_memory`, `remember_fact`, `list_tasks` (for staff view), `mark_handled`, `message_person` (gated to vendor support lane only), `create_task`. NO money tools (handled by Yoco webhook), NO donor/beneficiary/grant tools.

## Adding a new tool

1. Add a row to this catalog with name, intent, audience, schema.
2. Write the implementation in each Adapter that selects it.
3. If the tool should be available to ALL bots: add to all 3 Adapters in one PR.
4. If audience changes: update the row and re-verify each Adapter's manifest at startup.

## Adding a new bot

1. Write `<bot>/lib/adapter.ts`.
2. Call `selectTools(TOOL_CATALOG, { audience, pickByName })`.
3. Wire each picked tool to a real DB call.
4. The Brain Core, Wall, Intake all come for free.

---

*Locked by spec: v0.1. Catalog is a contract; do not delete or rename a tool without bumping minor version and updating every Adapter that selects it.*

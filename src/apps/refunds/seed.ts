import { decide, listApprovals } from "@/lib/approvals";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { applyTransition } from "@/lib/transitions";
import { refunds } from "./config";

export type Outcome = "requested" | "one_approval" | "approved" | "denied" | "issued";
type Requester = "agent" | "reviewer" | "admin";

/** [customer, order id (unique per sample), amount in cents, reason code, notes, requester, outcome] */
export type SeedRefund = [string, string, number, string, string | null, Requester, Outcome];

export const SEED: SeedRefund[] = [
  ["Acme Logistics", "ORD-10421", 4_999, "duplicate_charge", "Charged twice on 3 Oct", "agent", "requested"],
  ["Jane Cooper", "ORD-10433", 12_500, "item_not_received", null, "agent", "requested"],
  ["Brightside Dental", "ORD-10440", 2_350, "service_outage", "Outage credit, 2 days", "agent", "requested"],
  ["Marcus Lee", "ORD-10452", 189_900, "damaged_item", "Laptop arrived with cracked screen", "agent", "requested"],
  ["Northwind Traders", "ORD-10467", 325_000, "subscription_cancelled", "Annual plan cancelled in week 1", "agent", "one_approval"],
  ["Priya Shah", "ORD-10471", 7_800, "goodwill", "Long wait on support call", "admin", "requested"],
  ["Tomás García", "ORD-10489", 15_000, "item_not_received", null, "agent", "requested"],
  ["Helios Solar", "ORD-10495", 64_000, "duplicate_charge", null, "reviewer", "requested"],
  ["Emma Wilson", "ORD-10302", 3_499, "damaged_item", null, "agent", "approved"],
  ["Contoso Ltd", "ORD-10311", 48_000, "service_outage", "SLA breach credit", "agent", "approved"],
  ["Liam O'Brien", "ORD-10318", 9_900, "duplicate_charge", null, "agent", "approved"],
  ["Fabrikam Inc", "ORD-10325", 152_000, "subscription_cancelled", "Downgrade refund, prorated", "agent", "approved"],
  ["Sofia Rossi", "ORD-10333", 2_000, "goodwill", null, "admin", "approved"],
  ["Kenji Watanabe", "ORD-10347", 27_500, "item_not_received", "Carrier lost package", "agent", "approved"],
  ["Olivia Brown", "ORD-10351", 5_600, "damaged_item", null, "reviewer", "approved"],
  ["Wingtip Toys", "ORD-10210", 85_000, "goodwill", "Requested full refund after 11 months", "agent", "denied"],
  ["Noah Martin", "ORD-10222", 1_999, "duplicate_charge", "Second charge was a pre-auth", "agent", "denied"],
  ["Ava Nguyen", "ORD-10236", 14_900, "item_not_received", "Tracking shows delivered and signed", "agent", "denied"],
  ["Tailspin Air", "ORD-10241", 420_000, "service_outage", "Outage outside SLA window", "agent", "denied"],
  ["Lucas Silva", "ORD-10255", 6_500, "damaged_item", null, "admin", "denied"],
  ["Mia Johnson", "ORD-10263", 3_000, "goodwill", null, "agent", "denied"],
  ["Adventure Works", "ORD-10102", 99_900, "subscription_cancelled", null, "agent", "issued"],
  ["Ethan Davis", "ORD-10115", 4_250, "duplicate_charge", null, "agent", "issued"],
  ["Chloe Kim", "ORD-10123", 18_800, "damaged_item", "Replacement out of stock", "agent", "issued"],
  ["Litware Labs", "ORD-10131", 110_000, "service_outage", "Major incident credit", "agent", "issued"],
  ["Daniel Müller", "ORD-10140", 7_400, "item_not_received", null, "reviewer", "issued"],
  ["Grace Taylor", "ORD-10148", 2_599, "goodwill", null, "agent", "issued"],
  ["Proseware", "ORD-10156", 36_000, "duplicate_charge", null, "agent", "issued"],
  ["Henry Clark", "ORD-10163", 11_200, "damaged_item", null, "admin", "issued"],
  ["Isabella Lopez", "ORD-10170", 5_000, "item_not_received", null, "agent", "issued"],
];

/**
 * Seeds refunds through the foundation (repo.mutate, decide, applyTransition), so every seeded
 * refund has real approvals and audit history. Resumable: each sample is found by order id and
 * moved only forward towards its outcome, so a seed interrupted between steps completes on the
 * next run and a finished seed is a no-op. Returns the number of steps applied.
 */
export async function seedRefunds(users: User[], samples: SeedRefund[] = SEED): Promise<number> {
  const byRole = (role: Requester) => {
    const u = users.find((x) => x.role === role);
    if (!u) throw new Error(`Seed needs a user with role ${role}`);
    return u;
  };
  const admin = byRole("admin");
  const approvers = users.filter((u) => u.role === "reviewer" || u.role === "admin");
  let steps = 0;

  for (const [customer, order_id, amount_cents, reason_code, notes, role, outcome] of samples) {
    const requester = byRole(role);
    let [row] = await repo.query(admin, refunds, { where: { order_id }, orderBy: { field: "created_at", dir: "asc" }, limit: 1 });
    if (!row) {
      row = await repo.mutate(requester, refunds, { kind: "create", data: { customer, order_id, amount_cents, reason_code, notes } });
      steps++;
    }
    if (outcome === "requested") continue;

    if (row.status === "requested") {
      const prior = await listApprovals(admin, refunds, row.id);
      const pending = approvers.filter((u) => u.id !== row.requester_id && !prior.some((a) => a.approver_id === u.id));
      if (outcome === "denied") {
        await decide(pending[0], refunds, row.id, "deny", notes ?? "Does not meet refund policy");
        steps++;
        continue;
      }
      let status = "requested";
      for (const approver of outcome === "one_approval" ? pending.slice(0, 1 - prior.length) : pending) {
        if (status !== "requested") break;
        status = (await decide(approver, refunds, row.id, "approve")).status;
        steps++;
      }
      row = { ...row, status };
    }
    if (outcome === "issued" && row.status === "approved") {
      await applyTransition(admin, refunds, row.id, "issue");
      steps++;
    }
  }
  return steps;
}

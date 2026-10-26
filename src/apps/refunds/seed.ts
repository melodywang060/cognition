import { decide } from "@/lib/approvals";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { applyTransition } from "@/lib/transitions";
import { refunds } from "./config";

type Outcome = "requested" | "one_approval" | "approved" | "denied" | "issued";
type Requester = "agent" | "reviewer" | "admin";

// [customer, order id, amount in cents, reason code, notes, requester, outcome]
const SEED: [string, string, number, string, string | null, Requester, Outcome][] = [
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
 * refund has real approvals and audit history. Skips if any refunds already exist.
 */
export async function seedRefunds(users: User[]): Promise<number> {
  const byRole = (role: Requester) => {
    const u = users.find((x) => x.role === role);
    if (!u) throw new Error(`Seed needs a user with role ${role}`);
    return u;
  };
  const admin = byRole("admin");
  if ((await repo.query(admin, refunds, { limit: 1 })).length) return 0;
  const approvers = users.filter((u) => u.role === "reviewer" || u.role === "admin");

  for (const [customer, order_id, amount_cents, reason_code, notes, role, outcome] of SEED) {
    const requester = byRole(role);
    const row = await repo.mutate(requester, refunds, {
      kind: "create",
      data: { customer, order_id, amount_cents, reason_code, notes },
    });
    if (outcome === "requested") continue;
    const [first, second] = approvers.filter((u) => u.id !== requester.id);
    if (outcome === "denied") {
      await decide(first, refunds, row.id, "deny", notes ?? "Does not meet refund policy");
      continue;
    }
    const result = await decide(first, refunds, row.id, "approve");
    if (outcome === "one_approval") continue;
    if (result.status !== "approved") await decide(second, refunds, row.id, "approve");
    if (outcome === "issued") await applyTransition(admin, refunds, row.id, "issue");
  }
  return SEED.length;
}

import { decideChange, listChangeRequests, submit } from "@/lib/change-requests";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { featureFlags } from "./config";

type Env = "dev" | "staging" | "prod";
/** Prod only: what happens to the change request that turns the flag to its target state. */
export type ProdOutcome = "applied" | "pending" | "denied";

/** [name, description, environment, enabled, rollout %, prod outcome] */
export type SeedFlag = [string, string, Env, boolean, number, ProdOutcome?];

const flag = (name: string, description: string, rollouts: [number, number, number], prod: ProdOutcome): SeedFlag[] => [
  [name, description, "dev", rollouts[0] > 0, rollouts[0]],
  [name, description, "staging", rollouts[1] > 0, rollouts[1]],
  [name, description, "prod", rollouts[2] > 0, rollouts[2], prod],
];

export const SEED: SeedFlag[] = [
  ...flag("new-checkout", "Redesigned checkout flow", [100, 100, 25], "applied"),
  ...flag("instant-payouts", "Same-day payouts for verified merchants", [100, 50, 10], "pending"),
  ...flag("fraud-score-v2", "New fraud model in the payment path", [100, 100, 100], "applied"),
  ...flag("card-freeze-self-serve", "Customers can freeze cards in the app", [100, 100, 50], "denied"),
  ...flag("statement-pdf-v2", "New statement PDF renderer", [100, 0, 0], "applied"),
  ...flag("crypto-wallets", "Hold and send crypto", [20, 0, 0], "applied"),
];

/**
 * Seeds flags through the foundation (repo.mutate, submit, decideChange) so every flag has real
 * audit history, and prod flags have change requests. Resumable: flags are found by name and
 * environment and only moved forward, so an interrupted seed completes on the next run and a
 * finished seed is a no-op. Returns the number of steps applied.
 */
export async function seedFeatureFlags(users: User[], samples: SeedFlag[] = SEED): Promise<number> {
  const engineer = users.find((u) => u.role === "agent");
  const [admin, admin2] = users.filter((u) => u.role === "admin");
  if (!engineer || !admin || !admin2) throw new Error("Feature-flag seed needs an agent and two admins");
  let steps = 0;

  for (const [name, description, environment, enabled, rollout_pct, outcome] of samples) {
    let [row] = await repo.query(admin, featureFlags, { where: { name, environment }, limit: 1 });
    if (!row) {
      row = await repo.mutate(environment === "prod" ? admin : engineer, featureFlags, {
        kind: "create",
        data: { name, description, environment },
      });
      steps++;
    }
    const atTarget = row.enabled === enabled && row.rollout_pct === rollout_pct;
    if (environment !== "prod") {
      if (!atTarget) {
        await submit(engineer, featureFlags, { kind: "update", id: row.id, data: { enabled, rollout_pct } });
        steps++;
      }
      continue;
    }
    if (atTarget) continue;

    const requests = await listChangeRequests(admin, featureFlags, row.id);
    if (outcome === "denied" && requests.some((c) => c.status === "denied")) continue;
    let open = requests.find((c) => c.status === "requested");
    if (!open) {
      const result = await submit(admin, featureFlags, { kind: "update", id: row.id, data: { enabled, rollout_pct } });
      if (!("changeRequest" in result)) throw new Error(`Expected ${name} (prod) to need approval`);
      open = result.changeRequest;
      steps++;
    }
    if (outcome === "applied") {
      await decideChange(admin2, featureFlags, row.id, open.id, "approve");
      steps++;
    } else if (outcome === "denied") {
      await decideChange(admin2, featureFlags, row.id, open.id, "deny", "Wait until support is staffed for the launch");
      steps++;
    }
  }
  return steps;
}

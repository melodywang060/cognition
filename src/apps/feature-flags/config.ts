import type { AppConfig, ResourceConfig } from "@/lib/types";

export const ENVIRONMENTS = ["dev", "staging", "prod"] as const;

/**
 * Roles: engineers are `agent`s. Anyone (`agent`+) toggles in dev and staging; prod changes are
 * requested by an `admin` and applied only after a second, different `admin` approves.
 */
export const featureFlags: ResourceConfig = {
  id: "flags",
  label: "Feature flags",
  singular: "Feature flag",
  table: "feature_flags",
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "description", label: "Description", type: "text" },
    { name: "environment", label: "Environment", type: "enum", options: ENVIRONMENTS, required: true },
    // New flags start off; turning them on is a change (held for approval in prod).
    { name: "enabled", label: "Enabled", type: "boolean", required: true, default: false },
    { name: "rollout_pct", label: "Rollout %", type: "integer", required: true, default: 0, min: 0, max: 100 },
  ],
  list: {
    columns: ["name", "environment", "enabled", "rollout_pct", "description", "created_at"],
    filters: [
      { field: "environment", kind: "select" },
      { field: "rollout_pct", kind: "range" },
    ],
    search: ["name", "description"],
    sort: { field: "name", dir: "asc" },
  },
  form: { fields: ["name", "description", "environment"] },
  edit: { fields: ["enabled", "rollout_pct", "description"] },
  permissions: { read: "agent", create: "agent", update: "agent" },
  changeApproval: { when: { environment: "prod" }, requesterRole: "admin", approverRole: "admin" },
  historyRole: "agent",
};

export const featureFlagsApp: AppConfig = {
  id: "feature-flags",
  name: "Feature flags",
  description: "Toggle flags and rollout per environment. Prod changes need two admins.",
  resources: [featureFlags],
};

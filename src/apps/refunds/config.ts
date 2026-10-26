import type { AppConfig, ResourceConfig } from "@/lib/types";

/** Refunds strictly above this amount (in cents) need two distinct approvers. */
export const approvalThreshold = 100_000;

export const REFUND_STATUSES = ["requested", "approved", "denied", "issued"] as const;

export const REASON_CODES = [
  "duplicate_charge",
  "item_not_received",
  "damaged_item",
  "service_outage",
  "subscription_cancelled",
  "goodwill",
] as const;

export const refunds: ResourceConfig = {
  id: "refunds",
  label: "Refunds",
  singular: "Refund",
  table: "refunds",
  fields: [
    { name: "customer", label: "Customer", type: "text", required: true },
    { name: "order_id", label: "Order ID", type: "text", required: true },
    { name: "amount_cents", label: "Amount", type: "money", required: true },
    { name: "reason_code", label: "Reason code", type: "enum", options: REASON_CODES, required: true },
    { name: "notes", label: "Notes", type: "text" },
    { name: "status", label: "Status", type: "enum", options: REFUND_STATUSES },
    { name: "requester_id", label: "Requester", type: "user" },
  ],
  list: {
    columns: ["order_id", "customer", "amount_cents", "reason_code", "status", "requester_id", "created_at"],
    filters: [
      { field: "status", kind: "select" },
      { field: "customer", kind: "text" },
      { field: "amount_cents", kind: "range" },
    ],
    search: ["customer", "order_id", "notes"],
    sort: { field: "created_at", dir: "desc" },
  },
  form: { fields: ["customer", "order_id", "amount_cents", "reason_code", "notes"] },
  // No update/delete: a refund changes only through approve/deny and the issue transition.
  permissions: { read: "agent", create: "agent" },
  statusField: "status",
  approval: {
    approverRole: "reviewer",
    requesterField: "requester_id",
    amountField: "amount_cents",
    threshold: approvalThreshold,
    states: { pending: "requested", approved: "approved", denied: "denied" },
  },
  // Stand-in for a payments API call; no real integration.
  transitions: { issue: { label: "Issue refund", role: "admin", from: ["approved"], to: "issued" } },
};

export const refundsApp: AppConfig = {
  id: "refunds",
  name: "Refunds",
  description: `Request, approve and issue customer refunds. Over $${(approvalThreshold / 100).toLocaleString("en-US")} needs two approvers.`,
  resources: [refunds],
};

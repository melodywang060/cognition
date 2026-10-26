import type { AppConfig } from "@/lib/types";
import { refundsApp } from "./refunds/config";

/** The app registry. Each app lives in `src/apps/<name>/` and exports its config; add it here. */
export const registeredApps: AppConfig[] = [refundsApp];

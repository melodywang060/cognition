import { registeredApps } from "@/apps";
import { NotFoundError } from "./errors";
import type { AppConfig, ResourceConfig } from "./types";

const apps: AppConfig[] = [...registeredApps];

export function listApps(): readonly AppConfig[] {
  return apps;
}

/** Adds or replaces an app at runtime. Used by tests to register test-only resources. */
export function registerApp(app: AppConfig): void {
  const i = apps.findIndex((a) => a.id === app.id);
  if (i >= 0) apps[i] = app;
  else apps.push(app);
}

export function getApp(appId: string): AppConfig {
  const app = apps.find((a) => a.id === appId);
  if (!app) throw new NotFoundError(`Unknown app "${appId}"`);
  return app;
}

export function getResource(appId: string, resourceId: string): { app: AppConfig; resource: ResourceConfig } {
  const app = getApp(appId);
  const resource = app.resources.find((r) => r.id === resourceId);
  if (!resource) throw new NotFoundError(`Unknown resource "${appId}/${resourceId}"`);
  return { app, resource };
}

export function findResourceByTable(table: string): ResourceConfig | undefined {
  for (const app of apps) {
    const resource = app.resources.find((r) => r.table === table);
    if (resource) return resource;
  }
  return undefined;
}

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests use their own database (<name>_test) so test users and fixtures never reach the app's DB.
if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const base = new URL(process.env.DATABASE_URL ?? "postgresql://app:app@localhost:5432/internal_tools");
const testUrl = new URL(base);
testUrl.pathname = `${base.pathname.replace(/_test$/, "")}_test`;
process.env.BASE_DATABASE_URL = base.toString();
process.env.TEST_DATABASE_URL = testUrl.toString();

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: testUrl.toString() },
  },
});

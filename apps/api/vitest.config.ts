import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// A throwaway RSA key pair stands in for Postal's signing.key during tests.
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            POSTAL_ADMIN_TOKEN: "test-admin-token",
            POSTAL_WEBHOOK_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
            TEST_POSTAL_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
            ENCRYPTION_KEY: "test-encryption-key",
            OWNER_TOKEN: "test-owner-token",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});

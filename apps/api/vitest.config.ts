import { generateKeyPairSync } from "node:crypto";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// A throwaway RSA key pair stands in for Postal's signing.key during tests.
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export default defineConfig(async () => {
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            POSTAL_ADMIN_TOKEN: "test-admin-token",
            POSTAL_WEBHOOK_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
            TEST_POSTAL_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
            ENCRYPTION_KEY: "test-encryption-key",
            OWNER_TOKEN: "test-owner-token",
          },
        },
      }),
    ],
  };
});

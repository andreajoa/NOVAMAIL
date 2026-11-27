import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// A throwaway RSA key pair stands in for Postal's signing.key during tests.
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

// A throwaway self-signed certificate stands in for the SNS signing certificate.
const snsDir = mkdtempSync(join(tmpdir(), "nm-sns-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=sns.amazonaws.com", "-keyout", join(snsDir, "k.pem"), "-out", join(snsDir, "c.pem")], { stdio: "ignore" });
const snsCert = readFileSync(join(snsDir, "c.pem"), "utf8");
const snsKey = readFileSync(join(snsDir, "k.pem"), "utf8");
rmSync(snsDir, { recursive: true, force: true });

export default defineConfig(async () => {
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // Workers AI is mocked in tests; never open a remote session (CI has no Cloudflare login).
        remoteBindings: false,
        miniflare: {
          bindings: {
            POSTAL_ADMIN_TOKEN: "test-admin-token",
            POSTAL_WEBHOOK_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
            TEST_POSTAL_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
            ENCRYPTION_KEY: "test-encryption-key",
            OWNER_TOKEN: "test-owner-token",
            // Tests exercise the Postal path and billing; production pauses both until sending is live.
            SENDING_NODE: "postal",
            BILLING_PAUSED: "false",
            // Amazon SES path (tests switch SENDING_NODE to "ses" where needed).
            AWS_SES_ACCESS_KEY_ID: "AKIDTEST",
            AWS_SES_SECRET_ACCESS_KEY: "test-secret",
            SES_SNS_TOPIC_ARN: "arn:aws:sns:us-east-2:111111111111:novamail-ses-events",
            TEST_SNS_CERT: snsCert,
            TEST_SNS_KEY: snsKey,
          },
        },
      }),
    ],
  };
});

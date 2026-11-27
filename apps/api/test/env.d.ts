type NovaMailEnv = import("../src/env").Env;

declare namespace Cloudflare {
  interface Env extends NovaMailEnv {
    TEST_POSTAL_PRIVATE_KEY: string;
    TEST_SNS_CERT: string;
    TEST_SNS_KEY: string;
  }
}

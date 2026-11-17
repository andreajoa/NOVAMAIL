type NovaMailEnv = import("../src/env").Env;
type TestMigration = import("cloudflare:test").D1Migration;

declare namespace Cloudflare {
  interface Env extends NovaMailEnv {
    TEST_MIGRATIONS: TestMigration[];
    TEST_POSTAL_PRIVATE_KEY: string;
  }
}

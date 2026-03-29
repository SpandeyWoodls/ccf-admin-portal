/**
 * CCF Admin Portal - Quick Smoke Test
 *
 * A fast (~30 second) sanity check that verifies core infrastructure:
 *
 *  1. Server is up (health endpoint responds)
 *  2. Database is connected (health data includes timestamp from DB)
 *  3. Admin can login (auth works, JWT issued)
 *  4. Dashboard returns data (authenticated endpoint + DB queries work)
 *  5. Public health endpoint works (no auth required)
 *
 * Run: npx tsx src/__tests__/smoke.test.ts
 * Requires: Backend running on localhost:3001
 */

const BASE = "http://localhost:3001";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  PASS  ${name} (${ms}ms)`);
    passed++;
  } catch (err: any) {
    const ms = Date.now() - start;
    console.log(`  FAIL  ${name} (${ms}ms)`);
    console.log(`        ${err.message}`);
    failures.push(`${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function fetchJson(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any = null;
  const ct = res.headers.get("content-type");
  if (ct?.includes("json")) {
    data = await res.json();
  }

  return { status: res.status, data };
}

async function run(): Promise<void> {
  const suiteStart = Date.now();

  console.log("\n========================================");
  console.log("  CCF Admin Portal - Smoke Test");
  console.log("========================================\n");

  // ─── Test 1: Server is up ────────────────────────────────────────────────

  await test("1. Server is up (GET /api/v1/health returns 200)", async () => {
    const { status, data } = await fetchJson("GET", "/api/v1/health");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Health check should return success=true");
  });

  // ─── Test 2: Database is connected ───────────────────────────────────────

  await test("2. Database is connected (health returns valid timestamp)", async () => {
    const { data } = await fetchJson("GET", "/api/v1/health");
    assert(data.data !== null, "Health data should not be null");
    assert(data.data.status === "ok", `Expected status 'ok', got '${data.data.status}'`);
    assert(typeof data.data.timestamp === "string", "Should return a timestamp string");
    // Verify the timestamp is a valid ISO date
    const ts = new Date(data.data.timestamp);
    assert(!isNaN(ts.getTime()), `Timestamp '${data.data.timestamp}' is not a valid date`);
    // Timestamp should be recent (within last 60 seconds)
    const diff = Math.abs(Date.now() - ts.getTime());
    assert(diff < 60_000, `Timestamp is ${diff}ms old, expected < 60s`);
  });

  // ─── Test 3: Admin can login ─────────────────────────────────────────────

  let adminToken = "";

  await test("3. Admin can login (POST /api/v1/auth/login)", async () => {
    const { status, data } = await fetchJson("POST", "/api/v1/auth/login", {
      email: "admin@cyberchakra.in",
      password: "ChangeMe123!",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Login should succeed");
    assert(typeof data.data.accessToken === "string", "Should return an accessToken");
    assert(data.data.accessToken.length > 10, "Token should be non-trivial");
    assert(data.data.admin.email === "admin@cyberchakra.in", "Should return admin email");
    assert(data.data.admin.role, "Should return admin role");
    adminToken = data.data.accessToken;
  });

  // ─── Test 4: Dashboard returns data ──────────────────────────────────────

  await test("4. Dashboard returns data (GET /api/v1/admin/dashboard)", async () => {
    assert(adminToken.length > 0, "Need valid admin token from login step");
    const { status, data } = await fetchJson(
      "GET",
      "/api/v1/admin/dashboard",
      undefined,
      adminToken,
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Dashboard should succeed");
    assert(typeof data.data.totalActiveLicenses === "number", "Should have totalActiveLicenses (number)");
    assert(typeof data.data.totalOrganizations === "number", "Should have totalOrganizations (number)");
    assert(typeof data.data.trialConversionRate === "number", "Should have trialConversionRate (number)");
    assert(Array.isArray(data.data.recentActivity), "recentActivity should be an array");
    assert(typeof data.data.licensesByTier === "object", "licensesByTier should be an object");
    assert(typeof data.data.licensesByStatus === "object", "licensesByStatus should be an object");
  });

  // ─── Test 5: Public health endpoint works (no auth) ─────────────────────

  await test("5. Public health endpoint works without auth", async () => {
    const { status, data } = await fetchJson("GET", "/api/v1/health");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Should succeed without auth");
    assert(data.error === null, "error should be null");
    assert(typeof data.message === "string", "message should be a string");
  });

  // ─── Bonus: Verify 404 handler ──────────────────────────────────────────

  await test("Bonus: Unknown endpoint returns structured 404", async () => {
    const { status, data } = await fetchJson("GET", "/api/v1/nonexistent");
    assert(status === 404, `Expected 404, got ${status}`);
    assert(data.success === false, "Should return success=false");
    assert(data.error === "NOT_FOUND", `Expected NOT_FOUND error, got ${data.error}`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - suiteStart) / 1000).toFixed(1);

  console.log("\n========================================");
  console.log(`  Passed: ${passed} | Failed: ${failed} | Time: ${elapsed}s`);

  if (failures.length > 0) {
    console.log("\n  FAILURES:");
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
  }

  console.log("========================================\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("\nSmoke test crashed:", err.message);
  if (err.cause?.code === "ECONNREFUSED") {
    console.error("  Backend is not running. Start it with: npm run dev");
  }
  process.exit(1);
});

/**
 * CCF Admin Portal - Full Lifecycle End-to-End Test
 *
 * Tests the complete flow from admin portal to desktop app:
 *
 *  1. Admin logs in
 *  2. Admin creates an organization
 *  3. Admin creates a license for the org
 *  4. Desktop app activates the license
 *  5. Desktop app validates the license
 *  6. Desktop app sends heartbeat
 *  7. Desktop app checks for updates
 *  8. Desktop app fetches announcements
 *  9. Admin creates an announcement
 * 10. Desktop app sees the announcement
 * 11. Admin suspends the license
 * 12. Desktop app validation fails (suspended)
 * 13. Admin reinstates the license
 * 14. Desktop app validation succeeds again
 * 15. Desktop app deactivates the license
 * 16. License activation count returns to 0
 *
 * Error cases:
 * - Activate with wrong key
 * - Validate with wrong fingerprint
 * - Double activation on same machine (idempotent)
 * - Activate beyond max activations
 * - PHP redirect compatibility
 *
 * Run: npx tsx src/__tests__/full-flow.test.ts
 * Requires: Backend running on localhost:3001 with clean database
 */

const BASE = "http://localhost:3001";

// ─── State shared across sequential steps ──────────────────────────────────

let adminToken = "";
let orgId = "";
let licenseId = "";
let licenseKey = "";
let announcementId = "";

const HW_FINGERPRINT = "test_fp_" + Date.now();
const MACHINE_NAME = "TEST-MACHINE-01";
const TIMESTAMP = Date.now();

// ─── Test harness ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

async function step(
  number: number,
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  const label = `[Step ${String(number).padStart(2, "0")}] ${name}`;
  try {
    await fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err: any) {
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.message}`);
    failures.push(`${label}: ${err.message}`);
    failed++;
  }
}

async function errorCase(name: string, fn: () => Promise<void>): Promise<void> {
  const label = `[Error] ${name}`;
  try {
    await fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err: any) {
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.message}`);
    failures.push(`${label}: ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

interface ApiResult {
  status: number;
  data: any;
  headers: Headers;
}

async function api(
  method: string,
  path: string,
  body?: any,
  opts?: { token?: string; followRedirect?: boolean },
): Promise<ApiResult> {
  const token = opts?.token ?? adminToken;
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: opts?.followRedirect === false ? "manual" : "follow",
  });

  let data: any = null;
  const ct = res.headers.get("content-type");
  if (ct?.includes("json")) {
    data = await res.json();
  } else {
    // For 204 / redirect responses there may be no body
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
  }

  return { status: res.status, data, headers: res.headers };
}

// ─── Main test sequence ────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log("\n========================================================");
  console.log("  CCF Admin Portal - Full Lifecycle E2E Test");
  console.log("========================================================\n");

  // First check if server is reachable
  try {
    const probe = await fetch(`${BASE}/api/v1/health`);
    if (!probe.ok) throw new Error(`Health returned ${probe.status}`);
  } catch (err: any) {
    console.log("  ERROR  Cannot reach backend at " + BASE);
    console.log("         " + err.message);
    console.log("\n  Make sure the backend is running: npm run dev\n");
    process.exit(1);
  }

  // ─── Phase 1: Admin Portal Operations ────────────────────────────────────

  console.log("--- Phase 1: Admin Portal Operations ---\n");

  await step(1, "Admin logs in", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/auth/login",
      {
        email: "admin@cyberchakra.in",
        password: "ChangeMe123!",
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Login should succeed");
    assert(typeof data.data.accessToken === "string", "Should return accessToken");
    assert(data.data.admin.email === "admin@cyberchakra.in", "Should return admin email");
    adminToken = data.data.accessToken;
  });

  await step(2, "Admin creates an organization", async () => {
    const slug = `test-police-dept-${TIMESTAMP}`;
    const { status, data } = await api("POST", "/api/v1/admin/organizations", {
      name: `Test Police Department ${TIMESTAMP}`,
      slug,
      orgType: "law_enforcement",
      email: "test@police.gov.in",
      country: "IN",
    });
    assert(status === 201 || status === 200, `Expected 201, got ${status}`);
    assert(data.success === true, "Org creation should succeed");
    assert(data.data.id, "Should return org ID");
    orgId = data.data.id;
  });

  await step(3, "Admin creates a license for the org", async () => {
    const { status, data } = await api("POST", "/api/v1/admin/licenses", {
      organizationId: orgId,
      licenseType: "perpetual",
      tier: "government",
      maxActivations: 2,
    });
    assert(status === 201 || status === 200, `Expected 201, got ${status}`);
    assert(data.success === true, "License creation should succeed");
    assert(data.data.licenseKey, "Should return license key");
    assert(data.data.licenseKey.startsWith("CCF-"), "Key should start with CCF-");
    licenseId = data.data.id;
    licenseKey = data.data.licenseKey;
  });

  // ─── Phase 2: Desktop App Operations ─────────────────────────────────────

  console.log("\n--- Phase 2: Desktop App Operations ---\n");

  await step(4, "Desktop app activates the license", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/license/activate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        user_email: "test@police.gov.in",
        machine_name: MACHINE_NAME,
        os_info: "Windows 11 Pro",
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Activation should succeed");
    assert(data.data !== null, "data should not be null");
    assert(typeof data.data.license_id === "number", "license_id should be a number");
    assert(typeof data.data.organization === "string", "organization should be a string");
    assert(typeof data.data.validation_token === "string", "validation_token should be a string");
    assert(typeof data.data.next_validation === "string", "next_validation should be a string");
    assert(data.error === null, "error should be null on success");
    assert(typeof data.message === "string", "message should be a string");
  });

  await step(5, "Desktop app validates the license", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/license/validate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Validation should succeed");
    assert(data.data !== null, "data should not be null");
    assert(typeof data.data.license_id === "number", "license_id should be a number");
    assert(typeof data.data.validation_token === "string", "validation_token should be a string");
    assert(data.error === null, "error should be null");
  });

  await step(6, "Desktop app sends heartbeat", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/heartbeat",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
        usage_stats: {
          cases_created: 10,
          acquisitions: 25,
          reports_generated: 5,
        },
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Heartbeat should succeed");
    assert(Array.isArray(data.announcements), "announcements should be an array");
    assert(
      data.announcements.every((a: any) => typeof a === "string"),
      "Each announcement should be a string (HeartbeatResponse uses Vec<String>)",
    );
    assert("update_available" in data, "update_available field must be present");
    // HeartbeatResponse must NOT contain ServerResponse fields
    assert(!("data" in data), "HeartbeatResponse must NOT contain 'data' field");
    assert(!("error" in data), "HeartbeatResponse must NOT contain 'error' field");
  });

  await step(7, "Desktop app checks for updates", async () => {
    const { status } = await api(
      "GET",
      "/api/v1/update-check?target=windows&arch=x86_64&current_version=99.0.0",
      undefined,
      { token: "" },
    );
    // With a very high version number, expect 204 (no update available)
    assert(status === 204 || status === 200, `Expected 204 or 200, got ${status}`);
  });

  await step(8, "Desktop app fetches announcements (initially empty or seeded)", async () => {
    const { status, data } = await api("GET", "/api/v1/announcements", undefined, {
      token: "",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Should succeed");
    assert(data.data !== null, "data should not be null");
    assert(Array.isArray(data.data.announcements), "data.announcements should be an array");
    // Verify snake_case field names on any existing announcements
    for (const ann of data.data.announcements) {
      assert(typeof ann.message === "string", "announcement.message should be string");
      assert(typeof ann.announcement_type === "string", "announcement.announcement_type should be snake_case string");
      assert(!("announcementType" in ann), "Must NOT contain camelCase announcementType");
    }
  });

  // ─── Phase 3: Admin Creates Content, Desktop Sees It ─────────────────────

  console.log("\n--- Phase 3: Admin Creates Content, Desktop Sees It ---\n");

  await step(9, "Admin creates an announcement", async () => {
    const { status, data } = await api("POST", "/api/v1/admin/announcements", {
      title: `E2E Test Announcement ${TIMESTAMP}`,
      message: `This is a test announcement from the E2E test suite (${TIMESTAMP})`,
      announcementType: "info",
      dismissible: true,
      priority: 10,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isActive: true,
    });
    assert(status === 201 || status === 200, `Expected 201, got ${status}`);
    assert(data.success === true, "Announcement creation should succeed");
    assert(data.data.id, "Should return announcement ID");
    announcementId = data.data.id;
  });

  await step(10, "Desktop app sees the new announcement", async () => {
    const { status, data } = await api("GET", "/api/v1/announcements", undefined, {
      token: "",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Should succeed");
    const announcements: any[] = data.data.announcements;
    const found = announcements.some((a: any) =>
      a.message.includes(String(TIMESTAMP)),
    );
    assert(found, `Should find the announcement containing timestamp ${TIMESTAMP}`);
  });

  // ─── Phase 4: Admin Suspend / Reinstate Cycle ───────────────────────────

  console.log("\n--- Phase 4: Admin Suspend / Reinstate Cycle ---\n");

  await step(11, "Admin suspends the license", async () => {
    const { status, data } = await api(
      "POST",
      `/api/v1/admin/licenses/${licenseId}/suspend`,
      { reason: "E2E test suspension" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Suspend should succeed");
    assert(data.data.status === "suspended", "Status should be suspended");
  });

  await step(12, "Desktop app validation fails (suspended)", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/license/validate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(data.success === false, "Validation should fail");
    assert(data.error === "LICENSE_SUSPENDED", `Expected LICENSE_SUSPENDED, got ${data.error}`);
  });

  await step(13, "Admin reinstates the license", async () => {
    const { status, data } = await api(
      "POST",
      `/api/v1/admin/licenses/${licenseId}/reinstate`,
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Reinstate should succeed");
    assert(
      data.data.status === "active" || data.data.status === "issued",
      `Expected active or issued, got ${data.data.status}`,
    );
  });

  await step(14, "Desktop app validation succeeds again", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/license/validate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Validation should succeed after reinstatement");
    assert(data.data !== null, "data should not be null");
    assert(typeof data.data.validation_token === "string", "Should return new validation_token");
  });

  // ─── Phase 5: Deactivation & Cleanup ─────────────────────────────────────

  console.log("\n--- Phase 5: Deactivation & Cleanup ---\n");

  await step(15, "Desktop app deactivates the license", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/license/deactivate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, "Deactivation should succeed");
  });

  await step(16, "License activation count returns to 0", async () => {
    const { status, data } = await api(
      "GET",
      `/api/v1/admin/licenses/${licenseId}`,
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.currentActivations === 0, `Expected 0 activations, got ${data.data.currentActivations}`);
  });

  // ─── Error Cases ─────────────────────────────────────────────────────────

  console.log("\n--- Error Cases ---\n");

  await errorCase("Activate with wrong key returns 404", async () => {
    const { status, data } = await api(
      "POST",
      "/api/v1/license/activate",
      {
        license_key: "CCF-FAKE-FAKE-FAKE-FAKE",
        hardware_fingerprint: HW_FINGERPRINT,
        machine_name: MACHINE_NAME,
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 404, `Expected 404, got ${status}`);
    assert(data.success === false, "Should fail");
    assert(data.error === "LICENSE_NOT_FOUND", `Expected LICENSE_NOT_FOUND, got ${data.error}`);
  });

  await errorCase("Validate with wrong fingerprint returns 403", async () => {
    // Re-activate so we can test wrong fingerprint
    await api(
      "POST",
      "/api/v1/license/activate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        machine_name: MACHINE_NAME,
        app_version: "2.0.0",
      },
      { token: "" },
    );

    const { status, data } = await api(
      "POST",
      "/api/v1/license/validate",
      {
        license_key: licenseKey,
        hardware_fingerprint: "wrong_fingerprint_xyz",
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 403, `Expected 403, got ${status}`);
    assert(data.success === false, "Should fail");
    assert(data.error === "NOT_ACTIVATED", `Expected NOT_ACTIVATED, got ${data.error}`);
  });

  await errorCase("Double activation on same machine is idempotent", async () => {
    // Activate again on the same machine (already activated above)
    const { status, data } = await api(
      "POST",
      "/api/v1/license/activate",
      {
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        machine_name: MACHINE_NAME,
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(status === 200, `Expected 200 (idempotent), got ${status}`);
    assert(data.success === true, "Should succeed (idempotent)");
    assert(data.message?.includes("already"), `Expected 'already' in message, got: ${data.message}`);
  });

  await errorCase("Activate beyond max activations returns 403", async () => {
    // License has maxActivations=2. We have 1 active (HW_FINGERPRINT).
    // Activate a second device
    const fp2 = "test_fp_second_device_" + Date.now();
    const res2 = await api(
      "POST",
      "/api/v1/license/activate",
      {
        license_key: licenseKey,
        hardware_fingerprint: fp2,
        machine_name: "SECOND-MACHINE",
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(res2.status === 200, `Second activation should succeed (2 of 2), got ${res2.status}`);

    // Now try a third device, which should fail (maxActivations=2)
    const fp3 = "test_fp_third_device_" + Date.now();
    const res3 = await api(
      "POST",
      "/api/v1/license/activate",
      {
        license_key: licenseKey,
        hardware_fingerprint: fp3,
        machine_name: "THIRD-MACHINE",
        app_version: "2.0.0",
      },
      { token: "" },
    );
    assert(res3.status === 403, `Expected 403 for third activation, got ${res3.status}`);
    assert(res3.data.error === "ACTIVATION_LIMIT_REACHED", `Expected ACTIVATION_LIMIT_REACHED, got ${res3.data.error}`);

    // Cleanup: deactivate the second device
    await api(
      "POST",
      "/api/v1/license/deactivate",
      { license_key: licenseKey, hardware_fingerprint: fp2 },
      { token: "" },
    );
  });

  // ─── PHP Redirect Compatibility ──────────────────────────────────────────

  console.log("\n--- PHP Redirect Compatibility ---\n");

  await errorCase("POST /license/activate.php redirects to /api/v1/license/activate", async () => {
    // Use redirect: "manual" to check we get a 307 redirect
    const res = await fetch(`${BASE}/license/activate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
      }),
      redirect: "manual",
    });
    assert(
      res.status === 307,
      `Expected 307 redirect, got ${res.status}`,
    );
    const location = res.headers.get("location") || "";
    assert(
      location.includes("/api/v1/license/activate"),
      `Expected redirect to /api/v1/license/activate, got: ${location}`,
    );
  });

  await errorCase("POST /license/validate.php redirects to /api/v1/license/validate", async () => {
    const res = await fetch(`${BASE}/license/validate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
      }),
      redirect: "manual",
    });
    assert(res.status === 307, `Expected 307 redirect, got ${res.status}`);
    const location = res.headers.get("location") || "";
    assert(
      location.includes("/api/v1/license/validate"),
      `Expected redirect to /api/v1/license/validate, got: ${location}`,
    );
  });

  await errorCase("POST /license/deactivate.php redirects to /api/v1/license/deactivate", async () => {
    const res = await fetch(`${BASE}/license/deactivate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
      }),
      redirect: "manual",
    });
    assert(res.status === 307, `Expected 307 redirect, got ${res.status}`);
    const location = res.headers.get("location") || "";
    assert(
      location.includes("/api/v1/license/deactivate"),
      `Expected redirect to /api/v1/license/deactivate, got: ${location}`,
    );
  });

  await errorCase("POST /license/heartbeat.php redirects to /api/v1/heartbeat", async () => {
    const res = await fetch(`${BASE}/license/heartbeat.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_fingerprint: HW_FINGERPRINT,
        app_version: "2.0.0",
      }),
      redirect: "manual",
    });
    assert(res.status === 307, `Expected 307 redirect, got ${res.status}`);
    const location = res.headers.get("location") || "";
    assert(
      location.includes("/api/v1/heartbeat"),
      `Expected redirect to /api/v1/heartbeat, got: ${location}`,
    );
  });

  await errorCase("GET /license/update-check.php redirects to /api/v1/update-check", async () => {
    const res = await fetch(
      `${BASE}/license/update-check.php?target=windows&arch=x86_64&current_version=1.0.0`,
      { redirect: "manual" },
    );
    assert(res.status === 301, `Expected 301 redirect, got ${res.status}`);
    const location = res.headers.get("location") || "";
    assert(
      location.includes("/api/v1/update-check"),
      `Expected redirect to /api/v1/update-check, got: ${location}`,
    );
  });

  // ─── Final Cleanup ───────────────────────────────────────────────────────

  console.log("\n--- Cleanup ---\n");

  // Deactivate remaining activation
  await api(
    "POST",
    "/api/v1/license/deactivate",
    { license_key: licenseKey, hardware_fingerprint: HW_FINGERPRINT },
    { token: "" },
  ).catch(() => {}); // ignore if already deactivated

  // Delete the test announcement
  if (announcementId) {
    await api("DELETE", `/api/v1/admin/announcements/${announcementId}`).catch(
      () => {},
    );
  }

  console.log("  Cleanup complete.");

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log("\n========================================================");
  console.log("  RESULTS");
  console.log("========================================================");
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${passed + failed + skipped}`);

  if (failures.length > 0) {
    console.log("\n  FAILURES:");
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
  }

  console.log("========================================================\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("\nTest suite crashed:", err.message);
  console.error(err.stack);
  process.exit(1);
});

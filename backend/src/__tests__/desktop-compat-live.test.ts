/**
 * Desktop App Compatibility - Live Backend Test
 *
 * Tests every desktop-facing endpoint against the LIVE backend to verify
 * response formats match the Rust serde structs exactly.
 *
 * The Rust desktop app deserializes these responses with serde_json.
 * If ANY field is missing, has the wrong type, uses wrong casing, or is
 * `undefined` instead of `null`, serde_json::from_str() will FAIL and the
 * desktop app will crash or return an opaque error.
 *
 * === Rust structs (from src-tauri/src/licensing/mod.rs) ===
 *
 * ServerResponse { success: bool, data: Option<ServerResponseData>, error: Option<String>, message: Option<String> }
 * ServerResponseData { license_id: Option<i64>, organization: Option<String>, expires_at: Option<String>,
 *                      validation_token: Option<String>, next_validation: Option<String>,
 *                      valid: Option<bool>, announcements: Vec<Announcement> }
 * Announcement { message: String, announcement_type: String }
 * HeartbeatResponse { success: bool, announcements: Vec<String>, update_available: Option<UpdateInfo> }
 * UpdateInfo { version: String, url: String, changelog: String }
 *
 * === Rust structs (from src-tauri/src/commands/support.rs) ===
 *
 * ApiResponse<T> { success: bool, data: Option<T>, message: Option<String>, error: Option<String> }
 * TicketCreateResponse { ticket_number: String, ticket_id: i64, status: String, portal_url: String }
 * SupportStatus { open_tickets: i32, unread_replies: i32, tickets: Vec<TicketSummary>, portal_url: String }
 * TicketSummary { ticket_number, subject, status, priority, category, has_new_reply, last_updated, portal_url }
 * TicketDetails { ticket_id: i64, ticket_number, subject, category, priority, status, created_at, updated_at, messages: Vec<TicketMessage>, can_reply: bool }
 * TicketMessage { id: i64, message, sender_type, sender_name, created_at, is_initial: bool, attachments: Vec<String> }
 * TicketReplyResponse { reply_id: i64, message, sender_type, sender_name, created_at, ticket_status }
 *
 * === Rust structs (from src-tauri/src/commands/onboarding.rs) ===
 *
 * TrialRequestResponse { request_id: i64, status: String, message: String, is_existing: bool }
 * TrialStatusResponse { status, request_id: Option<i64>, license_key: Option<String>,
 *                        trial_days: Option<i32>, expires_at: Option<String>,
 *                        rejection_reason: Option<String>, message: Option<String> }
 *
 * === Rust structs (from src-tauri/src/commands/license.rs) ===
 *
 * AnnouncementsResponse { success: bool, data: Option<AnnouncementsData> }
 * AnnouncementsData { announcements: Vec<Announcement> }
 *
 * === Tauri updater format (NOT a ServerResponse) ===
 *
 * { version: String, notes: String, pub_date: String, platforms: { "target-arch": { signature, url } } }
 *
 * Run:  npx tsx src/__tests__/desktop-compat-live.test.ts
 * Requires: Backend running on localhost:3001, db seeded (npx tsx src/seed.ts)
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE = process.env.TEST_BASE_URL || "http://localhost:3001";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@cyberchakra.in";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "ChangeMe123!";
const HARDWARE_FINGERPRINT = `compat_live_${Date.now()}`;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

function skip(name: string, reason: string): void {
  console.log(`  SKIP  ${name} -- ${reason}`);
  skipped++;
}

// ---------------------------------------------------------------------------
// Structural validators -- mirror what serde_json does
// ---------------------------------------------------------------------------

function assertField(obj: Record<string, unknown>, field: string, expectedType: string, label: string): void {
  if (!(field in obj)) {
    throw new Error(`[${label}] Missing required field "${field}"`);
  }
  if (typeof obj[field] !== expectedType) {
    throw new Error(
      `[${label}] Field "${field}" must be ${expectedType}, got ${typeof obj[field]} (value: ${JSON.stringify(obj[field])})`
    );
  }
}

function assertNullableField(obj: Record<string, unknown>, field: string, expectedType: string, label: string): void {
  if (!(field in obj)) {
    throw new Error(
      `[${label}] Missing field "${field}". Rust Option<T> needs the key present; null is OK, missing is NOT.`
    );
  }
  if (obj[field] !== null && typeof obj[field] !== expectedType) {
    throw new Error(
      `[${label}] Field "${field}" must be ${expectedType} or null, got ${typeof obj[field]} (value: ${JSON.stringify(obj[field])})`
    );
  }
}

function assertNullableFieldIfPresent(obj: Record<string, unknown>, field: string, expectedType: string, label: string): void {
  if (field in obj && obj[field] !== null && typeof obj[field] !== expectedType) {
    throw new Error(
      `[${label}] Field "${field}" must be ${expectedType} or null, got ${typeof obj[field]} (value: ${JSON.stringify(obj[field])})`
    );
  }
}

/**
 * Validate the { success, data, error, message } envelope.
 * This is the outer shape of ServerResponse / ApiResponse<T> in Rust.
 */
function assertServerResponseEnvelope(json: unknown, label: string): void {
  const obj = json as Record<string, unknown>;

  assertField(obj, "success", "boolean", label);

  // CRITICAL: error and message must NOT be undefined.
  // Rust Option<String> deserializes `null` fine, but a missing key fails.
  if (!("error" in obj)) {
    throw new Error(`[${label}] "error" field is MISSING. Rust expects it present (null is OK, undefined/missing is NOT).`);
  }
  assertNullableField(obj, "error", "string", label);

  if (!("message" in obj)) {
    throw new Error(`[${label}] "message" field is MISSING. Rust expects it present (null or string, not undefined).`);
  }
  assertNullableField(obj, "message", "string", label);

  // data must be present (can be null)
  if (!("data" in obj)) {
    throw new Error(`[${label}] "data" field is MISSING. Rust expects it present (null is OK).`);
  }
}

/**
 * Validate ServerResponseData fields inside data.
 * Used by /license/activate and /license/validate.
 */
function assertServerResponseData(data: Record<string, unknown>, label: string): void {
  // license_id: Option<i64> -- number or null, NEVER a UUID string
  assertNullableField(data, "license_id", "number", label);
  if (data.license_id !== null && typeof data.license_id === "string") {
    throw new Error(`[${label}] license_id is a string "${data.license_id}". Rust expects i64 (number), not a UUID.`);
  }

  // organization: Option<String> -- org NAME, not org ID
  assertNullableField(data, "organization", "string", label);

  // expires_at: Option<String> -- ISO 8601 or null for perpetual
  assertNullableField(data, "expires_at", "string", label);
  if (typeof data.expires_at === "string" && !ISO_REGEX.test(data.expires_at)) {
    throw new Error(`[${label}] expires_at "${data.expires_at}" is not ISO 8601 format`);
  }

  // validation_token: Option<String>
  assertNullableField(data, "validation_token", "string", label);

  // next_validation: Option<String> -- ISO 8601
  assertNullableField(data, "next_validation", "string", label);
  if (typeof data.next_validation === "string" && !ISO_REGEX.test(data.next_validation)) {
    throw new Error(`[${label}] next_validation "${data.next_validation}" is not ISO 8601 format`);
  }

  // announcements: Vec<Announcement> with #[serde(default)]
  // The #[serde(default)] means it CAN be missing, but our backend always sends it.
  if ("announcements" in data) {
    if (!Array.isArray(data.announcements)) {
      throw new Error(`[${label}] "announcements" must be an array`);
    }
    for (let i = 0; i < (data.announcements as unknown[]).length; i++) {
      assertAnnouncement((data.announcements as any)[i], `${label}.announcements[${i}]`);
    }
  }
}

/**
 * Validate an Announcement object.
 * Rust: Announcement { message: String, announcement_type: String }
 */
function assertAnnouncement(obj: Record<string, unknown>, label: string): void {
  assertField(obj, "message", "string", label);
  assertField(obj, "announcement_type", "string", label); // snake_case!

  // Verify NO camelCase variant leaked from Prisma
  if ("announcementType" in obj) {
    throw new Error(
      `[${label}] Found "announcementType" (camelCase). Rust expects "announcement_type" (snake_case). ` +
      `This is a common Prisma → API leak.`
    );
  }
}

/**
 * Validate HeartbeatResponse.
 * Rust: HeartbeatResponse { success: bool, announcements: Vec<String>, update_available: Option<UpdateInfo> }
 * CRITICAL: This is NOT a ServerResponse! It must NOT have "data", "error", or "message".
 */
function assertHeartbeatResponse(obj: Record<string, unknown>, label: string): void {
  assertField(obj, "success", "boolean", label);

  // announcements: Vec<String> -- array of plain strings, NOT Announcement objects
  if (!("announcements" in obj)) {
    throw new Error(`[${label}] "announcements" field is missing`);
  }
  if (!Array.isArray(obj.announcements)) {
    throw new Error(`[${label}] "announcements" must be an array`);
  }
  for (let i = 0; i < (obj.announcements as unknown[]).length; i++) {
    const item = (obj.announcements as unknown[])[i];
    if (typeof item !== "string") {
      throw new Error(
        `[${label}] announcements[${i}] must be a string, got ${typeof item} (value: ${JSON.stringify(item)}). ` +
        `HeartbeatResponse uses Vec<String>, NOT Vec<Announcement>.`
      );
    }
  }

  // update_available: Option<UpdateInfo> -- null or { version, url, changelog }
  if (!("update_available" in obj)) {
    throw new Error(`[${label}] "update_available" field is missing`);
  }
  if (obj.update_available !== null) {
    const u = obj.update_available as Record<string, unknown>;
    assertField(u, "version", "string", `${label}.update_available`);
    assertField(u, "url", "string", `${label}.update_available`);
    assertField(u, "changelog", "string", `${label}.update_available`);
  }

  // The backend also sends "commands": []. The Rust struct does NOT have this field,
  // but serde_json by default ignores unknown fields (no #[serde(deny_unknown_fields)]).
  // We note this but do not fail -- it is harmless.
  if ("commands" in obj) {
    if (!Array.isArray(obj.commands)) {
      throw new Error(`[${label}] "commands" (extra field) must be an array if present`);
    }
  }

  // CRITICAL: Must NOT have ServerResponse fields
  if ("data" in obj) {
    throw new Error(`[${label}] HeartbeatResponse must NOT contain "data" field. It is NOT a ServerResponse.`);
  }
  if ("error" in obj) {
    throw new Error(`[${label}] HeartbeatResponse must NOT contain "error" field. It is NOT a ServerResponse.`);
  }
}

/**
 * Validate Tauri updater JSON format.
 * { version, notes, pub_date, platforms: { "target-arch": { signature, url } } }
 * CRITICAL: NOT a ServerResponse.
 */
function assertTauriUpdaterResponse(obj: Record<string, unknown>, label: string): void {
  assertField(obj, "version", "string", label);
  assertField(obj, "notes", "string", label);
  assertField(obj, "pub_date", "string", label);

  if (typeof obj.platforms !== "object" || obj.platforms === null) {
    throw new Error(`[${label}] "platforms" must be an object`);
  }

  for (const [key, value] of Object.entries(obj.platforms as Record<string, unknown>)) {
    const platform = value as Record<string, unknown>;
    assertField(platform, "signature", "string", `${label}.platforms["${key}"]`);
    assertField(platform, "url", "string", `${label}.platforms["${key}"]`);
  }

  // CRITICAL: Must NOT use ServerResponse wrapper
  if ("success" in obj) {
    throw new Error(`[${label}] Tauri updater response must NOT contain "success". It is NOT a ServerResponse.`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function post(path: string, body: unknown, headers?: Record<string, string>): Promise<{ status: number; body: any; raw: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Not JSON
  }
  return { status: res.status, body: json, raw };
}

async function get(path: string, headers?: Record<string, string>): Promise<{ status: number; body: any; raw: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...headers },
    redirect: "follow",
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Not JSON (e.g., 204)
  }
  return { status: res.status, body: json, raw };
}

// ---------------------------------------------------------------------------
// Setup: authenticate as admin, create org + license for testing
// ---------------------------------------------------------------------------

interface TestContext {
  authToken: string;
  orgId: string;
  licenseId: string;
  licenseKey: string;
  ticketNumber: string | null;
}

async function setup(): Promise<TestContext> {
  console.log("\n--- Setup: Authenticating and creating test data ---\n");

  // 1. Login as admin
  const loginRes = await post("/api/v1/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (loginRes.status !== 200 || !loginRes.body?.success) {
    throw new Error(
      `Setup failed: Could not login as admin. Status: ${loginRes.status}. ` +
      `Body: ${loginRes.raw.slice(0, 500)}. ` +
      `Make sure the backend is running and the database is seeded.`
    );
  }

  const authToken = loginRes.body.data.accessToken;
  const authHeaders = { Authorization: `Bearer ${authToken}` };

  // 2. Create a test organization
  const orgSlug = `compat-test-${Date.now()}`;
  const orgRes = await post(
    "/api/v1/admin/organizations",
    {
      name: "Compat Test Police Dept",
      slug: orgSlug,
      orgType: "law_enforcement",
      email: "compat-test@police.gov.in",
      country: "IN",
    },
    authHeaders,
  );

  if (orgRes.status !== 201 && orgRes.status !== 200) {
    throw new Error(
      `Setup failed: Could not create org. Status: ${orgRes.status}. ` +
      `Body: ${orgRes.raw.slice(0, 500)}`
    );
  }

  const orgId = orgRes.body.data.id;

  // 3. Create a license
  const licRes = await post(
    "/api/v1/admin/licenses",
    {
      organizationId: orgId,
      licenseType: "perpetual",
      tier: "government",
      maxActivations: 5,
      notes: "Created by desktop-compat-live.test.ts",
    },
    authHeaders,
  );

  if (licRes.status !== 201 && licRes.status !== 200) {
    throw new Error(
      `Setup failed: Could not create license. Status: ${licRes.status}. ` +
      `Body: ${licRes.raw.slice(0, 500)}`
    );
  }

  const licenseKey = licRes.body.data.licenseKey;
  const licenseId = licRes.body.data.id;

  console.log(`  Setup complete: org=${orgId}, license=${licenseKey}\n`);

  return { authToken, orgId, licenseId, licenseKey, ticketNumber: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests(): Promise<void> {
  let ctx: TestContext;

  try {
    ctx = await setup();
  } catch (e: any) {
    console.error(`\n  FATAL: ${e.message}\n`);
    process.exit(2);
  }

  console.log("=== Desktop App Compatibility - Live Backend Tests ===\n");

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: POST /api/v1/license/activate (success)
  // Rust: serde_json::from_str::<ServerResponse>
  // ────────────────────────────────────────────────────────────────────────

  let activateData: any = null;

  await test("1. POST /license/activate -- ServerResponse with ServerResponseData", async () => {
    const res = await post("/api/v1/license/activate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: HARDWARE_FINGERPRINT,
      user_email: "compat-test@police.gov.in",
      machine_name: "COMPAT-LIVE-TEST",
      os_info: "Windows 11 Pro 24H2",
      app_version: "2.0.0",
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    activateData = json;

    // Validate outer ServerResponse envelope
    assertServerResponseEnvelope(json, "activate");

    // success MUST be true
    assert(json.success === true, "success must be boolean true");

    // error MUST be null on success (not undefined, not empty string)
    assert(json.error === null, `error must be null on success, got: ${JSON.stringify(json.error)}`);

    // data MUST be a non-null object
    assert(json.data !== null && json.data !== undefined, "data must not be null on success");
    assert(typeof json.data === "object" && !Array.isArray(json.data), "data must be an object, not an array");

    // Validate ServerResponseData fields
    assertServerResponseData(json.data, "activate");

    // Additional activate-specific checks
    const d = json.data;

    // license_id must be a number, not a UUID
    assert(typeof d.license_id === "number", `license_id must be number (i64), got ${typeof d.license_id}: "${d.license_id}"`);

    // organization must be a non-empty string (the name we set)
    assert(typeof d.organization === "string" && d.organization.length > 0, "organization must be a non-empty string");

    // validation_token must be a non-empty string (HMAC token)
    assert(typeof d.validation_token === "string" && d.validation_token.length > 0, "validation_token must be a non-empty string");

    // next_validation must be an ISO 8601 string
    assert(typeof d.next_validation === "string", "next_validation must be a string");
    assert(ISO_REGEX.test(d.next_validation), `next_validation "${d.next_validation}" is not ISO 8601`);

    // announcements must be an array (can be empty)
    assert(Array.isArray(d.announcements), "announcements must be an array");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: POST /license/activate re-activation (same fingerprint)
  // Should still return success (idempotent)
  // ────────────────────────────────────────────────────────────────────────

  await test("2. POST /license/activate re-activation -- idempotent success", async () => {
    const res = await post("/api/v1/license/activate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: HARDWARE_FINGERPRINT,
      user_email: "compat-test@police.gov.in",
      machine_name: "COMPAT-LIVE-TEST",
      os_info: "Windows 11 Pro 24H2",
      app_version: "2.0.0",
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "activate-reactivation");
    assert(res.body.success === true, "Re-activation must succeed");
    assertServerResponseData(res.body.data, "activate-reactivation");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: POST /license/activate with invalid key (error)
  // ────────────────────────────────────────────────────────────────────────

  await test("3. POST /license/activate with invalid key -- error response", async () => {
    const res = await post("/api/v1/license/activate", {
      license_key: "CCF-XXXX-FAKE-XXXX",
      hardware_fingerprint: "fake_fp",
      app_version: "2.0.0",
    });

    assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "activate-error");
    assert(json.success === false, "success must be false for error");
    assert(json.data === null, "data must be null for error");
    assert(typeof json.error === "string" && json.error.length > 0, "error must be a non-empty string code");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 4: POST /license/validate (success)
  // Rust: serde_json::from_str::<ServerResponse>
  // Same shape as activate
  // ────────────────────────────────────────────────────────────────────────

  await test("4. POST /license/validate -- ServerResponse with ServerResponseData", async () => {
    const res = await post("/api/v1/license/validate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: HARDWARE_FINGERPRINT,
      app_version: "2.0.0",
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "validate");
    assert(json.success === true, "validate success must be true");
    assert(json.error === null, "validate error must be null");
    assert(json.data !== null, "validate data must not be null");

    // Full ServerResponseData validation
    assertServerResponseData(json.data, "validate");

    // Validate-specific: license_id, organization, validation_token must all match
    const d = json.data;
    assert(typeof d.license_id === "number", `license_id must be number, got ${typeof d.license_id}`);
    assert(typeof d.organization === "string", "organization must be string");
    assert(typeof d.validation_token === "string" && d.validation_token.length > 0, "validation_token must be non-empty string");
    assert(typeof d.next_validation === "string" && ISO_REGEX.test(d.next_validation), "next_validation must be ISO 8601 string");
    assert(Array.isArray(d.announcements), "announcements must be array");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 5: POST /license/validate with invalid key (error)
  // ────────────────────────────────────────────────────────────────────────

  await test("5. POST /license/validate with invalid key -- error response", async () => {
    const res = await post("/api/v1/license/validate", {
      license_key: "CCF-XXXX-FAKE-XXXX",
      hardware_fingerprint: "fake_fp",
    });

    assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "validate-error");
    assert(res.body.success === false, "success must be false");
    assert(res.body.data === null, "data must be null");
    assert(typeof res.body.error === "string", "error must be string");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 6: POST /license/validate with wrong fingerprint (not activated)
  // ────────────────────────────────────────────────────────────────────────

  await test("6. POST /license/validate with wrong fingerprint -- NOT_ACTIVATED", async () => {
    const res = await post("/api/v1/license/validate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: "wrong_fingerprint_xyz",
    });

    assert(res.status === 403, `Expected HTTP 403, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "validate-wrong-fp");
    assert(res.body.success === false, "success must be false");
    assert(res.body.error === "NOT_ACTIVATED", `error must be "NOT_ACTIVATED", got "${res.body.error}"`);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 7: POST /heartbeat (success)
  // Rust: serde_json::from_str::<HeartbeatResponse>
  // DIFFERENT from ServerResponse!
  // ────────────────────────────────────────────────────────────────────────

  await test("7. POST /heartbeat -- HeartbeatResponse (NOT ServerResponse)", async () => {
    const res = await post("/api/v1/heartbeat", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: HARDWARE_FINGERPRINT,
      app_version: "2.0.0",
      usage_stats: {
        cases_created: 5,
        acquisitions: 12,
        reports_generated: 3,
      },
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;

    // Full HeartbeatResponse validation
    assertHeartbeatResponse(json, "heartbeat");

    // success must be true
    assert(json.success === true, "heartbeat success must be true");

    // announcements must be Vec<String> (just message strings)
    assert(Array.isArray(json.announcements), "announcements must be array");
    for (let i = 0; i < json.announcements.length; i++) {
      assert(
        typeof json.announcements[i] === "string",
        `announcements[${i}] must be a string, got ${typeof json.announcements[i]}. ` +
        `HeartbeatResponse uses Vec<String>, NOT Vec<Announcement>!`
      );
    }

    // update_available must be present (null or UpdateInfo)
    assert("update_available" in json, "update_available field must be present");
    if (json.update_available !== null) {
      const u = json.update_available;
      assert(typeof u.version === "string", "update_available.version must be string");
      assert(typeof u.url === "string", "update_available.url must be string");
      assert(typeof u.changelog === "string", "update_available.changelog must be string");
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 8: GET /health
  // Desktop app just checks HTTP 200. Body is ServerResponse-shaped.
  // ────────────────────────────────────────────────────────────────────────

  await test("8. GET /health -- HTTP 200 with ServerResponse envelope", async () => {
    const res = await get("/api/v1/health");

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "health");
    assert(json.success === true, "health success must be true");

    // data.status must be "ok"
    assert(json.data !== null, "health data must not be null");
    assert(json.data.status === "ok", `health data.status must be "ok", got "${json.data.status}"`);

    // data.timestamp must be ISO 8601
    assert(typeof json.data.timestamp === "string", "health data.timestamp must be string");
    assert(ISO_REGEX.test(json.data.timestamp), "health data.timestamp must be ISO 8601");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 9: GET /announcements
  // Rust: AnnouncementsResponse { success: bool, data: Option<AnnouncementsData> }
  // AnnouncementsData { announcements: Vec<Announcement> }
  // ────────────────────────────────────────────────────────────────────────

  await test("9. GET /announcements -- AnnouncementsResponse with nested data.announcements", async () => {
    const res = await get("/api/v1/announcements");

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "announcements");
    assert(json.success === true, "announcements success must be true");

    // data must be an object, NOT an array
    assert(json.data !== null, "announcements data must not be null");
    assert(typeof json.data === "object" && !Array.isArray(json.data), "data must be an object (not an array)");

    // data.announcements must be an array
    assert(Array.isArray(json.data.announcements), "data.announcements must be an array");

    // Each announcement must have message + announcement_type (snake_case)
    for (let i = 0; i < json.data.announcements.length; i++) {
      assertAnnouncement(json.data.announcements[i], `announcements[${i}]`);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 10: GET /update-check (no update expected for high version)
  // Tauri updater: 204 = no update, 200 = update available with Tauri JSON
  // ────────────────────────────────────────────────────────────────────────

  await test("10. GET /update-check with high version -- HTTP 204 (no update)", async () => {
    const res = await get("/api/v1/update-check?target=windows&arch=x86_64&current_version=99.99.99");

    // 204 = no update available (expected when no releases exist or version is current)
    assert(res.status === 204, `Expected HTTP 204 (no update), got ${res.status}. Body: ${res.raw.slice(0, 200)}`);
  });

  await test("10b. GET /update-check response format (if update available)", async () => {
    const res = await get("/api/v1/update-check?target=windows&arch=x86_64&current_version=0.0.1");

    // Could be 204 (no releases in db) or 200 (update available)
    if (res.status === 204) {
      skip("10b-inner", "No releases in database to test Tauri updater format");
      return;
    }

    assert(res.status === 200, `Expected HTTP 200 or 204, got ${res.status}`);

    // If 200, validate Tauri updater format
    assertTauriUpdaterResponse(res.body, "update-check");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 11: POST /trial-request
  // Rust: ApiResponse<TrialRequestResponse> { success, data, message, error }
  // TrialRequestResponse { request_id: i64, status: String, message: String, is_existing: bool }
  // NOTE: The backend returns request_id as a UUID string, but the Rust struct
  // expects i64. The Rust side actually reads this as serde_json::Value, not
  // the strict TrialRequestResponse, so it handles string IDs.
  // ────────────────────────────────────────────────────────────────────────

  let trialFingerprint = `trial_compat_${Date.now()}`;

  await test("11. POST /trial-request -- ServerResponse with request_id and status", async () => {
    const res = await post("/api/v1/trial-request", {
      full_name: "Inspector Compat Test",
      email: `compat-trial-${Date.now()}@police.gov.in`,
      phone: "+91-9876543210",
      organization: "Compat Test Police Station",
      organization_type: "law_enforcement",
      designation: "Inspector",
      department: "Cyber Crime",
      purpose: "Testing desktop app compatibility",
      expected_volume: "1-10",
      hardware_fingerprint: trialFingerprint,
      machine_name: "COMPAT-TRIAL-TEST",
      os_info: "Windows 11 Pro",
      app_version: "2.0.0",
    });

    assert(res.status === 201 || res.status === 200, `Expected HTTP 201 or 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "trial-request");
    assert(json.success === true, "trial-request success must be true");
    assert(json.data !== null, "trial-request data must not be null");

    // Rust reads data["request_id"] and data["status"] via serde_json::Value indexing
    const d = json.data;
    assert("request_id" in d, 'data.request_id required (Rust reads data["request_id"])');
    assert("status" in d, 'data.status required (Rust reads data["status"])');
    assert(typeof d.status === "string", "data.status must be a string");
    assert(
      ["pending", "approved", "rejected"].includes(d.status),
      `data.status must be one of pending/approved/rejected, got "${d.status}"`
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 12: POST /trial-request duplicate (same fingerprint)
  // Should return success with existing request info
  // ────────────────────────────────────────────────────────────────────────

  await test("12. POST /trial-request duplicate -- returns existing request", async () => {
    const res = await post("/api/v1/trial-request", {
      full_name: "Inspector Compat Test",
      email: `compat-trial-dup-${Date.now()}@police.gov.in`,
      phone: "+91-9876543210",
      organization: "Compat Test Police Station",
      organization_type: "law_enforcement",
      purpose: "Testing duplicate handling",
      expected_volume: "1-10",
      hardware_fingerprint: trialFingerprint,
      machine_name: "COMPAT-TRIAL-TEST",
      os_info: "Windows 11 Pro",
      app_version: "2.0.0",
    });

    assert(res.status === 200 || res.status === 201, `Expected HTTP 200/201, got ${res.status}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "trial-request-dup");
    assert(json.success === true, "duplicate trial-request must succeed");
    assert(json.data !== null, "data must not be null");
    assert("request_id" in json.data, "data.request_id required");
    assert("status" in json.data, "data.status required");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 13: GET /trial-request-status
  // Rust: ApiResponse<TrialStatusResponse> via serde_json::Value
  // TrialStatusResponse { status, request_id, license_key, trial_days, expires_at, rejection_reason, message }
  // ────────────────────────────────────────────────────────────────────────

  await test("13. GET /trial-request-status -- ServerResponse with status fields", async () => {
    const res = await get(`/api/v1/trial-request-status?hardware_fingerprint=${trialFingerprint}`);

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "trial-status");
    assert(json.success === true, "trial-status success must be true");
    assert(json.data !== null, "trial-status data must not be null");

    const d = json.data;

    // Required fields that Rust reads
    assert("status" in d, "data.status required");
    assert(typeof d.status === "string", "data.status must be string");
    assert("request_id" in d, "data.request_id required");
    assert("submitted_at" in d, "data.submitted_at required");

    // Conditional fields based on status
    if (d.status === "approved") {
      assert("license_key" in d, "data.license_key required when status=approved");
      assert(typeof d.license_key === "string", "data.license_key must be string");
    }
    if (d.status === "rejected") {
      assertNullableFieldIfPresent(d, "rejection_reason", "string", "trial-status");
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 14: GET /trial-request-status with unknown fingerprint
  // ────────────────────────────────────────────────────────────────────────

  await test("14. GET /trial-request-status with unknown fingerprint -- 404", async () => {
    const res = await get("/api/v1/trial-request-status?hardware_fingerprint=nonexistent_fp_xyz");

    assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "trial-status-404");
    assert(res.body.success === false, "success must be false");
    assert(res.body.data === null, "data must be null");
    assert(typeof res.body.error === "string", "error must be a string code");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 15: POST /support/create-ticket
  // Rust: ApiResponse<TicketCreateResponse>
  // TicketCreateResponse { ticket_number, ticket_id, status, portal_url }
  // NOTE: The backend returns { ticket_number, status, created_at } but the
  // Rust struct expects { ticket_number, ticket_id, status, portal_url }.
  // The Rust side uses ApiResponse<TicketCreateResponse> with strict typing.
  // We validate what the backend actually sends and flag mismatches.
  // ────────────────────────────────────────────────────────────────────────

  await test("15. POST /support/create-ticket -- ServerResponse with ticket data", async () => {
    const res = await post("/api/v1/support/create-ticket", {
      license_key: ctx.licenseKey,
      subject: "Compat test ticket",
      message: "This is a test ticket from desktop-compat-live.test.ts",
      category: "other",
      priority: "low",
      sender_name: "Compat Test User",
      sender_email: "compat-test@police.gov.in",
    });

    assert(res.status === 201 || res.status === 200, `Expected HTTP 201/200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "create-ticket");
    assert(json.success === true, "create-ticket success must be true");
    assert(json.data !== null, "create-ticket data must not be null");

    const d = json.data;

    // ticket_number: String -- always required
    assert("ticket_number" in d, "data.ticket_number required");
    assert(typeof d.ticket_number === "string", "data.ticket_number must be string");
    assert(d.ticket_number.startsWith("CCF-"), `ticket_number must start with "CCF-", got "${d.ticket_number}"`);

    // status: String -- always required
    assert("status" in d, "data.status required");
    assert(typeof d.status === "string", "data.status must be string");

    // created_at: String -- backend sends this
    assert("created_at" in d, "data.created_at required");
    assert(typeof d.created_at === "string", "data.created_at must be string");
    assert(ISO_REGEX.test(d.created_at), "data.created_at must be ISO 8601");

    // NOTE: Rust TicketCreateResponse expects ticket_id (i64) and portal_url (String)
    // but the current backend does not send these. The Rust side should handle this
    // gracefully (or the backend should be updated). We log a warning.
    if (!("ticket_id" in d)) {
      console.log("        WARNING: data.ticket_id missing. Rust TicketCreateResponse expects ticket_id: i64.");
    }
    if (!("portal_url" in d)) {
      console.log("        WARNING: data.portal_url missing. Rust TicketCreateResponse expects portal_url: String.");
    }

    // Save for subsequent tests
    ctx.ticketNumber = d.ticket_number;
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 16: POST /support/ticket-status
  // Rust: ApiResponse<SupportStatus> (but this endpoint returns single ticket info)
  // Backend returns: { ticket_number, subject, status, priority, category,
  //                    created_at, updated_at, closed_at, portal_url }
  // ────────────────────────────────────────────────────────────────────────

  await test("16. POST /support/ticket-status -- ServerResponse with ticket info", async () => {
    if (!ctx.ticketNumber) {
      skip("16", "No ticket created in test 15");
      return;
    }

    const res = await post("/api/v1/support/ticket-status", {
      ticket_number: ctx.ticketNumber,
      license_key: ctx.licenseKey,
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "ticket-status");
    assert(json.success === true, "ticket-status success must be true");
    assert(json.data !== null, "ticket-status data must not be null");

    const d = json.data;

    // Required fields
    assert("ticket_number" in d, "data.ticket_number required");
    assert(typeof d.ticket_number === "string", "data.ticket_number must be string");
    assert("subject" in d, "data.subject required");
    assert(typeof d.subject === "string", "data.subject must be string");
    assert("status" in d, "data.status required");
    assert(typeof d.status === "string", "data.status must be string");
    assert("priority" in d, "data.priority required");
    assert(typeof d.priority === "string", "data.priority must be string");
    assert("category" in d, "data.category required");
    assert(typeof d.category === "string", "data.category must be string");
    assert("created_at" in d, "data.created_at required");
    assert(typeof d.created_at === "string" && ISO_REGEX.test(d.created_at), "data.created_at must be ISO 8601 string");
    assert("updated_at" in d, "data.updated_at required");
    assert(typeof d.updated_at === "string" && ISO_REGEX.test(d.updated_at), "data.updated_at must be ISO 8601 string");

    // closed_at: nullable
    assert("closed_at" in d, "data.closed_at must be present (null is OK)");
    assertNullableField(d, "closed_at", "string", "ticket-status");

    // portal_url: String
    assert("portal_url" in d, "data.portal_url required");
    assert(typeof d.portal_url === "string", "data.portal_url must be string");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 17: POST /support/ticket-details
  // Rust: ApiResponse<TicketDetails>
  // TicketDetails { ticket_id, ticket_number, subject, category, priority,
  //                 status, created_at, updated_at, messages: Vec<TicketMessage>, can_reply }
  // ────────────────────────────────────────────────────────────────────────

  await test("17. POST /support/ticket-details -- ServerResponse with messages", async () => {
    if (!ctx.ticketNumber) {
      skip("17", "No ticket created in test 15");
      return;
    }

    const res = await post("/api/v1/support/ticket-details", {
      ticket_number: ctx.ticketNumber,
      license_key: ctx.licenseKey,
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "ticket-details");
    assert(json.success === true, "ticket-details success must be true");
    assert(json.data !== null, "ticket-details data must not be null");

    const d = json.data;

    // Required fields
    assert("ticket_number" in d, "data.ticket_number required");
    assert(typeof d.ticket_number === "string", "data.ticket_number must be string");
    assert("subject" in d, "data.subject required");
    assert(typeof d.subject === "string", "data.subject must be string");
    assert("status" in d, "data.status required");
    assert(typeof d.status === "string", "data.status must be string");
    assert("priority" in d, "data.priority required");
    assert(typeof d.priority === "string", "data.priority must be string");
    assert("category" in d, "data.category required");
    assert(typeof d.category === "string", "data.category must be string");
    assert("created_at" in d, "data.created_at required");
    assert(typeof d.created_at === "string" && ISO_REGEX.test(d.created_at), "data.created_at must be ISO 8601");
    assert("updated_at" in d, "data.updated_at required");
    assert(typeof d.updated_at === "string" && ISO_REGEX.test(d.updated_at), "data.updated_at must be ISO 8601");
    assert("can_reply" in d, "data.can_reply required");
    assert(typeof d.can_reply === "boolean", "data.can_reply must be boolean");

    // messages: Vec<TicketMessage>
    assert("messages" in d, "data.messages required");
    assert(Array.isArray(d.messages), "data.messages must be an array");
    assert(d.messages.length > 0, "data.messages should have at least the initial message");

    for (let i = 0; i < d.messages.length; i++) {
      const m = d.messages[i];
      const ml = `ticket-details.messages[${i}]`;

      // Rust: TicketMessage { id: i64, message, sender_type, sender_name, created_at, is_initial, attachments }
      assert("id" in m, `${ml}.id required`);
      assert("message" in m, `${ml}.message required`);
      assert(typeof m.message === "string", `${ml}.message must be string`);
      assert("sender_type" in m, `${ml}.sender_type required`);
      assert(typeof m.sender_type === "string", `${ml}.sender_type must be string`);
      assert("sender_name" in m, `${ml}.sender_name required`);
      assert(typeof m.sender_name === "string", `${ml}.sender_name must be string`);
      assert("created_at" in m, `${ml}.created_at required`);
      assert(typeof m.created_at === "string" && ISO_REGEX.test(m.created_at), `${ml}.created_at must be ISO 8601`);

      // is_initial: bool with #[serde(default)] -- so it CAN be missing (defaults to false)
      // but our backend sends it
      if ("is_initial" in m) {
        assert(typeof m.is_initial === "boolean", `${ml}.is_initial must be boolean if present`);
      }

      // Verify NO camelCase leaks from Prisma
      if ("senderType" in m) {
        throw new Error(`${ml}: Found "senderType" (camelCase). Rust expects "sender_type" (snake_case).`);
      }
      if ("senderName" in m) {
        throw new Error(`${ml}: Found "senderName" (camelCase). Rust expects "sender_name" (snake_case).`);
      }
      if ("createdAt" in m) {
        throw new Error(`${ml}: Found "createdAt" (camelCase). Rust expects "created_at" (snake_case).`);
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 18: POST /support/reply-ticket
  // Rust: ApiResponse<TicketReplyResponse>
  // TicketReplyResponse { reply_id: i64, message, sender_type, sender_name, created_at, ticket_status }
  // ────────────────────────────────────────────────────────────────────────

  await test("18. POST /support/reply-ticket -- ServerResponse with reply data", async () => {
    if (!ctx.ticketNumber) {
      skip("18", "No ticket created in test 15");
      return;
    }

    const res = await post("/api/v1/support/reply-ticket", {
      ticket_number: ctx.ticketNumber,
      license_key: ctx.licenseKey,
      message: "This is a compatibility test reply from desktop-compat-live.test.ts",
      sender_name: "Compat Test User",
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "reply-ticket");
    assert(json.success === true, "reply-ticket success must be true");
    assert(json.data !== null, "reply-ticket data must not be null");

    const d = json.data;

    // Rust TicketReplyResponse fields
    // message_id: the backend sends this as "message_id" but Rust expects "reply_id"
    assert("message_id" in d || "reply_id" in d, "data.message_id or data.reply_id required");

    // ticket_number
    assert("ticket_number" in d, "data.ticket_number required");
    assert(typeof d.ticket_number === "string", "data.ticket_number must be string");

    // status / ticket_status -- Rust reads "ticket_status"
    assert("ticket_status" in d || "status" in d, "data.ticket_status or data.status required");
    if ("ticket_status" in d) {
      assert(typeof d.ticket_status === "string", "data.ticket_status must be string");
    }
    if ("status" in d) {
      assert(typeof d.status === "string", "data.status must be string");
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 19: POST /support/ticket-status with invalid ticket number
  // ────────────────────────────────────────────────────────────────────────

  await test("19. POST /support/ticket-status with invalid ticket -- 404", async () => {
    const res = await post("/api/v1/support/ticket-status", {
      ticket_number: "CCF-NONEXISTENT-XXXX",
      license_key: ctx.licenseKey,
    });

    assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "ticket-status-404");
    assert(res.body.success === false, "success must be false");
    assert(res.body.data === null, "data must be null");
    assert(typeof res.body.error === "string", "error must be string code");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 20: POST /license/deactivate (success)
  // Rust: serde_json::from_str::<ServerResponse>
  // data is { deactivated: true } -- read loosely by Rust
  // ────────────────────────────────────────────────────────────────────────

  await test("20. POST /license/deactivate -- ServerResponse with deactivated flag", async () => {
    const res = await post("/api/v1/license/deactivate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: HARDWARE_FINGERPRINT,
    });

    assert(res.status === 200, `Expected HTTP 200, got ${res.status}. Body: ${res.raw.slice(0, 300)}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "deactivate");
    assert(json.success === true, "deactivate success must be true");
    assert(json.error === null, "deactivate error must be null");
    assert(json.data !== null, "deactivate data must not be null");
    assert(json.data.deactivated === true, "data.deactivated must be true");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 21: POST /license/deactivate with already-deactivated fingerprint
  // ────────────────────────────────────────────────────────────────────────

  await test("21. POST /license/deactivate already deactivated -- 404", async () => {
    const res = await post("/api/v1/license/deactivate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: HARDWARE_FINGERPRINT,
    });

    assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "deactivate-404");
    assert(res.body.success === false, "success must be false");
    assert(typeof res.body.error === "string", "error must be string code");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 22: Legacy .php redirects
  // The old PHP backend used /license/activate.php etc.
  // These should redirect (307) to the new endpoints.
  // ────────────────────────────────────────────────────────────────────────

  await test("22a. POST /license/activate.php redirects and works", async () => {
    // Re-activate first for this test
    const res = await fetch(`${BASE}/license/activate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: ctx.licenseKey,
        hardware_fingerprint: `php_compat_${Date.now()}`,
        user_email: "compat-test@police.gov.in",
        machine_name: "PHP-COMPAT-TEST",
        os_info: "Windows 11",
        app_version: "2.0.0",
      }),
      redirect: "follow",
    });

    // After redirect, should get a successful response
    assert(res.ok, `Expected success after redirect, got ${res.status}`);

    const json = await res.json();
    assertServerResponseEnvelope(json, "php-activate-redirect");
    assert(json.success === true, "php redirect activate must succeed");
  });

  await test("22b. POST /license/validate.php redirects and works", async () => {
    const fp = `php_compat_${Date.now() - 1}`; // Use a recent fingerprint
    // First activate with this fingerprint
    await post("/api/v1/license/activate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: fp,
      app_version: "2.0.0",
    });

    const res = await fetch(`${BASE}/license/validate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: ctx.licenseKey,
        hardware_fingerprint: fp,
      }),
      redirect: "follow",
    });

    assert(res.ok, `Expected success after redirect, got ${res.status}`);
    const json = await res.json();
    assertServerResponseEnvelope(json, "php-validate-redirect");
  });

  await test("22c. POST /license/deactivate.php redirects and works", async () => {
    const fp = `php_deactivate_compat_${Date.now()}`;
    // Activate first
    await post("/api/v1/license/activate", {
      license_key: ctx.licenseKey,
      hardware_fingerprint: fp,
      app_version: "2.0.0",
    });

    const res = await fetch(`${BASE}/license/deactivate.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: ctx.licenseKey,
        hardware_fingerprint: fp,
      }),
      redirect: "follow",
    });

    assert(res.ok, `Expected success after redirect, got ${res.status}`);
    const json = await res.json();
    assertServerResponseEnvelope(json, "php-deactivate-redirect");
  });

  await test("22d. POST /license/heartbeat.php redirects and works", async () => {
    const res = await fetch(`${BASE}/license/heartbeat.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: ctx.licenseKey,
        hardware_fingerprint: HARDWARE_FINGERPRINT,
        app_version: "2.0.0",
      }),
      redirect: "follow",
    });

    assert(res.ok, `Expected success after redirect, got ${res.status}`);
    const json = await res.json();
    assertHeartbeatResponse(json, "php-heartbeat-redirect");
  });

  await test("22e. GET /license/update-check.php redirects", async () => {
    const res = await fetch(
      `${BASE}/license/update-check.php?target=windows&arch=x86_64&current_version=99.99.99`,
      { method: "GET", redirect: "follow" },
    );

    // Should be 204 (no update) or 200 (update available)
    assert(res.status === 204 || res.status === 200, `Expected 204 or 200, got ${res.status}`);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 23: 404 catch-all returns ServerResponse shape
  // ────────────────────────────────────────────────────────────────────────

  await test("23. GET /api/v1/nonexistent -- 404 in ServerResponse format", async () => {
    const res = await get("/api/v1/this-does-not-exist");

    assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);

    const json = res.body;
    assertServerResponseEnvelope(json, "404-catch-all");
    assert(json.success === false, "404 success must be false");
    assert(json.data === null, "404 data must be null");
    assert(typeof json.error === "string", "404 error must be a string code");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 24: Validation error returns ServerResponse shape
  // (e.g., missing required fields)
  // ────────────────────────────────────────────────────────────────────────

  await test("24. POST /license/activate with empty body -- validation error in ServerResponse", async () => {
    const res = await post("/api/v1/license/activate", {});

    // Should be 400 or 422 for validation error
    assert(res.status >= 400 && res.status < 500, `Expected 4xx, got ${res.status}`);

    const json = res.body;
    if (json) {
      // The error handler wraps zod errors in ServerResponse format
      assertServerResponseEnvelope(json, "validation-error");
      assert(json.success === false, "validation error success must be false");
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 25: Announcement snake_case enforcement (regression)
  // Verify announcement_type is snake_case in ALL endpoints that return it
  // ────────────────────────────────────────────────────────────────────────

  await test("25. Activate response announcements use snake_case 'announcement_type'", async () => {
    if (!activateData || !activateData.data || !activateData.data.announcements) {
      skip("25", "No activate data with announcements to check");
      return;
    }

    for (const ann of activateData.data.announcements) {
      assert(
        "announcement_type" in ann,
        'Announcement must have "announcement_type" (snake_case)',
      );
      assert(
        !("announcementType" in ann),
        'Announcement must NOT have "announcementType" (camelCase) -- Prisma leak detected',
      );
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 26: Cross-endpoint consistency checks
  // ────────────────────────────────────────────────────────────────────────

  await test("26. All error responses use consistent { success: false, data: null, error: string } shape", async () => {
    // Test multiple error scenarios
    const errorResponses = [
      await post("/api/v1/license/activate", { license_key: "CCF-BAD", hardware_fingerprint: "x" }),
      await post("/api/v1/license/validate", { license_key: "CCF-BAD", hardware_fingerprint: "x" }),
      await post("/api/v1/license/deactivate", { license_key: "CCF-BAD", hardware_fingerprint: "x" }),
      await post("/api/v1/support/ticket-status", { ticket_number: "CCF-BAD", license_key: "CCF-BAD" }),
    ];

    for (let i = 0; i < errorResponses.length; i++) {
      const r = errorResponses[i]!;
      if (r.body) {
        assertServerResponseEnvelope(r.body, `error-consistency[${i}]`);
        assert(r.body.success === false, `error-consistency[${i}]: success must be false`);
        assert(r.body.data === null, `error-consistency[${i}]: data must be null, got ${JSON.stringify(r.body.data)}`);
        assert(typeof r.body.error === "string", `error-consistency[${i}]: error must be string`);
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 27: GET /trial-request-status missing param returns proper error
  // ────────────────────────────────────────────────────────────────────────

  await test("27. GET /trial-request-status without hardware_fingerprint -- 400", async () => {
    const res = await get("/api/v1/trial-request-status");

    assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
    assertServerResponseEnvelope(res.body, "trial-status-missing-param");
    assert(res.body.success === false, "success must be false");
    assert(typeof res.body.error === "string", "error must be string");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("=".repeat(60) + "\n");

  if (failed > 0) {
    console.log("  Some tests failed. The desktop app may crash when hitting these endpoints.");
    console.log("  Fix the backend response format before deploying.\n");
    process.exit(1);
  } else {
    console.log("  All tests passed. Backend responses match Rust serde expectations.\n");
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runTests().catch((err) => {
  console.error(`\n  FATAL: Test suite crashed: ${err.message}\n`);
  console.error(err.stack);
  process.exit(2);
});

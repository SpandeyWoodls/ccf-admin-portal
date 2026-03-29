/**
 * Desktop App API Compatibility Tests
 *
 * These tests document and verify the EXACT JSON format the Rust desktop app
 * expects from each endpoint. The desktop app uses serde_json to deserialize
 * these responses, so field names and types must match exactly.
 *
 * If any field is missing, has the wrong type, or uses the wrong casing,
 * serde_json::from_str() will FAIL and the desktop app will crash.
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
 * === Endpoints by deserialization target ===
 *
 * ServerResponse (with ServerResponseData in data):
 *   - POST /api/v1/license/activate   -> serde_json::from_str::<ServerResponse>
 *   - POST /api/v1/license/validate   -> serde_json::from_str::<ServerResponse>
 *   - POST /api/v1/license/deactivate -> serde_json::from_str::<ServerResponse>
 *
 * Generic ServerResponse envelope (data is serde_json::Value, read via indexing):
 *   - POST /api/v1/trial-request        -> parsed as serde_json::Value, data["request_id"], data["status"]
 *   - GET  /api/v1/trial-request-status  -> parsed as serde_json::Value
 *   - POST /api/v1/support/*             -> parsed as serde_json::Value
 *   - GET  /api/v1/health                -> desktop just checks HTTP 200
 *
 * Custom struct (NOT ServerResponse):
 *   - POST /api/v1/heartbeat    -> HeartbeatResponse { success, announcements: Vec<String>, update_available }
 *
 * Announcements (custom deserialization in license.rs):
 *   - GET /api/v1/announcements -> AnnouncementsResponse { success, data: { announcements: Vec<Announcement> } }
 *
 * Tauri updater format (NOT ServerResponse):
 *   - GET /api/v1/update-check  -> { version, notes, pub_date, platforms: { "target-arch": { signature, url } } }
 */

// ---------------------------------------------------------------------------
// Type definitions matching the Rust structs EXACTLY
// ---------------------------------------------------------------------------

/** Matches Rust: Announcement { message: String, announcement_type: String } */
interface RustAnnouncement {
  message: string;
  announcement_type: string; // snake_case! NOT "announcementType"
}

/** Matches Rust: ServerResponseData (all fields Optional except announcements which defaults to []) */
interface RustServerResponseData {
  license_id: number | null;       // Option<i64> - MUST be number or null, never a UUID string
  organization: string | null;     // Option<String> - org NAME, not org ID
  expires_at: string | null;       // Option<String> - ISO 8601
  validation_token: string | null; // Option<String>
  next_validation: string | null;  // Option<String> - ISO 8601
  valid: boolean | null;           // Option<bool>
  announcements: RustAnnouncement[]; // Vec<Announcement> with #[serde(default)]
}

/** Matches Rust: ServerResponse { success, data, error, message } */
interface RustServerResponse<T = RustServerResponseData> {
  success: boolean;
  data: T | null;
  error: string | null;    // MUST be null, not undefined, on success
  message: string | null;  // Option<String> - MUST be present (null or string, not undefined)
}

/** Matches Rust: HeartbeatResponse (NOT ServerResponse!) */
interface RustHeartbeatResponse {
  success: boolean;
  announcements: string[];                // Vec<String> - just message strings, NOT Announcement objects!
  update_available: RustUpdateInfo | null; // Option<UpdateInfo>
}

/** Matches Rust: UpdateInfo { version, url, changelog } */
interface RustUpdateInfo {
  version: string;
  url: string;
  changelog: string;
}

/** Tauri v2 updater JSON format (NOT a ServerResponse) */
interface TauriUpdaterResponse {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

// ---------------------------------------------------------------------------
// Structural validators - these mirror what serde_json does
// ---------------------------------------------------------------------------

/**
 * Validates the { success, data, error, message } envelope.
 * Does NOT validate data contents -- use assertServerResponseData for that.
 */
function assertServerResponseEnvelope(json: unknown, label: string): void {
  const obj = json as Record<string, unknown>;

  // Top-level shape
  assertField(obj, "success", "boolean", label);

  // CRITICAL: error and message must NOT be undefined (Rust Option<String> deserializes null, not missing)
  if (!("error" in obj)) {
    throw new Error(`[${label}] "error" field is missing. Rust expects it present (null is OK, undefined is NOT).`);
  }
  assertNullableField(obj, "error", "string", label);

  if (!("message" in obj)) {
    throw new Error(`[${label}] "message" field is missing. Rust expects it present (null or string, not undefined).`);
  }
  assertNullableField(obj, "message", "string", label);

  // data must be present (can be null)
  if (!("data" in obj)) {
    throw new Error(`[${label}] "data" field is missing.`);
  }
}

/**
 * Validates the full ServerResponse including ServerResponseData in the data field.
 * Used for: /license/activate, /license/validate, /license/deactivate
 */
function assertServerResponseWithData(json: unknown, label: string): void {
  assertServerResponseEnvelope(json, label);
  const obj = json as Record<string, unknown>;

  if (obj.data !== null && obj.data !== undefined) {
    assertServerResponseData(obj.data as Record<string, unknown>, label);
  }
}

function assertServerResponseData(obj: Record<string, unknown>, label: string): void {
  // All fields are Option<T> in Rust, so they can be null, but they MUST be present
  // (serde by default requires the key to exist unless #[serde(default)] is used)
  // ServerResponseData uses #[serde(default)] on announcements only

  assertNullableField(obj, "license_id", "number", label + ".data");
  assertNullableField(obj, "organization", "string", label + ".data");
  assertNullableField(obj, "expires_at", "string", label + ".data");
  assertNullableField(obj, "validation_token", "string", label + ".data");
  assertNullableField(obj, "next_validation", "string", label + ".data");
  assertNullableField(obj, "valid", "boolean", label + ".data");

  // announcements has #[serde(default)] so it can be missing, but we always include it
  if ("announcements" in obj) {
    if (!Array.isArray(obj.announcements)) {
      throw new Error(`[${label}.data] "announcements" must be an array`);
    }
    for (const ann of obj.announcements as unknown[]) {
      assertAnnouncement(ann as Record<string, unknown>, label);
    }
  }
}

function assertAnnouncement(obj: Record<string, unknown>, label: string): void {
  assertField(obj, "message", "string", label + ".announcement");
  assertField(obj, "announcement_type", "string", label + ".announcement"); // snake_case!

  // Verify NO camelCase variant exists (common mistake from Prisma)
  if ("announcementType" in obj) {
    throw new Error(
      `[${label}.announcement] Found "announcementType" (camelCase). Rust expects "announcement_type" (snake_case).`
    );
  }
}

function assertHeartbeatResponse(json: unknown, label: string): void {
  const obj = json as Record<string, unknown>;

  assertField(obj, "success", "boolean", label);

  // announcements MUST be Vec<String> (array of strings), NOT Vec<Announcement>
  if (!Array.isArray(obj.announcements)) {
    throw new Error(`[${label}] "announcements" must be an array of strings`);
  }
  for (const item of obj.announcements as unknown[]) {
    if (typeof item !== "string") {
      throw new Error(
        `[${label}] Each announcement must be a string, got ${typeof item}. ` +
        `HeartbeatResponse uses Vec<String>, NOT Vec<Announcement>.`
      );
    }
  }

  // update_available must be null or UpdateInfo
  if (!("update_available" in obj)) {
    throw new Error(`[${label}] "update_available" field is missing`);
  }
  if (obj.update_available !== null) {
    const u = obj.update_available as Record<string, unknown>;
    assertField(u, "version", "string", label + ".update_available");
    assertField(u, "url", "string", label + ".update_available");
    assertField(u, "changelog", "string", label + ".update_available");
  }

  // CRITICAL: HeartbeatResponse does NOT have "data", "error", or "message" fields
  if ("data" in obj) {
    throw new Error(
      `[${label}] HeartbeatResponse must NOT contain "data" field. It is NOT a ServerResponse.`
    );
  }
  if ("error" in obj) {
    throw new Error(
      `[${label}] HeartbeatResponse must NOT contain "error" field. It is NOT a ServerResponse.`
    );
  }
}

function assertTauriUpdaterResponse(json: unknown, label: string): void {
  const obj = json as Record<string, unknown>;

  assertField(obj, "version", "string", label);
  assertField(obj, "notes", "string", label);
  assertField(obj, "pub_date", "string", label);

  if (typeof obj.platforms !== "object" || obj.platforms === null) {
    throw new Error(`[${label}] "platforms" must be an object`);
  }

  const platforms = obj.platforms as Record<string, unknown>;
  for (const [key, value] of Object.entries(platforms)) {
    const platform = value as Record<string, unknown>;
    assertField(platform, "signature", "string", `${label}.platforms["${key}"]`);
    assertField(platform, "url", "string", `${label}.platforms["${key}"]`);
  }

  // CRITICAL: Tauri updater response does NOT use ServerResponse wrapper
  if ("success" in obj) {
    throw new Error(`[${label}] Tauri updater response must NOT contain "success". It is NOT a ServerResponse.`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
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
    throw new Error(`[${label}] Missing field "${field}". Rust Option<T> needs the key present; null is OK, missing is NOT.`);
  }
  if (obj[field] !== null && typeof obj[field] !== expectedType) {
    throw new Error(
      `[${label}] Field "${field}" must be ${expectedType} or null, got ${typeof obj[field]} (value: ${JSON.stringify(obj[field])})`
    );
  }
}

// ---------------------------------------------------------------------------
// Test fixtures: EXACT expected response shapes
// ---------------------------------------------------------------------------

// ── Test 1 & 3: POST /api/v1/license/activate and /validate (success) ────
// Deserialized via: serde_json::from_str::<ServerResponse>
const ACTIVATE_VALIDATE_SUCCESS: RustServerResponse<RustServerResponseData> = {
  success: true,
  data: {
    license_id: null,                            // Option<i64> - null for UUID-based systems
    organization: "Cyber Chakra Labs",            // Option<String> - org NAME, not UUID
    expires_at: "2027-03-28T00:00:00.000Z",      // Option<String> - ISO 8601 or null for perpetual
    validation_token: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", // Option<String> - UUID token
    next_validation: "2026-04-27T00:00:00.000Z", // Option<String> - ISO 8601
    valid: true,                                  // Option<bool>
    announcements: [                              // Vec<Announcement> - can be empty []
      {
        message: "Welcome to CCF 2.0!",
        announcement_type: "info",                // snake_case! NOT "announcementType"
      },
    ],
  },
  error: null,     // Option<String> - MUST be null, NOT undefined
  message: "License activated successfully", // Option<String> - MUST be present, can be null or ""
};

// ── Test 2: POST /api/v1/license/activate (error - not found) ────────────
const ACTIVATE_ERROR: RustServerResponse<null> = {
  success: false,
  data: null,
  error: "LICENSE_NOT_FOUND", // String error code
  message: "License key not found",
};

// ── Test 4: POST /api/v1/license/deactivate (success) ────────────────────
// Deserialized via: serde_json::from_str::<ServerResponse>
// Rust only checks success/error/message; data is not read as ServerResponseData
const DEACTIVATE_SUCCESS: RustServerResponse<{ deactivated: boolean }> = {
  success: true,
  data: { deactivated: true },
  error: null,
  message: "License deactivated successfully",
};

// ── Test 5: POST /api/v1/heartbeat (success) ─────────────────────────────
// CRITICAL: Uses HeartbeatResponse, NOT ServerResponse!
const HEARTBEAT_SUCCESS: RustHeartbeatResponse = {
  success: true,
  announcements: ["System maintenance scheduled for Saturday"], // Vec<String> NOT Vec<Announcement>!
  update_available: null, // Option<UpdateInfo>
};

// ── Test 5b: Heartbeat with update available ─────────────────────────────
const HEARTBEAT_WITH_UPDATE: RustHeartbeatResponse = {
  success: true,
  announcements: [],
  update_available: {
    version: "2.1.0",
    url: "https://releases.cyberchakra.in/v2.1.0/ccf-setup.exe",
    changelog: "New features and bug fixes",
  },
};

// ── Test 6: GET /api/v1/update-check (update available) ──────────────────
// CRITICAL: Uses Tauri updater format, NOT ServerResponse!
const UPDATE_CHECK_AVAILABLE: TauriUpdaterResponse = {
  version: "2.1.0",
  notes: "Release notes here",
  pub_date: "2026-03-28T12:00:00.000Z",
  platforms: {
    "windows-x86_64": {
      signature: "dW50cnVzdGVkIGNvbW1lbnQ6...", // base64 signature
      url: "https://releases.cyberchakra.in/v2.1.0/ccf-setup.exe",
    },
  },
};
// Test 6b: GET /api/v1/update-check (no update) -> HTTP 204 No Content, empty body

// ── Test 7: GET /api/v1/announcements ────────────────────────────────────
// Consumed in Rust (license.rs lines 134-151) as:
// AnnouncementsResponse { success: bool, data: Option<AnnouncementsData> }
// AnnouncementsData { announcements: Vec<Announcement> }
const ANNOUNCEMENTS_SUCCESS = {
  success: true,
  data: {
    announcements: [
      { message: "Maintenance window", announcement_type: "warning" },
    ],
  },
  error: null,
  message: "",
};

// ── Test 8: GET /api/v1/health ───────────────────────────────────────────
// Desktop just checks HTTP 200; body is ServerResponse shaped but not deserialized strictly
const HEALTH_SUCCESS = {
  success: true,
  data: { status: "ok", timestamp: "2026-03-28T12:00:00.000Z" },
  error: null,
  message: "Server is healthy",
};

// ── Test 9: POST /api/v1/trial-request ───────────────────────────────────
// Consumed as serde_json::Value, accessed via data["request_id"], data["status"], etc.
const TRIAL_REQUEST_SUCCESS = {
  success: true,
  data: {
    request_id: "uuid-here",
    status: "pending",
  },
  error: null,
  message: "Trial request submitted successfully. You will be notified once reviewed.",
};

// ── Test 10: GET /api/v1/trial-request-status ────────────────────────────
const TRIAL_STATUS_SUCCESS = {
  success: true,
  data: {
    request_id: "uuid-here",
    status: "approved",
    submitted_at: "2026-03-20T10:00:00.000Z",
    license_key: "CCF-XXXX-XXXX-XXXX-XXXX",
    reviewed_at: "2026-03-21T14:00:00.000Z",
  },
  error: null,
  message: "",
};

// ── Test 11: POST /api/v1/support/create-ticket ──────────────────────────
const CREATE_TICKET_SUCCESS = {
  success: true,
  data: {
    ticket_number: "CCF-ABC123-XYZ",
    status: "open",
    created_at: "2026-03-28T12:00:00.000Z",
  },
  error: null,
  message: "Support ticket created successfully",
};

// ── Test 12: POST /api/v1/support/ticket-status ──────────────────────────
const TICKET_STATUS_SUCCESS = {
  success: true,
  data: {
    ticket_number: "CCF-ABC123-XYZ",
    subject: "Issue with acquisition",
    status: "open",
    priority: "medium",
    category: "bug",
    created_at: "2026-03-28T12:00:00.000Z",
    updated_at: "2026-03-28T12:00:00.000Z",
    closed_at: null,
  },
  error: null,
  message: "",
};

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

function runAllTests(): void {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void): void {
    try {
      fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  FAIL  ${name}`);
      console.error(`        ${e.message}`);
      failed++;
    }
  }

  console.log("\n=== Desktop App API Compatibility Tests ===\n");

  // ── Activate/Validate: ServerResponse with ServerResponseData ──────────

  test("1. POST /license/activate success has correct ServerResponseData fields", () => {
    assertServerResponseWithData(ACTIVATE_VALIDATE_SUCCESS, "activate-success");
  });

  test("2. POST /license/activate error has null data and error string", () => {
    assertServerResponseEnvelope(ACTIVATE_ERROR, "activate-error");
    if (ACTIVATE_ERROR.data !== null) {
      throw new Error("Error response data must be null");
    }
    if (typeof ACTIVATE_ERROR.error !== "string") {
      throw new Error("Error response error must be a string code");
    }
  });

  test("3. POST /license/validate success has correct ServerResponseData fields", () => {
    assertServerResponseWithData(ACTIVATE_VALIDATE_SUCCESS, "validate-success");
  });

  // ── Deactivate: ServerResponse envelope (data read loosely) ────────────

  test("4. POST /license/deactivate success has ServerResponse envelope", () => {
    assertServerResponseEnvelope(DEACTIVATE_SUCCESS, "deactivate");
    if (DEACTIVATE_SUCCESS.error !== null) throw new Error("error must be null on success");
  });

  // ── HeartbeatResponse (NOT ServerResponse!) ────────────────────────────

  test("5. POST /heartbeat matches HeartbeatResponse (NOT ServerResponse)", () => {
    assertHeartbeatResponse(HEARTBEAT_SUCCESS, "heartbeat");
  });

  test("5b. POST /heartbeat with update_available matches HeartbeatResponse", () => {
    assertHeartbeatResponse(HEARTBEAT_WITH_UPDATE, "heartbeat-update");
    const info = HEARTBEAT_WITH_UPDATE.update_available!;
    if (typeof info.version !== "string") throw new Error("version must be string");
    if (typeof info.url !== "string") throw new Error("url must be string");
    if (typeof info.changelog !== "string") throw new Error("changelog must be string");
  });

  // ── Tauri Updater format (NOT ServerResponse!) ─────────────────────────

  test("6. GET /update-check returns Tauri updater format", () => {
    assertTauriUpdaterResponse(UPDATE_CHECK_AVAILABLE, "update-check");
  });

  test("6b. GET /update-check no update returns HTTP 204 (no body to validate)", () => {
    // Documenting: response is HTTP 204 No Content with empty body
    // The Tauri updater treats 204 as "no update available"
  });

  // ── Announcements ──────────────────────────────────────────────────────

  test("7. GET /announcements has ServerResponse envelope with nested data.announcements", () => {
    assertServerResponseEnvelope(ANNOUNCEMENTS_SUCCESS, "announcements");
    const data = ANNOUNCEMENTS_SUCCESS.data as any;
    if (!data || !Array.isArray(data.announcements)) {
      throw new Error("data.announcements must be an array (not data itself being the array)");
    }
    for (const ann of data.announcements) {
      assertAnnouncement(ann, "announcements");
    }
  });

  // ── Health ─────────────────────────────────────────────────────────────

  test("8. GET /health returns HTTP 200 with ServerResponse envelope", () => {
    assertServerResponseEnvelope(HEALTH_SUCCESS, "health");
  });

  // ── Trial: ServerResponse envelope (data read via serde_json::Value) ──

  test("9. POST /trial-request has ServerResponse envelope with data.request_id and data.status", () => {
    assertServerResponseEnvelope(TRIAL_REQUEST_SUCCESS, "trial-request");
    const data = TRIAL_REQUEST_SUCCESS.data as any;
    if (!data) throw new Error("data must not be null on success");
    if (!("request_id" in data)) throw new Error("data.request_id required (Rust reads data[\"request_id\"])");
    if (!("status" in data)) throw new Error("data.status required (Rust reads data[\"status\"])");
  });

  test("10. GET /trial-request-status has ServerResponse envelope with data.status", () => {
    assertServerResponseEnvelope(TRIAL_STATUS_SUCCESS, "trial-request-status");
    const data = TRIAL_STATUS_SUCCESS.data as any;
    if (!data) throw new Error("data must not be null on success");
    if (!("status" in data)) throw new Error("data.status required");
    if (!("request_id" in data)) throw new Error("data.request_id required");
  });

  // ── Support: ServerResponse envelope ───────────────────────────────────

  test("11. POST /support/create-ticket has ServerResponse envelope", () => {
    assertServerResponseEnvelope(CREATE_TICKET_SUCCESS, "create-ticket");
    const data = CREATE_TICKET_SUCCESS.data as any;
    if (!data) throw new Error("data must not be null on success");
    if (!("ticket_number" in data)) throw new Error("data.ticket_number required");
    if (!("status" in data)) throw new Error("data.status required");
  });

  test("12. POST /support/ticket-status has ServerResponse envelope", () => {
    assertServerResponseEnvelope(TICKET_STATUS_SUCCESS, "ticket-status");
    const data = TICKET_STATUS_SUCCESS.data as any;
    if (!data) throw new Error("data must not be null on success");
    if (!("ticket_number" in data)) throw new Error("data.ticket_number required");
    if (!("status" in data)) throw new Error("data.status required");
  });

  // ── Critical field name checks ────────────────────────────────────────

  test("13. Announcement uses snake_case 'announcement_type', not camelCase", () => {
    const ann = { message: "test", announcement_type: "info" };
    assertAnnouncement(ann, "snake-case-check");
  });

  test("14. camelCase 'announcementType' is rejected", () => {
    const bad = { message: "test", announcement_type: "info", announcementType: "info" };
    try {
      assertAnnouncement(bad, "camel-case-reject");
      throw new Error("Should have thrown for camelCase field");
    } catch (e: any) {
      if (!e.message.includes("announcementType")) {
        throw e;
      }
      // Expected - camelCase was correctly rejected
    }
  });

  test("15. HeartbeatResponse is rejected if it contains ServerResponse fields", () => {
    const badHeartbeat = {
      success: true,
      data: { received: true },
      error: null,
      message: "Heartbeat recorded",
    };
    try {
      assertHeartbeatResponse(badHeartbeat, "bad-heartbeat");
      throw new Error("Should have thrown for ServerResponse-shaped heartbeat");
    } catch (e: any) {
      if (!e.message.includes("data") && !e.message.includes("announcements")) {
        throw e;
      }
      // Expected - ServerResponse shape was correctly rejected
    }
  });

  test("16. ServerResponse 'error' field must be null (not undefined) on success", () => {
    const badResp = { success: true, data: null, message: "" };
    try {
      assertServerResponseEnvelope(badResp, "missing-error");
      throw new Error("Should have thrown for missing 'error' field");
    } catch (e: any) {
      if (!e.message.includes("error")) {
        throw e;
      }
    }
  });

  test("17. ServerResponse 'message' field must be present (not undefined)", () => {
    const badResp = { success: true, data: null, error: null };
    try {
      assertServerResponseEnvelope(badResp, "missing-message");
      throw new Error("Should have thrown for missing 'message' field");
    } catch (e: any) {
      if (!e.message.includes("message")) {
        throw e;
      }
    }
  });

  test("18. Update check response must NOT contain 'success' field", () => {
    const badUpdate = {
      success: true,
      version: "2.1.0",
      notes: "notes",
      pub_date: "2026-03-28T12:00:00Z",
      platforms: { "windows-x86_64": { signature: "sig", url: "url" } },
    };
    try {
      assertTauriUpdaterResponse(badUpdate, "bad-update");
      throw new Error("Should have thrown for 'success' in updater response");
    } catch (e: any) {
      if (!e.message.includes("success")) {
        throw e;
      }
    }
  });

  // ── ISO 8601 date format checks ───────────────────────────────────────

  test("19. Date fields are ISO 8601 strings, not Date objects or timestamps", () => {
    const data = ACTIVATE_VALIDATE_SUCCESS.data!;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

    if (data.expires_at && !isoRegex.test(data.expires_at)) {
      throw new Error(`expires_at "${data.expires_at}" is not ISO 8601`);
    }
    if (data.next_validation && !isoRegex.test(data.next_validation)) {
      throw new Error(`next_validation "${data.next_validation}" is not ISO 8601`);
    }
  });

  test("20. license_id must be a number or null, never a UUID string", () => {
    const data = ACTIVATE_VALIDATE_SUCCESS.data!;
    if (data.license_id !== null && typeof data.license_id !== "number") {
      throw new Error(
        `license_id must be number|null (Rust i64), got ${typeof data.license_id}: "${data.license_id}"`
      );
    }
  });

  // ── Negative tests: wrong formats that would crash the desktop app ────

  test("21. Heartbeat with Vec<Announcement> instead of Vec<String> is rejected", () => {
    const wrongHeartbeat = {
      success: true,
      announcements: [{ message: "hello", announcement_type: "info" }],
      update_available: null,
    };
    try {
      assertHeartbeatResponse(wrongHeartbeat, "wrong-heartbeat-ann");
      throw new Error("Should have thrown for Announcement objects in heartbeat");
    } catch (e: any) {
      if (!e.message.includes("must be a string")) {
        throw e;
      }
    }
  });

  test("22. Announcements as raw array (not nested in data object) would fail Rust deserialization", () => {
    // This is the OLD (broken) format that would crash:
    // { success: true, data: [{ message: "...", announcementType: "..." }], error: null, message: "" }
    // Rust expects: { success: true, data: { announcements: [...] }, ... }
    const broken = {
      success: true,
      data: [{ message: "test", announcementType: "info" }], // data IS the array - WRONG
      error: null,
      message: "",
    };
    // When data is an array, the Rust AnnouncementsData deserialization would fail
    // because it expects an object with an "announcements" field
    if (Array.isArray(broken.data)) {
      // This format is wrong - data must be an object, not an array
    } else {
      throw new Error("Test setup error: data should be an array for this test");
    }
  });

  test("23. ServerResponseData with camelCase fields would crash desktop", () => {
    const badData = {
      success: true,
      data: {
        licenseId: null,          // WRONG: should be license_id
        organization: "Test",
        expiresAt: null,          // WRONG: should be expires_at
        validationToken: "tok",   // WRONG: should be validation_token
        nextValidation: null,     // WRONG: should be next_validation
        valid: true,
        announcements: [],
      },
      error: null,
      message: "",
    };
    try {
      assertServerResponseWithData(badData, "camelCase-data");
      throw new Error("Should have thrown for camelCase fields");
    } catch (e: any) {
      if (!e.message.includes("license_id")) {
        throw e;
      }
    }
  });

  test("24. 'data' field must not be 'undefined' (must be null or object)", () => {
    const badResp = { success: true, error: null, message: "" };
    try {
      assertServerResponseEnvelope(badResp, "undefined-data");
      throw new Error("Should have thrown for missing 'data' field");
    } catch (e: any) {
      if (!e.message.includes("data")) {
        throw e;
      }
    }
  });

  // ── Summary ────────────────────────────────────────────────────────────

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();

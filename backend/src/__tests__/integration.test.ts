/**
 * CCF Admin Portal - Integration Test Suite
 *
 * Run with: npx tsx src/__tests__/integration.test.ts
 * Requires: Backend running on localhost:3001 with a clean database
 */

const BASE_URL = 'http://localhost:3001';
let authToken = '';
let createdOrgId = '';
let createdLicenseId = '';
let createdLicenseKey = '';

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function api(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, data };
}

async function run() {
  console.log('\n🧪 CCF Admin Portal Integration Tests\n');
  console.log('--- Health Check ---');

  await test('GET /api/v1/health returns 200', async () => {
    const { status, data } = await api('GET', '/api/v1/health');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.status === 'ok', 'Health check should return ok');
  });

  console.log('\n--- Authentication ---');

  await test('POST /api/v1/auth/login with valid credentials', async () => {
    const { status, data } = await api('POST', '/api/v1/auth/login', {
      email: 'admin@cyberchakra.in',
      password: 'ChangeMe123!',
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.token, 'Should return JWT token');
    assert(data.user.email === 'admin@cyberchakra.in', 'Should return user');
    authToken = data.token;
  });

  await test('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const { status } = await api('POST', '/api/v1/auth/login', {
      email: 'admin@cyberchakra.in',
      password: 'wrongpassword',
    });
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('GET /api/v1/auth/me returns current user', async () => {
    const { status, data } = await api('GET', '/api/v1/auth/me');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.email === 'admin@cyberchakra.in', 'Should return admin user');
  });

  console.log('\n--- Organizations ---');

  await test('POST /api/v1/admin/organizations creates org', async () => {
    const { status, data } = await api('POST', '/api/v1/admin/organizations', {
      name: 'Test Police Department',
      orgType: 'law_enforcement',
      email: 'test@police.gov.in',
      country: 'IN',
    });
    assert(status === 201 || status === 200, `Expected 201, got ${status}`);
    assert(data.id, 'Should return org ID');
    createdOrgId = data.id;
  });

  await test('GET /api/v1/admin/organizations lists orgs', async () => {
    const { status, data } = await api('GET', '/api/v1/admin/organizations');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(data.data || data), 'Should return array');
  });

  console.log('\n--- Licenses ---');

  await test('POST /api/v1/admin/licenses creates license', async () => {
    const { status, data } = await api('POST', '/api/v1/admin/licenses', {
      organizationId: createdOrgId,
      licenseType: 'perpetual',
      tier: 'government',
      maxActivations: 5,
    });
    assert(status === 201 || status === 200, `Expected 201, got ${status}`);
    assert(data.licenseKey, 'Should return license key');
    assert(data.licenseKey.startsWith('CCF-'), 'Key should start with CCF-');
    createdLicenseId = data.id;
    createdLicenseKey = data.licenseKey;
  });

  console.log('\n--- Desktop App API (Public) ---');

  await test('POST /api/v1/license/activate works', async () => {
    const { status, data } = await api('POST', '/api/v1/license/activate', {
      license_key: createdLicenseKey,
      hardware_fingerprint: 'test_fingerprint_abc123',
      user_email: 'test@police.gov.in',
      machine_name: 'TEST-MACHINE-01',
      os_info: 'Windows 11',
      app_version: '2.0.0',
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, 'Should be successful');
    assert(data.data !== null, 'Should have data');
    assert(typeof data.message === 'string', 'Message should be string');
    assert(data.error === null || data.error === undefined, 'Error should be null');
  });

  await test('POST /api/v1/license/validate works', async () => {
    const { status, data } = await api('POST', '/api/v1/license/validate', {
      license_key: createdLicenseKey,
      hardware_fingerprint: 'test_fingerprint_abc123',
      app_version: '2.0.0',
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, 'Should be successful');
  });

  await test('POST /api/v1/heartbeat works', async () => {
    const { status, data } = await api('POST', '/api/v1/heartbeat', {
      license_key: createdLicenseKey,
      hardware_fingerprint: 'test_fingerprint_abc123',
      app_version: '2.0.0',
      usage_stats: { cases_created: 10, acquisitions: 25, reports_generated: 5 },
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, 'Heartbeat should succeed');
  });

  await test('GET /api/v1/announcements returns announcements', async () => {
    const { status, data } = await api('GET', '/api/v1/announcements');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, 'Should be successful');
  });

  await test('GET /api/v1/update-check returns 204 (no update)', async () => {
    const { status } = await api('GET', '/api/v1/update-check?target=windows&arch=x86_64&current_version=99.0.0');
    assert(status === 204 || status === 200, `Expected 204/200, got ${status}`);
  });

  console.log('\n--- Dashboard ---');

  await test('GET /api/v1/admin/dashboard returns stats', async () => {
    const { status, data } = await api('GET', '/api/v1/admin/dashboard');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(typeof data.totalActiveLicenses === 'number', 'Should have license count');
  });

  console.log('\n--- Cleanup ---');

  await test('POST /api/v1/license/deactivate works', async () => {
    const { status, data } = await api('POST', '/api/v1/license/deactivate', {
      license_key: createdLicenseKey,
      hardware_fingerprint: 'test_fingerprint_abc123',
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.success === true, 'Deactivation should succeed');
  });

  console.log('\n✅ All tests completed\n');
}

run().catch(err => {
  console.error('\n❌ Test suite crashed:', err.message);
  process.exit(1);
});

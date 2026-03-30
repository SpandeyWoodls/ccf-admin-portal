/**
 * CCF Admin Portal - Health Check Utility
 *
 * Quick health check that verifies:
 * 1. API is responding
 * 2. Database is connected (via Prisma)
 * 3. Returns exit code 0 (healthy) or 1 (unhealthy)
 *
 * Used by Hostinger monitoring, Docker health checks, etc.
 *
 * Run with: npx tsx src/healthcheck.ts
 */

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:3001';
const TIMEOUT_MS = 5000;

interface CheckResult {
  name: string;
  status: 'pass' | 'fail';
  latencyMs: number;
  message?: string;
}

async function checkApi(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${BASE_URL}/api/v1/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json() as any;
      return {
        name: 'API',
        status: data.status === 'ok' ? 'pass' : 'fail',
        latencyMs,
        message: data.status === 'ok' ? 'Responding normally' : `Unexpected status: ${data.status}`,
      };
    }

    return {
      name: 'API',
      status: 'fail',
      latencyMs,
      message: `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      name: 'API',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: err.name === 'AbortError' ? `Timeout after ${TIMEOUT_MS}ms` : err.message,
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    // Run a simple query to verify the connection is functional
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    return {
      name: 'Database',
      status: 'pass',
      latencyMs,
      message: 'Connected and responsive',
    };
  } catch (err: any) {
    return {
      name: 'Database',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: err.message,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function run() {
  console.log('CCF Admin Portal - Health Check');
  console.log('================================\n');

  const results = await Promise.all([checkApi(), checkDatabase()]);

  let allHealthy = true;

  for (const result of results) {
    const icon = result.status === 'pass' ? '✓' : '✗';
    const label = result.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${result.name}: ${label} (${result.latencyMs}ms)`);
    if (result.message) {
      console.log(`    ${result.message}`);
    }
    if (result.status === 'fail') {
      allHealthy = false;
    }
  }

  console.log('');

  if (allHealthy) {
    console.log('Status: HEALTHY');
    process.exit(0);
  } else {
    console.log('Status: UNHEALTHY');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Health check crashed:', err.message);
  process.exit(1);
});

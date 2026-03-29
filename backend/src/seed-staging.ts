/**
 * CCF Admin Portal - Staging Data Seed
 *
 * Populates the staging database with realistic test data for QA testing.
 * This includes test admin users, organizations, licenses in various states,
 * and staging-specific settings (feature flags enabled, etc.).
 *
 * Usage:
 *   npx tsx src/seed-staging.ts
 *   npm run db:seed:staging
 *
 * Safe to run multiple times (uses upsert).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding STAGING database with test data...\n");

  // ─── Admin users ─────────────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("StagingPass123!", 12);

  const superAdmin = await prisma.adminUser.upsert({
    where: { email: "admin@cyberchakra.in" },
    create: {
      email: "admin@cyberchakra.in",
      passwordHash,
      name: "Staging Super Admin",
      role: "super_admin",
      isActive: true,
    },
    update: {},
  });
  console.log(`Admin: ${superAdmin.email} (super_admin)`);

  const qaUser = await prisma.adminUser.upsert({
    where: { email: "qa@cyberchakra.in" },
    create: {
      email: "qa@cyberchakra.in",
      passwordHash,
      name: "QA Tester",
      role: "admin",
      isActive: true,
    },
    update: {},
  });
  console.log(`Admin: ${qaUser.email} (admin)`);

  const viewer = await prisma.adminUser.upsert({
    where: { email: "viewer@cyberchakra.in" },
    create: {
      email: "viewer@cyberchakra.in",
      passwordHash,
      name: "Read-Only Viewer",
      role: "viewer",
      isActive: true,
    },
    update: {},
  });
  console.log(`Admin: ${viewer.email} (viewer)`);

  console.log("  Password for all accounts: StagingPass123!\n");

  // ─── Test organizations ──────────────────────────────────────────────────

  const orgs = [
    {
      name: "Test Police Department",
      slug: "test-police-department",
      orgType: "law_enforcement" as const,
      address: "123 Test Street, Test City, TS 12345",
      phone: "+91-9999999999",
    },
    {
      name: "Digital Forensics Lab - Staging",
      slug: "digital-forensics-lab-staging",
      orgType: "private_lab" as const,
      address: "456 Lab Avenue, Research Park, RP 67890",
      phone: "+91-8888888888",
    },
    {
      name: "Test University Cyber Lab",
      slug: "test-university-cyber-lab",
      orgType: "academic" as const,
      address: "789 Campus Road, University Town, UT 11111",
      phone: "+91-7777777777",
    },
  ];

  const createdOrgs = [];
  for (const orgData of orgs) {
    const org = await prisma.organization.upsert({
      where: { slug: orgData.slug },
      create: {
        name: orgData.name,
        slug: orgData.slug,
        orgType: orgData.orgType,
        address: orgData.address,
        phone: orgData.phone,
        isActive: true,
      },
      update: {},
    });
    createdOrgs.push(org);
    console.log(`Organization: ${org.name} (id: ${org.id})`);
  }
  console.log("");

  // ─── Test licenses (various states) ───────────────────────────────────────

  const testLicenses = [
    {
      key: "TEST-AAAA-BBBB-CCCC",
      licenseType: "perpetual" as const,
      tier: "team" as const,
      status: "active" as const,
      orgIndex: 0,
      notes: "Active perpetual license for testing",
    },
    {
      key: "TEST-DDDD-EEEE-FFFF",
      licenseType: "trial" as const,
      tier: "individual" as const,
      status: "active" as const,
      orgIndex: 0,
      notes: "Active trial license (expires in 30 days)",
    },
    {
      key: "TEST-GGGG-HHHH-IIII",
      licenseType: "time_limited" as const,
      tier: "enterprise" as const,
      status: "expired" as const,
      orgIndex: 1,
      notes: "Expired time-limited license for testing expiry flows",
    },
    {
      key: "TEST-JJJJ-KKKK-LLLL",
      licenseType: "perpetual" as const,
      tier: "government" as const,
      status: "suspended" as const,
      orgIndex: 1,
      notes: "Suspended license for testing suspension flows",
    },
    {
      key: "TEST-MMMM-NNNN-OOOO",
      licenseType: "perpetual" as const,
      tier: "team" as const,
      status: "revoked" as const,
      orgIndex: 2,
      notes: "Revoked license for testing revocation flows",
    },
    {
      key: "TEST-PPPP-QQQQ-RRRR",
      licenseType: "organization" as const,
      tier: "enterprise" as const,
      status: "active" as const,
      orgIndex: 2,
      notes: "Active organization license with multiple seats",
    },
  ];

  for (const lic of testLicenses) {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    await prisma.license.upsert({
      where: { licenseKey: lic.key },
      create: {
        licenseKey: lic.key,
        licenseType: lic.licenseType,
        tier: lic.tier,
        status: lic.status,
        maxActivations: lic.licenseType === "organization" ? 10 : 3,
        organizationId: createdOrgs[lic.orgIndex].id,
        validFrom: new Date("2025-01-01"),
        validUntil:
          lic.licenseType === "trial"
            ? thirtyDaysFromNow
            : lic.status === "expired"
              ? thirtyDaysAgo
              : (lic.licenseType as string) === "time_limited"
                ? new Date("2027-12-31")
                : null,
        notes: lic.notes,
      },
      update: {},
    });
    console.log(`License: ${lic.key} (${lic.licenseType}, ${lic.status})`);
  }
  console.log("");

  // ─── Default settings + feature flags ─────────────────────────────────────

  const settings: Record<string, string> = {
    // Application defaults
    "trial.duration_days": "30",
    "trial.max_activations": "1",
    "trial.auto_approve": "true", // Auto-approve in staging for QA convenience
    "license.default_max_activations": "3",
    "heartbeat.interval_hours": "24",
    "support.auto_close_days": "14",

    // Feature flags -- staging gets beta features enabled
    "feature.beta.new_dashboard": "true",
    "feature.beta.bulk_operations": "true",
    "feature.beta.advanced_analytics": "true",
    "feature.debug.panel": "true",
    "feature.debug.verbose_logging": "true",
    "feature.rollout.v2_license_flow": "true",
    "feature.limit.max_export_rows": "50000",
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    console.log(`Setting: ${key} = ${value}`);
  }

  console.log("\n--- Staging seed complete ---");
  console.log("Login credentials: any of the admin emails above with password StagingPass123!");
}

main()
  .catch((err) => {
    console.error("Staging seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

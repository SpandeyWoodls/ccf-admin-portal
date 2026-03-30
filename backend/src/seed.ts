import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── Default super admin ──────────────────────────────────────────────────

  const email = "admin@cyberchakra.in";
  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing) {
    console.log(`Admin user ${email} already exists, skipping.`);
  } else {
    const randomPassword = crypto.randomBytes(16).toString("hex");
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const admin = await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        name: "Super Admin",
        role: "super_admin",
        isActive: true,
      },
    });

    console.log(`Created super admin: ${admin.email} (id: ${admin.id})`);
    console.log(`Generated admin password: ${randomPassword}`);
    console.log("IMPORTANT: Save this password now. It will not be shown again.");
  }

  // ─── Default settings ────────────────────────────────────────────────────

  const defaults: Record<string, string> = {
    "trial.duration_days": "30",
    "trial.max_activations": "1",
    "trial.auto_approve": "false",
    "license.default_max_activations": "1",
    "heartbeat.interval_hours": "24",
    "support.auto_close_days": "14",
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
    console.log(`Setting: ${key} = ${value}`);
  }

  console.log("\nSeed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

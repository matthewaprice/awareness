import "dotenv/config";
import { PrismaClient } from "../prisma/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const email = "admin@raredisease.local";
  const password = "admin1234";
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`Admin user already exists: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: "Platform Admin",
        role: "ADMIN",
        emailVerified: true,
        active: true,
      },
    });
    console.log(`Created admin user: ${email} / ${password}`);
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

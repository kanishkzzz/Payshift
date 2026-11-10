import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

/** Create or update one staff account without resetting any other database data. */
async function main() {
  const email = process.env.STAFF_EMAIL?.trim().toLowerCase();
  const password = process.env.STAFF_PASSWORD;
  const name = process.env.STAFF_NAME?.trim() || "Kanishk Negi";

  if (!email || !password) {
    throw new Error("Set STAFF_EMAIL and STAFF_PASSWORD before running this script.");
  }
  if (password.length < 12) {
    throw new Error("STAFF_PASSWORD must be at least 12 characters long.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const staff = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "ADMIN" },
    create: { email, name, passwordHash, role: "ADMIN" },
  });

  console.log(`Staff account ready: ${staff.email} (${staff.role}).`);
}

main()
  .catch((error: unknown) => {
    console.error("Could not create staff account:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

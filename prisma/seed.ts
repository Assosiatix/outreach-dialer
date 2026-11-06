// pnpm db:seed — create/update team members from SEED_MEMBERS and the default Twilio number.
// SEED_MEMBERS="Name|email|password|role|alertPhone;Name2|email2|password2|caller|"
// Existing members keep their password unless SEED_RESET_PASSWORDS=true.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const db = new PrismaClient();

async function main() {
  const raw = process.env.SEED_MEMBERS ?? "";
  const entries = raw.split(";").map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) console.warn("SEED_MEMBERS is empty — no team members created.");
  for (const e of entries) {
    const [name, email, password, role = "caller", alertPhone = ""] = e.split("|").map((s) => s.trim());
    if (!name || !email || !password) {
      console.warn(`Skipping malformed entry: ${e}`);
      continue;
    }
    const existing = await db.teamMember.findUnique({ where: { email: email.toLowerCase() } });
    const phone = alertPhone ? parsePhoneNumberFromString(alertPhone)?.number ?? null : null;
    if (existing) {
      await db.teamMember.update({
        where: { id: existing.id },
        data: {
          name,
          role: role === "admin" ? "admin" : "caller",
          ...(phone ? { alertPhone: phone } : {}),
          ...(process.env.SEED_RESET_PASSWORDS === "true" ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        },
      });
      console.log(`Updated ${email}`);
    } else {
      await db.teamMember.create({
        data: {
          name,
          email: email.toLowerCase(),
          passwordHash: await bcrypt.hash(password, 12),
          role: role === "admin" ? "admin" : "caller",
          alertPhone: phone,
        },
      });
      console.log(`Created ${email} (${role})`);
    }
  }

  const def = process.env.TWILIO_DEFAULT_NUMBER;
  const parsed = def ? parsePhoneNumberFromString(def) : undefined;
  if (parsed?.isValid() && !(await db.twilioNumber.findUnique({ where: { phoneNumber: parsed.number } }))) {
    const hasDefault = await db.twilioNumber.findFirst({ where: { isDefault: true } });
    await db.twilioNumber.create({
      data: { phoneNumber: parsed.number, country: parsed.country ?? "US", label: "Main", isDefault: !hasDefault, smsEnabled: true },
    });
    console.log(`Added Twilio number ${parsed.number}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

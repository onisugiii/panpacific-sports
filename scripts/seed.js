// scripts/seed.js
// Run once after schema.sql, with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// set in your environment:
//
//   npm run seed
//
// Safe to re-run -- it skips anything that already exists.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const supabase = require("../lib/supabase");

const DEPARTMENTS = [
  { id: "dept_eng", name: "College of Engineering", color: "#4EA8FF" },
  { id: "dept_bus", name: "College of Business", color: "#FFC145" },
  { id: "dept_cas", name: "College of Arts & Sciences", color: "#FF4655" },
  { id: "dept_edu", name: "College of Education", color: "#3ED089" },
];

const SPORTS = [
  { id: "sport_bball", name: "Basketball", emoji: "🏀", team_size: 5 },
  { id: "sport_vball", name: "Volleyball", emoji: "🏐", team_size: 6 },
];

const COORDINATOR_EMAIL = process.env.SEED_COORDINATOR_EMAIL || "coordinator@campus.edu";
const COORDINATOR_PASSWORD = process.env.SEED_COORDINATOR_PASSWORD || "coordinator123";

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the seed script.");
    process.exit(1);
  }

  console.log("Seeding departments...");
  for (const dept of DEPARTMENTS) {
    const { error } = await supabase.from("departments").upsert(dept, { onConflict: "id" });
    if (error) console.error(`  ✗ ${dept.name}: ${error.message}`);
    else console.log(`  ✓ ${dept.name}`);
  }

  console.log("Seeding sports...");
  for (const sport of SPORTS) {
    const { error } = await supabase.from("sports").upsert(sport, { onConflict: "id" });
    if (error) console.error(`  ✗ ${sport.name}: ${error.message}`);
    else console.log(`  ✓ ${sport.name}`);
  }

  console.log("Seeding coordinator account...");
  const { data: existing } = await supabase.from("users").select("id").eq("email", COORDINATOR_EMAIL).maybeSingle();
  if (existing) {
    console.log(`  ✓ Coordinator account already exists (${COORDINATOR_EMAIL})`);
  } else {
    const { error } = await supabase.from("users").insert({
      id: "coordinator_1",
      role: "coordinator",
      name: "Sports Coordinator",
      email: COORDINATOR_EMAIL,
      password_hash: bcrypt.hashSync(COORDINATOR_PASSWORD, 8),
    });
    if (error) console.error(`  ✗ Coordinator: ${error.message}`);
    else console.log(`  ✓ Created coordinator: ${COORDINATOR_EMAIL} / ${COORDINATOR_PASSWORD} (change this password!)`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

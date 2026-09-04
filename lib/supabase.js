// lib/supabase.js
// One shared Supabase client, using the service role key so the API can
// read/write freely -- this app does its own auth (JWT + bcrypt) rather
// than Supabase Auth, so Row Level Security is bypassed intentionally here.
// The service role key must NEVER be exposed to the frontend; it's only
// ever read from process.env on the server side.

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. " +
    "API calls that touch the database will fail until these are configured."
  );
}

const supabase = createClient(url || "https://placeholder.supabase.co", serviceKey || "placeholder-key", {
  auth: { persistSession: false },
});

module.exports = supabase;

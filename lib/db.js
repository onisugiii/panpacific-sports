// lib/db.js
// Every Supabase query lives in this file. Routes call these functions and
// only ever see plain camelCase JS objects -- the snake_case <-> camelCase
// mapping to Postgres columns happens here, in one place.

const supabase = require("./supabase");

function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function must(error, context) {
  if (error) {
    console.error(`[db] ${context}:`, error.message);
    throw new Error(error.message || `Database error while ${context}.`);
  }
}

// ---------------- departments ----------------
async function listDepartments() {
  const { data, error } = await supabase.from("departments").select("*").order("name");
  must(error, "listing departments");
  return data.map((d) => ({ id: d.id, name: d.name, color: d.color }));
}

async function createDepartment({ name, color }) {
  const row = { id: newId("dept"), name, color: color || "#4EA8FF" };
  const { data, error } = await supabase.from("departments").insert(row).select().single();
  must(error, "creating department");
  return { id: data.id, name: data.name, color: data.color };
}

async function updateDepartment(id, { name, color } = {}) {
  const row = {};
  if (typeof name === "string" && name.trim()) row.name = name.trim();
  if (typeof color === "string" && color.trim()) row.color = color.trim();
  const { data, error } = await supabase.from("departments").update(row).eq("id", id).select().maybeSingle();
  must(error, "updating department");
  return data ? { id: data.id, name: data.name, color: data.color } : null;
}

async function deleteDepartment(id) {
  const { error } = await supabase.from("departments").delete().eq("id", id);
  must(error, "deleting department");
}

// ---------------- sports ----------------
function mapSport(s) {
  return {
    id: s.id,
    name: s.name,
    emoji: s.emoji,
    teamSize: s.team_size,
    maxMembers: s.max_members ?? null,
    positions: Array.isArray(s.positions) ? s.positions : [],
    periodLabel: s.period_label || "Match",
    periodCount: s.period_count || 1,
    periodMinutes: s.period_minutes || 0, // 0 = no time limit (clock counts up, not down)
  };
}

async function listSports() {
  const { data, error } = await supabase.from("sports").select("*").order("name");
  must(error, "listing sports");
  return data.map(mapSport);
}

async function createSport({ name, emoji, teamSize, maxMembers, positions, periodLabel, periodCount, periodMinutes }) {
  const row = {
    id: newId("sport"),
    name,
    emoji: emoji || "🏆",
    team_size: teamSize || 1,
    max_members: maxMembers || null,
    positions: Array.isArray(positions) ? positions : [],
    period_label: periodLabel || "Match",
    period_count: periodCount && periodCount > 0 ? periodCount : 1,
    period_minutes: typeof periodMinutes === "number" && periodMinutes > 0 ? periodMinutes : 0,
  };
  const { data, error } = await supabase.from("sports").insert(row).select().single();
  must(error, "creating sport");
  return mapSport(data);
}

async function updateSport(id, { name, emoji, teamSize, maxMembers, positions, periodLabel, periodCount, periodMinutes } = {}) {
  const row = {};
  if (typeof name === "string" && name.trim()) row.name = name.trim();
  if (typeof emoji === "string" && emoji.trim()) row.emoji = emoji.trim();
  if (typeof teamSize === "number" && teamSize > 0) row.team_size = teamSize;
  if (maxMembers === null) row.max_members = null;
  else if (typeof maxMembers === "number" && maxMembers > 0) row.max_members = maxMembers;
  if (Array.isArray(positions)) row.positions = positions;
  if (typeof periodLabel === "string" && periodLabel.trim()) row.period_label = periodLabel.trim();
  if (typeof periodCount === "number" && periodCount > 0) row.period_count = periodCount;
  if (periodMinutes === null || periodMinutes === 0) row.period_minutes = 0; // explicitly clear = "no time limit"
  else if (typeof periodMinutes === "number" && periodMinutes > 0) row.period_minutes = periodMinutes;

  const { data, error } = await supabase.from("sports").update(row).eq("id", id).select().maybeSingle();
  must(error, "updating sport");
  return data ? mapSport(data) : null;
}

async function deleteSport(id) {
  // matches and registrations reference sports with ON DELETE CASCADE (see schema.sql),
  // so removing the sport cleans those up automatically.
  const { error } = await supabase.from("sports").delete().eq("id", id);
  must(error, "deleting sport");
}

async function countActiveRegistrations(sportId) {
  const { count, error } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("sport_id", sportId)
    .in("status", ["pending", "approved"]);
  must(error, "counting registrations for sport");
  return count || 0;
}

// ---------------- users ----------------
function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    studentId: u.student_id,
    departmentId: u.department_id,
    passwordHash: u.password_hash,
    createdAt: u.created_at,
  };
}

async function getUserByEmail(email) {
  const { data, error } = await supabase.from("users").select("*").ilike("email", email).maybeSingle();
  must(error, "looking up user by email");
  return mapUser(data);
}

async function getUserById(id) {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  must(error, "looking up user by id");
  return mapUser(data);
}

async function createStudent({ name, email, passwordHash, studentId, departmentId }) {
  const row = {
    id: newId("student"),
    role: "student",
    name,
    email,
    password_hash: passwordHash,
    student_id: studentId,
    department_id: departmentId,
  };
  const { data, error } = await supabase.from("users").insert(row).select().single();
  must(error, "creating student account");
  return mapUser(data);
}

async function createAdmin({ name, email, passwordHash }) {
  const row = {
    id: newId("admin"),
    role: "admin",
    name,
    email,
    password_hash: passwordHash,
  };
  const { data, error } = await supabase.from("users").insert(row).select().single();
  must(error, "creating admin account");
  return mapUser(data);
}

async function listUsersByRole(role) {
  const { data, error } = await supabase.from("users").select("*").eq("role", role).order("created_at", { ascending: false });
  must(error, "listing users");
  return data.map(mapUser);
}

async function deleteUser(id) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  must(error, "deleting user");
}

async function updateUserPassword(id, passwordHash) {
  const { data, error } = await supabase.from("users").update({ password_hash: passwordHash }).eq("id", id).select().maybeSingle();
  must(error, "updating password");
  return data ? mapUser(data) : null;
}

async function updateUserEmail(id, email) {
  const { data, error } = await supabase.from("users").update({ email }).eq("id", id).select().maybeSingle();
  must(error, "updating email");
  return data ? mapUser(data) : null;
}

// ---------------- password reset requests ----------------
function mapResetRequest(r) {
  return {
    id: r.id,
    userId: r.user_id,
    email: r.email,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

async function createPasswordResetRequest({ userId, email }) {
  const row = { id: newId("reset"), user_id: userId, email, status: "pending" };
  const { data, error } = await supabase.from("password_reset_requests").insert(row).select().single();
  must(error, "creating password reset request");
  return mapResetRequest(data);
}

async function listPasswordResetRequests({ status } = {}) {
  let q = supabase.from("password_reset_requests").select("*, users(name, role)").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  must(error, "listing password reset requests");
  return data.map((r) => ({ ...mapResetRequest(r), userName: r.users?.name || "Unknown", userRole: r.users?.role || "unknown" }));
}

async function getPasswordResetRequestById(id) {
  const { data, error } = await supabase.from("password_reset_requests").select("*").eq("id", id).maybeSingle();
  must(error, "looking up password reset request");
  return data ? mapResetRequest(data) : null;
}

async function resolvePasswordResetRequest(id, status) {
  const { data, error } = await supabase
    .from("password_reset_requests")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  must(error, "resolving password reset request");
  return data ? mapResetRequest(data) : null;
}

// ---------------- registrations ----------------
function mapRegistration(r, extra = {}) {
  return {
    id: r.id,
    userId: r.user_id,
    sportId: r.sport_id,
    departmentId: r.department_id,
    status: r.status,
    requestedPosition: r.position || null,
    createdAt: r.created_at,
    ...extra,
  };
}

async function withRegistrationDetails(regs) {
  if (regs.length === 0) return [];
  const [{ data: users }, { data: sports }, { data: depts }, { data: lineups }] = await Promise.all([
    supabase.from("users").select("id,name,student_id"),
    supabase.from("sports").select("id,name"),
    supabase.from("departments").select("id,name"),
    supabase.from("lineups").select("sport_id,user_id,position"),
  ]);
  const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
  const sportMap = Object.fromEntries((sports || []).map((s) => [s.id, s]));
  const deptMap = Object.fromEntries((depts || []).map((d) => [d.id, d]));
  const lineupMap = Object.fromEntries((lineups || []).map((l) => [l.sport_id + "|" + l.user_id, l.position]));

  return regs.map((r) =>
    mapRegistration(r, {
      studentName: userMap[r.user_id]?.name || "Unknown",
      studentIdNumber: userMap[r.user_id]?.student_id || null,
      sportName: sportMap[r.sport_id]?.name || "Unknown",
      departmentName: deptMap[r.department_id]?.name || "Unknown",
      // The lineup position is the coordinator-confirmed one; fall back to
      // what the student requested at signup if the coordinator hasn't
      // touched the roster yet.
      position: lineupMap[r.sport_id + "|" + r.user_id] || r.position || null,
    })
  );
}

async function listRegistrations({ sportId, status } = {}) {
  let q = supabase.from("registrations").select("*").order("created_at", { ascending: false });
  if (sportId) q = q.eq("sport_id", sportId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  must(error, "listing registrations");
  return withRegistrationDetails(data);
}

async function listRegistrationsForUser(userId) {
  const { data, error } = await supabase.from("registrations").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  must(error, "listing your registrations");
  return withRegistrationDetails(data);
}

async function findRegistration(userId, sportId) {
  const { data, error } = await supabase.from("registrations").select("*").eq("user_id", userId).eq("sport_id", sportId).maybeSingle();
  must(error, "checking existing registration");
  return data ? mapRegistration(data) : null;
}

async function getRegistrationById(id) {
  const { data, error } = await supabase.from("registrations").select("*").eq("id", id).maybeSingle();
  must(error, "looking up registration");
  return data ? mapRegistration(data) : null;
}

async function createRegistration({ userId, sportId, departmentId, position }) {
  const row = { id: newId("reg"), user_id: userId, sport_id: sportId, department_id: departmentId, status: "pending", position: position || null };
  const { data, error } = await supabase.from("registrations").insert(row).select().single();
  must(error, "creating registration");
  const [withDetails] = await withRegistrationDetails([data]);
  return withDetails;
}

// When a registration is approved and the student requested a position at
// signup, promote that straight into the lineup table -- the coordinator
// can still change it afterwards in the Rosters & Lineups tab.
async function updateRegistrationStatus(id, status) {
  const { data, error } = await supabase.from("registrations").update({ status }).eq("id", id).select().single();
  must(error, "updating registration status");
  if (status === "approved" && data.position) {
    await upsertLineupEntry({
      sportId: data.sport_id,
      departmentId: data.department_id,
      userId: data.user_id,
      position: data.position,
    });
  }
  const [withDetails] = await withRegistrationDetails([data]);
  return withDetails;
}

async function deleteRegistration(id) {
  const { error } = await supabase.from("registrations").delete().eq("id", id);
  must(error, "deleting registration");
}

// ---------------- matches ----------------
function mapMatch(m) {
  return {
    id: m.id,
    sportId: m.sport_id,
    departmentA: m.department_a,
    departmentB: m.department_b,
    scoreA: m.score_a,
    scoreB: m.score_b,
    periodScores: Array.isArray(m.period_scores) ? m.period_scores : [],
    currentPeriod: m.current_period || 0,
    clockSeconds: m.clock_seconds || 0,
    clockRunning: !!m.clock_running,
    clockStartedAt: m.clock_started_at || null,
    venue: m.venue || "",
    time: m.time || "",
    status: m.status,
    createdAt: m.created_at,
  };
}

async function listMatches({ sportId } = {}) {
  let q = supabase.from("matches").select("*").order("created_at", { ascending: false });
  if (sportId) q = q.eq("sport_id", sportId);
  const { data, error } = await q;
  must(error, "listing matches");
  return data.map(mapMatch);
}

async function createMatch({ sportId, departmentA, departmentB, venue, time, periodCount }) {
  const periods = Array.from({ length: periodCount && periodCount > 0 ? periodCount : 1 }, () => ({ a: 0, b: 0 }));
  const row = {
    id: newId("match"),
    sport_id: sportId,
    department_a: departmentA,
    department_b: departmentB,
    venue: venue || "",
    time: time || "",
    status: "scheduled",
    period_scores: periods,
    current_period: 0,
    clock_seconds: 0,
    clock_running: false,
    clock_started_at: null,
    score_a: 0,
    score_b: 0,
  };
  const { data, error } = await supabase.from("matches").insert(row).select().single();
  must(error, "creating match");
  return mapMatch(data);
}

async function updateMatch(id, patch) {
  const row = {};
  if (typeof patch.scoreA === "number") row.score_a = patch.scoreA;
  if (typeof patch.scoreB === "number") row.score_b = patch.scoreB;
  if (patch.status) row.status = patch.status;
  if (typeof patch.venue === "string") row.venue = patch.venue;
  if (typeof patch.time === "string") row.time = patch.time;

  const { data, error } = await supabase.from("matches").update(row).eq("id", id).select().maybeSingle();
  must(error, "updating match");
  return data ? mapMatch(data) : null;
}

// Update a single period's score (partial: only the sides provided change),
// then recompute score_a/score_b as the sum across all periods -- that sum
// stays the single source of truth standings are calculated from.
async function updateMatchPeriod(id, periodIndex, { a, b } = {}) {
  const { data: existing, error: fetchErr } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
  must(fetchErr, "loading match for period update");
  if (!existing) return null;

  const periods = Array.isArray(existing.period_scores) ? existing.period_scores.slice() : [];
  while (periods.length <= periodIndex) periods.push({ a: 0, b: 0 });
  const current = periods[periodIndex] || { a: 0, b: 0 };
  periods[periodIndex] = {
    a: typeof a === "number" ? Math.max(0, a) : current.a || 0,
    b: typeof b === "number" ? Math.max(0, b) : current.b || 0,
  };

  const totalA = periods.reduce((sum, p) => sum + (p.a || 0), 0);
  const totalB = periods.reduce((sum, p) => sum + (p.b || 0), 0);

  const { data, error } = await supabase
    .from("matches")
    .update({ period_scores: periods, score_a: totalA, score_b: totalB })
    .eq("id", id)
    .select()
    .maybeSingle();
  must(error, "updating match period score");
  return data ? mapMatch(data) : null;
}

async function deleteMatch(id) {
  const { error } = await supabase.from("matches").delete().eq("id", id);
  must(error, "deleting match");
}

// Start/pause/reset the live game clock. We never write elapsed time every
// second -- only on these three actions -- and compute the displayed time
// on the frontend as clockSeconds + (now - clockStartedAt) while running.
async function setMatchClock(id, action) {
  const { data: existing, error: fetchErr } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
  must(fetchErr, "loading match for clock update");
  if (!existing) return null;

  let row;
  if (action === "start") {
    if (existing.clock_running) return mapMatch(existing); // already running, no-op
    row = { clock_running: true, clock_started_at: new Date().toISOString() };
  } else if (action === "pause") {
    if (!existing.clock_running) return mapMatch(existing); // already paused, no-op
    const startedAt = existing.clock_started_at ? new Date(existing.clock_started_at).getTime() : Date.now();
    const elapsed = (existing.clock_seconds || 0) + Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    row = { clock_running: false, clock_started_at: null, clock_seconds: elapsed };
  } else if (action === "reset") {
    row = { clock_running: false, clock_started_at: null, clock_seconds: 0 };
  } else {
    throw new Error("Invalid clock action. Use start, pause, or reset.");
  }

  const { data, error } = await supabase.from("matches").update(row).eq("id", id).select().maybeSingle();
  must(error, "updating match clock");
  return data ? mapMatch(data) : null;
}

// Advance/retreat which period is the "live" one (Next/Prev Quarter),
// clamped to the range of periods that already exist for this match.
async function setMatchCurrentPeriod(id, direction) {
  const { data: existing, error: fetchErr } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
  must(fetchErr, "loading match for period-index update");
  if (!existing) return null;

  const periodCount = Array.isArray(existing.period_scores) ? existing.period_scores.length : 1;
  const delta = direction === "next" ? 1 : direction === "prev" ? -1 : 0;
  const newIndex = Math.min(Math.max(0, (existing.current_period || 0) + delta), Math.max(0, periodCount - 1));

  const { data, error } = await supabase.from("matches").update({ current_period: newIndex }).eq("id", id).select().maybeSingle();
  must(error, "updating match current period");
  return data ? mapMatch(data) : null;
}

// ---------------- lineups ----------------
function mapLineup(l, extra = {}) {
  return {
    id: l.id,
    sportId: l.sport_id,
    departmentId: l.department_id,
    userId: l.user_id,
    position: l.position || "",
    createdAt: l.created_at,
    ...extra,
  };
}

async function listLineupsForSport(sportId) {
  const { data, error } = await supabase.from("lineups").select("*").eq("sport_id", sportId);
  must(error, "listing lineups");
  if (data.length === 0) return [];
  const { data: users } = await supabase.from("users").select("id,name,student_id");
  const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
  return data.map((l) =>
    mapLineup(l, {
      studentName: userMap[l.user_id]?.name || "Unknown",
      studentIdNumber: userMap[l.user_id]?.student_id || null,
    })
  );
}

// Upsert by (sport_id, user_id) -- a student has one lineup slot per sport.
async function upsertLineupEntry({ sportId, departmentId, userId, position }) {
  const { data: existing } = await supabase
    .from("lineups")
    .select("*")
    .eq("sport_id", sportId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("lineups")
      .update({ department_id: departmentId, position: position || "" })
      .eq("id", existing.id)
      .select()
      .single();
    must(error, "updating lineup entry");
    return mapLineup(data);
  }

  const row = { id: newId("lineup"), sport_id: sportId, department_id: departmentId, user_id: userId, position: position || "" };
  const { data, error } = await supabase.from("lineups").insert(row).select().single();
  must(error, "creating lineup entry");
  return mapLineup(data);
}

async function deleteLineupEntry(id) {
  const { error } = await supabase.from("lineups").delete().eq("id", id);
  must(error, "removing lineup entry");
}

// ---------------- standings ----------------
async function sportStandings(sportId) {
  const [{ data: depts, error: deptErr }, { data: finals, error: matchErr }] = await Promise.all([
    supabase.from("departments").select("id"),
    supabase.from("matches").select("*").eq("sport_id", sportId).eq("status", "final"),
  ]);
  must(deptErr, "loading departments for standings");
  must(matchErr, "loading final matches for standings");

  const table = {};
  depts.forEach((d) => (table[d.id] = { departmentId: d.id, w: 0, l: 0, d: 0, pts: 0 }));
  finals.forEach((m) => {
    const a = table[m.department_a];
    const b = table[m.department_b];
    if (!a || !b) return;
    if (m.score_a > m.score_b) { a.w++; b.l++; a.pts += 3; }
    else if (m.score_b > m.score_a) { b.w++; a.l++; b.pts += 3; }
    else { a.d++; b.d++; a.pts += 1; b.pts += 1; }
  });
  return Object.values(table).sort((x, y) => y.pts - x.pts);
}

async function overallStandings() {
  const sports = await listSports();
  const { data: depts, error } = await supabase.from("departments").select("id");
  must(error, "loading departments for overall standings");

  const totals = {};
  depts.forEach((d) => (totals[d.id] = 0));
  for (const s of sports) {
    const rows = await sportStandings(s.id);
    rows.forEach((row) => { totals[row.departmentId] = (totals[row.departmentId] || 0) + row.pts; });
  }
  return Object.entries(totals)
    .map(([departmentId, pts]) => ({ departmentId, pts }))
    .sort((a, b) => b.pts - a.pts);
}

module.exports = {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listSports, createSport, updateSport, deleteSport, countActiveRegistrations,
  getUserByEmail, getUserById, createStudent,
  createAdmin, listUsersByRole, deleteUser, updateUserPassword,updateUserEmail,
  createPasswordResetRequest, listPasswordResetRequests, getPasswordResetRequestById, resolvePasswordResetRequest,
  listRegistrations, listRegistrationsForUser, findRegistration, getRegistrationById,
  createRegistration, updateRegistrationStatus, deleteRegistration,
  listMatches, createMatch, updateMatch, updateMatchPeriod, setMatchClock, setMatchCurrentPeriod, deleteMatch,
  listLineupsForSport, upsertLineupEntry, deleteLineupEntry,
  sportStandings, overallStandings,
};
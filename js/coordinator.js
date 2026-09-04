const user = requireRole(["coordinator", "admin"]);
const isSuperadmin = user && user.role === "coordinator";

const SWATCHES = ["#FF4655", "#3ED089", "#4EA8FF", "#FFC145", "#B98EFF", "#FF8A5C", "#5CD6D6", "#FF6FB5"];

let sports = [];
let departments = [];
let matches = [];
let registrations = [];
let admins = [];
let resetRequests = [];
let liveSportFilter = "all";
let regSportFilter = "all";
let regStatusFilter = "pending";
let standingsSportId = null;
let rosterSportId = null;
let rosterLineups = [];
let rosterTeamA = null;
let rosterTeamB = null;

const deptById = () => Object.fromEntries(departments.map((d) => [d.id, d]));
const sportById = () => Object.fromEntries(sports.map((s) => [s.id, s]));

document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("myAccountBtn").addEventListener("click", openChangePasswordModal);

document.getElementById("roleLabel").textContent = isSuperadmin ? "PanPacific Sports · Superadmin" : "PanPacific Sports · Admin";
document.getElementById("dashTitle").textContent = isSuperadmin ? "COORDINATOR" : "ADMIN";
if (isSuperadmin) document.getElementById("usersTabBtn").style.display = "";

async function boot() {
  if (!user) return;
  try {
    await refreshAll();
    renderAll();
  } catch (e) {
    document.querySelector(".app-shell").insertAdjacentHTML("afterbegin", `<div class="error-text">${e.message}</div>`);
  }
}

async function refreshAll() {
  const calls = [
    api("/sports"),
    api("/departments"),
    api("/matches"),
    api("/registrations"),
  ];
  if (isSuperadmin) {
    calls.push(api("/users/admins"));
    calls.push(api("/users/password-reset-requests?status=pending"));
  }
  const results = await Promise.all(calls);
  sports = results[0].sports;
  departments = results[1].departments;
  matches = results[2].matches;
  registrations = results[3].registrations;
  if (isSuperadmin) {
    admins = results[4].admins;
    resetRequests = results[5].requests;
  }
  if (!standingsSportId && sports.length) standingsSportId = sports[0].id;
}

function renderAll() {
  renderOverallPoints();
  renderLiveTab();
  renderRegistrationsTab();
  renderRostersTab();
  renderStandingsTab();
  renderSetupTab();
  if (isSuperadmin) renderUsersTab();
}

// ---------------- tabs ----------------
document.querySelectorAll(".tabs .tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs .tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    ["live", "registrations", "rosters", "standings", "setup", "users"].forEach((t) => {
      document.getElementById("tab-" + t).style.display = t === btn.dataset.tab ? "block" : "none";
    });
  });
});

// ---------------- overall points ----------------
async function renderOverallPoints() {
  const { overall } = await api("/standings/overall");
  const max = Math.max(1, ...overall.map((o) => o.pts));
  const dmap = deptById();
  document.getElementById("overallPoints").innerHTML = overall.map((row, i) => {
    const d = dmap[row.departmentId];
    if (!d) return "";
    return `
      <div class="points-row">
        <div class="points-rank display">${i + 1}</div>
        <div class="points-name">${d.name}</div>
        <div class="points-track"><div class="points-fill" style="width:${(row.pts / max) * 100}%; background:${d.color};"></div></div>
        <div class="points-val mono" style="color:${d.color};">${row.pts}</div>
      </div>`;
  }).join("");
}

// ================= LIVE & SCHEDULE =================
function renderLiveTab() {
  const el = document.getElementById("tab-live");
  const dmap = deptById();
  const smap = sportById();

  const chips = [`<button class="chip ${liveSportFilter === "all" ? "active" : ""}" data-filter="all">All sports</button>`]
    .concat(sports.map((s) => `<button class="chip ${liveSportFilter === s.id ? "active" : ""}" data-filter="${s.id}">${sportIconHtml(s.emoji)} ${s.name}</button>`))
    .concat([`<button class="chip" id="scheduleMatchBtn" style="border-style:dashed;">+ Schedule match</button>`])
    .join("");

  const visible = matches
    .filter((m) => liveSportFilter === "all" || m.sportId === liveSportFilter)
    .slice()
    .sort((a, b) => ({ live: 0, scheduled: 1, final: 2 }[a.status] - { live: 0, scheduled: 1, final: 2 }[b.status]));

  const cardsHtml = visible.length === 0
    ? `<div class="empty-box">No matches yet — schedule one to get started.</div>`
    : visible.map((m) => matchCardHtml(m, smap[m.sportId], dmap[m.departmentA], dmap[m.departmentB])).join("");

  el.innerHTML = `<div class="chip-row">${chips}</div>${cardsHtml}`;

  el.querySelectorAll("[data-filter]").forEach((btn) => btn.addEventListener("click", () => {
    liveSportFilter = btn.dataset.filter;
    renderLiveTab();
  }));
  const scheduleBtn = document.getElementById("scheduleMatchBtn");
  if (scheduleBtn) scheduleBtn.addEventListener("click", openScheduleMatchModal);

  el.querySelectorAll("[data-period-score]").forEach((btn) => btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    const [matchId, periodIndex, side, delta] = btn.dataset.periodScore.split("|");
    const match = matches.find((x) => x.id === matchId);
    const period = (match.periodScores && match.periodScores[periodIndex]) || { a: 0, b: 0 };
    const field = side === "A" ? "a" : "b";
    const newVal = Math.max(0, (period[field] || 0) + Number(delta));
    btn.disabled = true;
    try {
      const { match: updated } = await api(`/matches/${matchId}/periods/${periodIndex}`, { method: "PATCH", body: { [field]: newVal } });
      const idx = matches.findIndex((x) => x.id === matchId);
      matches[idx] = updated;
      renderLiveTab();
    } catch (e) { alert(e.message); btn.disabled = false; }
  }));

  el.querySelectorAll("[data-expand]").forEach((btn) => btn.addEventListener("click", () => openScoreboard(btn.dataset.expand)));
  el.querySelectorAll("[data-editmatch]").forEach((btn) => btn.addEventListener("click", () => openEditMatchModal(btn.dataset.editmatch)));
  el.querySelectorAll("[data-start]").forEach((btn) => btn.addEventListener("click", () => updateMatchStatus(btn.dataset.start, "live")));
  el.querySelectorAll("[data-finalize]").forEach((btn) => btn.addEventListener("click", () => updateMatchStatus(btn.dataset.finalize, "final")));
  el.querySelectorAll("[data-delmatch]").forEach((btn) => btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    if (!confirm("Delete this match?")) return;
    btn.disabled = true;
    try {
      await api("/matches/" + btn.dataset.delmatch, { method: "DELETE" });
      matches = matches.filter((m) => m.id !== btn.dataset.delmatch);
      renderLiveTab();
      renderStandingsTab();
      renderOverallPoints();
    } catch (e) { alert(e.message); btn.disabled = false; }
  }));
}

async function updateMatchStatus(matchId, status) {
  try {
    const { match } = await api("/matches/" + matchId, { method: "PATCH", body: { status } });
    const idx = matches.findIndex((m) => m.id === matchId);
    matches[idx] = match;
    renderLiveTab();
    renderStandingsTab();
    renderOverallPoints();
  } catch (e) { alert(e.message); }
}

function matchCardHtml(m, sport, a, b) {
  if (!sport || !a || !b) return "";
  const isLive = m.status === "live";
  const isFinal = m.status === "final";
  const statusHtml = isLive
    ? `<span class="status-live"><span class="live-dot"></span>LIVE</span>`
    : isFinal ? `<span class="status-final">FINAL</span>` : `<span class="status-scheduled">SCHEDULED</span>`;

  const actions = !isFinal ? `
    <div class="match-actions">
      ${m.status === "scheduled" ? `<button class="action-btn" data-start="${m.id}">▶ Start match</button>` : ""}
      ${isLive ? `<button class="action-btn green" data-finalize="${m.id}">🏁 Finalize</button>` : ""}
    </div>` : "";

  const periodCount = sport.periodCount || 1;
  const periods = (m.periodScores && m.periodScores.length ? m.periodScores : Array.from({ length: periodCount }, () => ({ a: 0, b: 0 })));
  const periodLabel = sport.periodLabel || "Match";

  const periodsHtml = !isFinal ? `
    <div class="period-row">
      ${periods.map((p, i) => `
        <div class="period-cell">
          <div class="period-label">${periodLabel}${periods.length > 1 ? " " + (i + 1) : ""}</div>
          <div class="period-scores">
            <button data-period-score="${m.id}|${i}|A|-1">−</button>
            <span style="color:${a.color}; min-width:16px;">${p.a || 0}</span>
            <button data-period-score="${m.id}|${i}|A|1">+</button>
          </div>
          <div class="period-scores" style="margin-top:4px;">
            <button data-period-score="${m.id}|${i}|B|-1">−</button>
            <span style="color:${b.color}; min-width:16px;">${p.b || 0}</span>
            <button data-period-score="${m.id}|${i}|B|1">+</button>
          </div>
        </div>`).join("")}
    </div>` : "";

  return `
    <div class="match-card ${isLive ? "live" : ""}">
      <div class="match-meta">
        <div class="match-meta-left">
          <span>${sportIconHtml(sport.emoji)} ${sport.name}</span>
          ${m.venue ? `<span>· ${m.venue}</span>` : ""}
          ${m.time ? `<span>· ${m.time}</span>` : ""}
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${statusHtml}
          <button class="icon-btn" data-expand="${m.id}" title="Expand scoreboard">⛶</button>
          <button class="icon-btn" data-editmatch="${m.id}" title="Edit venue/time">✎</button>
          <button class="icon-btn" data-delmatch="${m.id}" title="Delete match">🗑</button>
        </div>
      </div>
      <div class="match-teams">
        <div class="team-block">
          <div class="team-info">
            <div class="team-name-row"><span class="dot" style="background:${a.color}"></span><span class="label">${a.name}</span></div>
          </div>
          <div class="score-num" style="color:${a.color};">${sevenSegNumberHtml(m.scoreA)}</div>
        </div>
        <div class="vs-label display">VS</div>
        <div class="team-block right">
          <div class="team-info right">
            <div class="team-name-row"><span class="label">${b.name}</span><span class="dot" style="background:${b.color}"></span></div>
          </div>
          <div class="score-num" style="color:${b.color};">${sevenSegNumberHtml(m.scoreB)}</div>
        </div>
      </div>
      ${periodsHtml}
      ${actions}
    </div>`;
}

// ================= FULLSCREEN SCOREBOARD =================
const scoreboardRoot = document.getElementById("scoreboardRoot");
let scoreboardActivePeriod = 0;
let scoreboardClockInterval = null;
let scoreboardAutoPausing = false; // guards against firing the auto-pause-at-0:00 call more than once

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// Elapsed seconds right now: if the clock is running, add the time since the
// server-recorded start to the frozen clockSeconds; otherwise just the frozen value.
function liveClockSeconds(m) {
  if (!m.clockRunning || !m.clockStartedAt) return m.clockSeconds || 0;
  const startedAt = new Date(m.clockStartedAt).getTime();
  return (m.clockSeconds || 0) + Math.max(0, (Date.now() - startedAt) / 1000);
}

// null = no time limit for this sport (plain count-up stopwatch, unchanged
// behavior). A positive number switches the scoreboard clock to count down
// from that many minutes instead.
function periodDurationSeconds(sport) {
  return sport && sport.periodMinutes > 0 ? sport.periodMinutes * 60 : null;
}

// What the clock should actually display right now: elapsed time (count-up)
// for sports with no configured duration, or remaining time (count-down,
// clamped to 0) for sports with a periodMinutes set.
function displayClockSeconds(m, sport) {
  const elapsed = liveClockSeconds(m);
  const duration = periodDurationSeconds(sport);
  return duration == null ? elapsed : Math.max(0, duration - elapsed);
}

// The .scoreboard-overlay element is the actual fullscreen element -- once
// requestFullscreen() is called on it, that exact DOM node must stay alive
// or the browser auto-exits fullscreen. So it's built ONCE here; every
// subsequent update (score buttons, period nav) only touches the inner
// #scoreboardContent div, never the outer wrapper.
function openScoreboard(matchId) {
  const m = matches.find((x) => x.id === matchId);
  scoreboardActivePeriod = m ? (m.currentPeriod || 0) : 0; // default to the live quarter/set/half
  scoreboardAutoPausing = false;

  scoreboardRoot.innerHTML = `
    <div class="scoreboard-overlay">
      <button class="pill-btn scoreboard-exit" id="scoreboardExit">✕ Exit</button>
      <div id="scoreboardContent"></div>
    </div>`;
  document.getElementById("scoreboardExit").addEventListener("click", closeScoreboard);

  renderScoreboardContent(matchId);

  if (scoreboardClockInterval) clearInterval(scoreboardClockInterval);
  scoreboardClockInterval = setInterval(() => {
    const current = matches.find((x) => x.id === matchId);
    if (!current) return;
    const sport = sportById()[current.sportId];
    const duration = periodDurationSeconds(sport);

    // Countdown sport hit 0:00 while running -- auto-pause it server-side so
    // the frozen time is correct, then re-render to show "Time's Up" state.
    if (duration != null && current.clockRunning && liveClockSeconds(current) >= duration && !scoreboardAutoPausing) {
      scoreboardAutoPausing = true;
      adjustScoreboardClock(matchId, "pause").finally(() => { scoreboardAutoPausing = false; });
      return;
    }

    const clockEl = document.getElementById("scoreboardClockTime");
    if (clockEl) clockEl.textContent = formatClock(displayClockSeconds(current, sport));
  }, 1000);

  const el = scoreboardRoot.querySelector(".scoreboard-overlay");
  if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function closeScoreboard() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  scoreboardRoot.innerHTML = "";
  if (scoreboardClockInterval) { clearInterval(scoreboardClockInterval); scoreboardClockInterval = null; }
}

async function adjustScoreboardScore(matchId, side, delta) {
  const btns = scoreboardRoot.querySelectorAll("[data-sb-score]");
  btns.forEach((b) => (b.disabled = true));
  const match = matches.find((x) => x.id === matchId);
  const period = (match.periodScores && match.periodScores[scoreboardActivePeriod]) || { a: 0, b: 0 };
  const field = side === "A" ? "a" : "b";
  const newVal = Math.max(0, (period[field] || 0) + delta);
  try {
    const { match: updated } = await api(`/matches/${matchId}/periods/${scoreboardActivePeriod}`, { method: "PATCH", body: { [field]: newVal } });
    const idx = matches.findIndex((x) => x.id === matchId);
    matches[idx] = updated;
    renderScoreboardContent(matchId); // updates in place, keeps fullscreen alive
    renderLiveTab(); // keep the tab behind the scenes in sync too
  } catch (e) {
    alert(e.message);
    btns.forEach((b) => (b.disabled = false));
  }
}

async function adjustScoreboardClock(matchId, action) {
  const btns = scoreboardRoot.querySelectorAll("[data-sb-clock], [data-sb-live-period-nav]");
  btns.forEach((b) => (b.disabled = true));
  try {
    const { match: updated } = await api(`/matches/${matchId}/clock`, { method: "PATCH", body: { action } });
    const idx = matches.findIndex((x) => x.id === matchId);
    matches[idx] = updated;
    renderScoreboardContent(matchId);
    renderLiveTab();
  } catch (e) {
    alert(e.message);
    btns.forEach((b) => (b.disabled = false));
  }
}

async function advanceScoreboardPeriod(matchId, direction) {
  const btns = scoreboardRoot.querySelectorAll("[data-sb-clock], [data-sb-live-period-nav]");
  btns.forEach((b) => (b.disabled = true));
  try {
    const { match: moved } = await api(`/matches/${matchId}/current-period`, { method: "PATCH", body: { direction } });
    // Starting a new quarter/set/half should start its clock fresh, whether
    // it's a countdown (full duration again) or a plain stopwatch (back to 0:00).
    const { match: updated } = await api(`/matches/${matchId}/clock`, { method: "PATCH", body: { action: "reset" } });
    matches[matches.findIndex((x) => x.id === matchId)] = { ...moved, ...updated };
    scoreboardActivePeriod = updated.currentPeriod || 0; // score buttons follow the live period
    renderScoreboardContent(matchId);
    renderLiveTab();
  } catch (e) {
    alert(e.message);
    btns.forEach((b) => (b.disabled = false));
  }
}

async function finalizeMatchFromScoreboard(matchId) {
  if (!confirm("Finalize this match? This locks in the final score and stops the clock.")) return;

  const btns = scoreboardRoot.querySelectorAll("[data-sb-score], [data-sb-clock], [data-sb-live-period-nav], #sbFinalizeBtn");
  btns.forEach((b) => (b.disabled = true));
  try {
    const m = matches.find((x) => x.id === matchId);
    if (m && m.clockRunning) {
      const { match: paused } = await api(`/matches/${matchId}/clock`, { method: "PATCH", body: { action: "pause" } });
      matches[matches.findIndex((x) => x.id === matchId)] = paused;
    }
    const { match: updated } = await api(`/matches/${matchId}`, { method: "PATCH", body: { status: "final" } });
    matches[matches.findIndex((x) => x.id === matchId)] = updated;
    renderScoreboardContent(matchId);
    renderLiveTab();
    renderStandingsTab();
    renderOverallPoints();
  } catch (e) {
    alert(e.message);
    btns.forEach((b) => (b.disabled = false));
  }
}

// Renders/updates everything BELOW the Exit button. Called on open, on every
// score button click, and on period nav clicks -- always replacing only
// #scoreboardContent's innerHTML, never the fullscreen wrapper itself.
function renderScoreboardContent(matchId) {
  const content = document.getElementById("scoreboardContent");
  if (!content) return; // overlay isn't open (e.g. got closed mid-request)

  const m = matches.find((x) => x.id === matchId);
  if (!m) return closeScoreboard();
  const sport = sportById()[m.sportId];
  const dmap = deptById();
  const a = dmap[m.departmentA];
  const b = dmap[m.departmentB];
  if (!sport || !a || !b) return closeScoreboard();

  const isLive = m.status === "live";
  const isFinal = m.status === "final";
  const statusHtml = isLive
    ? `<span class="status-live"><span class="live-dot"></span>LIVE</span>`
    : isFinal ? `<span class="status-final">FINAL</span>` : `<span class="status-scheduled">SCHEDULED</span>`;

  const periods = m.periodScores || [];
  const periodLabel = sport.periodLabel || "Match";
  const currentPeriod = m.currentPeriod || 0;
  scoreboardActivePeriod = Math.min(Math.max(0, scoreboardActivePeriod), Math.max(0, periods.length - 1));

  const periodsHtml = periods.length > 1 ? `
    <div class="scoreboard-periods">
      ${periods.map((p, i) => `
        <div class="scoreboard-period ${i === scoreboardActivePeriod ? "active" : ""}" data-sb-select-period="${i}">
          <div class="lbl">${periodLabel} ${i + 1}${i === currentPeriod ? ` <span class="live-tag">${isLive ? "● LIVE" : "● CURRENT"}</span>` : ""}</div>
          <div class="vals"><span style="color:${a.color};">${p.a || 0}</span> – <span style="color:${b.color};">${p.b || 0}</span></div>
        </div>`).join("")}
    </div>` : "";

  // Game clock + live-quarter advance -- separate from the period-editing nav
  // above, which is for correcting a past period's score. This is for
  // running the game in real time: pause/resume the clock, and move the
  // "current" quarter/set/half forward (or back) as play progresses.
  const periodDuration = periodDurationSeconds(sport);
  const timeIsUp = periodDuration != null && !m.clockRunning && displayClockSeconds(m, sport) <= 0;

  const clockHtml = !isFinal ? `
    <div class="scoreboard-clock">
      <div class="scoreboard-clock-time ${timeIsUp ? "times-up" : ""}" id="scoreboardClockTime">${formatClock(displayClockSeconds(m, sport))}</div>
      ${timeIsUp ? `<div class="scoreboard-clock-hint">⏱ Time's up for this ${periodLabel.toLowerCase()}</div>` : (periodDuration != null ? `<div class="scoreboard-clock-hint">${sport.periodMinutes} min ${periodLabel.toLowerCase()}</div>` : "")}
      <div class="scoreboard-clock-btns">
        <button class="pill-btn solid" data-sb-clock="${m.clockRunning ? "pause" : "start"}">${m.clockRunning ? "⏸ Pause" : "▶ Start"}</button>
        <button class="pill-btn" data-sb-clock="reset">↺ Reset</button>
      </div>
    </div>
    ${periods.length > 1 ? `
    <div class="scoreboard-period-nav live">
      <button class="icon-btn" id="sbLivePeriodPrev" data-sb-live-period-nav ${currentPeriod === 0 ? "disabled" : ""}>‹</button>
      <span>${isLive ? "LIVE" : "Current"}: ${periodLabel} ${currentPeriod + 1}</span>
      <button class="icon-btn" id="sbLivePeriodNext" data-sb-live-period-nav ${currentPeriod === periods.length - 1 ? "disabled" : ""}>›</button>
    </div>` : ""}
  ` : "";

  // Basketball-style quick-add (1/2/3 points) when the sport is set up in
  // quarters; every other sport just gets a plain +1/-1, since "field goal"
  // and "three-pointer" only make sense for basketball.
  const isBasketballStyle = /quarter/i.test(periodLabel);
  const quickAdds = isBasketballStyle ? [1, 2, 3] : [1];

  const scoreControls = (side) => !isFinal ? `
    <div class="scoreboard-controls">
      <button class="scoreboard-ctrl-btn minus" data-sb-score="${side}|-1">−1</button>
      ${quickAdds.map((n) => `<button class="scoreboard-ctrl-btn plus" data-sb-score="${side}|${n}">+${n}</button>`).join("")}
    </div>` : "";

  content.innerHTML = `
    <div class="scoreboard-sport">${sportIconHtml(sport.emoji)} ${sport.name}${m.venue ? " · " + m.venue : ""}</div>
    <div class="scoreboard-status">${statusHtml}</div>
    ${clockHtml}
    <div class="scoreboard-teams">
      <div class="scoreboard-team">
        <div class="name">${a.name}</div>
        <div class="score" style="color:${a.color};">${sevenSegNumberHtml(m.scoreA)}</div>
        ${scoreControls("A")}
      </div>
      <div class="scoreboard-vs">VS</div>
      <div class="scoreboard-team">
        <div class="name">${b.name}</div>
        <div class="score" style="color:${b.color};">${sevenSegNumberHtml(m.scoreB)}</div>
        ${scoreControls("B")}
      </div>
    </div>
    ${periodsHtml}
    ${!isFinal ? `<div class="scoreboard-finalize"><button class="pill-btn danger" id="sbFinalizeBtn">🏁 Finalize Match</button></div>` : ""}
  `;

  content.querySelectorAll("[data-sb-select-period]").forEach((box) => box.addEventListener("click", () => {
    scoreboardActivePeriod = Number(box.dataset.sbSelectPeriod);
    renderScoreboardContent(matchId);
  }));

  const livePrevBtn = document.getElementById("sbLivePeriodPrev");
  const liveNextBtn = document.getElementById("sbLivePeriodNext");
  if (livePrevBtn) livePrevBtn.addEventListener("click", () => advanceScoreboardPeriod(matchId, "prev"));
  if (liveNextBtn) liveNextBtn.addEventListener("click", () => advanceScoreboardPeriod(matchId, "next"));

  const finalizeBtn = document.getElementById("sbFinalizeBtn");
  if (finalizeBtn) finalizeBtn.addEventListener("click", () => finalizeMatchFromScoreboard(matchId));

  content.querySelectorAll("[data-sb-clock]").forEach((btn) => btn.addEventListener("click", () => {
    adjustScoreboardClock(matchId, btn.dataset.sbClock);
  }));

  content.querySelectorAll("[data-sb-score]").forEach((btn) => btn.addEventListener("click", () => {
    const [side, delta] = btn.dataset.sbScore.split("|");
    adjustScoreboardScore(matchId, side, Number(delta));
  }));
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && scoreboardRoot.innerHTML) scoreboardRoot.innerHTML = "";
});

// ================= REGISTRATIONS =================
function renderRegistrationsTab() {
  const el = document.getElementById("tab-registrations");
  const sportChips = [`<button class="chip ${regSportFilter === "all" ? "active" : ""}" data-regfilter-sport="all">All sports</button>`]
    .concat(sports.map((s) => `<button class="chip ${regSportFilter === s.id ? "active" : ""}" data-regfilter-sport="${s.id}">${sportIconHtml(s.emoji)} ${s.name}</button>`))
    .join("");
  const statusChips = ["pending", "approved", "rejected", "all"].map((st) =>
    `<button class="chip ${regStatusFilter === st ? "active" : ""}" data-regfilter-status="${st}">${st[0].toUpperCase() + st.slice(1)}</button>`
  ).join("");

  const visible = registrations.filter((r) =>
    (regSportFilter === "all" || r.sportId === regSportFilter) &&
    (regStatusFilter === "all" || r.status === regStatusFilter)
  );

  const rowsHtml = visible.length === 0
    ? `<div class="empty-box">No registrations match this filter.</div>`
    : `<div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th style="width:34%;">Student</th><th style="width:18%;">Sport</th><th style="width:18%;">Team</th><th style="width:14%;">Status</th><th style="width:16%;"></th></tr>
          </thead>
          <tbody>
            ${visible.map((r) => `
              <tr>
                <td>
                  <div class="name">${r.studentName}</div>
                  <div class="meta">${r.studentIdNumber || "—"}</div>
                </td>
                <td>${r.sportName}</td>
                <td>${r.departmentName}</td>
                <td><span class="status-badge ${r.status}">${r.status}</span></td>
                <td class="actions">
                  ${r.status !== "approved" ? `<button class="pill-btn solid" data-reg-action="${r.id}|approved">Approve</button>` : ""}
                  ${r.status !== "rejected" ? `<button class="pill-btn danger" data-reg-action="${r.id}|rejected">Reject</button>` : ""}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

  el.innerHTML = `<div class="chip-row">${sportChips}</div><div class="chip-row">${statusChips}</div>${rowsHtml}`;

  el.querySelectorAll("[data-regfilter-sport]").forEach((b) => b.addEventListener("click", () => { regSportFilter = b.dataset.regfilterSport; renderRegistrationsTab(); }));
  el.querySelectorAll("[data-regfilter-status]").forEach((b) => b.addEventListener("click", () => { regStatusFilter = b.dataset.regfilterStatus; renderRegistrationsTab(); }));
  el.querySelectorAll("[data-reg-action]").forEach((b) => b.addEventListener("click", async () => {
    if (b.disabled) return;
    const [id, status] = b.dataset.regAction.split("|");
    const row = b.closest("tr");
    row.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
    try {
      const { registration } = await api("/registrations/" + id, { method: "PATCH", body: { status } });
      const idx = registrations.findIndex((r) => r.id === id);
      registrations[idx] = registration;
      renderRegistrationsTab();
    } catch (e) {
      alert(e.message);
      row.querySelectorAll("button").forEach((btn) => (btn.disabled = false));
    }
  }));
}

// ================= ROSTERS & LINEUPS =================
async function renderRostersTab() {
  const el = document.getElementById("tab-rosters");
  if (sports.length === 0) {
    el.innerHTML = `<div class="empty-box">Add a sport first to see rosters.</div>`;
    return;
  }
  if (!rosterSportId || !sports.find((s) => s.id === rosterSportId)) rosterSportId = sports[0].id;
  const sport = sports.find((s) => s.id === rosterSportId);

  el.innerHTML = `
    <div class="field" style="max-width:260px;">
      <select id="rosterSportSelect">
        ${sports.map((s) => `<option value="${s.id}" ${s.id === rosterSportId ? "selected" : ""}>${s.name}</option>`).join("")}
      </select>
    </div>
    <div id="rosterBody"><div class="loading-row">Loading roster…</div></div>`;

  document.getElementById("rosterSportSelect").addEventListener("change", (e) => {
    rosterSportId = e.target.value;
    rosterTeamA = null; rosterTeamB = null; // reset pairing, sport just changed
    renderRostersTab();
  });

  try {
    const { lineups } = await api("/lineups?sportId=" + rosterSportId);
    rosterLineups = lineups;
  } catch (e) {
    document.getElementById("rosterBody").innerHTML = `<div class="error-text">${e.message}</div>`;
    return;
  }

  const approved = registrations.filter((r) => r.sportId === rosterSportId && r.status === "approved");
  const byDept = {};
  approved.forEach((r) => {
    (byDept[r.departmentId] = byDept[r.departmentId] || []).push(r);
  });

  const dmap = deptById();
  const lineupByUser = Object.fromEntries(rosterLineups.map((l) => [l.userId, l]));
  const deptIds = Object.keys(byDept);

  const body = document.getElementById("rosterBody");
  if (deptIds.length === 0) {
    body.innerHTML = `<div class="empty-box">No approved registrations for ${sportIconHtml(sport.emoji)} ${sport.name} yet. Approve students in the Registrations tab first.</div>`;
    return;
  }
  if (deptIds.length < 2) {
    body.innerHTML = `<div class="empty-box">Only one team has approved registrations for ${sportIconHtml(sport.emoji)} ${sport.name} so far — need at least two teams to build a side-by-side pairing.</div>`;
    return;
  }

  // Default the pairing: prefer an actual scheduled/live match for this sport
  // between two teams that both have approved rosters; otherwise just the
  // first two teams with approved registrations.
  if (!rosterTeamA || !deptIds.includes(rosterTeamA) || !rosterTeamB || !deptIds.includes(rosterTeamB) || rosterTeamA === rosterTeamB) {
    const candidateMatch = matches.find((m) =>
      m.sportId === rosterSportId && deptIds.includes(m.departmentA) && deptIds.includes(m.departmentB) && m.status !== "final"
    ) || matches.find((m) => m.sportId === rosterSportId && deptIds.includes(m.departmentA) && deptIds.includes(m.departmentB));
    if (candidateMatch) {
      rosterTeamA = candidateMatch.departmentA;
      rosterTeamB = candidateMatch.departmentB;
    } else {
      rosterTeamA = deptIds[0];
      rosterTeamB = deptIds[1];
    }
  }

  const positionOptions = (sport.positions && sport.positions.length ? sport.positions : []);

  const renderTeamColumn = (deptId) => {
    const d = dmap[deptId];
    const students = byDept[deptId] || [];
    return `
      <div class="roster-column">
        <div class="roster-group-head"><span class="dot" style="background:${d.color}"></span>${d.name} <span style="color:var(--muted); font-weight:400;">(${students.length}${sport.maxMembers ? "/" + sport.maxMembers : ""})</span></div>
        ${students.length === 0 ? `<div class="empty-box" style="padding:14px;">No approved students yet.</div>` : `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th style="width:40%;">Player</th><th style="width:18%;">ID</th><th style="width:42%;">Position</th></tr></thead>
            <tbody>
              ${students.map((r) => {
                const lineup = lineupByUser[r.userId];
                const currentPos = lineup ? lineup.position : "";
                const opts = ["", ...positionOptions];
                return `
                  <tr>
                    <td class="name">${r.studentName}</td>
                    <td class="meta">${r.studentIdNumber || "—"}</td>
                    <td>
                      ${positionOptions.length
                        ? `<select data-lineup="${rosterSportId}|${deptId}|${r.userId}">
                            ${opts.map((p) => `<option value="${p}" ${p === currentPos ? "selected" : ""}>${p || "No position set"}</option>`).join("")}
                          </select>`
                        : `<input type="text" data-lineup-text="${rosterSportId}|${deptId}|${r.userId}" value="${currentPos}">`}
                    </td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`}
      </div>`;
  };

  body.innerHTML = `
    <div class="roster-pairing">
      <select id="rosterTeamASelect">
        ${deptIds.map((id) => `<option value="${id}" ${id === rosterTeamA ? "selected" : ""} ${id === rosterTeamB ? "disabled" : ""}>${dmap[id].name}</option>`).join("")}
      </select>
      <span class="roster-pairing-vs">vs</span>
      <select id="rosterTeamBSelect">
        ${deptIds.map((id) => `<option value="${id}" ${id === rosterTeamB ? "selected" : ""} ${id === rosterTeamA ? "disabled" : ""}>${dmap[id].name}</option>`).join("")}
      </select>
    </div>
    ${positionOptions.length === 0 ? `<div class="empty-box" style="padding:14px; margin-bottom:16px; text-align:left;">This sport has no position list yet — add one by editing ${sport.name} in the Teams & Sports tab, or just type free-text positions below.</div>` : ""}
    <div class="roster-columns">
      ${renderTeamColumn(rosterTeamA)}
      ${renderTeamColumn(rosterTeamB)}
    </div>`;

  document.getElementById("rosterTeamASelect").addEventListener("change", (e) => {
    rosterTeamA = e.target.value;
    renderRostersTab();
  });
  document.getElementById("rosterTeamBSelect").addEventListener("change", (e) => {
    rosterTeamB = e.target.value;
    renderRostersTab();
  });

  body.querySelectorAll("[data-lineup]").forEach((sel) => sel.addEventListener("change", async () => {
    const [sportId, departmentId, userId] = sel.dataset.lineup.split("|");
    await saveLineup(sel, sportId, departmentId, userId, sel.value);
  }));
  body.querySelectorAll("[data-lineup-text]").forEach((inp) => inp.addEventListener("change", async () => {
    const [sportId, departmentId, userId] = inp.dataset.lineupText.split("|");
    await saveLineup(inp, sportId, departmentId, userId, inp.value.trim());
  }));
}

async function saveLineup(inputEl, sportId, departmentId, userId, position) {
  inputEl.disabled = true;
  try {
    await api("/lineups", { method: "PUT", body: { sportId, departmentId, userId, position } });
  } catch (e) {
    alert(e.message);
  }
  inputEl.disabled = false;
}

// ================= STANDINGS =================
async function renderStandingsTab() {
  const el = document.getElementById("tab-standings");
  if (sports.length === 0) {
    el.innerHTML = `<div class="empty-box">Add a sport first to see standings.</div>`;
    return;
  }
  if (!standingsSportId) standingsSportId = sports[0].id;
  el.innerHTML = `
    <div class="field" style="max-width:220px;">
      <select id="standingsSportSelect">
        ${sports.map((s) => `<option value="${s.id}" ${s.id === standingsSportId ? "selected" : ""}>${s.name}</option>`).join("")}
      </select>
    </div>
    <div id="standingsTable"></div>`;
  document.getElementById("standingsSportSelect").addEventListener("change", (e) => {
    standingsSportId = e.target.value;
    loadStandingsTable();
  });
  await loadStandingsTable();
}

async function loadStandingsTable() {
  const { standings } = await api("/standings/sport/" + standingsSportId);
  const dmap = deptById();
  document.getElementById("standingsTable").innerHTML = `
    <div class="standings-table">
      <div class="standings-row head"><div>Team</div><div class="center">W</div><div class="center">L</div><div class="center">D</div><div class="right">Pts</div></div>
      ${standings.map((row, i) => {
        const d = dmap[row.departmentId];
        if (!d) return "";
        return `
          <div class="standings-row">
            <div class="standings-team"><span class="standings-rank display">${i + 1}</span><span class="dot" style="background:${d.color}"></span><span class="name">${d.name}</span></div>
            <div class="center mono">${row.w}</div>
            <div class="center mono">${row.l}</div>
            <div class="center mono">${row.d}</div>
            <div class="right mono" style="color:var(--gold); font-weight:700;">${row.pts}</div>
          </div>`;
      }).join("")}
    </div>`;
}

// ================= SETUP (teams & sports) =================
function renderSetupTab() {
  const el = document.getElementById("tab-setup");
  el.innerHTML = `
    <div style="margin-bottom:28px;">
      <div class="section-label" style="justify-content:space-between; display:flex;">
        <span>Sports</span>
        <button class="pill-btn" id="addSportBtn" style="padding:4px 10px; font-size:12px;">+ Add sport</button>
      </div>
      <div id="sportsList"></div>
    </div>
    <div style="margin-bottom:28px;">
      <div class="section-label" style="justify-content:space-between; display:flex;">
        <span>Teams (departments)</span>
        <button class="pill-btn" id="addDeptBtn" style="padding:4px 10px; font-size:12px;">+ Add team</button>
      </div>
      <div id="deptsList"></div>
    </div>
    <button class="pill-btn danger" id="resetAllBtn">↺ Reset all data</button>
  `;

  document.getElementById("sportsList").innerHTML = sports.map((s) => `
    <span class="list-chip">${sportIconHtml(s.emoji)} ${s.name}
      <span style="color:var(--muted); font-size:11px;">${s.maxMembers ? `(${s.maxMembers} max)` : ""}</span>
      <button data-edit-sport="${s.id}" title="Edit">✎</button>
      <button data-del-sport="${s.id}" title="Delete">✕</button>
    </span>`).join("") || `<span style="color:var(--muted); font-size:13px;">No sports yet.</span>`;

  document.getElementById("deptsList").innerHTML = departments.map((d) => `
    <span class="list-chip"><span class="dot" style="background:${d.color}"></span>${d.name}
      <button data-edit-dept="${d.id}" title="Edit">✎</button>
      <button data-del-dept="${d.id}" title="Delete">✕</button>
    </span>`).join("") || `<span style="color:var(--muted); font-size:13px;">No teams yet.</span>`;

  document.getElementById("addSportBtn").addEventListener("click", openAddSportModal);
  document.getElementById("addDeptBtn").addEventListener("click", openAddDeptModal);

  el.querySelectorAll("[data-edit-sport]").forEach((b) => b.addEventListener("click", () => openEditSportModal(b.dataset.editSport)));
  el.querySelectorAll("[data-edit-dept]").forEach((b) => b.addEventListener("click", () => openEditDeptModal(b.dataset.editDept)));

  el.querySelectorAll("[data-del-sport]").forEach((b) => b.addEventListener("click", async () => {
    if (b.disabled) return;
    if (!confirm("Delete this sport? Its matches and registrations will be removed too.")) return;
    b.disabled = true;
    try {
      await api("/sports/" + b.dataset.delSport, { method: "DELETE" });
      await refreshAll();
      renderAll();
    } catch (e) { alert(e.message); b.disabled = false; }
  }));
  el.querySelectorAll("[data-del-dept]").forEach((b) => b.addEventListener("click", async () => {
    if (b.disabled) return;
    if (!confirm("Delete this team?")) return;
    b.disabled = true;
    try {
      await api("/departments/" + b.dataset.delDept, { method: "DELETE" });
      await refreshAll();
      renderAll();
    } catch (e) { alert(e.message); b.disabled = false; }
  }));

  document.getElementById("resetAllBtn").addEventListener("click", () => {
    alert("To fully reset, stop the server and delete backend/data/db.json, then restart. This keeps the dashboard safe from accidental wipes.");
  });
}

// ================= MODALS =================
const modalRoot = document.getElementById("modalRoot");
function closeModal() { modalRoot.innerHTML = ""; }

// A sport's "emoji" field now stores a Font Awesome icon name (e.g. "fa-basketball")
// rather than an actual emoji character. sportIconHtml() stays backward-compatible:
// any sport created before this feature still has a real emoji character saved,
// so it just renders that character as-is until the coordinator re-picks an icon.
function sportIconHtml(icon) {
  if (!icon) return "";
  return icon.startsWith("fa-") ? `<i class="fa-solid ${icon}"></i>` : icon;
}

// A curated set of Font Awesome Free icons that actually look like sports/games,
// shown as a clickable picker instead of making people type CSS class names.
const SPORT_ICON_OPTIONS = [
  "fa-basketball", "fa-volleyball", "fa-futbol", "fa-football",
  "fa-baseball", "fa-table-tennis-paddle-ball", "fa-person-running", "fa-person-swimming",
  "fa-dumbbell", "fa-chess", "fa-golf-ball-tee", "fa-bowling-ball",
  "fa-hockey-puck", "fa-medal", "fa-trophy",
];

const PERIOD_PRESETS = [
  { label: "Basketball (4 Quarters)", icon: "fa-basketball", periodLabel: "Quarter", periodCount: 4, periodMinutes: 10, positions: ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"] },
  { label: "Volleyball (Best of 5 Sets)", icon: "fa-volleyball", periodLabel: "Set", periodCount: 5, periodMinutes: 0, positions: ["Setter", "Outside Hitter", "Opposite Hitter", "Middle Blocker", "Libero"] },
  { label: "Football/Soccer (2 Halves)", icon: "fa-futbol", periodLabel: "Half", periodCount: 2, periodMinutes: 45, positions: ["Goalkeeper", "Defender", "Midfielder", "Forward"] },
  { label: "Single match/game", icon: "fa-trophy", periodLabel: "Match", periodCount: 1, periodMinutes: 0, positions: [] },
];

function periodPresetChips(prefix) {
  return `<div class="chip-row" style="margin-top:-4px;">
    ${PERIOD_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${prefix}|${i}">${p.label}</button>`).join("")}
  </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Positions are shown as checkboxes rather than a comma-separated text field,
// so picking a sport preset gives real click-to-select options instead of
// needing to type/remember spellings for every sport.
// modalPositionOptions: [{ label, checked }], rebuilt whenever a preset chip
// is clicked (replacing the list wholesale) or a custom position is added
// (appended to whatever's currently checked in the DOM).
let modalPositionOptions = [];

function buildPositionOptions(canonicalList, currentPositions) {
  const current = currentPositions || [];
  const options = canonicalList.map((label) => ({ label, checked: current.includes(label) }));
  current.forEach((label) => {
    if (!canonicalList.includes(label)) options.push({ label, checked: true }); // a saved custom position not in the canonical list
  });
  return options;
}

function renderPositionsChecklist() {
  const container = document.getElementById("m_positionsContainer");
  if (!container) return;
  container.innerHTML = modalPositionOptions.length === 0
    ? `<div class="empty-box" style="padding:10px 14px; text-align:left; font-size:12px; margin-bottom:8px;">Pick a sport preset above, or add a position by name below.</div>`
    : `<div class="chip-row" id="m_positionsList">
        ${modalPositionOptions.map((o, i) => `
          <label class="chip-checkbox">
            <input type="checkbox" data-pos-index="${i}" ${o.checked ? "checked" : ""}>
            ${escapeHtml(o.label)}
          </label>`).join("")}
      </div>`;
  container.querySelectorAll("[data-pos-index]").forEach((cb) => cb.addEventListener("change", () => {
    modalPositionOptions[Number(cb.dataset.posIndex)].checked = cb.checked;
  }));
}

function wireCustomPositionAdd(inputId, addBtnId) {
  document.getElementById(addBtnId).addEventListener("click", () => {
    const input = document.getElementById(inputId);
    const label = input.value.trim();
    if (!label) return;
    if (!modalPositionOptions.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      modalPositionOptions.push({ label, checked: true });
      renderPositionsChecklist();
    }
    input.value = "";
    input.focus();
  });
  document.getElementById(inputId).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById(addBtnId).click(); }
  });
}

function selectedPositions() {
  return modalPositionOptions.filter((o) => o.checked).map((o) => o.label);
}

function positionsFieldHtml() {
  return `
    <div class="field">
      <label>Positions</label>
      <div id="m_positionsContainer"></div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="m_positionCustom" placeholder="Add a position…" style="flex:1; background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px; font-size:13px;">
        <button type="button" class="pill-btn" id="m_positionCustomAdd">+ Add</button>
      </div>
    </div>`;
}

function wirePresetChips(prefix) {
  document.querySelectorAll(`[data-preset^="${prefix}|"]`).forEach((btn) => btn.addEventListener("click", () => {
    const preset = PERIOD_PRESETS[Number(btn.dataset.preset.split("|")[1])];
    document.getElementById("m_periodLabel").value = preset.periodLabel;
    document.getElementById("m_periodCount").value = preset.periodCount;
    document.getElementById("m_periodMinutes").value = preset.periodMinutes || "";
    modalPositionOptions = preset.positions.map((label) => ({ label, checked: true }));
    renderPositionsChecklist();
    modalSelectedIcon = preset.icon;
    renderIconPicker();
  }));
}

// Icon picker: a grid of curated Font Awesome icons the coordinator clicks
// instead of typing a class name, plus a text fallback for anything not in
// the curated list (any Font Awesome Free "solid" icon name works there).
let modalSelectedIcon = "fa-trophy";

function iconPickerFieldHtml() {
  return `
    <div class="field">
      <label>Icon</label>
      <div class="icon-picker" id="m_iconPicker"></div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <input type="text" id="m_iconCustom" placeholder="Or type any Font Awesome icon name (e.g. fa-chess-king)" style="flex:1; background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 10px; font-size:13px;">
        <button type="button" class="pill-btn" id="m_iconCustomUse">Use</button>
      </div>
    </div>`;
}

function renderIconPicker() {
  const el = document.getElementById("m_iconPicker");
  if (!el) return;
  el.innerHTML = SPORT_ICON_OPTIONS.map((icon) => `
    <button type="button" class="icon-pick-btn ${icon === modalSelectedIcon ? "active" : ""}" data-icon="${icon}" title="${icon}">
      <i class="fa-solid ${icon}"></i>
    </button>`).join("");
  el.querySelectorAll("[data-icon]").forEach((btn) => btn.addEventListener("click", () => {
    modalSelectedIcon = btn.dataset.icon;
    renderIconPicker();
  }));
}

function wireCustomIconUse(inputId, btnId) {
  document.getElementById(btnId).addEventListener("click", () => {
    const input = document.getElementById(inputId);
    let val = input.value.trim();
    if (!val) return;
    if (!val.startsWith("fa-")) val = "fa-" + val;
    modalSelectedIcon = val;
    renderIconPicker();
    input.value = "";
  });
  document.getElementById(inputId).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById(btnId).click(); }
  });
}

function openAddSportModal() {
  modalSelectedIcon = "fa-trophy";
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:560px;">
        <div class="modal-head"><h3>Add sport</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Name</label><input type="text" id="m_name" style="background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px; width:100%;"></div>
        <div class="field"><label>Players per team</label><input type="number" id="m_teamSize" value="5" min="1"></div>
        <div class="field"><label>Max total registrations (optional)</label><input type="number" id="m_maxMembers" min="1" placeholder="Leave blank for unlimited"></div>
        <div class="field"><label>Quick scoring presets</label>${periodPresetChips("add")}</div>
        <div class="grid-2" style="margin-bottom:14px;">
          <div class="field" style="margin-bottom:0;"><label>Period label</label><input type="text" id="m_periodLabel" value="Match"></div>
          <div class="field" style="margin-bottom:0;"><label># of periods</label><input type="number" id="m_periodCount" value="1" min="1"></div>
        </div>
        <div class="field"><label>Minutes per period (optional — leave blank for no time limit)</label><input type="number" id="m_periodMinutes" min="1"></div>
        ${iconPickerFieldHtml()}
        ${positionsFieldHtml()}
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Add sport</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  renderIconPicker();
  wireCustomIconUse("m_iconCustom", "m_iconCustomUse");
  modalPositionOptions = [];
  renderPositionsChecklist();
  wireCustomPositionAdd("m_positionCustom", "m_positionCustomAdd");
  wirePresetChips("add");
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const name = document.getElementById("m_name").value.trim();
    if (!name) return;
    const maxVal = document.getElementById("m_maxMembers").value;
    const positions = selectedPositions();
    btn.disabled = true;
    try {
      await api("/sports", {
        method: "POST",
        body: {
          name,
          emoji: modalSelectedIcon,
          teamSize: Number(document.getElementById("m_teamSize").value) || 1,
          maxMembers: maxVal ? Number(maxVal) : null,
          positions,
          periodLabel: document.getElementById("m_periodLabel").value || "Match",
          periodCount: Number(document.getElementById("m_periodCount").value) || 1,
          periodMinutes: document.getElementById("m_periodMinutes").value ? Number(document.getElementById("m_periodMinutes").value) : 0,
        },
      });
      closeModal();
      await refreshAll();
      renderAll();
    } catch (e) { alert(e.message); btn.disabled = false; }
  });
}

function openEditSportModal(sportId) {
  const sport = sports.find((s) => s.id === sportId);
  if (!sport) return;
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:560px;">
        <div class="modal-head"><h3>Edit sport</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Name</label><input type="text" id="m_name" value="${sport.name}" style="background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px; width:100%;"></div>
        <div class="field"><label>Players per team</label><input type="number" id="m_teamSize" value="${sport.teamSize}" min="1"></div>
        <div class="field"><label>Max total registrations (optional)</label><input type="number" id="m_maxMembers" min="1" value="${sport.maxMembers || ""}" placeholder="Leave blank for unlimited"></div>
        <div class="field"><label>Quick scoring presets</label>${periodPresetChips("edit")}</div>
        <div class="grid-2" style="margin-bottom:14px;">
          <div class="field" style="margin-bottom:0;"><label>Period label</label><input type="text" id="m_periodLabel" value="${sport.periodLabel || "Match"}"></div>
          <div class="field" style="margin-bottom:0;"><label># of periods</label><input type="number" id="m_periodCount" value="${sport.periodCount || 1}" min="1"></div>
        </div>
        <div class="field"><label>Minutes per period (optional — leave blank for no time limit)</label><input type="number" id="m_periodMinutes" min="1" value="${sport.periodMinutes || ""}"></div>
        ${iconPickerFieldHtml()}
        ${positionsFieldHtml()}
        <div class="error-text" id="m_error"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Save changes</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  // If this sport still has an old-style emoji character (from before this
  // feature), default the picker to the trophy icon rather than showing a
  // literal emoji character as a "selected" state that doesn't match anything.
  modalSelectedIcon = sport.emoji && sport.emoji.startsWith("fa-") ? sport.emoji : "fa-trophy";
  renderIconPicker();
  wireCustomIconUse("m_iconCustom", "m_iconCustomUse");
  const guessedPreset = PERIOD_PRESETS.find((p) => p.periodLabel.toLowerCase() === (sport.periodLabel || "").toLowerCase());
  modalPositionOptions = buildPositionOptions(guessedPreset ? guessedPreset.positions : [], sport.positions);
  renderPositionsChecklist();
  wireCustomPositionAdd("m_positionCustom", "m_positionCustomAdd");
  wirePresetChips("edit");
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const name = document.getElementById("m_name").value.trim();
    if (!name) return;
    const maxVal = document.getElementById("m_maxMembers").value;
    const positions = selectedPositions();
    btn.disabled = true;
    try {
      await api("/sports/" + sportId, {
        method: "PATCH",
        body: {
          name,
          emoji: modalSelectedIcon,
          teamSize: Number(document.getElementById("m_teamSize").value) || 1,
          maxMembers: maxVal ? Number(maxVal) : null,
          positions,
          periodLabel: document.getElementById("m_periodLabel").value || "Match",
          periodCount: Number(document.getElementById("m_periodCount").value) || 1,
          periodMinutes: document.getElementById("m_periodMinutes").value ? Number(document.getElementById("m_periodMinutes").value) : 0,
        },
      });
      closeModal();
      await refreshAll();
      renderAll();
    } catch (e) { document.getElementById("m_error").textContent = e.message; btn.disabled = false; }
  });
}

function openAddDeptModal() {
  let selectedColor = SWATCHES[0];
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Add team</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Team / department name</label><input type="text" id="m_name"></div>
        <div class="swatch-row">
          ${SWATCHES.map((c, i) => `<button class="swatch ${i === 0 ? "selected" : ""}" data-color="${c}" style="background:${c};"></button>`).join("")}
        </div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Add team</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  modalRoot.querySelectorAll(".swatch").forEach((sw) => sw.addEventListener("click", () => {
    modalRoot.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
    sw.classList.add("selected");
    selectedColor = sw.dataset.color;
  }));
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const name = document.getElementById("m_name").value.trim();
    if (!name) return;
    btn.disabled = true;
    try {
      await api("/departments", { method: "POST", body: { name, color: selectedColor } });
      closeModal();
      await refreshAll();
      renderAll();
    } catch (e) { alert(e.message); btn.disabled = false; }
  });
}

function openEditDeptModal(deptId) {
  const dept = departments.find((d) => d.id === deptId);
  if (!dept) return;
  let selectedColor = dept.color;
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Edit team</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Team / department name</label><input type="text" id="m_name" value="${dept.name}"></div>
        <div class="swatch-row">
          ${SWATCHES.map((c) => `<button class="swatch ${c.toLowerCase() === dept.color.toLowerCase() ? "selected" : ""}" data-color="${c}" style="background:${c};"></button>`).join("")}
        </div>
        <div class="error-text" id="m_error"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Save changes</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  modalRoot.querySelectorAll(".swatch").forEach((sw) => sw.addEventListener("click", () => {
    modalRoot.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
    sw.classList.add("selected");
    selectedColor = sw.dataset.color;
  }));
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const name = document.getElementById("m_name").value.trim();
    if (!name) return;
    btn.disabled = true;
    try {
      await api("/departments/" + deptId, { method: "PATCH", body: { name, color: selectedColor } });
      closeModal();
      await refreshAll();
      renderAll();
    } catch (e) { document.getElementById("m_error").textContent = e.message; btn.disabled = false; }
  });
}

function openScheduleMatchModal() {
  if (sports.length === 0 || departments.length < 2) {
    alert("Add at least one sport and two teams first (see Teams & Sports tab).");
    return;
  }
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Schedule match</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Sport</label>
          <select id="m_sport">${sports.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
        </div>
        <div class="grid-2" style="margin-bottom:14px;">
          <select id="m_teamA">${departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join("")}</select>
          <select id="m_teamB">${departments.map((d, i) => `<option value="${d.id}" ${i === 1 ? "selected" : ""}>${d.name}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Venue (optional)</label><input type="text" id="m_venue"></div>
        <div class="field"><label>Time (optional)</label><input type="text" id="m_time"></div>
        <div class="error-text" id="m_error"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Schedule</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const sportId = document.getElementById("m_sport").value;
    const teamA = document.getElementById("m_teamA").value;
    const teamB = document.getElementById("m_teamB").value;
    if (teamA === teamB) {
      document.getElementById("m_error").textContent = "Pick two different teams.";
      return;
    }
    btn.disabled = true;
    try {
      await api("/matches", { method: "POST", body: { sportId, departmentA: teamA, departmentB: teamB, venue: document.getElementById("m_venue").value, time: document.getElementById("m_time").value } });
      closeModal();
      await refreshAll();
      renderAll();
    } catch (e) { document.getElementById("m_error").textContent = e.message; btn.disabled = false; }
  });
}

function openEditMatchModal(matchId) {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return;
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Edit match</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Venue</label><input type="text" id="m_venue" value="${m.venue || ""}"></div>
        <div class="field"><label>Time</label><input type="text" id="m_time" value="${m.time || ""}"></div>
        <div class="error-text" id="m_error"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Save changes</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const { match } = await api("/matches/" + matchId, {
        method: "PATCH",
        body: { venue: document.getElementById("m_venue").value, time: document.getElementById("m_time").value },
      });
      const idx = matches.findIndex((x) => x.id === matchId);
      matches[idx] = match;
      closeModal();
      renderLiveTab();
    } catch (e) { document.getElementById("m_error").textContent = e.message; btn.disabled = false; }
  });
}

// ================= MY ACCOUNT (change own password) =================
function openChangePasswordModal() {
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>My account</h3><button class="icon-btn" id="closeModal">✕</button></div>

        <div class="section-label" style="margin-top:0;">Email</div>
        <div class="field"><label>Current email</label><input type="email" value="${user.email}" disabled style="opacity:0.6;"></div>
        <div class="field"><label>New email</label><input type="email" id="e_new"></div>
        <div class="field"><label>Current password</label><input type="password" id="e_current" placeholder="Confirm with your password"></div>
        <div class="error-text" id="e_error"></div>
        <div class="success-text" id="e_success" style="display:none;"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center; margin-bottom:24px;" id="e_submit">Update email</button>

        <div class="section-label">Password</div>
        <div class="field"><label>Current password</label><input type="password" id="m_current"></div>
        <div class="field"><label>New password</label><input type="password" id="m_new" placeholder="At least 6 characters"></div>
        <div class="error-text" id="m_error"></div>
        <div class="success-text" id="m_success" style="display:none;"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Update password</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);

  document.getElementById("e_submit").addEventListener("click", async () => {
    const btn = document.getElementById("e_submit");
    if (btn.disabled) return;
    const newEmail = document.getElementById("e_new").value.trim();
    const currentPassword = document.getElementById("e_current").value;
    document.getElementById("e_error").textContent = "";
    if (!newEmail || !currentPassword) {
      document.getElementById("e_error").textContent = "Enter your new email and current password.";
      return;
    }
    btn.disabled = true;
    try {
      const { user: updated } = await api("/auth/change-email", { method: "POST", body: { currentPassword, newEmail } });
      setSession(getToken(), updated); // keep the session's cached email in sync
      document.getElementById("e_success").style.display = "block";
      document.getElementById("e_success").textContent = "Email updated.";
      document.getElementById("e_current").value = "";
    } catch (e) { document.getElementById("e_error").textContent = e.message; }
    btn.disabled = false;
  });

  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const currentPassword = document.getElementById("m_current").value;
    const newPassword = document.getElementById("m_new").value;
    document.getElementById("m_error").textContent = "";
    btn.disabled = true;
    try {
      await api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
      document.getElementById("m_success").style.display = "block";
      document.getElementById("m_success").textContent = "Password updated.";
      document.getElementById("m_current").value = "";
      document.getElementById("m_new").value = "";
    } catch (e) { document.getElementById("m_error").textContent = e.message; }
    btn.disabled = false;
  });
}

// ================= USERS (superadmin only: manage admins + password resets) =================
function renderUsersTab() {
  const el = document.getElementById("tab-users");
  el.innerHTML = `
    <div style="margin-bottom:28px;">
      <div class="section-label" style="justify-content:space-between; display:flex;">
        <span>🔑 Password reset requests</span>
      </div>
      <div id="resetRequestsList"></div>
    </div>
    <div style="margin-bottom:28px;">
      <div class="section-label" style="justify-content:space-between; display:flex;">
        <span>Admins</span>
        <button class="pill-btn" id="addAdminBtn" style="padding:4px 10px; font-size:12px;">+ Add admin</button>
      </div>
      <div id="adminsList"></div>
    </div>
  `;

  const reqEl = document.getElementById("resetRequestsList");
  reqEl.innerHTML = resetRequests.length === 0
    ? `<div class="empty-box">No pending password reset requests.</div>`
    : resetRequests.map((r) => `
      <div class="sport-card">
        <div>
          <div class="name">${r.userName} <span style="color:var(--muted); font-weight:400;">(${r.userRole})</span></div>
          <div class="meta">${r.email}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="pill-btn solid" data-approve-reset="${r.id}">Approve</button>
          <button class="pill-btn danger" data-reject-reset="${r.id}">Reject</button>
        </div>
      </div>`).join("");

  reqEl.querySelectorAll("[data-approve-reset]").forEach((b) => b.addEventListener("click", () => openApproveResetModal(b.dataset.approveReset)));
  reqEl.querySelectorAll("[data-reject-reset]").forEach((b) => b.addEventListener("click", async () => {
    if (b.disabled) return;
    if (!confirm("Reject this password reset request?")) return;
    b.disabled = true;
    try {
      await api("/users/password-reset-requests/" + b.dataset.rejectReset + "/resolve", { method: "POST", body: { action: "reject" } });
      resetRequests = resetRequests.filter((r) => r.id !== b.dataset.rejectReset);
      renderUsersTab();
    } catch (e) { alert(e.message); b.disabled = false; }
  }));

  document.getElementById("adminsList").innerHTML = admins.map((a) => `
    <div class="sport-card">
      <div>
        <div class="name">${a.name}</div>
        <div class="meta">${a.email}</div>
      </div>
      <button class="pill-btn danger" data-del-admin="${a.id}">Delete</button>
    </div>`).join("") || `<div class="empty-box">No admins yet. Add one to help manage the tournament.</div>`;

  document.getElementById("addAdminBtn").addEventListener("click", openAddAdminModal);
  document.querySelectorAll("[data-del-admin]").forEach((b) => b.addEventListener("click", async () => {
    if (b.disabled) return;
    if (!confirm("Delete this admin account? They will no longer be able to log in.")) return;
    b.disabled = true;
    try {
      await api("/users/admins/" + b.dataset.delAdmin, { method: "DELETE" });
      admins = admins.filter((a) => a.id !== b.dataset.delAdmin);
      renderUsersTab();
    } catch (e) { alert(e.message); b.disabled = false; }
  }));
}

function openAddAdminModal() {
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Add admin</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Full name</label><input type="text" id="m_name"></div>
        <div class="field"><label>Email</label><input type="email" id="m_email"></div>
        <div class="field"><label>Password</label><input type="password" id="m_password" placeholder="At least 6 characters"></div>
        <div class="error-text" id="m_error"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Add admin</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const name = document.getElementById("m_name").value.trim();
    const email = document.getElementById("m_email").value.trim();
    const password = document.getElementById("m_password").value;
    if (!name || !email || !password) return;
    btn.disabled = true;
    try {
      await api("/users/admins", { method: "POST", body: { name, email, password } });
      closeModal();
      const { admins: fresh } = await api("/users/admins");
      admins = fresh;
      renderUsersTab();
    } catch (e) { document.getElementById("m_error").textContent = e.message; btn.disabled = false; }
  });
}

function openApproveResetModal(requestId) {
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Approve password reset</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <p class="sub" style="margin-top:-8px;">Set a new password, or leave blank to auto-generate one you can share with them.</p>
        <div class="field"><label>New password (optional)</label><input type="text" id="m_newpass" placeholder="Leave blank to auto-generate"></div>
        <div class="error-text" id="m_error"></div>
        <div id="m_result" style="display:none; margin-bottom:14px;">
          <div class="success-text">Password reset. New password:</div>
          <div class="mono" id="m_resultPass" style="font-size:18px; font-weight:700; background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px; text-align:center; margin-top:6px;"></div>
        </div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Approve & reset password</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", () => { closeModal(); renderUsersTab(); });
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const newPassword = document.getElementById("m_newpass").value.trim();
    btn.disabled = true;
    try {
      const { newPassword: generated } = await api("/users/password-reset-requests/" + requestId + "/resolve", {
        method: "POST",
        body: { action: "approve", newPassword: newPassword || undefined },
      });
      resetRequests = resetRequests.filter((r) => r.id !== requestId);
      document.getElementById("m_submit").style.display = "none";
      document.getElementById("m_result").style.display = "block";
      document.getElementById("m_resultPass").textContent = generated;
    } catch (e) { document.getElementById("m_error").textContent = e.message; btn.disabled = false; }
  });
}

boot();
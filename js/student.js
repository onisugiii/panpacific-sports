const user = requireRole("student");

let sports = [];
let departments = [];
let myRegistrations = [];
let matches = [];

const deptById = () => Object.fromEntries(departments.map((d) => [d.id, d]));
const sportById = () => Object.fromEntries(sports.map((s) => [s.id, s]));

// A sport's "emoji" field stores a Font Awesome icon name (e.g. "fa-basketball").
// Sports created before this feature still have a real emoji character saved,
// so this stays backward-compatible and just renders that character as-is.
function sportIconHtml(icon) {
  if (!icon) return "";
  return icon.startsWith("fa-") ? `<i class="fa-solid ${icon}"></i>` : icon;
}

document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("myAccountBtn").addEventListener("click", openChangePasswordModal);
const modalRoot = document.getElementById("modalRoot");
function closeModal() { modalRoot.innerHTML = ""; }

function openChangePasswordModal() {
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>Change my password</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <div class="field"><label>Current password</label><input type="password" id="m_current"></div>
        <div class="field"><label>New password</label><input type="password" id="m_new" placeholder="At least 6 characters"></div>
        <div class="error-text" id="m_error"></div>
        <div class="success-text" id="m_success" style="display:none;"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Update password</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
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

async function boot() {
  if (!user) return;
  document.getElementById("welcomeName").textContent = "HI, " + user.name.split(" ")[0].toUpperCase();

  try {
    const [sportsRes, deptRes, mineRes] = await Promise.all([
      api("/sports"),
      api("/departments"),
      api("/registrations/mine"),
    ]);
    sports = sportsRes.sports;
    departments = deptRes.departments;
    myRegistrations = mineRes.registrations;

    const myDept = deptById()[user.departmentId];
    document.getElementById("deptLabel").textContent = myDept ? myDept.name : "Student";

    renderOverallPoints();
    renderJoinTab();
    renderMineTab();
    renderScheduleTab();
    await renderStandingsTab();
  } catch (e) {
    document.querySelector(".app-shell").insertAdjacentHTML(
      "afterbegin",
      `<div class="error-text">${e.message}</div>`
    );
  }
}

// ---------------- tabs ----------------
document.querySelectorAll(".tabs .tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs .tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    ["join", "mine", "schedule", "standings"].forEach((t) => {
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

// ---------------- join a sport ----------------
function renderJoinTab() {
  const registeredSportIds = new Set(myRegistrations.map((r) => r.sportId));
  const el = document.getElementById("tab-join");
  if (sports.length === 0) {
    el.innerHTML = `<div class="empty-box">No sports have been set up yet. Check back once the coordinator adds some.</div>`;
    return;
  }
  el.innerHTML = sports.map((s) => {
    const already = registeredSportIds.has(s.id);
    return `
      <div class="sport-card">
        <div>
          <div class="name">${sportIconHtml(s.emoji)} ${s.name}</div>
          <div class="meta">Team size: ${s.teamSize}${s.maxMembers ? ` · Max ${s.maxMembers} registrations` : ""}${s.teamSize >= 4 ? " · Position required" : ""}</div>
        </div>
        ${already
          ? `<span class="status-badge pending">Already registered</span>`
          : `<button class="pill-btn solid" data-join="${s.id}">Register</button>`}
      </div>`;
  }).join("");

  el.querySelectorAll("[data-join]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sport = sports.find((s) => s.id === btn.dataset.join);
      if (sport && sport.teamSize >= 4) {
        openJoinPositionModal(sport);
        return;
      }
      await registerForSport(btn, btn.dataset.join, null);
    });
  });
}

async function registerForSport(btn, sportId, position) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Registering…";
  try {
    await api("/registrations", { method: "POST", body: { sportId, position: position || undefined } });
    const { registrations } = await api("/registrations/mine");
    myRegistrations = registrations;
    renderJoinTab();
    renderMineTab();
    return true;
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
    btn.textContent = originalText;
    return false;
  }
}

// Sports with 4+ team members ask the student to pick their position before
// registering, so the coordinator already knows it once they approve.
function openJoinPositionModal(sport) {
  const options = sport.positions && sport.positions.length ? sport.positions : [];
  const myDept = deptById()[user.departmentId];
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h3>${sportIconHtml(sport.emoji)} Register for ${sport.name}</h3><button class="icon-btn" id="closeModal">✕</button></div>
        <p class="sub" style="margin-top:-8px;">This is a team sport — pick the position you'd like to play. The coordinator can still adjust this later.</p>
        <div class="field">
          <label>Team</label>
          <div style="display:flex; align-items:center; gap:8px; background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-size:14px; font-weight:600;">
            ${myDept ? `<span class="dot" style="background:${myDept.color};"></span>${myDept.name}` : "Your department"}
          </div>
        </div>
        <div class="field">
          <label>Position</label>
          ${options.length
            ? `<select id="m_position"><option value="">Select a position…</option>${options.map((p) => `<option value="${p}">${p}</option>`).join("")}</select>`
            : `<input type="text" id="m_position">`}
        </div>
        <div class="error-text" id="m_error"></div>
        <button class="pill-btn solid" style="width:100%; justify-content:center;" id="m_submit">Register</button>
      </div>
    </div>`;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("m_submit").addEventListener("click", async () => {
    const btn = document.getElementById("m_submit");
    if (btn.disabled) return;
    const position = document.getElementById("m_position").value.trim();
    if (!position) {
      document.getElementById("m_error").textContent = "Please choose a position.";
      return;
    }
    btn.disabled = true;
    try {
      await api("/registrations", { method: "POST", body: { sportId: sport.id, position } });
      const { registrations } = await api("/registrations/mine");
      myRegistrations = registrations;
      closeModal();
      renderJoinTab();
      renderMineTab();
    } catch (e) {
      document.getElementById("m_error").textContent = e.message;
      btn.disabled = false;
    }
  });
}

// ---------------- my registrations ----------------
function renderMineTab() {
  const el = document.getElementById("tab-mine");
  if (myRegistrations.length === 0) {
    el.innerHTML = `<div class="empty-box">You haven't registered for any sports yet.</div>`;
    return;
  }
  el.innerHTML = myRegistrations.map((r) => `
    <div class="sport-card">
      <div>
        <div class="name">${r.sportName}</div>
        <div class="meta">Playing for ${r.departmentName}${r.position ? ` · ${r.position}` : ""}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="status-badge ${r.status}">${r.status}</span>
        <button class="pill-btn danger" data-withdraw="${r.id}">Withdraw</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("[data-withdraw]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      if (!confirm("Withdraw from this sport?")) return;
      btn.disabled = true;
      try {
        await api("/registrations/" + btn.dataset.withdraw, { method: "DELETE" });
        const { registrations } = await api("/registrations/mine");
        myRegistrations = registrations;
        renderJoinTab();
        renderMineTab();
      } catch (e) { alert(e.message); btn.disabled = false; }
    });
  });
}

// ---------------- schedule (read-only) ----------------
async function renderScheduleTab() {
  const { matches: m } = await api("/matches");
  matches = m;
  const el = document.getElementById("tab-schedule");
  const dmap = deptById();
  const smap = sportById();

  if (matches.length === 0) {
    el.innerHTML = `<div class="empty-box">No matches scheduled yet.</div>`;
    return;
  }

  const order = { live: 0, scheduled: 1, final: 2 };
  const sorted = matches.slice().sort((a, b) => order[a.status] - order[b.status]);

  el.innerHTML = sorted.map((m) => {
    const sport = smap[m.sportId];
    const a = dmap[m.departmentA];
    const b = dmap[m.departmentB];
    if (!sport || !a || !b) return "";
    const statusHtml = m.status === "live"
      ? `<span class="status-live"><span class="live-dot"></span>LIVE</span>`
      : m.status === "final"
        ? `<span class="status-final">FINAL</span>`
        : `<span class="status-scheduled">SCHEDULED</span>`;

    return `
      <div class="match-card ${m.status === "live" ? "live" : ""}">
        <div class="match-meta">
          <div class="match-meta-left">
            <span>${sportIconHtml(sport.emoji)} ${sport.name}</span>
            ${m.venue ? `<span>· ${m.venue}</span>` : ""}
            ${m.time ? `<span>· ${m.time}</span>` : ""}
          </div>
          ${statusHtml}
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
      </div>`;
  }).join("");
}

// ---------------- standings ----------------
async function renderStandingsTab() {
  const el = document.getElementById("tab-standings");
  if (sports.length === 0) {
    el.innerHTML = `<div class="empty-box">No sports yet.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="field" style="max-width:220px;">
      <select id="standingsSportSelect">
        ${sports.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
      </select>
    </div>
    <div id="standingsTable"></div>
  `;
  const select = document.getElementById("standingsSportSelect");
  select.addEventListener("change", () => loadStandingsTable(select.value));
  await loadStandingsTable(select.value);
}

async function loadStandingsTable(sportId) {
  const { standings } = await api("/standings/sport/" + sportId);
  const dmap = deptById();
  const tableEl = document.getElementById("standingsTable");
  tableEl.innerHTML = `
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

boot();
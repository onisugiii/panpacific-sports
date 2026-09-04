// api.js - tiny fetch wrapper shared by every page.
// Since the frontend is served by the same Express app, we can use
// relative URLs and it'll work in dev and in production the same way.

const API_BASE = "/api";

function getToken() {
  return localStorage.getItem("im_token");
}
function getUser() {
  try { return JSON.parse(localStorage.getItem("im_user") || "null"); }
  catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem("im_token", token);
  localStorage.setItem("im_user", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("im_token");
  localStorage.removeItem("im_user");
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Couldn't reach the server. Is it running?");
  }
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Redirects to the right page if the visitor isn't logged in / wrong role.
// Call at the top of coordinator.html / student.html scripts. Accepts either
// a single role string ("student") or an array of allowed roles
// (["coordinator", "admin"]) since admins share the coordinator dashboard.
function requireRole(roleOrRoles) {
  const allowed = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const user = getUser();
  if (!user || !getToken()) {
    window.location.href = "index.html";
    return null;
  }
  if (!allowed.includes(user.role)) {
    window.location.href = user.role === "student" ? "student.html" : "coordinator.html";
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

// ---------------- 7-segment scoreboard digits ----------------
// Renders a number as real seven-segment digits (see .seg-digit / .seven-seg
// in style.css) instead of relying on a font -- guarantees the exact look
// everywhere, on every browser, with no external font dependency.
const SEVEN_SEG_MAP = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
  "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abcdfg",
};

function sevenSegDigitHtml(ch) {
  const on = SEVEN_SEG_MAP[ch] || "";
  return `<span class="seg-digit">${"abcdefg".split("").map((s) =>
    `<span class="seg seg-${s}${on.includes(s) ? " on" : ""}"></span>`
  ).join("")}</span>`;
}

function sevenSegNumberHtml(value) {
  return `<span class="seven-seg">${String(value).split("").map((ch) =>
    SEVEN_SEG_MAP[ch] ? sevenSegDigitHtml(ch) : `<span class="seg-digit" style="display:flex; align-items:flex-end; justify-content:center;">${ch}</span>`
  ).join("")}</span>`;
}
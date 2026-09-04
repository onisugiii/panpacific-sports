const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");
const { authenticate, requireRole } = require("../lib/auth");

const router = express.Router();

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function randomTempPassword() {
  // 8 random base36 characters, e.g. "k3f9x2qz" — easy to read aloud/type.
  return Math.random().toString(36).slice(2, 10);
}

// All routes below are coordinator-only (the coordinator is the superadmin).

// GET /api/users/admins  — list admin accounts
router.get("/admins", authenticate, requireRole("coordinator"), async (req, res, next) => {
  try {
    const admins = await db.listUsersByRole("admin");
    res.json({ admins: admins.map(publicUser) });
  } catch (err) { next(err); }
});

// POST /api/users/admins  — create a new admin account
router.post("/admins", authenticate, requireRole("coordinator"), async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are all required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const existing = await db.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const passwordHash = bcrypt.hashSync(password, 8);
    const admin = await db.createAdmin({ name, email, passwordHash });
    res.status(201).json({ admin: publicUser(admin) });
  } catch (err) { next(err); }
});

// DELETE /api/users/admins/:id  — remove an admin account
router.delete("/admins/:id", authenticate, requireRole("coordinator"), async (req, res, next) => {
  try {
    const target = await db.getUserById(req.params.id);
    if (!target || target.role !== "admin") return res.status(404).json({ error: "Admin not found." });
    await db.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/users/password-reset-requests  — list forgot-password requests (filter by status)
router.get("/password-reset-requests", authenticate, requireRole("coordinator"), async (req, res, next) => {
  try {
    const { status } = req.query;
    const requests = await db.listPasswordResetRequests({ status });
    res.json({ requests });
  } catch (err) { next(err); }
});

// POST /api/users/password-reset-requests/:id/resolve
// body: { action: "approve" | "reject", newPassword?: string }
// On approve, sets the user's password (to newPassword if provided, otherwise
// a randomly generated temp password) and returns it once so the coordinator
// can relay it to the student/admin.
router.post("/password-reset-requests/:id/resolve", authenticate, requireRole("coordinator"), async (req, res, next) => {
  try {
    const { action, newPassword } = req.body || {};
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
    }
    const request = await db.getPasswordResetRequestById(req.params.id);
    if (!request) return res.status(404).json({ error: "Password reset request not found." });
    if (request.status !== "pending") return res.status(400).json({ error: "This request was already resolved." });

    if (action === "reject") {
      const updated = await db.resolvePasswordResetRequest(request.id, "rejected");
      return res.json({ request: updated });
    }

    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    const tempPassword = newPassword || randomTempPassword();
    await db.updateUserPassword(request.userId, bcrypt.hashSync(tempPassword, 8));
    const updated = await db.resolvePasswordResetRequest(request.id, "approved");
    res.json({ request: updated, newPassword: tempPassword });
  } catch (err) { next(err); }
});

module.exports = router;
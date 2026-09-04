const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");
const { signToken, authenticate } = require("../lib/auth");

const router = express.Router();

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// POST /api/auth/register  (students only self-register)
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, studentId, departmentId } = req.body || {};
    if (!name || !email || !password || !studentId || !departmentId) {
      return res.status(400).json({ error: "name, email, password, studentId, and departmentId are all required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const departments = await db.listDepartments();
    if (!departments.find((d) => d.id === departmentId)) {
      return res.status(400).json({ error: "That department doesn't exist." });
    }

    const existing = await db.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const passwordHash = bcrypt.hashSync(password, 8);
    const user = await db.createStudent({ name, email, passwordHash, studentId, departmentId });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/login  (students, admins, and the coordinator use this)
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const user = await db.getUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password  (any logged-in user changes their own password)
router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    const user = await db.getUserById(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    await db.updateUserPassword(user.id, bcrypt.hashSync(newPassword, 8));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/auth/change-email  (any logged-in user changes their own email,
// confirmed with their current password)
router.post("/change-email", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newEmail } = req.body || {};
    if (!currentPassword || !newEmail) {
      return res.status(400).json({ error: "currentPassword and newEmail are required." });
    }
    const trimmedEmail = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const user = await db.getUserById(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    if (trimmedEmail.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: "That's already your current email." });
    }
    const existing = await db.getUserByEmail(trimmedEmail);
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const updated = await db.updateUserEmail(user.id, trimmedEmail);
    res.json({ user: publicUser(updated) });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password  (public — student or admin says they forgot their password)
// Always responds with the same generic message so we don't leak which emails
// have accounts; the coordinator reviews and approves/rejects the request.
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required." });
    const user = await db.getUserByEmail(email);
    if (user && user.role !== "coordinator") {
      await db.createPasswordResetRequest({ userId: user.id, email: user.email });
    }
    res.json({ ok: true, message: "If an account exists for that email, the coordinator has been notified." });
  } catch (err) { next(err); }
});

module.exports = router;
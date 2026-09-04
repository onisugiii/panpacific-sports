const express = require("express");
const db = require("../lib/db");
const { authenticate, requireRole } = require("../lib/auth");

const router = express.Router();

// GET /api/registrations  (coordinator/admin: all, filterable)
router.get("/", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { sportId, status } = req.query;
    res.json({ registrations: await db.listRegistrations({ sportId, status }) });
  } catch (err) { next(err); }
});

// GET /api/registrations/mine  (student)
router.get("/mine", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    res.json({ registrations: await db.listRegistrationsForUser(req.user.id) });
  } catch (err) { next(err); }
});

// POST /api/registrations  (student registers for a sport under their own department)
// body: { sportId, position? } -- position is required for sports with 4+
// team members (basketball, volleyball, etc.) so the coordinator knows what
// role the student intends to play the moment they approve.
router.post("/", authenticate, requireRole("student"), async (req, res, next) => {
  try {
    const { sportId, position } = req.body || {};
    if (!sportId) return res.status(400).json({ error: "sportId is required." });

    const sports = await db.listSports();
    const sport = sports.find((s) => s.id === sportId);
    if (!sport) return res.status(404).json({ error: "That sport doesn't exist." });

    if (sport.teamSize >= 4 && !position) {
      return res.status(400).json({ error: `${sport.name} needs a position — pick one before registering.` });
    }

    const user = await db.getUserById(req.user.id);
    const already = await db.findRegistration(user.id, sportId);
    if (already) return res.status(409).json({ error: "You're already registered for this sport." });

    if (sport.maxMembers) {
      const currentCount = await db.countActiveRegistrations(sportId);
      if (currentCount >= sport.maxMembers) {
        return res.status(400).json({ error: `${sport.name} is full (${sport.maxMembers} member limit reached).` });
      }
    }

    const registration = await db.createRegistration({ userId: user.id, sportId, departmentId: user.departmentId, position });
    res.status(201).json({ registration });
  } catch (err) { next(err); }
});

// PATCH /api/registrations/:id  (coordinator/admin approves/rejects)
router.patch("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be pending, approved, or rejected." });
    }
    const existing = await db.getRegistrationById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Registration not found." });
    const registration = await db.updateRegistrationStatus(req.params.id, status);
    res.json({ registration });
  } catch (err) { next(err); }
});

// DELETE /api/registrations/:id  (student withdraws their own, or coordinator removes any)
router.delete("/:id", authenticate, async (req, res, next) => {
  try {
    const reg = await db.getRegistrationById(req.params.id);
    if (!reg) return res.status(404).json({ error: "Registration not found." });
    if (!["coordinator", "admin"].includes(req.user.role) && reg.userId !== req.user.id) {
      return res.status(403).json({ error: "You can only withdraw your own registration." });
    }
    await db.deleteRegistration(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
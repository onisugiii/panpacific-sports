const express = require("express");
const db = require("../lib/db");
const { authenticate, requireRole } = require("../lib/auth");

const router = express.Router();

// GET /api/lineups?sportId=...  (coordinator/admin: full lineup for a sport, with student names)
router.get("/", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { sportId } = req.query;
    if (!sportId) return res.status(400).json({ error: "sportId is required." });
    res.json({ lineups: await db.listLineupsForSport(sportId) });
  } catch (err) { next(err); }
});

// PUT /api/lineups  (coordinator/admin assigns/updates a student's position for a sport)
// Body: { sportId, departmentId, userId, position }
router.put("/", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { sportId, departmentId, userId, position } = req.body || {};
    if (!sportId || !departmentId || !userId) {
      return res.status(400).json({ error: "sportId, departmentId, and userId are all required." });
    }
    // Only students with an approved registration for this sport, under this
    // department, are eligible for a lineup slot.
    const reg = await db.findRegistration(userId, sportId);
    if (!reg || reg.status !== "approved") {
      return res.status(400).json({ error: "That student doesn't have an approved registration for this sport." });
    }
    const lineup = await db.upsertLineupEntry({ sportId, departmentId, userId, position });
    res.json({ lineup });
  } catch (err) { next(err); }
});

// DELETE /api/lineups/:id  (coordinator/admin removes a lineup slot, e.g. to clear a position)
router.delete("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    await db.deleteLineupEntry(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
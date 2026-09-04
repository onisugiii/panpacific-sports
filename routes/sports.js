const express = require("express");
const db = require("../lib/db");
const { authenticate, requireRole } = require("../lib/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try { res.json({ sports: await db.listSports() }); }
  catch (err) { next(err); }
});

router.post("/", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { name, emoji, teamSize, maxMembers, positions, periodLabel, periodCount, periodMinutes } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required." });
    if (periodMinutes !== undefined && periodMinutes !== null && (typeof periodMinutes !== "number" || periodMinutes < 0)) {
      return res.status(400).json({ error: "periodMinutes must be a non-negative number, or 0/null for no time limit." });
    }
    const sport = await db.createSport({ name, emoji, teamSize, maxMembers, positions, periodLabel, periodCount, periodMinutes });
    res.status(201).json({ sport });
  } catch (err) { next(err); }
});

// PATCH /api/sports/:id  (coordinator/admin edits name, emoji, team size, member cap, period settings)
router.patch("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { name, emoji, teamSize, maxMembers, positions, periodLabel, periodCount, periodMinutes } = req.body || {};
    if (teamSize !== undefined && (typeof teamSize !== "number" || teamSize < 1)) {
      return res.status(400).json({ error: "teamSize must be a positive number." });
    }
    if (maxMembers !== undefined && maxMembers !== null && (typeof maxMembers !== "number" || maxMembers < 1)) {
      return res.status(400).json({ error: "maxMembers must be a positive number, or null for unlimited." });
    }
    if (periodMinutes !== undefined && periodMinutes !== null && (typeof periodMinutes !== "number" || periodMinutes < 0)) {
      return res.status(400).json({ error: "periodMinutes must be a non-negative number, or 0/null for no time limit." });
    }
    const sport = await db.updateSport(req.params.id, { name, emoji, teamSize, maxMembers, positions, periodLabel, periodCount, periodMinutes });
    if (!sport) return res.status(404).json({ error: "Sport not found." });
    res.json({ sport });
  } catch (err) { next(err); }
});

router.delete("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    await db.deleteSport(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
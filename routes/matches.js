const express = require("express");
const db = require("../lib/db");
const { authenticate, requireRole } = require("../lib/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { sportId } = req.query;
    res.json({ matches: await db.listMatches({ sportId }) });
  } catch (err) { next(err); }
});

// POST /api/matches  (coordinator schedules a match between two departments)
router.post("/", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { sportId, departmentA, departmentB, venue, time } = req.body || {};
    if (!sportId || !departmentA || !departmentB) {
      return res.status(400).json({ error: "sportId, departmentA, and departmentB are required." });
    }
    if (departmentA === departmentB) {
      return res.status(400).json({ error: "A match needs two different departments." });
    }
    const [sports, departments] = await Promise.all([db.listSports(), db.listDepartments()]);
    const sport = sports.find((s) => s.id === sportId);
    if (!sport) return res.status(404).json({ error: "Sport not found." });
    if (!departments.find((d) => d.id === departmentA) || !departments.find((d) => d.id === departmentB)) {
      return res.status(404).json({ error: "Department not found." });
    }
    const match = await db.createMatch({ sportId, departmentA, departmentB, venue, time, periodCount: sport.periodCount });
    res.status(201).json({ match });
  } catch (err) { next(err); }
});

// PATCH /api/matches/:id  (coordinator updates status/venue/time, or the total score directly for single-period sports)
router.patch("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { scoreA, scoreB, status, venue, time } = req.body || {};
    if (status && !["scheduled", "live", "final"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    const patch = {};
    if (typeof scoreA === "number") patch.scoreA = Math.max(0, scoreA);
    if (typeof scoreB === "number") patch.scoreB = Math.max(0, scoreB);
    if (status) patch.status = status;
    if (typeof venue === "string") patch.venue = venue;
    if (typeof time === "string") patch.time = time;

    const match = await db.updateMatch(req.params.id, patch);
    if (!match) return res.status(404).json({ error: "Match not found." });
    res.json({ match });
  } catch (err) { next(err); }
});

// PATCH /api/matches/:id/periods/:periodIndex  (coordinator adjusts one period's score, e.g. Q1, Q2...)
// Body: { a?: number, b?: number } -- only the sides provided are changed.
// The match's total scoreA/scoreB is recomputed as the sum of all periods.
router.patch("/:id/periods/:periodIndex", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const periodIndex = Number(req.params.periodIndex);
    if (!Number.isInteger(periodIndex) || periodIndex < 0) {
      return res.status(400).json({ error: "periodIndex must be a non-negative integer." });
    }
    const { a, b } = req.body || {};
    if (a !== undefined && typeof a !== "number") return res.status(400).json({ error: "a must be a number." });
    if (b !== undefined && typeof b !== "number") return res.status(400).json({ error: "b must be a number." });

    const match = await db.updateMatchPeriod(req.params.id, periodIndex, { a, b });
    if (!match) return res.status(404).json({ error: "Match not found." });
    res.json({ match });
  } catch (err) { next(err); }
});

// PATCH /api/matches/:id/clock  (coordinator starts/pauses/resets the live game clock)
// Body: { action: "start" | "pause" | "reset" }
router.patch("/:id/clock", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { action } = req.body || {};
    if (!["start", "pause", "reset"].includes(action)) {
      return res.status(400).json({ error: "action must be start, pause, or reset." });
    }
    const match = await db.setMatchClock(req.params.id, action);
    if (!match) return res.status(404).json({ error: "Match not found." });
    res.json({ match });
  } catch (err) { next(err); }
});

// PATCH /api/matches/:id/current-period  (coordinator advances or rewinds the live quarter/set/half)
// Body: { direction: "next" | "prev" }
router.patch("/:id/current-period", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { direction } = req.body || {};
    if (!["next", "prev"].includes(direction)) {
      return res.status(400).json({ error: "direction must be next or prev." });
    }
    const match = await db.setMatchCurrentPeriod(req.params.id, direction);
    if (!match) return res.status(404).json({ error: "Match not found." });
    res.json({ match });
  } catch (err) { next(err); }
});

router.delete("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    await db.deleteMatch(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
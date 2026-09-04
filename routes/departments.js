const express = require("express");
const db = require("../lib/db");
const { authenticate, requireRole } = require("../lib/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try { res.json({ departments: await db.listDepartments() }); }
  catch (err) { next(err); }
});

router.post("/", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { name, color } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required." });
    const department = await db.createDepartment({ name, color });
    res.status(201).json({ department });
  } catch (err) { next(err); }
});

// PATCH /api/departments/:id  (coordinator/admin edits name/color)
router.patch("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    const { name, color } = req.body || {};
    const department = await db.updateDepartment(req.params.id, { name, color });
    if (!department) return res.status(404).json({ error: "Team not found." });
    res.json({ department });
  } catch (err) { next(err); }
});

router.delete("/:id", authenticate, requireRole("coordinator", "admin"), async (req, res, next) => {
  try {
    await db.deleteDepartment(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
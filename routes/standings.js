const express = require("express");
const db = require("../lib/db");

const router = express.Router();

router.get("/sport/:sportId", async (req, res, next) => {
  try { res.json({ standings: await db.sportStandings(req.params.sportId) }); }
  catch (err) { next(err); }
});

router.get("/overall", async (req, res, next) => {
  try { res.json({ overall: await db.overallStandings() }); }
  catch (err) { next(err); }
});

module.exports = router;

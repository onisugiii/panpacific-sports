require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("../routes/auth");
const departmentRoutes = require("../routes/departments");
const sportRoutes = require("../routes/sports");
const registrationRoutes = require("../routes/registrations");
const matchRoutes = require("../routes/matches");
const standingsRoutes = require("../routes/standings");
const userRoutes = require("../routes/users");
const lineupRoutes = require("../routes/lineups");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/sports", sportRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/standings", standingsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/lineups", lineupRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Centralized error handler -- every route's catch(next(err)) lands here.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Something went wrong on the server." });
});

// On Vercel, this file is deployed as a serverless function and Vercel
// itself handles the HTTP server -- we just export the Express app.
// Locally (npm run dev), there's no Vercel runtime, so we also serve the
// static frontend and start listening on a port ourselves.
if (!process.env.VERCEL) {
  const frontendDir = path.join(__dirname, "..");
  app.use(express.static(frontendDir, { extensions: ["html"] }));
  app.get("/", (req, res) => res.sendFile(path.join(frontendDir, "index.html")));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`PanPacific Sports running at http://localhost:${PORT}`);
  });
}

module.exports = app;
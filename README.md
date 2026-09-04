# PanPacific Sports

Coordinator and student dashboard for university intramurals — students
register for sports, the coordinator approves rosters and runs live
scoring, and everyone sees a running points tally across every sport.

Built to deploy on **Vercel** (serverless functions + static frontend) with
**Supabase** (Postgres) as the database.

## Stack

- **Frontend:** plain HTML/CSS/JS, no build step. Served as static files.
- **Backend:** a single Express app (`api/index.js`) deployed as one Vercel
  serverless function; `vercel.json` rewrites all `/api/*` traffic to it, so
  the existing Express routes (`/api/auth/...`, `/api/sports`, etc.) work
  unchanged.
- **Database:** Supabase Postgres. All queries live in `lib/db.js`; routes
  never touch Supabase directly.
- **Auth:** custom JWT + bcrypt (not Supabase Auth), so the same login
  system works for both students and the coordinator without extra setup.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in the contents of `schema.sql`,
   and run it. This creates the `departments`, `sports`, `users`,
   `registrations`, and `matches` tables.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not the `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`

   The service role key is powerful — it bypasses Row Level Security. It's
   only ever used from the server (this app's Express routes), never sent
   to the browser. Keep it out of any frontend code.

## 2. Seed starter data

Locally:

```bash
npm install
cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
npm run seed
```

This adds four sample departments, two sample sports, and a coordinator
account:

- **Email:** `coordinator@campus.edu`
- **Password:** `coordinator123`

Change the password by setting `SEED_COORDINATOR_PASSWORD` in `.env` before
seeding, or add a "change password" flow later. The seed script is safe to
re-run — it skips anything that already exists.

## 3. Run it locally

```bash
npm run dev
```

Open **http://localhost:3000**. This runs the same Express app Vercel will
run, just with `app.listen()` added back in and static files served
directly — see the bottom of `api/index.js`.

## 4. Deploy to Vercel

```bash
npm install -g vercel   # if you don't have it
vercel
```

Or connect the repo in the Vercel dashboard (Import Project → pick this
repo). Either way, before the first deploy (or right after, then redeploy),
set these in **Project Settings → Environment Variables**:

| Key | Value |
|---|---|
| `SUPABASE_URL` | from Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Project Settings → API |
| `JWT_SECRET` | any long random string |

Vercel auto-detects `api/index.js` as a serverless function and serves
`index.html`, `student.html`, `coordinator.html`, `css/`, and `js/` as
static assets — no extra config beyond `vercel.json` (which just rewrites
`/api/*` to the one function).

## How the roles work

**Students** register their own account (name, student ID, department,
email, password), then can:
- Browse available sports and register themselves (starts as "pending"
  until the coordinator approves it)
- See their own registrations and withdraw if needed
- View the match schedule and live scores (read-only)
- View standings for any sport

**Coordinators** log in with the seeded account and can:
- Add/remove sports and teams (teams = departments/colleges)
- Approve or reject student registrations, filterable by sport/status
- Schedule matches between two teams for a sport
- Start a match (LIVE), update the score with +/- controls in real time,
  then Finalize it (locks the score, awards standings points: 3 for a win,
  1 each for a tie)
- View standings per sport and the overall points tally across all sports

## Project structure

```
panpacific-sports/
├── api/
│   └── index.js         # Express app; Vercel serverless function + local dev server
├── lib/
│   ├── supabase.js       # Supabase client (service role key)
│   ├── db.js             # every database query lives here
│   └── auth.js           # JWT signing/verification, role middleware
├── routes/
│   ├── auth.js            # register / login / me
│   ├── departments.js     # teams (CRUD, coordinator-only writes)
│   ├── sports.js          # sports (CRUD, coordinator-only writes)
│   ├── registrations.js   # student sign-ups + coordinator approval
│   ├── matches.js         # scheduling + live scoring
│   └── standings.js       # per-sport and overall points calculations
├── scripts/
│   └── seed.js           # one-time: sample data + coordinator account
├── schema.sql             # run once in the Supabase SQL editor
├── vercel.json             # routes /api/* to the one serverless function
├── index.html / student.html / coordinator.html
├── css/style.css
└── js/ (api.js, student.js, coordinator.js)
```

## API reference

All endpoints are under `/api`. Protected routes need
`Authorization: Bearer <token>` from `/api/auth/login` or `/api/auth/register`.

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/auth/register` | anyone | Create a student account |
| POST | `/auth/login` | anyone | Log in (student or coordinator) |
| GET | `/auth/me` | logged in | Current user info |
| GET | `/departments` | anyone | List teams |
| POST | `/departments` | coordinator | Add a team |
| DELETE | `/departments/:id` | coordinator | Remove a team |
| GET | `/sports` | anyone | List sports |
| POST | `/sports` | coordinator | Add a sport |
| DELETE | `/sports/:id` | coordinator | Remove a sport |
| POST | `/registrations` | student | Register for a sport |
| GET | `/registrations/mine` | student | Your own registrations |
| GET | `/registrations` | coordinator | All registrations (`?sportId=`, `?status=`) |
| PATCH | `/registrations/:id` | coordinator | Approve/reject |
| DELETE | `/registrations/:id` | owner or coordinator | Withdraw / remove |
| GET | `/matches` | anyone | List matches (`?sportId=`) |
| POST | `/matches` | coordinator | Schedule a match |
| PATCH | `/matches/:id` | coordinator | Update score/status/venue/time |
| DELETE | `/matches/:id` | coordinator | Remove a match |
| GET | `/standings/sport/:sportId` | anyone | W/L/D + points for one sport |
| GET | `/standings/overall` | anyone | Combined points across all sports |

## Notes before a real event

1. **Change the coordinator password** from the seeded default.
2. **Set a real `JWT_SECRET`** in Vercel's env vars — don't rely on the
   fallback in `lib/auth.js`.
3. Supabase's free tier is plenty for an intramurals event, but if you
   expect a lot of simultaneous live-score updates, keep an eye on your
   connection/request limits during peak match times.
4. Row Level Security is intentionally off on these tables since all access
   goes through this app's own auth via the service role key. If you ever
   query Supabase directly from the browser instead, turn RLS on first.

# Ekhaya FC app: operations guide

Live: https://ekhaya-fc-app.web.app · Staging: the address printed by the "Deploy to staging" workflow

## How a change reaches fans (CI/CD)

| You do | What runs automatically |
|---|---|
| Push to any other branch, or open a pull request | **Checks**: lint, type check, unit tests, build, size budget, database-rules tests, container build |
| Push to `staging` | Same checks, then the app goes to the **staging** address (never touches the live site, rules, shared fan data or alerts) |
| Push to `master` | Same checks, then rules + app go **live**, shared fan data is refreshed, and the live site is checked |
| Nothing (every 6 hours) | **Uptime check**. GitHub emails you if the site is down |

A failed check stops the deploy before fans see anything.

### Using staging
```
git checkout -b staging      # first time only (afterwards: git checkout staging)
git merge master
git push -u origin staging   # → Actions → "Deploy to staging" prints the address
# happy with it?
git checkout master && git merge staging && git push
```
Staging shows a red **STAGING** badge. It uses the live database, so avoid test edits to real matches there.

## Same setup everywhere (containers)
- `docker compose up` gives a complete local copy: app (http://localhost:5173), test database UI (http://localhost:4000) and the club's data loaded in. Sign in as `admin@ekhaya.test` / `ekhaya123`. It never touches live data.
- `docker compose --profile prod up web` runs the exact production build on http://localhost:8081.
- VS Code / Codespaces: "Reopen in Container" uses `.devcontainer/`.
- Without Docker: `npm run emulators` + `npm run seed:emulator` + `npm run dev:emulators`.
- Node is pinned to 22 (`.nvmrc`), and `npm ci` installs the exact versions in `package-lock.json`, the same on your laptop, GitHub and Docker.

## Scale: what heavy traffic costs (free Spark plan)

| Daily free allowance | Used by |
|---|---|
| 50,000 reads | each fan opening the app: ~1 read for fixtures + table + teams (shared snapshot), plus news, their own profile and the open page |
| 20,000 writes | predictions, votes, admin edits, error reports (max 5 per fan visit) |
| 360 MB hosting download | first visit ~300 KB; after a deploy only ~30-60 KB (libraries stay cached) |

- **Shared snapshot** (`publicData/snapshot`): fixtures, table and teams in one document. Admin apps rebuild it within a second of any change. The deploy and the cup/fixture workflows also rebuild it. If it is ever missing or too big, the app falls back to direct reads by itself. Check it in **More → App health**.
- **Hosting** is Google's global CDN, so load balancing and scaling are automatic.
- When the club grows past the free allowance, upgrade to Blaze with a **budget alert** (Google Cloud → Billing → Budgets). At this app's size, thousands of fans a day cost cents.

## Feature switches and club notice
**More → App health → Feature switches** (superadmin): turn features on or off for everyone instantly, no deploy needed. The **Club notice** shows a banner at the top of every page (e.g. "Kick-off moved to 3pm").

## Errors and logging
- Crashes and unexpected errors fans hit are saved (deduplicated, max 5 per visit) and listed in **More → App health → Errors fans hit**, with page, version and phone type.
- Network blips are not reported (normal on mobile).
- Deploy, check and workflow logs: GitHub → Actions.

## Settings (configuration)
- All app settings come from `VITE_*` values: `.env` locally (see `.env.example`), the `APP_ENV` secret on GitHub. They are read in one place: `src/config.ts`.
- Secrets never go in `VITE_*` (those are public in the browser). Server keys live only in GitHub secrets (`FIREBASE_SA`, `SQUAD_CODE`).

## Useful commands
| Command | What it does |
|---|---|
| `npm run check` | lint + types + unit tests |
| `npm run build && npm run check:bundle` | production build + size budget |
| `npm run snapshot` | rebuild the shared fan data (needs the key in ~/ekhaya-keys) |
| `npm run smoke` | check the live site |
| `npm run test:rules` | database rules tests (needs Java) |

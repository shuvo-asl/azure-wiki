# Azure DevOps Wiki — Daily Standup Publisher

Fill a web form, hit **Publish**, and the daily standup is created/updated in your Azure DevOps
**project wiki** at `Sprint Logs / Sprint <code> / Day - <n>` via the REST API — no more copy-paste.

Repo: <https://github.com/shuvo-asl/azure-wiki>

## Page types

Pick the type in the form; each renders its own template and publishes under `Sprint <code>/`:

| Type | Wiki page | Template | Sections |
|------|-----------|----------|----------|
| **Daily Standup** | `Day - <n>` | `templates/daily.hbs` | Team Progress, Focus Areas, Blockers/Risks, Decisions, Action Items |
| **Sprint Planning** | `Sprint Planning` | `templates/planning.hbs` | Sprint Goal, Capacity, Committed Backlog, Risks/Dependencies |
| **Sprint Review & Retro** | `Sprint R2r` | `templates/r2r.hbs` | Delivered, Metrics, Went Well, Didn't Go Well, Improvements, Action Items |

Only **Daily** takes a day number; Planning and R2r are one page per sprint. All templates are
Handlebars files — edit wording/structure without touching code. Empty sections fall back to sensible
placeholder rows.

## Quick start

```bash
git clone https://github.com/shuvo-asl/azure-wiki.git
cd azure-wiki
cp .env.example .env          # fill in your ADO org, project, wiki, and PAT
docker compose up --build     # open http://localhost:8080
```

## How it works

- The daily template lives in [`templates/daily.hbs`](templates/daily.hbs) (Handlebars). Edit it to
  change wording/structure — no code changes needed.
- The team roster lives in [`config/team.json`](config/team.json) — the form pre-fills one row per
  member, each with an **On leave** toggle.
- The **Sprint** dropdown is populated from the latest 3 `Sprint <code>` pages already in your wiki
  (plus an **Other…** option to start a brand-new sprint).

## Setup

```bash
cp .env.example .env      # then fill in the values
```

| Variable         | Meaning                                                        |
|------------------|---------------------------------------------------------------|
| `ADO_ORG_URL`    | `https://dev.azure.com/<org>`                                  |
| `ADO_PROJECT`    | Project name or id                                            |
| `ADO_WIKI`       | Wiki name or id (usually `<project>.wiki`)                     |
| `ADO_PAT`        | Personal Access Token with **Wiki (Read & Write)** scope      |
| `WIKI_ROOT_PATH` | Root path for sprints (default `/Sprint Logs`)                 |
| `PORT`           | Listen port (default `8080`)                                   |
| `DRY_RUN`        | `true` = render + log markdown, **do not** write to the wiki  |

## Run with Docker — development (live reload)

```bash
docker compose up --build
# open http://localhost:8080
```

`docker-compose.override.yml` is applied automatically and gives **live reload** — save a file and
it reflects in the running container, no rebuild:

| You edit…                     | What happens                                              |
|-------------------------------|----------------------------------------------------------|
| `src/*.js` (backend)          | **nodemon** restarts the server automatically            |
| `public/*.html`, `public/*.js`| served statically — just **refresh the browser**         |
| `templates/*.hbs`             | read fresh per request — refresh / re-publish, no restart |
| `config/team.json`            | read fresh per request — no restart                       |
| Tailwind classes in HTML/JS   | **tailwind --watch** rebuilds `public/styles.css`         |

File watching uses polling (`--legacy-watch` / `--poll`, `CHOKIDAR_USEPOLLING=true`) so change
events cross the Docker bind mount reliably on macOS/Windows. Only `package.json` dependency changes
require a rebuild (`docker compose up --build`).

## Run with Docker — production (no live reload)

```bash
docker compose -f docker-compose.yml up --build   # ignores the dev override
```

## Run locally (Node 20+, no Docker)

```bash
npm install
npm run dev              # server + CSS watcher with live reload
# or, one-off:
npm run build:css && npm start
```

## Safe rollout

1. Start with `DRY_RUN=true` and confirm the rendered markdown in the server logs / result box.
2. Point `WIKI_ROOT_PATH` at a throwaway path (e.g. `/Sprint Logs/_test`), set `DRY_RUN=false`,
   publish, and verify the page in the wiki. Publishing again to the same path **updates** it
   (ETag / `If-Match` handled automatically).
3. Switch `WIKI_ROOT_PATH` back to `/Sprint Logs` for real use.

## API (internal)

| Endpoint          | Purpose                                             |
|-------------------|-----------------------------------------------------|
| `GET /api/team`   | Roster for the Team Progress rows                   |
| `GET /api/sprints`| Latest 3 sprints for the dropdown                   |
| `GET /api/exists` | Overwrite check for a computed page path            |
| `POST /api/publish` | Render + create/update the page                   |

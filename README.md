# Job Finder

Finds web development jobs on Remotive, RemoteOK and Jooble (Morocco),
scores each job against your skills, and lets you track where you applied.
You apply yourself; the app only finds, sorts and remembers.

## Files

| File | What it does |
|---|---|
| `start.bat` | **Double-click to open the app** in your browser |
| `profile.json` | Your search keywords and skills (edit this!) |
| `finder.js` | Fetches, filters, scores and saves jobs |
| `index.js` | Runs a search from the terminal |
| `server.js` | The local web app (http://localhost:3000) |
| `public/index.html` | The app page |
| `run-daily.bat` | What the daily task runs |
| `setup-daily-task.ps1` | Creates the daily task in Windows |
| `.env` | Your Jooble key (private, never share) |
| `data/` | Jobs, seen jobs, applied/hidden, log (created automatically) |

## Daily use

1. Double-click `start.bat` (or run `node server.js --open`).
2. Click **Search for new jobs** (or let the daily task do it).
3. Review the **New** tab, best scores first.
4. **View offer**, apply on the site, then click **Mark applied**.
5. Not interested? Click **Hide**.

Keep the black `start.bat` window open while using the app. Close it to stop.

## Search from the terminal

```bash
node index.js                       # keywords from profile.json
node index.js "angular" "vue"       # other keywords, just this once
```

## The score (0–100%)

Each skill in `profile.json` found in the job text adds points
(Angular = 3, Cypress = 2, Git = 1, …). `pointsFor100` points = 100%.
Words in `avoid` remove points (PHP −10, …). Green chips = your skills found,
red chips = avoided words found.

Jooble only sends a short summary of each job, so Jooble scores are usually lower.
Open the offer to judge it fully.

## Daily automatic search

```bash
powershell -ExecutionPolicy Bypass -File setup-daily-task.ps1
```

Searches every day at 09:00 (`-Time 08:30` to change). If the PC is off,
it runs when you turn it on. The result of each run is in `data/log.txt`.

Test it now: `schtasks /run /tn JobFinder`
Remove it: `powershell -Command "Unregister-ScheduledTask -TaskName JobFinder -Confirm:$false"`

## .env

```
JOOBLE_API_KEY=your-key
JOOBLE_HOST=ma.jooble.org
JOOBLE_LOCATION=
```

// server.js — the Job Finder web app, on your computer only
// Usage: node server.js --open     (then it opens http://localhost:3000)
//
// Routes:
//   GET  /             -> the app page (public/index.html)
//   GET  /api/jobs     -> latest jobs + your Applied/Hidden statuses
//   POST /api/status   -> mark a job as applied / hidden / normal
//   POST /api/refresh  -> search for new jobs right now

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { runSearch, readJson, writeJson, DATA_DIR, JOBS_FILE } = require("./finder");

const PORT = 3000;
const HOST = "127.0.0.1"; // only your own computer can open the app
const STATUS_FILE = path.join(DATA_DIR, "job-status.json");
const PAGE_FILE = path.join(__dirname, "public", "index.html");
const ALLOWED_STATUSES = ["applied", "hidden", ""];

let refreshRunning = false;

function sendJson(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// Read a small JSON body from a POST request
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // ---- The page ----
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(PAGE_FILE, "utf8"));
    }

    // ---- Jobs + statuses ----
    if (req.method === "GET" && req.url === "/api/jobs") {
      const data = readJson(JOBS_FILE, { lastRun: null, keywords: [], sources: [], jobs: [] });
      const statuses = readJson(STATUS_FILE, {});
      return sendJson(res, 200, { ...data, statuses });
    }

    // ---- Mark applied / hidden / normal ----
    if (req.method === "POST" && req.url === "/api/status") {
      const { key, status, job } = await readBody(req);
      if (typeof key !== "string" || !key || key.length > 500 || !ALLOWED_STATUSES.includes(status)) {
        return sendJson(res, 400, { error: "Invalid key or status" });
      }

      const statuses = readJson(STATUS_FILE, {});
      if (status === "") {
        delete statuses[key];
      } else {
        // Keep a copy of the job so it stays in "Applied" even after it disappears from the job sites
        const { title, company, location, url, source, score } = job || {};
        statuses[key] = {
          status,
          date: new Date().toISOString().slice(0, 10),
          job: { key, title, company, location, url, source, score },
        };
      }
      writeJson(STATUS_FILE, statuses);
      return sendJson(res, 200, { ok: true });
    }

    // ---- Search now ----
    if (req.method === "POST" && req.url === "/api/refresh") {
      if (refreshRunning) return sendJson(res, 409, { error: "A search is already running" });
      refreshRunning = true;
      try {
        const summary = await runSearch(null);
        return sendJson(res, 200, summary);
      } finally {
        refreshRunning = false;
      }
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Error:", err.message);
    sendJson(res, 500, { error: err.message });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`The app is already running. Open http://localhost:${PORT} in your browser.`);
  } else {
    console.error("Server error:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Job Finder is running at ${url}`);
  console.log("Keep this window open while you use the app. Press Ctrl+C to stop it.");

  if (process.argv.includes("--open")) {
    const command = process.platform === "win32" ? `start "" "${url}"`
      : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    exec(command);
  }
});

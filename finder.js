// finder.js — the "brain" of Job Finder
// Fetches jobs from Remotive + RemoteOK + Jooble, filters web-dev jobs,
// removes duplicates, scores each job against profile.json,
// remembers which jobs you've already seen, and saves data/jobs.json.
// Used by index.js (terminal / daily task) and server.js (Refresh button).

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const SEEN_FILE = path.join(DATA_DIR, "seen-jobs.json");

// Load secrets (like JOOBLE_API_KEY) from the .env file, if it exists
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env: Jooble will be skipped
}

// ---------- Helpers ----------

// "Développeur" -> "developpeur", so accents never break a comparison
function normalize(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Remove HTML tags like <b> or <p> from text
function stripTags(text = "") {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Same title + same company = same job, even on two different sites
function jobKey(job) {
  return `${job.title}|${job.company}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function loadProfile() {
  return readJson(path.join(ROOT, "profile.json"), {
    searchKeywords: ["frontend"], skills: {}, avoid: {}, pointsFor100: 15,
  });
}

// ---------- Sources ----------
// Each source returns jobs in the same shape:
// { source, title, company, location, date, salary, url, text }

async function fetchRemotive(keyword) {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Remotive: ${res.status}`);
  const data = await res.json();

  return (data.jobs || []).map((job) => ({
    source: "Remotive",
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location || "Anywhere",
    date: job.publication_date?.slice(0, 10) || "",
    salary: job.salary || "",
    url: job.url,
    text: stripTags(`${job.title} ${(job.tags || []).join(" ")} ${job.description || ""}`),
  }));
}

async function fetchRemoteOK() {
  // RemoteOK has no search parameter: we get the latest jobs ONCE and filter ourselves
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "job-finder-script" },
  });
  if (!res.ok) throw new Error(`RemoteOK: ${res.status}`);
  const data = await res.json();

  // The first item is a legal notice, not a job
  return data.filter((job) => job.position).map((job) => ({
    source: "RemoteOK",
    title: job.position,
    company: job.company,
    location: job.location || "Anywhere",
    date: job.date?.slice(0, 10) || "",
    salary: job.salary_min ? `$${job.salary_min} - $${job.salary_max}` : "",
    url: job.url,
    text: stripTags(`${job.position} ${(job.tags || []).join(" ")} ${job.description || ""}`),
  }));
}

async function fetchJooble(keyword) {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) throw new Error("no JOOBLE_API_KEY in .env");

  // Never print this URL: it contains your secret key
  const host = process.env.JOOBLE_HOST || "jooble.org";
  const res = await fetch(`https://${host}/api/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keywords: keyword,
      location: process.env.JOOBLE_LOCATION || "",
    }),
  });
  if (!res.ok) throw new Error(`Jooble: ${res.status}`);
  const data = await res.json();

  return (data.jobs || []).map((job) => ({
    source: "Jooble",
    title: stripTags(job.title),
    company: job.company || "Unknown company",
    location: job.location || "?",
    date: job.updated?.slice(0, 10) || "",
    salary: job.salary || "",
    url: job.link,
    text: stripTags(`${job.title} ${job.snippet || ""}`),
  }));
}

// ---------- Filters ----------

// A job is kept only if its TITLE contains one of these words
const BASE_TITLE_KEYWORDS = [
  "angular", "react", "vue", "javascript", "typescript",
  "frontend", "front-end", "front end",
  "full stack", "full-stack", "fullstack",
  "web developer", "web engineer",
  // French titles (accents are removed before comparing)
  "developpeur web", "dev web", "developpeur front", "integrateur web",
];

function isWebDevJob(job, keywords) {
  const title = normalize(job.title);
  const words = [...BASE_TITLE_KEYWORDS, ...keywords.map(normalize)];
  return words.some((word) => title.includes(word));
}

// Keep the job if it mentions at least one of your keywords
function matchesAnyKeyword(job, keywords) {
  const text = normalize(job.text);
  return keywords.some((keyword) => text.includes(normalize(keyword)));
}

function removeDuplicates(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = jobKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Scoring (free, no AI) ----------

// Find a whole word: "java" must not match inside "javascript"
function hasWord(text, word) {
  const escaped = normalize(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(text);
}

function scoreJob(job, profile) {
  const text = normalize(job.text);

  const matchedSkills = Object.keys(profile.skills).filter((skill) => hasWord(text, skill));
  const points = matchedSkills.reduce((sum, skill) => sum + profile.skills[skill], 0);

  const avoidedWords = Object.keys(profile.avoid || {}).filter((word) => hasWord(text, word));
  const penalty = avoidedWords.reduce((sum, word) => sum + profile.avoid[word], 0);

  const raw = Math.round((points / (profile.pointsFor100 || 15)) * 100) - penalty;
  return {
    score: Math.max(0, Math.min(100, raw)),
    matchedSkills,
    avoidedWords,
  };
}

// ---------- Main search ----------

async function runSearch(keywords, log = console.log) {
  const profile = loadProfile();
  if (!keywords || keywords.length === 0) keywords = profile.searchKeywords;

  log(`Searching for: ${keywords.join(", ")}`);

  // One task per request: RemoteOK once, Remotive and Jooble once per keyword
  const tasks = [
    { label: "RemoteOK", run: () => fetchRemoteOK() },
    ...keywords.flatMap((keyword) => [
      { label: `Remotive "${keyword}"`, run: () => fetchRemotive(keyword) },
      { label: `Jooble "${keyword}"`, run: () => fetchJooble(keyword) },
    ]),
  ];

  // Run all requests at the same time; if one fails, the others still work
  const results = await Promise.allSettled(tasks.map((task) => task.run()));

  let allJobs = [];
  const sourceReport = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      log(`  ${tasks[i].label}: ${result.value.length} job(s)`);
      sourceReport.push({ label: tasks[i].label, ok: true, count: result.value.length });
      allJobs = allJobs.concat(result.value);
    } else {
      log(`  ${tasks[i].label}: failed (${result.reason.message})`);
      sourceReport.push({ label: tasks[i].label, ok: false, error: result.reason.message });
    }
  });

  const jobs = removeDuplicates(
    allJobs.filter((job) => matchesAnyKeyword(job, keywords) && isWebDevJob(job, keywords))
  );

  // Older versions kept seen-jobs.json next to index.js: move it into data/
  const oldSeenFile = path.join(ROOT, "seen-jobs.json");
  if (!fs.existsSync(SEEN_FILE) && fs.existsSync(oldSeenFile)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.renameSync(oldSeenFile, SEEN_FILE);
  }

  // Mark each job as new or already seen, and remember the new ones
  const seenJobs = readJson(SEEN_FILE, {});
  const today = new Date().toISOString().slice(0, 10);

  for (const job of jobs) {
    job.key = jobKey(job);
    job.isNew = !seenJobs[job.key];
    if (job.isNew) seenJobs[job.key] = today;
    job.firstSeen = seenJobs[job.key];
    Object.assign(job, scoreJob(job, profile));
    delete job.text; // not needed in the saved file
  }
  writeJson(SEEN_FILE, seenJobs);

  // NEW first, then best score, then newest date
  jobs.sort((a, b) => (b.isNew - a.isNew) || (b.score - a.score) || b.date.localeCompare(a.date));

  const newCount = jobs.filter((job) => job.isNew).length;
  writeJson(JOBS_FILE, {
    lastRun: new Date().toISOString(),
    keywords,
    sources: sourceReport,
    jobs,
  });

  log(`Kept ${jobs.length} job(s) after filters, ${newCount} NEW since last run.`);
  return { total: jobs.length, newCount, sources: sourceReport };
}

module.exports = { runSearch, readJson, writeJson, DATA_DIR, JOBS_FILE };

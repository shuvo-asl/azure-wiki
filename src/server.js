import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { render, formatDate } from "./render.js";
import { buildPath } from "./paths.js";
import {
  listSprints,
  getPage,
  ensureParents,
  createOrUpdate,
  getPlanningItems,
} from "./adoClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8080", 10);
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === "true";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Team roster (read fresh so the mounted config can change) ---
app.get("/api/team", (_req, res) => {
  try {
    const file = path.join(__dirname, "..", "config", "team.json");
    const roster = JSON.parse(fs.readFileSync(file, "utf8"));
    res.json({ members: roster.members || [] });
  } catch (err) {
    res.status(500).json({ error: `Could not read team roster: ${err.message}` });
  }
});

// --- Latest sprints for the dropdown ---
app.get("/api/sprints", async (_req, res) => {
  try {
    const sprints = await listSprints(3);
    res.json({ sprints });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Committed backlog items from a sprint's planning page (pre-fills R2r Delivered) ---
app.get("/api/planning-items", async (req, res) => {
  const { sprintCode } = req.query;
  if (!sprintCode) return res.status(400).json({ error: "sprintCode is required" });
  try {
    const items = await getPlanningItems(String(sprintCode).trim());
    res.json({ items });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Existence check for the overwrite warning ---
// Builds the path server-side so the client doesn't need to know WIKI_ROOT_PATH.
app.get("/api/exists", async (req, res) => {
  const { pageType = "daily", sprintCode, dayNo } = req.query;
  if (!sprintCode) return res.status(400).json({ error: "sprintCode is required" });
  try {
    const pagePath = buildPath(pageType, {
      sprintCode: String(sprintCode).trim(),
      dayNo: String(dayNo ?? "").trim(),
    });
    const { exists } = await getPage(pagePath);
    res.json({ exists, path: pagePath });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Publish a page ---
app.post("/api/publish", async (req, res) => {
  const { pageType = "daily", sprintCode, dayNo } = req.body || {};

  if (!sprintCode || String(sprintCode).trim() === "")
    return res.status(400).json({ error: "sprintCode is required" });
  if (pageType === "daily" && (dayNo === undefined || String(dayNo).trim() === ""))
    return res.status(400).json({ error: "dayNo is required for a daily standup" });

  try {
    const pagePath = buildPath(pageType, {
      sprintCode: String(sprintCode).trim(),
      dayNo: dayNo === undefined ? undefined : String(dayNo).trim(),
    });

    const content = render(pageType, {
      ...req.body,
      sprintCode: String(sprintCode).trim(),
      dayNo: dayNo === undefined ? undefined : String(dayNo).trim(),
      date: formatDate(),
    });

    if (DRY_RUN) {
      console.log(`\n--- DRY RUN: would publish to ${pagePath} ---\n${content}\n--- end ---\n`);
      return res.json({ dryRun: true, path: pagePath, content });
    }

    const { exists, etag } = await getPage(pagePath);
    await ensureParents(String(sprintCode).trim());
    const result = await createOrUpdate(pagePath, content, exists ? etag : null);

    res.json({
      dryRun: false,
      created: result.created,
      updated: result.updated,
      path: result.path,
      remoteUrl: result.remoteUrl,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(
    `az-wiki standup publisher listening on http://localhost:${PORT}` +
      (DRY_RUN ? "  [DRY_RUN]" : "")
  );
});

// Handlebars template registry + render(pageType, data).
// Templates live in /templates and are read fresh each render so the
// mounted volume can be edited without restarting the server.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

const registry = {
  daily: "daily.hbs",
  // planning: "planning.hbs",
  // r2r: "r2r.hbs",
};

// Format a Date as e.g. "27 August 2026".
export function formatDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function loadTemplate(pageType) {
  const file = registry[pageType];
  if (!file) throw new Error(`No template for page type: ${pageType}`);
  const src = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf8");
  return Handlebars.compile(src, { noEscape: true });
}

// Apply the empty-section fallbacks that match the sample layout.
function withDailyDefaults(data) {
  const members = (data.members || []).map((m) => ({
    name: m.name || "",
    yesterday: emptyDash(m.yesterday),
    today: emptyDash(m.today),
    blockers: emptyDash(m.blockers),
  }));

  const focusAreas = clean(data.focusAreas);

  let risks = (data.risks || [])
    .filter((r) => (r.owner || r.issue || r.nextAction || "").trim() !== "")
    .map((r) => ({
      owner: emptyDash(r.owner),
      issue: r.issue?.trim() || "None",
      nextAction: emptyDash(r.nextAction),
    }));
  if (risks.length === 0) risks = [{ owner: "–", issue: "None", nextAction: "–" }];

  let decisions = clean(data.decisions);
  if (decisions.length === 0)
    decisions = ["*[Capture any decisions made during stand-up]*"];

  let actionItems = clean(data.actionItems);
  if (actionItems.length === 0)
    actionItems = ["*[Only add if follow-up is needed]*"];

  return {
    sprintCode: data.sprintCode,
    date: data.date || formatDate(),
    members,
    focusAreas,
    risks,
    decisions,
    actionItems,
  };
}

// "" / undefined -> en dash, matching the sample's empty cells.
function emptyDash(v) {
  const s = (v ?? "").toString().trim();
  return s === "" ? "–" : s;
}

// Trim, drop empty lines/entries.
function clean(list) {
  return (list || [])
    .map((x) => (x ?? "").toString().trim())
    .filter((x) => x !== "");
}

const defaulters = {
  daily: withDailyDefaults,
};

export function render(pageType, data) {
  const applyDefaults = defaulters[pageType];
  if (!applyDefaults) throw new Error(`No renderer for page type: ${pageType}`);
  const template = loadTemplate(pageType);
  return template(applyDefaults(data));
}

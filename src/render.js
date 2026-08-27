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
  planning: "planning.hbs",
  r2r: "r2r.hbs",
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

  const risks = normalizeRisks(data.risks);

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

// Shared: normalize a Blockers/Risks table, defaulting to the "None" row.
function normalizeRisks(list) {
  let risks = (list || [])
    .filter((r) => (r.owner || r.issue || r.nextAction || "").trim() !== "")
    .map((r) => ({
      owner: emptyDash(r.owner),
      issue: r.issue?.trim() || "None",
      nextAction: emptyDash(r.nextAction),
    }));
  if (risks.length === 0) risks = [{ owner: "–", issue: "None", nextAction: "–" }];
  return risks;
}

function withPlanningDefaults(data) {
  let capacity = (data.capacity || [])
    .filter((m) => (m.name || "").trim() !== "")
    .map((m) => ({
      name: m.name.trim(),
      days: emptyDash(m.days),
      notes: emptyDash(m.notes),
    }));
  if (capacity.length === 0) capacity = [{ name: "–", days: "–", notes: "–" }];

  let committedItems = (data.committedItems || [])
    .filter((i) => (i.item || i.owner || i.estimate || "").trim() !== "")
    .map((i) => ({
      item: emptyDash(i.item),
      owner: emptyDash(i.owner),
      estimate: emptyDash(i.estimate),
    }));
  if (committedItems.length === 0)
    committedItems = [
      { item: "*[Add committed backlog items]*", owner: "–", estimate: "–" },
    ];

  return {
    sprintCode: data.sprintCode,
    date: data.date || formatDate(),
    sprintGoal: (data.sprintGoal || "").trim() || "*[Define the sprint goal]*",
    capacity,
    committedItems,
    risks: normalizeRisks(data.risks),
  };
}

function withR2rDefaults(data) {
  let delivered = (data.delivered || [])
    .filter((d) => (d.item || d.owner || d.status || "").trim() !== "")
    .map((d) => ({
      item: emptyDash(d.item),
      owner: emptyDash(d.owner),
      status: emptyDash(d.status),
    }));
  if (delivered.length === 0)
    delivered = [{ item: "*[List delivered items]*", owner: "–", status: "–" }];

  let retro = (data.retro || [])
    .filter((m) => (m.name || "").trim() !== "")
    .map((m) => ({
      name: m.name.trim(),
      wentWell: emptyDash(m.wentWell),
      wentWrong: emptyDash(m.wentWrong),
      challenge: emptyDash(m.challenge),
      improvements: emptyDash(m.improvements),
    }));
  if (retro.length === 0)
    retro = [{ name: "–", wentWell: "–", wentWrong: "–", challenge: "–", improvements: "–" }];

  const actionItems = clean(data.actionItems);

  return {
    sprintCode: data.sprintCode,
    date: data.date || formatDate(),
    delivered,
    retro,
    actionItems: actionItems.length ? actionItems : ["*[Only add if follow-up is needed]*"],
  };
}

const defaulters = {
  daily: withDailyDefaults,
  planning: withPlanningDefaults,
  r2r: withR2rDefaults,
};

export function render(pageType, data) {
  const applyDefaults = defaulters[pageType];
  if (!applyDefaults) throw new Error(`No renderer for page type: ${pageType}`);
  const template = loadTemplate(pageType);
  return template(applyDefaults(data));
}

// Thin wrapper around the Azure DevOps Wiki REST API (api-version 7.1).
// Docs verified: PUT create/update, GET page/list, HTTP Basic with a PAT.

import { rootPath, sprintPath } from "./paths.js";

const API_VERSION = "7.1";

function cfg() {
  const orgUrl = (process.env.ADO_ORG_URL || "").replace(/\/+$/, "");
  const project = process.env.ADO_PROJECT || "";
  const wiki = process.env.ADO_WIKI || "";
  const pat = process.env.ADO_PAT || "";
  if (!orgUrl || !project || !wiki) {
    throw new Error(
      "Missing ADO config: set ADO_ORG_URL, ADO_PROJECT, ADO_WIKI (and ADO_PAT)."
    );
  }
  return { orgUrl, project, wiki, pat };
}

function pagesUrl({ orgUrl, project, wiki }, params) {
  const base = `${orgUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(
    wiki
  )}/pages`;
  const search = new URLSearchParams({ "api-version": API_VERSION, ...params });
  return `${base}?${search.toString()}`;
}

function authHeader({ pat }) {
  const token = Buffer.from(`:${pat}`).toString("base64");
  return `Basic ${token}`;
}

// GET a page. Returns { exists, etag, content }.
export async function getPage(path, { includeContent = false } = {}) {
  const c = cfg();
  const url = pagesUrl(c, {
    path,
    includeContent: String(includeContent),
  });
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader(c), Accept: "application/json" },
  });

  if (res.status === 404) return { exists: false, etag: null, content: null };
  if (!res.ok) throw await asError(res, `GET ${path}`);

  const etag = res.headers.get("etag");
  const body = await res.json().catch(() => ({}));
  return { exists: true, etag, content: body.content ?? null };
}

// List latest N sprints (default 3) under the wiki root.
export async function listSprints(limit = 3) {
  const c = cfg();
  const url = pagesUrl(c, { path: rootPath(), recursionLevel: "oneLevel" });
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader(c), Accept: "application/json" },
  });

  if (res.status === 404) return [];
  if (!res.ok) throw await asError(res, "list sprints");

  const body = await res.json().catch(() => ({}));
  const subPages = body.subPages || [];

  const sprints = subPages
    .map((p) => {
      const name = (p.path || "").split("/").pop() || "";
      const m = name.match(/^Sprint\s+(\S+)/i);
      if (!m) return null;
      const code = m[1];
      const num = parseInt(code, 10);
      return { sprintCode: code, label: name, sortKey: isNaN(num) ? -1 : num };
    })
    .filter(Boolean)
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, limit)
    .map(({ sprintCode, label }) => ({ sprintCode, label }));

  return sprints;
}

// Make sure the "Sprint <code>" parent page exists (ADO also auto-creates
// parents, but this keeps the tree tidy with an explicit page).
export async function ensureParents(sprintCode) {
  const parent = sprintPath(sprintCode);
  const { exists } = await getPage(parent);
  if (!exists) {
    await putPage(parent, `# Sprint ${sprintCode}\n`, null);
  }
}

// Create or update a page. Pass etag to update an existing page.
export async function createOrUpdate(path, content, etag = null) {
  const res = await putPage(path, content, etag);
  const body = await res.json().catch(() => ({}));
  return {
    created: res.status === 201,
    updated: res.status === 200,
    path: body.path || path,
    remoteUrl: body.remoteUrl || null,
  };
}

async function putPage(path, content, etag) {
  const c = cfg();
  const url = pagesUrl(c, { path });
  const headers = {
    Authorization: authHeader(c),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (etag) headers["If-Match"] = etag;

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ content }),
  });

  if (!res.ok) throw await asError(res, `PUT ${path}`);
  return res;
}

async function asError(res, ctx) {
  const text = await res.text().catch(() => "");
  const err = new Error(
    `Azure DevOps API error (${res.status}) on ${ctx}: ${text.slice(0, 500)}`
  );
  err.status = res.status;
  return err;
}

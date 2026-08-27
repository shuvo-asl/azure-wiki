// Builds the wiki page path for each page type.
// Registry keyed by page type so Sprint Planning / R2r drop in later.

const ROOT = process.env.WIKI_ROOT_PATH || "/Sprint Logs";

// Normalize a root so it starts with "/" and has no trailing slash.
function normalizeRoot(root) {
  let r = root.trim();
  if (!r.startsWith("/")) r = "/" + r;
  if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
  return r;
}

const builders = {
  daily: ({ sprintCode, dayNo }) =>
    `${normalizeRoot(ROOT)}/Sprint ${sprintCode}/Day - ${dayNo}`,
  planning: ({ sprintCode }) =>
    `${normalizeRoot(ROOT)}/Sprint ${sprintCode}/Sprint Planning`,
  r2r: ({ sprintCode }) =>
    `${normalizeRoot(ROOT)}/Sprint ${sprintCode}/Sprint R2r`,
};

export function sprintPath(sprintCode) {
  return `${normalizeRoot(ROOT)}/Sprint ${sprintCode}`;
}

export function rootPath() {
  return normalizeRoot(ROOT);
}

export function buildPath(pageType, params) {
  const builder = builders[pageType];
  if (!builder) throw new Error(`Unsupported page type: ${pageType}`);
  return builder(params);
}

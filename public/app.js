// Frontend logic for the standup publisher.

const $ = (id) => document.getElementById(id);
const OTHER = "__other__";

// ---- Row builders -------------------------------------------------------

function memberRow(name = "") {
  const tr = document.createElement("tr");
  tr.className = "border-t border-slate-100 member-row";
  tr.innerHTML = `
    <td class="py-1 pr-2">
      <input class="m-name w-full rounded border-slate-300 border p-1.5" value="${escapeAttr(name)}" placeholder="Name" />
    </td>
    <td class="py-1 px-2"><input class="m-yesterday w-full rounded border-slate-300 border p-1.5" /></td>
    <td class="py-1 px-2"><input class="m-today w-full rounded border-slate-300 border p-1.5" /></td>
    <td class="py-1 px-2"><input class="m-blockers w-full rounded border-slate-300 border p-1.5" placeholder="None" /></td>
    <td class="py-1 pl-2 text-center"><input type="checkbox" class="m-leave h-4 w-4" /></td>
    <td class="py-1 text-center"><button type="button" class="del text-slate-400 hover:text-red-500">✕</button></td>
  `;
  const leave = tr.querySelector(".m-leave");
  leave.addEventListener("change", () => {
    const disabled = leave.checked;
    ["m-yesterday", "m-today", "m-blockers"].forEach((c) => {
      const el = tr.querySelector("." + c);
      el.disabled = disabled;
      el.classList.toggle("bg-slate-100", disabled);
    });
  });
  tr.querySelector(".del").addEventListener("click", () => tr.remove());
  return tr;
}

function riskRow() {
  const tr = document.createElement("tr");
  tr.className = "border-t border-slate-100 risk-row";
  tr.innerHTML = `
    <td class="py-1 pr-2"><input class="r-owner w-full rounded border-slate-300 border p-1.5" /></td>
    <td class="py-1 px-2"><input class="r-issue w-full rounded border-slate-300 border p-1.5" /></td>
    <td class="py-1 px-2"><input class="r-next w-full rounded border-slate-300 border p-1.5" /></td>
    <td class="py-1 text-center"><button type="button" class="del text-slate-400 hover:text-red-500">✕</button></td>
  `;
  tr.querySelector(".del").addEventListener("click", () => tr.remove());
  return tr;
}

function actionRow() {
  const div = document.createElement("div");
  div.className = "flex items-center gap-2 action-row";
  div.innerHTML = `
    <span class="text-slate-400 text-sm">[ ]</span>
    <input class="a-text flex-1 rounded border-slate-300 border p-1.5" placeholder="Action item" />
    <button type="button" class="del text-slate-400 hover:text-red-500">✕</button>
  `;
  div.querySelector(".del").addEventListener("click", () => div.remove());
  return div;
}

// ---- Data gathering -----------------------------------------------------

function sprintCode() {
  const sel = $("sprintSelect").value;
  return sel === OTHER ? $("sprintOther").value.trim() : sel.trim();
}

function gather() {
  const members = [...document.querySelectorAll(".member-row")].map((tr) => {
    const leave = tr.querySelector(".m-leave").checked;
    if (leave) return { name: val(tr, ".m-name"), yesterday: "On Leave", today: "On Leave", blockers: "–" };
    return {
      name: val(tr, ".m-name"),
      yesterday: val(tr, ".m-yesterday"),
      today: val(tr, ".m-today"),
      blockers: val(tr, ".m-blockers"),
    };
  }).filter((m) => m.name !== "");

  const risks = [...document.querySelectorAll(".risk-row")].map((tr) => ({
    owner: val(tr, ".r-owner"),
    issue: val(tr, ".r-issue"),
    nextAction: val(tr, ".r-next"),
  }));

  const actionItems = [...document.querySelectorAll(".action-row")].map((d) => val(d, ".a-text"));

  return {
    pageType: $("pageType").value,
    sprintCode: sprintCode(),
    dayNo: $("dayNo").value,
    members,
    focusAreas: lines($("focusAreas").value),
    risks,
    decisions: lines($("decisions").value),
    actionItems,
  };
}

// ---- Publish ------------------------------------------------------------

async function publish(e) {
  e.preventDefault();
  const data = gather();
  if (!data.sprintCode) return showResult("error", "Please choose or enter a sprint.");
  if (!data.dayNo) return showResult("error", "Please enter a day number.");

  setBusy(true);
  try {
    // Overwrite warning (skipped gracefully if the check fails, e.g. dry-run offline)
    try {
      const ex = await api(
        `/api/exists?pageType=${data.pageType}&sprintCode=${encodeURIComponent(data.sprintCode)}&dayNo=${encodeURIComponent(data.dayNo)}`
      );
      if (ex.exists && !confirm(`Page already exists:\n${ex.path}\n\nPublishing will overwrite it. Continue?`)) {
        return;
      }
    } catch (_) { /* non-fatal */ }

    const res = await api("/api/publish", { method: "POST", body: JSON.stringify(data) });
    if (res.dryRun) {
      showResult("ok", `DRY RUN — would publish to ${res.path}. (No wiki write.)`, res.content);
    } else {
      const verb = res.created ? "Created" : "Updated";
      const link = res.remoteUrl ? ` <a class="underline" href="${res.remoteUrl}" target="_blank">Open page ↗</a>` : "";
      showResult("ok", `${verb}: ${res.path}.${link}`);
    }
  } catch (err) {
    showResult("error", err.message);
  } finally {
    setBusy(false);
  }
}

// ---- Init ---------------------------------------------------------------

async function init() {
  // Team roster
  try {
    const { members } = await api("/api/team");
    (members || []).forEach((n) => $("memberRows").appendChild(memberRow(n)));
  } catch (_) { /* leave empty */ }
  if (!$("memberRows").children.length) $("memberRows").appendChild(memberRow());

  // Sprints
  const sel = $("sprintSelect");
  try {
    const { sprints } = await api("/api/sprints");
    sel.innerHTML = "";
    (sprints || []).forEach((s) => {
      const o = document.createElement("option");
      o.value = s.sprintCode;
      o.textContent = s.label;
      sel.appendChild(o);
    });
  } catch (_) {
    sel.innerHTML = "";
  }
  const other = document.createElement("option");
  other.value = OTHER;
  other.textContent = "Other… (new sprint)";
  sel.appendChild(other);
  if (sel.options.length === 1) sel.value = OTHER; // only "Other" -> show input
  toggleOther();

  sel.addEventListener("change", () => { toggleOther(); updatePath(); });
  $("sprintOther").addEventListener("input", updatePath);
  $("dayNo").addEventListener("input", updatePath);
  updatePath();

  $("addMember").addEventListener("click", () => $("memberRows").appendChild(memberRow()));
  $("addRisk").addEventListener("click", () => $("riskRows").appendChild(riskRow()));
  $("addAction").addEventListener("click", () => $("actionRows").appendChild(actionRow()));
  $("standup-form").addEventListener("submit", publish);
}

function toggleOther() {
  $("sprintOther").classList.toggle("hidden", $("sprintSelect").value !== OTHER);
}

function updatePath() {
  const code = sprintCode();
  const day = $("dayNo").value || "?";
  $("targetPath").textContent = code ? `→ Sprint ${code} / Day - ${day}` : "";
}

// ---- Helpers ------------------------------------------------------------

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const val = (root, sel) => root.querySelector(sel).value.trim();
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const escapeAttr = (s) => String(s).replace(/"/g, "&quot;");

function setBusy(b) {
  $("publishBtn").disabled = b;
  $("publishBtn").textContent = b ? "Publishing…" : "Publish to Wiki";
}

function showResult(kind, msg, pre) {
  const el = $("result");
  el.className =
    "rounded-lg p-4 text-sm " +
    (kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200");
  el.innerHTML = msg + (pre ? `<pre class="mt-3 bg-white/70 border border-slate-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">${escapeHtml(pre)}</pre>` : "");
  el.classList.remove("hidden");
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

init();

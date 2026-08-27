// Frontend logic for the sprint wiki publisher (daily / planning / r2r).

const $ = (id) => document.getElementById(id);
const OTHER = "__other__";
let roster = [];

// ---- Row builders -------------------------------------------------------

function inputCell(cls, placeholder = "") {
  return `<td class="py-1 px-2"><input class="${cls} w-full rounded border-slate-300 border p-1.5" placeholder="${placeholder}" /></td>`;
}
function delCell() {
  return `<td class="py-1 text-center"><button type="button" class="del text-slate-400 hover:text-red-500">✕</button></td>`;
}
function wireDel(el) {
  el.querySelector(".del").addEventListener("click", () => el.remove());
  return el;
}
function row(html, cls) {
  const tr = document.createElement("tr");
  tr.className = "border-t border-slate-100 " + cls;
  tr.innerHTML = html;
  return wireDel(tr);
}

function memberRow(name = "") {
  const tr = row(
    `<td class="py-1 pr-2"><input class="m-name w-full rounded border-slate-300 border p-1.5" value="${escapeAttr(name)}" placeholder="Name" /></td>
     ${inputCell("m-yesterday")}${inputCell("m-today")}${inputCell("m-blockers", "None")}
     <td class="py-1 pl-2 text-center"><input type="checkbox" class="m-leave h-4 w-4" /></td>${delCell()}`,
    "member-row"
  );
  const leave = tr.querySelector(".m-leave");
  leave.addEventListener("change", () => {
    ["m-yesterday", "m-today", "m-blockers"].forEach((c) => {
      const el = tr.querySelector("." + c);
      el.disabled = leave.checked;
      el.classList.toggle("bg-slate-100", leave.checked);
    });
  });
  return tr;
}

const capacityRow = (name = "") =>
  row(
    `<td class="py-1 pr-2"><input class="c-name w-full rounded border-slate-300 border p-1.5" value="${escapeAttr(name)}" placeholder="Name" /></td>
     ${inputCell("c-days", "e.g. 8")}${inputCell("c-notes")}${delCell()}`,
    "capacity-row"
  );

const committedRow = () =>
  row(`${inputCell("ci-item")}${inputCell("ci-owner")}${inputCell("ci-estimate")}${delCell()}`, "committed-row");

const riskRow = (cls) =>
  row(`${inputCell("r-owner")}${inputCell("r-issue")}${inputCell("r-next")}${delCell()}`, cls);

const metricRow = () =>
  row(`${inputCell("mt-metric")}${inputCell("mt-value")}${delCell()}`, "metric-row");

function actionRow() {
  const div = document.createElement("div");
  div.className = "flex items-center gap-2 action-row";
  div.innerHTML = `<span class="text-slate-400 text-sm">[ ]</span>
    <input class="a-text flex-1 rounded border-slate-300 border p-1.5" placeholder="Action item" />
    <button type="button" class="del text-slate-400 hover:text-red-500">✕</button>`;
  return wireDel(div);
}

// data-add value -> how to append a row
const ADDERS = {
  member: () => $("memberRows").appendChild(memberRow()),
  risk: () => $("riskRows").appendChild(riskRow("risk-row")),
  prisk: () => $("priskRows").appendChild(riskRow("prisk-row")),
  capacity: () => $("capacityRows").appendChild(capacityRow()),
  committed: () => $("committedRows").appendChild(committedRow()),
  metric: () => $("metricRows").appendChild(metricRow()),
  action: (btn) => $(btn.dataset.target).appendChild(actionRow()),
};

// ---- Data gathering -----------------------------------------------------

function sprintCode() {
  const sel = $("sprintSelect").value;
  return sel === OTHER ? $("sprintOther").value.trim() : sel.trim();
}
function pageType() {
  return $("pageType").value;
}

function gatherRisks(selector) {
  return [...document.querySelectorAll(selector)].map((tr) => ({
    owner: val(tr, ".r-owner"),
    issue: val(tr, ".r-issue"),
    nextAction: val(tr, ".r-next"),
  }));
}

function gather() {
  const base = { pageType: pageType(), sprintCode: sprintCode() };

  if (base.pageType === "daily") {
    const members = [...document.querySelectorAll(".member-row")]
      .map((tr) => {
        if (tr.querySelector(".m-leave").checked)
          return { name: val(tr, ".m-name"), yesterday: "On Leave", today: "On Leave", blockers: "–" };
        return {
          name: val(tr, ".m-name"),
          yesterday: val(tr, ".m-yesterday"),
          today: val(tr, ".m-today"),
          blockers: val(tr, ".m-blockers"),
        };
      })
      .filter((m) => m.name !== "");
    return {
      ...base,
      dayNo: $("dayNo").value,
      members,
      focusAreas: lines($("focusAreas").value),
      risks: gatherRisks(".risk-row"),
      decisions: lines($("decisions").value),
      actionItems: [...document.querySelectorAll("#actionRows .action-row")].map((d) => val(d, ".a-text")),
    };
  }

  if (base.pageType === "planning") {
    return {
      ...base,
      sprintGoal: $("sprintGoal").value.trim(),
      capacity: [...document.querySelectorAll(".capacity-row")]
        .map((tr) => ({ name: val(tr, ".c-name"), days: val(tr, ".c-days"), notes: val(tr, ".c-notes") }))
        .filter((m) => m.name !== ""),
      committedItems: [...document.querySelectorAll(".committed-row")].map((tr) => ({
        item: val(tr, ".ci-item"),
        owner: val(tr, ".ci-owner"),
        estimate: val(tr, ".ci-estimate"),
      })),
      risks: gatherRisks(".prisk-row"),
    };
  }

  // r2r
  return {
    ...base,
    delivered: lines($("delivered").value),
    metrics: [...document.querySelectorAll(".metric-row")].map((tr) => ({
      metric: val(tr, ".mt-metric"),
      value: val(tr, ".mt-value"),
    })),
    wentWell: lines($("wentWell").value),
    wentWrong: lines($("wentWrong").value),
    improvements: lines($("improvements").value),
    actionItems: [...document.querySelectorAll("#r2rActionRows .action-row")].map((d) => val(d, ".a-text")),
  };
}

// ---- Publish ------------------------------------------------------------

async function publish(e) {
  e.preventDefault();
  const data = gather();
  if (!data.sprintCode) return showResult("error", "Please choose or enter a sprint.");
  if (data.pageType === "daily" && !data.dayNo) return showResult("error", "Please enter a day number.");

  setBusy(true);
  try {
    try {
      const q = new URLSearchParams({ pageType: data.pageType, sprintCode: data.sprintCode });
      if (data.dayNo) q.set("dayNo", data.dayNo);
      const ex = await api(`/api/exists?${q.toString()}`);
      if (ex.exists && !confirm(`Page already exists:\n${ex.path}\n\nPublishing will overwrite it. Continue?`)) return;
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
  // Team roster -> daily members + planning capacity
  try {
    const { members } = await api("/api/team");
    roster = members || [];
  } catch (_) { roster = []; }
  roster.forEach((n) => $("memberRows").appendChild(memberRow(n)));
  roster.forEach((n) => $("capacityRows").appendChild(capacityRow(n)));
  if (!$("memberRows").children.length) $("memberRows").appendChild(memberRow());
  if (!$("capacityRows").children.length) $("capacityRows").appendChild(capacityRow());

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
  if (sel.options.length === 1) sel.value = OTHER;
  toggleOther();

  // Wiring
  sel.addEventListener("change", () => { toggleOther(); updatePath(); });
  $("sprintOther").addEventListener("input", updatePath);
  $("dayNo").addEventListener("input", updatePath);
  $("pageType").addEventListener("change", applyType);

  document.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", () => ADDERS[btn.dataset.add](btn))
  );

  $("standup-form").addEventListener("submit", publish);
  applyType();
}

function applyType() {
  const t = pageType();
  document.querySelectorAll("[data-type]").forEach((el) =>
    el.classList.toggle("hidden", el.dataset.type !== t)
  );
  $("dayWrap").classList.toggle("hidden", t !== "daily");
  updatePath();
}

function toggleOther() {
  $("sprintOther").classList.toggle("hidden", $("sprintSelect").value !== OTHER);
}

function updatePath() {
  const code = sprintCode();
  if (!code) return void ($("targetPath").textContent = "");
  const t = pageType();
  const leaf =
    t === "daily" ? `Day - ${$("dayNo").value || "?"}` : t === "planning" ? "Sprint Planning" : "Sprint R2r";
  $("targetPath").textContent = `→ Sprint ${code} / ${leaf}`;
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

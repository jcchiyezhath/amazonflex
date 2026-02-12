/* Flex Route Verifier
   - Local-only (no backend)
   - iPhone Safari friendly
*/

const STORAGE_KEY = "flex_route_verifier_v1";

const STATUS = {
  UNMARKED: "unmarked",
  CONFIRMED: "confirmed",
  MISSING: "missing",
  EXTRA: "extra",
};

const STATUS_ORDER = [STATUS.UNMARKED, STATUS.CONFIRMED, STATUS.MISSING, STATUS.EXTRA];

const el = {
  inputText: document.getElementById("inputText"),
  btnExtract: document.getElementById("btnExtract"),
  btnPaste: document.getElementById("btnPaste"),
  btnClearBox: document.getElementById("btnClearBox"),
  btnCopy: document.getElementById("btnCopy"),
  btnReset: document.getElementById("btnReset"),
  btnUnmarkAll: document.getElementById("btnUnmarkAll"),
  btnRemoveUnmarked: document.getElementById("btnRemoveUnmarked"),
  btnTheme: document.getElementById("btnTheme"),

  list: document.getElementById("list"),
  emptyState: document.getElementById("emptyState"),

  countTotal: document.getElementById("countTotal"),
  countConfirmed: document.getElementById("countConfirmed"),
  countMissing: document.getElementById("countMissing"),
  countExtra: document.getElementById("countExtra"),
  countUnmarked: document.getElementById("countUnmarked"),

  toast: document.getElementById("toast"),
};

let state = {
  theme: "auto", // auto | dark | light
  items: [],     // { code: "1234", status: "unmarked" }
};

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.style.opacity = "1";
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => (el.toast.style.opacity = "0"), 1200);
}

function normalizeCode(s) {
  return String(s || "").trim().slice(0, 4);
}

function dedupeAdd(codes) {
  const existing = new Set(state.items.map(i => i.code));
  let added = 0;

  for (const c of codes) {
    const code = normalizeCode(c);
    if (!/^\d{4}$/.test(code)) continue;
    if (!existing.has(code)) {
      state.items.push({ code, status: STATUS.UNMARKED });
      existing.add(code);
      added++;
    }
  }

  // Sort numeric
  state.items.sort((a,b) => Number(a.code) - Number(b.code));

  return added;
}

/* Extraction logic
   Goal: get last 4 digits of TBAs from pasted text.
   Common patterns:
   - "TBA123456789012"  (take last 4)
   - "TBA 123456789012" (take last 4)
   - Long digit runs (take last 4)
*/
function extractLast4FromText(raw) {
  const text = String(raw || "");
  const found = [];

  // 1) TBA + digits (most reliable)
  const reTBA = /TBA\s*([0-9]{6,})/gi;
  let m;
  while ((m = reTBA.exec(text)) !== null) {
    const digits = m[1];
    found.push(digits.slice(-4));
  }

  // 2) Long digit runs (fallback)
  const reLongDigits = /([0-9]{10,})/g;
  while ((m = reLongDigits.exec(text)) !== null) {
    const digits = m[1];
    found.push(digits.slice(-4));
  }

  // 3) If user already has spaced groups like "… 1234"
  // Only accept if nearby "TBA" within the same line (reduces random matches).
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!/TBA/i.test(line)) continue;
    const re4 = /\b(\d{4})\b/g;
    while ((m = re4.exec(line)) !== null) {
      found.push(m[1]);
    }
  }

  return found;
}

function nextStatus(current) {
  const i = STATUS_ORDER.indexOf(current);
  const next = STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
  return next;
}

function badgeText(status) {
  if (status === STATUS.CONFIRMED) return "Confirmed";
  if (status === STATUS.MISSING) return "Missing";
  if (status === STATUS.EXTRA) return "Extra";
  return "Unmarked";
}

function badgeClass(status) {
  if (status === STATUS.CONFIRMED) return "badge s-confirmed";
  if (status === STATUS.MISSING) return "badge s-missing";
  if (status === STATUS.EXTRA) return "badge s-extra";
  return "badge s-unmarked";
}

function render() {
  el.list.innerHTML = "";

  if (!state.items.length) {
    el.emptyState.style.display = "block";
  } else {
    el.emptyState.style.display = "none";
  }

  for (const item of state.items) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "item";
    row.setAttribute("role", "listitem");
    row.setAttribute("aria-label", `Package ${item.code}. Status ${badgeText(item.status)}. Tap to change.`);

    const code = document.createElement("div");
    code.className = "code";
    code.textContent = item.code;

    const badge = document.createElement("div");
    badge.className = badgeClass(item.status);
    badge.textContent = badgeText(item.status);

    row.appendChild(code);
    row.appendChild(badge);

    row.addEventListener("click", () => {
      item.status = nextStatus(item.status);
      save();
      renderCounts();
      // Update only this row quickly
      badge.className = badgeClass(item.status);
      badge.textContent = badgeText(item.status);
      row.setAttribute("aria-label", `Package ${item.code}. Status ${badgeText(item.status)}. Tap to change.`);
    });

    el.list.appendChild(row);
  }

  renderCounts();
}

function renderCounts() {
  const total = state.items.length;
  let confirmed = 0, missing = 0, extra = 0, unmarked = 0;

  for (const i of state.items) {
    if (i.status === STATUS.CONFIRMED) confirmed++;
    else if (i.status === STATUS.MISSING) missing++;
    else if (i.status === STATUS.EXTRA) extra++;
    else unmarked++;
  }

  el.countTotal.textContent = String(total);
  el.countConfirmed.textContent = String(confirmed);
  el.countMissing.textContent = String(missing);
  el.countExtra.textContent = String(extra);
  el.countUnmarked.textContent = String(unmarked);
}

function makeCopyText() {
  const now = new Date();
  const ts = now.toLocaleString();

  const byStatus = {
    confirmed: [],
    missing: [],
    extra: [],
    unmarked: [],
  };

  for (const i of state.items) {
    byStatus[i.status].push(i.code);
  }

  const lines = [];
  lines.push(`Flex Route Verification (${ts})`);
  lines.push(`Total: ${state.items.length}`);
  lines.push(`Confirmed: ${byStatus.confirmed.length}`);
  lines.push(`Missing: ${byStatus.missing.length}`);
  lines.push(`Extra: ${byStatus.extra.length}`);
  lines.push(`Unmarked: ${byStatus.unmarked.length}`);
  lines.push("");

  function section(name, arr) {
    lines.push(`${name} (${arr.length})`);
    lines.push(arr.join(", "));
    lines.push("");
  }

  section("Confirmed", byStatus.confirmed);
  section("Missing", byStatus.missing);
  section("Extra", byStatus.extra);
  section("Unmarked", byStatus.unmarked);

  return lines.join("\n");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
    return true;
  } catch (_) {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "true");
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    toast(ok ? "Copied" : "Copy failed");
    return ok;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.items)) {
      state.items = data.items
        .filter(x => x && /^\d{4}$/.test(String(x.code || "")))
        .map(x => ({
          code: String(x.code),
          status: STATUS_ORDER.includes(x.status) ? x.status : STATUS.UNMARKED
        }));
    }
    if (data && typeof data.theme === "string") {
      state.theme = data.theme;
    }
  } catch (_) {}
}

function applyTheme() {
  // auto: follow system
  const root = document.documentElement;

  if (state.theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else if (state.theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    // auto
    root.removeAttribute("data-theme");
  }

  save();
  toast(`Theme: ${state.theme}`);
}

function cycleTheme() {
  // auto -> dark -> light -> auto
  const order = ["auto", "dark", "light"];
  const idx = order.indexOf(state.theme);
  state.theme = order[(idx + 1) % order.length];
  applyTheme();
}

async function pasteIntoBox() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return toast("Clipboard empty");
    const cur = el.inputText.value || "";
    el.inputText.value = cur ? (cur + "\n" + text) : text;
    toast("Pasted");
    el.inputText.focus();
  } catch (_) {
    toast("Paste not allowed. Use iPhone paste popup.");
    el.inputText.focus();
  }
}

function resetAll() {
  state.items = [];
  el.inputText.value = "";
  save();
  render();
  toast("Reset");
}

function unmarkAll() {
  for (const i of state.items) i.status = STATUS.UNMARKED;
  save();
  render();
  toast("Unmarked");
}

function removeUnmarked() {
  const before = state.items.length;
  state.items = state.items.filter(i => i.status !== STATUS.UNMARKED);
  const removed = before - state.items.length;
  save();
  render();
  toast(removed ? `Removed ${removed}` : "Nothing to remove");
}

function clearBoxOnly() {
  el.inputText.value = "";
  toast("Cleared");
  el.inputText.focus();
}

function extractAndMerge() {
  const raw = el.inputText.value || "";
  const codes = extractLast4FromText(raw);
  const added = dedupeAdd(codes);
  save();
  render();
  toast(added ? `Added ${added}` : "No new codes");
}

/* Events */
el.btnExtract.addEventListener("click", extractAndMerge);
el.btnCopy.addEventListener("click", () => copyToClipboard(makeCopyText()));
el.btnReset.addEventListener("click", resetAll);
el.btnUnmarkAll.addEventListener("click", unmarkAll);
el.btnRemoveUnmarked.addEventListener("click", removeUnmarked);
el.btnClearBox.addEventListener("click", clearBoxOnly);
el.btnPaste.addEventListener("click", pasteIntoBox);
el.btnTheme.addEventListener("click", cycleTheme);

// iOS: allow quick “Done” style behavior by preventing zoom on focus (uses 14px+ already)

// Init
load();
applyTheme();
render();

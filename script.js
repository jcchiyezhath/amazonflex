window.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "flex_route_verifier_v2";

  const STATUS = {
    UNMARKED: "unmarked",
    CONFIRMED: "confirmed",
    MISSING: "missing",
    EXTRA: "extra",
  };
  const STATUS_ORDER = [STATUS.UNMARKED, STATUS.CONFIRMED, STATUS.MISSING, STATUS.EXTRA];

  const $ = (id) => document.getElementById(id);

  const el = {
    inputText: $("inputText"),
    btnExtract: $("btnExtract"),
    btnPaste: $("btnPaste"),
    btnClearBox: $("btnClearBox"),
    btnCopy: $("btnCopy"),
    btnReset: $("btnReset"),
    btnUnmarkAll: $("btnUnmarkAll"),
    btnRemoveUnmarked: $("btnRemoveUnmarked"),
    btnTheme: $("btnTheme"),

    searchInput: $("searchInput"),
    btnClearSearch: $("btnClearSearch"),

    list: $("list"),
    emptyState: $("emptyState"),

    countTotal: $("countTotal"),
    countConfirmed: $("countConfirmed"),
    countMissing: $("countMissing"),
    countExtra: $("countExtra"),
    countUnmarked: $("countUnmarked"),
    countVisible: $("countVisible"),

    toast: $("toast"),
  };

  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.style.opacity = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.toast.style.opacity = "0"), 1200);
  }

  // If JS isn't wired to HTML, fail loudly once (so we don't get “buttons do nothing”)
  const required = ["inputText","btnExtract","btnReset","list","emptyState","toast"];
  for (const id of required) {
    if (!$(id)) {
      alert(`Missing element id="${id}" in index.html. Update files so HTML matches JS.`);
      return;
    }
  }

  let state = {
    theme: "auto",   // auto | dark | light
    items: [],       // { code:"1234", status:"unmarked" }
    search: "",
  };

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
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
      if (data && typeof data.search === "string") state.search = data.search;
      if (data && typeof data.theme === "string") state.theme = data.theme;
    } catch (_) {}
  }

  function applyTheme(silent=false) {
    const root = document.documentElement;
    if (state.theme === "dark") root.setAttribute("data-theme", "dark");
    else if (state.theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    save();
    if (!silent) toast(`Theme: ${state.theme}`);
  }

  function cycleTheme() {
    const order = ["auto", "dark", "light"];
    const idx = order.indexOf(state.theme);
    state.theme = order[(idx + 1) % order.length];
    applyTheme();
  }

  function extractLast4FromText(raw) {
    const text = String(raw || "");
    const found = [];

    // TBA + digits (best)
    const reTBA = /TBA\s*([0-9]{6,})/gi;
    let m;
    while ((m = reTBA.exec(text)) !== null) found.push(m[1].slice(-4));

    // long digit runs (fallback)
    const reLong = /([0-9]{10,})/g;
    while ((m = reLong.exec(text)) !== null) found.push(m[1].slice(-4));

    // lines with TBA + standalone 4 digits
    for (const line of text.split(/\r?\n/)) {
      if (!/TBA/i.test(line)) continue;
      const re4 = /\b(\d{4})\b/g;
      while ((m = re4.exec(line)) !== null) found.push(m[1]);
    }

    return found;
  }

  function dedupeAdd(codes) {
    const existing = new Set(state.items.map(i => i.code));
    let added = 0;

    for (const c of codes) {
      const code = String(c || "").trim().slice(0, 4);
      if (!/^\d{4}$/.test(code)) continue;
      if (!existing.has(code)) {
        state.items.push({ code, status: STATUS.UNMARKED });
        existing.add(code);
        added++;
      }
    }

    state.items.sort((a,b) => Number(a.code) - Number(b.code));
    return added;
  }

  function nextStatus(cur) {
    const i = STATUS_ORDER.indexOf(cur);
    return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
  }

  function badgeText(s) {
    if (s === STATUS.CONFIRMED) return "Confirmed";
    if (s === STATUS.MISSING) return "Missing";
    if (s === STATUS.EXTRA) return "Extra";
    return "Unmarked";
  }

  function badgeClass(s) {
    if (s === STATUS.CONFIRMED) return "badge s-confirmed";
    if (s === STATUS.MISSING) return "badge s-missing";
    if (s === STATUS.EXTRA) return "badge s-extra";
    return "badge s-unmarked";
  }

  function filteredItems() {
    const q = String(state.search || "").trim();
    if (!q) return state.items;
    return state.items.filter(i => i.code.includes(q));
  }

  function renderCounts() {
    let confirmed = 0, missing = 0, extra = 0, unmarked = 0;

    for (const i of state.items) {
      if (i.status === STATUS.CONFIRMED) confirmed++;
      else if (i.status === STATUS.MISSING) missing++;
      else if (i.status === STATUS.EXTRA) extra++;
      else unmarked++;
    }

    el.countTotal.textContent = String(state.items.length);
    el.countConfirmed.textContent = String(confirmed);
    el.countMissing.textContent = String(missing);
    el.countExtra.textContent = String(extra);
    el.countUnmarked.textContent = String(unmarked);
    el.countVisible.textContent = String(filteredItems().length);
  }

  function render() {
    el.list.innerHTML = "";

    if (!state.items.length) {
      el.emptyState.style.display = "block";
      renderCounts();
      return;
    }

    el.emptyState.style.display = "none";

    for (const item of filteredItems()) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "item";
      row.setAttribute("role", "listitem");

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
        badge.className = badgeClass(item.status);
        badge.textContent = badgeText(item.status);
        renderCounts();
      });

      el.list.appendChild(row);
    }

    renderCounts();
  }

  function extractAndMerge() {
    const codes = extractLast4FromText(el.inputText.value || "");
    const added = dedupeAdd(codes);
    save();
    render();
    toast(added ? `Added ${added}` : "No new codes");
  }

  function resetAll() {
    state.items = [];
    state.search = "";
    el.inputText.value = "";
    el.searchInput.value = "";
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

  function setSearch(val) {
    const cleaned = String(val || "").replace(/\D/g, "").slice(0, 4);
    state.search = cleaned;
    el.searchInput.value = cleaned;
    save();
    render();
  }

  function clearSearch() {
    setSearch("");
    toast("Search cleared");
  }

  async function pasteIntoBox() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return toast("Clipboard empty");
      el.inputText.value = el.inputText.value ? (el.inputText.value + "\n" + text) : text;
      toast("Pasted");
      el.inputText.focus();
    } catch (_) {
      toast("Use the iPhone paste popup");
      el.inputText.focus();
    }
  }

  async function copyResults() {
    const by = { confirmed: [], missing: [], extra: [], unmarked: [] };
    for (const i of state.items) by[i.status].push(i.code);

    const out =
      `Flex Route Verification (${new Date().toLocaleString()})\n` +
      `Total: ${state.items.length}\n` +
      `Confirmed: ${by.confirmed.length}\n` +
      `Missing: ${by.missing.length}\n` +
      `Extra: ${by.extra.length}\n` +
      `Unmarked: ${by.unmarked.length}\n\n` +
      `Confirmed (${by.confirmed.length})\n${by.confirmed.join(", ")}\n\n` +
      `Missing (${by.missing.length})\n${by.missing.join(", ")}\n\n` +
      `Extra (${by.extra.length})\n${by.extra.join(", ")}\n\n` +
      `Unmarked (${by.unmarked.length})\n${by.unmarked.join(", ")}\n`;

    try {
      await navigator.clipboard.writeText(out);
      toast("Copied");
    } catch (_) {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = out;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Copied");
    }
  }

  // wire buttons
  el.btnExtract.addEventListener("click", extractAndMerge);
  el.btnReset.addEventListener("click", resetAll);
  el.btnUnmarkAll.addEventListener("click", unmarkAll);
  el.btnRemoveUnmarked.addEventListener("click", removeUnmarked);
  el.btnClearBox.addEventListener("click", () => { el.inputText.value = ""; toast("Cleared"); });
  el.btnPaste.addEventListener("click", pasteIntoBox);
  el.btnCopy.addEventListener("click", copyResults);
  el.btnTheme.addEventListener("click", cycleTheme);

  el.searchInput.addEventListener("input", (e) => setSearch(e.target.value));
  el.btnClearSearch.addEventListener("click", clearSearch);

  // init
  load();
  applyTheme(true);
  el.searchInput.value = state.search || "";
  render();
  toast("Ready");
});

const state = {
  payload: null,
  snapshotIndex: null,
  currentSnapshot: null,
  primarySnapshotRunId: null,
  selectedSnapshotRunIds: [],
  snapshotPayloadCache: new Map(),
  history: [], // 수집 시점 오름차순 [{ snap, payload }] — 추이 차트/직전 대비 변동률용
  trendCountry: null,
  hiddenSites: new Set(),
  siteLabels: new Map(),
  detailOpen: true,
  pagination: {
    currentPage: 1,
    pageSize: 20,
  },
  filters: {
    country: "all",
    sites: [],
    days: "all",
    quota: "all",
    network: "all",
    sort: "price",
  },
};

const HEATMAP_DAYS = [1, 3, 5, 7, 10, 15, 30];
const QUICK_DAYS = [1, 3, 5, 7, 10, 15, 30];
const TREND_DAYS = 7;
const SITE_STYLE = {
  rokebi: { c: "#2563EB", d: "" },
  maaltalk: { c: "#EA580C", d: "7 4" },
  usimsa: { c: "#0F766E", d: "2 3" },
  pindirect: { c: "#7C3AED", d: "10 3 2 3" },
};
const FALLBACK_SITE_STYLE = { c: "#64748B", d: "4 4" };

const $ = (id) => document.getElementById(id);
const elements = {
  lastCollected: $("last-collected"),
  kpiTotal: $("kpi-total"),
  kpiCountries: $("kpi-countries"),
  kpiSites: $("kpi-sites"),
  snapshotDropdownButton: $("snapshot-dropdown-button"),
  snapshotDropdownLabel: $("snapshot-dropdown-label"),
  snapshotDropdownPanel: $("snapshot-dropdown-panel"),
  snapshotChecklist: $("snapshot-checklist"),
  snapshotSelectionHelp: $("snapshot-selection-help"),
  helpButton: $("help-button"),
  helpModal: $("help-modal"),
  helpOverlay: $("help-overlay"),
  helpClose: $("help-close"),
  side: $("side"),
  mobileFilter: $("mfilter"),
  mobileCount: $("mcount"),
  fCountry: $("f-country"),
  fSite: $("f-site"),
  fDays: $("f-days"),
  fNet: $("f-net"),
  quotaFilter: $("quota-filter"),
  sortFilter: $("sort-filter"),
  resetFilters: $("reset-filters"),
  active: $("active"),
  best: $("best"),
  ccards: $("ccards"),
  tCountry: $("t-country"),
  legend: $("legend"),
  trend: $("trend"),
  trendInsight: $("trend-insight"),
  vend: $("vend"),
  heatmapHeadRow: $("heatmap-head-row"),
  heatmapBody: $("heatmap-body"),
  prem: $("prem"),
  premInsight: $("prem-insight"),
  snapshotDiffMeta: $("snapshot-diff-meta"),
  snapshotDiffList: $("snapshot-diff-list"),
  diffPill: $("diff-pill"),
  valueTableBody: $("value-table-body"),
  detailToggle: $("detail-toggle"),
  detailBody: $("detail-body"),
  detailCount: $("detail-count"),
  detailSortLabel: $("detail-sort-label"),
  downloadCsv: $("download-csv"),
  comparisonBody: $("comparison-body"),
  pageFirst: $("page-first"),
  pagePrev: $("page-prev"),
  pageNext: $("page-next"),
  pageLast: $("page-last"),
  pageNumbers: $("page-numbers"),
};

const fmt = new Intl.NumberFormat("ko-KR");
const PAGE_WINDOW_SIZE = 5;

/* ═══ Initialization ═══════════════════════ */

async function loadDashboard() {
  const snapshotIndex = await tryLoadIndex();
  state.snapshotIndex = snapshotIndex;
  bindEvents();

  if (snapshotIndex?.snapshots?.length) {
    const latestSnapshot = getSnapshotByRunId(snapshotIndex.latest_run_id) ?? snapshotIndex.snapshots[0];
    await updateSnapshotSelection({
      primaryRunId: latestSnapshot.run_id,
      selectedRunIds: [latestSnapshot.run_id],
      resetFilters: true,
    });
    loadHistory(); // 첫 화면 이후 백그라운드 로드
    return;
  }

  elements.snapshotDropdownButton.disabled = true;
  elements.snapshotChecklist.innerHTML = "";
  elements.snapshotSelectionHelp.textContent = "기본 최신 데이터만 표시됩니다.";

  const payload = await fetchJson("./data/latest.json");
  const fallbackSnapshot = {
    run_id: payload.summary?.run_id ?? "latest",
    collected_at: payload.summary?.last_collected_at ?? null,
    label: "기본 최신 데이터",
    relative_path: "latest.json",
    selected_sites: payload.summary?.selected_sites ?? [],
    selected_countries: payload.summary?.selected_countries ?? [],
  };

  state.primarySnapshotRunId = fallbackSnapshot.run_id;
  state.selectedSnapshotRunIds = [fallbackSnapshot.run_id];
  state.currentSnapshot = fallbackSnapshot;
  state.snapshotPayloadCache.set(fallbackSnapshot.run_id, payload);
  applyPayload(payload, { resetFilters: true });
}

async function tryLoadIndex() {
  try { return await fetchJson("./data/index.json"); }
  catch { return null; }
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, window.location.href));
  if (!response.ok) throw new Error(`Failed to load dashboard data: ${response.status}`);
  return response.json();
}

async function ensureSnapshotPayload(snapshot) {
  const cached = state.snapshotPayloadCache.get(snapshot.run_id);
  if (cached) return typeof cached.then === "function" ? await cached : cached;
  const pending = fetchJson(`./data/${snapshot.relative_path}`);
  state.snapshotPayloadCache.set(snapshot.run_id, pending);
  try {
    const payload = await pending;
    state.snapshotPayloadCache.set(snapshot.run_id, payload);
    return payload;
  } catch (error) {
    state.snapshotPayloadCache.delete(snapshot.run_id);
    throw error;
  }
}

// 전체 스냅샷을 병렬 로드해 추이 차트와 직전 수집 대비 변동률에 사용한다. 실패한 스냅샷은 건너뛴다.
async function loadHistory() {
  const snapshots = state.snapshotIndex?.snapshots ?? [];
  const settled = await Promise.allSettled(snapshots.map((snap) => ensureSnapshotPayload(snap)));
  state.history = snapshots
    .map((snap, i) => ({ snap, payload: settled[i].status === "fulfilled" ? settled[i].value : null }))
    .filter((item) => item.payload)
    .sort((a, b) => new Date(a.snap.collected_at) - new Date(b.snap.collected_at));
  renderHero(getFilteredRows());
  renderTrend();
}

function getSnapshotByRunId(runId) {
  return state.snapshotIndex?.snapshots?.find((item) => item.run_id === runId) ?? null;
}

function normalizeSelectedSnapshotRunIds(selectedRunIds, primaryRunId) {
  const knownRunIds = (state.snapshotIndex?.snapshots ?? []).map((item) => item.run_id);
  const normalized = [];
  for (const runId of selectedRunIds) {
    if (knownRunIds.includes(runId) && !normalized.includes(runId)) normalized.push(runId);
  }
  if (primaryRunId && !normalized.includes(primaryRunId)) normalized.unshift(primaryRunId);
  return normalized.slice(0, 2);
}

async function updateSnapshotSelection({ primaryRunId, selectedRunIds, resetFilters = false }) {
  const primarySnapshot = getSnapshotByRunId(primaryRunId);
  if (!primarySnapshot) return;

  const normalizedSelectedRunIds = normalizeSelectedSnapshotRunIds(selectedRunIds, primaryRunId);
  const selectedSnapshots = normalizedSelectedRunIds.map((runId) => getSnapshotByRunId(runId)).filter(Boolean);

  elements.snapshotSelectionHelp.textContent = "선택한 스냅샷을 불러오는 중입니다.";
  await Promise.all(selectedSnapshots.map((snapshot) => ensureSnapshotPayload(snapshot)));
  const primaryPayload = await ensureSnapshotPayload(primarySnapshot);

  state.primarySnapshotRunId = primaryRunId;
  state.selectedSnapshotRunIds = normalizedSelectedRunIds;
  state.currentSnapshot = primarySnapshot;
  applyPayload(primaryPayload, { resetFilters });
}

function applyPayload(payload, { resetFilters }) {
  state.payload = payload;
  state.siteLabels = new Map(rowsOf(payload).map((r) => [r.site, r.site_label]));
  if (resetFilters) resetFiltersAndViews();
  initializeFilters();
  renderSnapshotControls();
  render();
}

/* ═══ Data helpers ═════════════════════════ */

const rowsOf = (payload = state.payload) => payload?.comparison_rows ?? [];
const won = (n) => `₩${fmt.format(Math.round(n))}`;
const ccBadge = (code) => `<span class="cc">${escapeHtml(code)}</span>`;
const siteStyle = (site) => SITE_STYLE[site] ?? FALLBACK_SITE_STYLE;
const siteDot = (site) => `<span class="dot" style="background:${siteStyle(site).c}"></span>`;
const countries = () => state.payload?.filters?.countries ?? [];
const countryName = (code) => countries().find(([c]) => c === code)?.[1] ?? code;
const networkBadge = (type) => `<span class="net ${type === "local" ? "local" : "roaming"}">${escapeHtml(type || "-")}</span>`;

// filters.sites와 filters.site_labels는 정렬 기준이 달라 인덱스로 짝지을 수 없다. 비교 행의 site_label을 쓴다.
function siteLabel(site) {
  return state.siteLabels.get(site) ?? site;
}

function minRow(rows) {
  let best = null;
  for (const r of rows) {
    if (r.lowest_price_krw == null) continue;
    if (!best || r.lowest_price_krw < best.lowest_price_krw) best = r;
  }
  return best;
}

function matches(row, { country = true, days = true } = {}) {
  const f = state.filters;
  if (country && f.country !== "all" && row.country_code !== f.country) return false;
  if (f.sites.length > 0 && !f.sites.includes(row.site)) return false;
  if (days && f.days !== "all" && String(row.days) !== f.days) return false;
  if (f.quota !== "all" && row.data_quota_label !== f.quota) return false;
  if (f.network !== "all" && row.network_type !== f.network) return false;
  return true;
}
const matchesGlobalFilters = (row) => matches(row);

// 직전(더 오래된) 수집 시점의 페이로드. 이력이 아직 로드되지 않았으면 null.
function previousPayload() {
  const i = state.history.findIndex((h) => h.snap.run_id === state.primarySnapshotRunId);
  return i > 0 ? state.history[i - 1].payload : null;
}

// 현재 필터 기준 최저가의 직전 수집 대비 변동률(%). countryCode가 없으면 전체 필터 그대로 적용.
function priceDeltaPct(countryCode) {
  const prev = previousPayload();
  if (!prev) return null;
  const pick = (payload) => minRow(rowsOf(payload).filter((r) =>
    countryCode ? matches(r, { country: false }) && r.country_code === countryCode : matches(r)));
  const cur = pick(state.payload);
  const old = pick(prev);
  if (!cur || !old) return null;
  return Math.round(((cur.lowest_price_krw - old.lowest_price_krw) / old.lowest_price_krw) * 100);
}

function deltaChip(pct) {
  if (pct == null) return "";
  if (pct === 0) return '<span class="delta flat">변동 없음</span>';
  return `<span class="delta ${pct < 0 ? "down" : "up"}">${pct < 0 ? "▼" : "▲"} ${Math.abs(pct)}%</span>`;
}

/* ═══ Filter Initialization ═════════════════ */

function initializeFilters() {
  const { filters } = state.payload;
  if (state.filters.sites.length === 0) state.filters.sites = filters.sites.slice();
  if (!state.trendCountry || !countries().some(([c]) => c === state.trendCountry)) {
    state.trendCountry = countries()[0]?.[0] ?? null;
  }
  populateSelect(elements.quotaFilter, [["all", "전체"], ...filters.data_quota_labels.map((l) => [l, l])]);
  setSelectValue(elements.quotaFilter, state.filters.quota);
  setSelectValue(elements.sortFilter, state.filters.sort);
}

function populateSelect(select, options) {
  select.innerHTML = "";
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

function setSelectValue(select, value) {
  const optionValues = Array.from(select.options).map((o) => o.value);
  select.value = optionValues.includes(value) ? value : optionValues[0] ?? "";
}

/* ═══ Snapshot Controls ════════════════════ */

function renderSnapshotControls() {
  const snapshots = state.snapshotIndex?.snapshots ?? [];
  if (!snapshots.length) return;

  elements.snapshotDropdownButton.disabled = false;
  elements.snapshotChecklist.innerHTML = "";

  const selectionCount = state.selectedSnapshotRunIds.length;
  for (const snapshot of snapshots) {
    const isPrimary = snapshot.run_id === state.primarySnapshotRunId;
    const isChecked = state.selectedSnapshotRunIds.includes(snapshot.run_id);
    const isDisabled = !isChecked && selectionCount >= 2;
    const wrapper = document.createElement("label");
    wrapper.className = `snapshot-option${isPrimary ? " is-primary" : ""}`;
    wrapper.innerHTML = `
      <input type="checkbox" value="${escapeHtml(snapshot.run_id)}" ${isChecked ? "checked" : ""} ${isDisabled ? "disabled" : ""}>
      <span class="snapshot-option-copy">
        <strong>${escapeHtml(formatDate(snapshot.collected_at))}</strong>
        <small>${escapeHtml(buildSnapshotScope(snapshot))}</small>
      </span>
    `;
    elements.snapshotChecklist.appendChild(wrapper);
  }

  const selectedSnapshots = state.selectedSnapshotRunIds.map((runId) => getSnapshotByRunId(runId)).filter(Boolean);
  elements.snapshotDropdownLabel.textContent = selectedSnapshots.length
    ? selectedSnapshots.map((s, i) => `${i === 0 ? "기준" : "비교"} ${formatDate(s.collected_at)}`).join(" · ")
    : "시점 선택";

  elements.snapshotSelectionHelp.textContent = selectionCount === 2
    ? "2개 선택 완료 · 첫 번째가 기준 시점입니다"
    : "최대 2개까지 체크 가능";
}

function buildSnapshotScope(snapshot) {
  const siteText = snapshot.selected_sites?.length ? snapshot.selected_sites.join(", ") : "전체 사이트";
  const countryText = snapshot.selected_countries?.length ? snapshot.selected_countries.join(", ") : "전체 국가";
  return `${siteText} · ${countryText}`;
}

/* ═══ Event Binding ════════════════════════ */

function bindEvents() {
  elements.quotaFilter.addEventListener("change", () => applyFilters({ quota: elements.quotaFilter.value }));
  elements.sortFilter.addEventListener("change", () => applyFilters({ sort: elements.sortFilter.value }));
  elements.resetFilters.addEventListener("click", () => {
    resetFiltersAndViews();
    initializeFilters();
    render();
  });

  elements.fCountry.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-country]");
    if (btn) selectCountry(btn.dataset.country);
  });
  elements.fSite.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-site]");
    if (!btn) return;
    const next = new Set(state.filters.sites);
    if (next.has(btn.dataset.site)) next.delete(btn.dataset.site); else next.add(btn.dataset.site);
    if (next.size) applyFilters({ sites: [...next] }); // 최소 1개는 유지
  });
  elements.fDays.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-days]");
    if (btn) applyFilters({ days: btn.dataset.days });
  });
  elements.fNet.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-net]");
    if (btn) applyFilters({ network: btn.dataset.net });
  });
  elements.ccards.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-country]");
    if (btn) selectCountry(state.filters.country === btn.dataset.country ? "all" : btn.dataset.country);
  });
  elements.active.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-clear]");
    if (!btn) return;
    const clear = {
      country: { country: "all" },
      sites: { sites: state.payload.filters.sites.slice() },
      days: { days: "all" },
      quota: { quota: "all" },
      network: { network: "all" },
    }[btn.dataset.clear];
    if (clear) { applyFilters(clear); setSelectValue(elements.quotaFilter, state.filters.quota); }
  });

  elements.tCountry.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tc]");
    if (btn) { state.trendCountry = btn.dataset.tc; renderTrend(); }
  });
  elements.legend.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lg]");
    if (!btn) return;
    const site = btn.dataset.lg;
    if (state.hiddenSites.has(site)) state.hiddenSites.delete(site); else state.hiddenSites.add(site);
    renderTrend();
  });
  elements.heatmapBody.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-hc]");
    if (!cell) return;
    applyFilters({ country: cell.dataset.hc, days: cell.dataset.hd, sort: "price" });
    setSelectValue(elements.sortFilter, "price");
    state.trendCountry = cell.dataset.hc;
    renderTrend();
    elements.detailBody.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  elements.mobileFilter.addEventListener("click", () => {
    const open = elements.side.classList.toggle("open");
    elements.mobileFilter.setAttribute("aria-expanded", String(open));
  });

  elements.snapshotDropdownButton.addEventListener("click", () => {
    const isExpanded = elements.snapshotDropdownButton.getAttribute("aria-expanded") === "true";
    setSnapshotDropdownOpen(!isExpanded);
  });

  elements.snapshotChecklist.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    const nextSelectedRunIds = target.checked
      ? [...state.selectedSnapshotRunIds, target.value]
      : state.selectedSnapshotRunIds.filter((runId) => runId !== target.value);
    const checkedRunIds = normalizeSelectedSnapshotRunIds(nextSelectedRunIds, null);
    const primaryRunId = checkedRunIds[0] ?? state.primarySnapshotRunId;
    if (!primaryRunId) { renderSnapshotControls(); return; }
    await updateSnapshotSelection({ primaryRunId, selectedRunIds: checkedRunIds.length ? checkedRunIds : [primaryRunId], resetFilters: false });
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (!elements.snapshotDropdownButton.contains(event.target) && !elements.snapshotDropdownPanel.contains(event.target)) {
      setSnapshotDropdownOpen(false);
    }
  });

  elements.detailToggle.addEventListener("click", () => {
    state.detailOpen = !state.detailOpen;
    elements.detailToggle.classList.toggle("open", state.detailOpen);
    elements.detailToggle.setAttribute("aria-expanded", String(state.detailOpen));
    elements.detailBody.hidden = !state.detailOpen;
  });

  elements.helpButton.addEventListener("click", () => { elements.helpModal.hidden = false; });
  elements.helpClose.addEventListener("click", () => { elements.helpModal.hidden = true; });
  elements.helpOverlay.addEventListener("click", () => { elements.helpModal.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !elements.helpModal.hidden) elements.helpModal.hidden = true; });

  elements.downloadCsv.addEventListener("click", () => { downloadComparisonRows(getFilteredRows()); });

  elements.pagePrev.addEventListener("click", () => goToPage(state.pagination.currentPage - 1));
  elements.pageNext.addEventListener("click", () => goToPage(state.pagination.currentPage + 1));
  elements.pageFirst.addEventListener("click", () => goToPage(1));
  elements.pageLast.addEventListener("click", () => {
    const rows = getFilteredRows();
    goToPage(Math.max(1, Math.ceil(rows.length / state.pagination.pageSize)));
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderTrend, 120);
  });
}

function selectCountry(code) {
  if (code !== "all") state.trendCountry = code;
  applyFilters({ country: code });
}

/* ═══ Rendering ════════════════════════════ */

function render() {
  const rows = getFilteredRows();
  renderHeader();
  renderSidebar();
  renderActiveFilters(rows);
  renderHero(rows);
  renderTrend();
  renderHeatmapAndVendors(rows);
  renderPremium();
  renderSnapshotDiff(rows);
  renderValueTable(rows);
  renderDetailTable(rows);
}

function renderHeader() {
  const { summary } = state.payload;
  elements.lastCollected.textContent = formatDate(summary.last_collected_at);
  elements.kpiTotal.textContent = fmt.format(summary.record_count);
  elements.kpiCountries.textContent = String(summary.country_count);
  elements.kpiSites.textContent = String(summary.site_count);
}

/* ── Sidebar ───────────────────────────── */
function renderSidebar() {
  const f = state.filters;
  const { filters } = state.payload;
  const rows = rowsOf();
  const sum = (list) => list.reduce((n, r) => n + (r.option_count ?? 1), 0);

  const byCountry = rows.filter((r) => matches(r, { country: false }));
  elements.fCountry.innerHTML =
    optButton({ attr: 'data-country="all"', pressed: f.country === "all", label: "전체 국가", count: sum(byCountry) }) +
    countries().map(([code, name]) => optButton({
      attr: `data-country="${escapeHtml(code)}"`, pressed: f.country === code,
      label: `${ccBadge(code)} ${escapeHtml(name)}`, count: sum(byCountry.filter((r) => r.country_code === code)),
    })).join("");

  const bySite = rows.filter((r) => (f.country === "all" || r.country_code === f.country)
    && (f.days === "all" || String(r.days) === f.days)
    && (f.quota === "all" || r.data_quota_label === f.quota)
    && (f.network === "all" || r.network_type === f.network));
  const checkIcon = '<span class="check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>';
  elements.fSite.innerHTML = filters.sites.map((site) => optButton({
    attr: `data-site="${escapeHtml(site)}"`, pressed: f.sites.includes(site),
    label: `${checkIcon}${siteDot(site)} ${escapeHtml(siteLabel(site))}`, count: sum(bySite.filter((r) => r.site === site)),
  })).join("");

  elements.fDays.innerHTML = ["all", ...QUICK_DAYS].map((d) =>
    `<button class="chip" type="button" data-days="${d}" aria-pressed="${f.days === String(d)}">${d === "all" ? "전체" : `${d}일`}</button>`).join("");

  elements.fNet.innerHTML = [["all", "전체"], ...filters.network_types.map((t) => [t, t.charAt(0).toUpperCase() + t.slice(1)])]
    .map(([v, l]) => `<button type="button" data-net="${escapeHtml(v)}" aria-pressed="${f.network === v}">${escapeHtml(l)}</button>`).join("");
}

function optButton({ attr, pressed, label, count }) {
  return `<button class="opt" type="button" ${attr} aria-pressed="${pressed}"><span class="opt-l">${label}</span><span class="cnt">${fmt.format(count)}</span></button>`;
}

/* ── Active filter chips ───────────────── */
function renderActiveFilters(rows) {
  const f = state.filters;
  const allSites = state.payload.filters.sites;
  const tags = [];
  if (f.country !== "all") tags.push(["country", `국가 · ${countryName(f.country)}`]);
  if (f.sites.length !== allSites.length) tags.push(["sites", `사이트 · ${f.sites.length}/${allSites.length}`]);
  if (f.days !== "all") tags.push(["days", `일수 · ${f.days}일`]);
  if (f.quota !== "all") tags.push(["quota", `용량 · ${f.quota}`]);
  if (f.network !== "all") tags.push(["network", `네트워크 · ${f.network}`]);

  const x = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  elements.active.innerHTML = (tags.length
    ? '<span class="lbl">적용된 필터</span>' + tags.map(([key, text]) =>
      `<span class="tag">${escapeHtml(text)}<button type="button" data-clear="${key}" aria-label="${escapeHtml(text)} 해제">${x}</button></span>`).join("")
    : '<span class="lbl">필터 없음 · 전체 조건을 보고 있어요</span>')
    + `<span class="result"><b>${fmt.format(rows.length)}</b>개 비교 행</span>`;
  elements.mobileCount.textContent = tags.length ? `(${tags.length})` : "";
}

/* ── Hero ──────────────────────────────── */
function renderHero(rows) {
  const best = minRow(rows);
  if (!best) {
    elements.best.innerHTML = '<div class="eyebrow">조건에 맞는 옵션이 없어요</div>';
  } else {
    const options = rows.reduce((n, r) => n + (r.option_count ?? 1), 0);
    const delta = priceDeltaPct(null);
    elements.best.innerHTML = `
      <div style="position:relative;z-index:1">
        <div class="eyebrow">지금 가장 저렴한 옵션</div>
        <div class="big num"><small>₩</small>${fmt.format(best.lowest_price_krw)}</div>
        <div class="what">${escapeHtml(best.country_name_ko)} · ${escapeHtml(String(best.days))}일 · ${escapeHtml(best.data_quota_label || "용량 정보 없음")}</div>
        <div class="meta">
          <span>${escapeHtml(best.site_label)}</span>
          <span>${escapeHtml(best.network_type || "-")}</span>
          ${delta == null ? "" : `<span>직전 수집 대비 ${delta === 0 ? "변동 없음" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`}</span>`}
        </div>
      </div>
      <div class="kpis">
        <div><b>${fmt.format(options)}</b><span>옵션</span></div>
        <div><b>${new Set(rows.map((r) => r.country_code)).size}</b><span>국가</span></div>
        <div><b>${new Set(rows.map((r) => r.site)).size}</b><span>사이트</span></div>
      </div>`;
  }

  const base = rowsOf().filter((r) => matches(r, { country: false }));
  elements.ccards.innerHTML = countries().map(([code, name]) => {
    const m = minRow(base.filter((r) => r.country_code === code));
    const dim = state.filters.country !== "all" && state.filters.country !== code;
    return `<button class="ccard${dim ? " dim" : ""}" type="button" data-country="${escapeHtml(code)}" aria-pressed="${state.filters.country === code}">
      <div class="row"><span class="nm">${ccBadge(code)} ${escapeHtml(name)}</span>${deltaChip(priceDeltaPct(code))}</div>
      <div class="px">${m ? `<small>₩</small>${fmt.format(m.lowest_price_krw)}` : "—"}</div>
      <div class="sub"><span>${m ? `${escapeHtml(String(m.days))}일 · ${escapeHtml(m.data_quota_label || "-")}` : "조건 없음"}</span><span>${m ? escapeHtml(m.site_label) : ""}</span></div>
    </button>`;
  }).join("");
}

/* ── Trend chart ───────────────────────── */
function trendSeries(countryCode) {
  const sites = state.payload.filters.sites;
  return sites.map((site) => ({
    site,
    pts: state.history
      .map((h) => {
        const m = minRow(rowsOf(h.payload).filter((r) => r.country_code === countryCode && r.site === site && r.days === TREND_DAYS));
        return m ? { t: new Date(h.snap.collected_at).getTime(), v: m.lowest_price_krw } : null;
      })
      .filter(Boolean),
  })).filter((s) => s.pts.length);
}

function renderTrend() {
  elements.tCountry.innerHTML = countries().map(([code, name]) =>
    `<button type="button" data-tc="${escapeHtml(code)}" aria-pressed="${state.trendCountry === code}">${escapeHtml(name)}</button>`).join("");

  if (state.history.length < 2) {
    elements.legend.innerHTML = "";
    elements.trendInsight.textContent = "";
    elements.trend.innerHTML = `<div class="empty-state">${state.history.length ? "비교할 수집 이력이 부족합니다." : "수집 이력을 불러오는 중입니다."}</div>`;
    return;
  }

  const series = trendSeries(state.trendCountry);
  elements.legend.innerHTML = series.map(({ site }) => `<button class="lg" type="button" data-lg="${escapeHtml(site)}" aria-pressed="${!state.hiddenSites.has(site)}">
    <svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="${siteStyle(site).c}" stroke-width="2.5" stroke-dasharray="${siteStyle(site).d}" stroke-linecap="round"/></svg>${escapeHtml(siteLabel(site))}</button>`).join("");

  const vis = series.filter((s) => !state.hiddenSites.has(s.site));
  const all = vis.flatMap((s) => s.pts);
  if (!all.length) {
    elements.trend.innerHTML = '<div class="empty-state">표시할 사이트를 선택하세요.</div>';
    elements.trendInsight.textContent = "";
    return;
  }

  const W = Math.max(320, Math.round(elements.trend.clientWidth));
  const H = 300, L = 58, R = W > 560 ? 140 : 14, T = 14, B = 30;
  const values = all.map((p) => p.v);
  const step = Math.max(100, Math.pow(10, Math.floor(Math.log10(Math.max(...values) - Math.min(...values) || 1000))) / 2);
  const lo = Math.max(0, Math.floor((Math.min(...values) * 0.92) / step) * step);
  const hi = Math.ceil((Math.max(...values) * 1.05) / step) * step;
  const times = state.history.map((h) => new Date(h.snap.collected_at).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);

  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt.format(Math.round(v))}</text>`;
  }
  let lastLabelX = -Infinity;
  for (const t of times) {
    if (x(t) - lastLabelX < 38) continue;
    lastLabelX = x(t);
    const d = new Date(t);
    g += `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}</text>`;
  }

  const ends = [];
  for (const s of vis) {
    const st = siteStyle(s.site);
    g += `<polyline points="${s.pts.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")}" fill="none" stroke="${st.c}" stroke-width="2.5" stroke-dasharray="${st.d}" stroke-linecap="round" stroke-linejoin="round"/>`;
    s.pts.forEach((p, i) => {
      g += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${i === s.pts.length - 1 ? 4.5 : 3}" fill="#fff" stroke="${st.c}" stroke-width="2"><title>${escapeHtml(siteLabel(s.site))} ${escapeHtml(formatDate(new Date(p.t).toISOString()))} ${won(p.v)}</title></circle>`;
    });
    const last = s.pts[s.pts.length - 1];
    ends.push({ site: s.site, y: y(last.v), v: last.v });
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y < ends[i - 1].y + 15) ends[i].y = ends[i - 1].y + 15;
  if (R > 20) {
    for (const e of ends) {
      g += `<text class="endlbl" x="${W - R + 10}" y="${e.y + 4}" style="fill:${siteStyle(e.site).c}">${escapeHtml(siteLabel(e.site))} ${won(e.v)}</text>`;
    }
  }
  elements.trend.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(countryName(state.trendCountry))} 사이트별 ${TREND_DAYS}일 최저가 추이">${g}</svg>`;

  const cur = vis.map((s) => ({ s, v: s.pts[s.pts.length - 1].v })).sort((a, b) => a.v - b.v)[0];
  const drops = vis.filter((s) => s.pts.length > 1)
    .map((s) => ({ s, p: (s.pts[s.pts.length - 1].v - s.pts[0].v) / s.pts[0].v }))
    .sort((a, b) => a.p - b.p);
  const dropText = drops.length && drops[0].p < 0
    ? ` 첫 수집 대비 가장 많이 내린 곳은 <b>${escapeHtml(siteLabel(drops[0].s.site))} (${Math.round(drops[0].p * 100)}%)</b>입니다.` : "";
  elements.trendInsight.innerHTML = `${escapeHtml(countryName(state.trendCountry))} ${TREND_DAYS}일 기준 최근 수집 최저가는 <b>${escapeHtml(siteLabel(cur.s.site))} ${won(cur.v)}</b>.${dropText}`;
}

/* ── Heatmap + Vendor ranking ──────────── */
function heatRamp(t) {
  const a = [239, 246, 255], m = [147, 197, 253], z = [37, 99, 235], e = [30, 58, 138];
  const [p, q, k] = t < 0.5 ? [a, m, t * 2] : t < 0.8 ? [m, z, (t - 0.5) / 0.3] : [z, e, (t - 0.8) / 0.2];
  return p.map((v, i) => Math.round(v + (q[i] - v) * k));
}

function renderHeatmapAndVendors(rows) {
  const base = rowsOf().filter((r) => matches(r, { country: false, days: false }));
  const cells = new Map();
  const colMin = {}, colMax = {};
  for (const d of HEATMAP_DAYS) {
    const prices = [];
    for (const [code] of countries()) {
      const m = minRow(base.filter((r) => r.country_code === code && r.days === d));
      cells.set(`${code}|${d}`, m);
      if (m) prices.push(m.lowest_price_krw);
    }
    colMin[d] = prices.length ? Math.min(...prices) : null;
    colMax[d] = prices.length ? Math.max(...prices) : null;
  }

  elements.heatmapHeadRow.innerHTML = '<th class="rl"></th>' + HEATMAP_DAYS.map((d) => `<th>${d}일</th>`).join("");
  elements.heatmapBody.innerHTML = countries().map(([code, name]) => {
    const tds = HEATMAP_DAYS.map((d) => {
      const r = cells.get(`${code}|${d}`);
      if (!r) return '<td><div class="hm-cell empty"><b>—</b></div></td>';
      const t = colMax[d] === colMin[d] ? 0 : (r.lowest_price_krw - colMin[d]) / (colMax[d] - colMin[d]);
      const [rr, gg, bb] = heatRamp(t);
      const sel = state.filters.country === code && state.filters.days === String(d);
      const title = `${name} ${d}일 ${won(r.lowest_price_krw)} · ${r.site_label} · ${r.data_quota_label || "용량 정보 없음"} ${r.network_type || ""}`;
      return `<td><button class="hm-cell${r.lowest_price_krw === colMin[d] ? " win" : ""}${sel ? " sel" : ""}" type="button" data-hc="${escapeHtml(code)}" data-hd="${d}"
        style="--bg-c:rgb(${rr},${gg},${bb});--fg-c:${t < 0.55 ? "#0F172A" : "#fff"}" title="${escapeHtml(title)}">
        <b>${won(r.lowest_price_krw)}</b><span><i></i>${escapeHtml(r.site_label)}</span></button></td>`;
    }).join("");
    return `<tr><td class="rl">${ccBadge(code)} ${escapeHtml(name)}</td>${tds}</tr>`;
  }).join("");

  // 벤더: 칸별 최저가 보유 수 + 현재 필터 기준 전체 최저가
  const wins = {};
  let totalCells = 0;
  for (const r of cells.values()) if (r) { wins[r.site] = (wins[r.site] ?? 0) + 1; totalCells++; }
  const list = state.filters.sites.map((site) => {
    const own = rows.filter((r) => r.site === site);
    return { site, min: minRow(own), options: own.reduce((n, r) => n + (r.option_count ?? 1), 0), wins: wins[site] ?? 0 };
  }).sort((a, b) => (a.min?.lowest_price_krw ?? Infinity) - (b.min?.lowest_price_krw ?? Infinity));

  elements.vend.innerHTML = list.map((v, i) => `<li>
    <span class="rk">${i + 1}</span>
    <div><div class="nm">${siteDot(v.site)}${escapeHtml(siteLabel(v.site))}</div>
      <div class="bar" role="img" aria-label="최저가 보유 ${v.wins}칸"><i style="width:${totalCells ? (v.wins / totalCells) * 100 : 0}%;background:${siteStyle(v.site).c}"></i></div>
      <div class="sub">최저가 보유 ${v.wins}/${totalCells}칸 · 옵션 ${fmt.format(v.options)}개</div></div>
    <div class="px">${v.min ? won(v.min.lowest_price_krw) : "—"}<small>전체 최저가</small></div></li>`).join("")
    || '<div class="empty-state">사이트를 선택하세요.</div>';
}

/* ── Local vs Roaming ──────────────────── */
function renderPremium() {
  const f = state.filters;
  const premiumRows = (state.payload.network_premium_summary ?? []).filter((r) =>
    (f.sites.length === 0 || f.sites.includes(r.site))
    && (f.days === "all" || String(r.days) === f.days)
    && (f.quota === "all" || r.data_quota_label === f.quota)
    && r.local_price_krw > 0 && r.roaming_price_krw > 0);

  const stats = countries().map(([code, name]) => {
    const rs = premiumRows.filter((r) => r.country_code === code);
    if (!rs.length) return { code, name, pct: null };
    const avg = (key) => rs.reduce((n, r) => n + r[key], 0) / rs.length;
    return { code, name, pct: (avg("roaming_price_krw") / avg("local_price_krw") - 1) * 100 };
  });

  elements.prem.innerHTML = stats.map(({ code, name, pct }) => {
    if (pct == null) return `<div class="prem-row"><span class="nm">${ccBadge(code)} ${escapeHtml(name)}</span><div class="axis"></div><span class="v na">비교 데이터 없음</span></div>`;
    const pos = pct >= 0;
    const w = (Math.min(Math.abs(pct), 50) / 50) * 50;
    return `<div class="prem-row"><span class="nm">${ccBadge(code)} ${escapeHtml(name)}</span>
      <div class="axis" role="img" aria-label="${escapeHtml(name)} ${pct.toFixed(1)}%"><i style="${pos ? "left:50%;background:#EA580C" : "right:50%;background:#2563EB"};width:${w}%"></i></div>
      <span class="v ${pos ? "pos" : "neg"}">${pos ? "+" : "−"}${Math.abs(pct).toFixed(1)}% <small>${pos ? "Local 유리" : "Roaming 유리"}</small></span></div>`;
  }).join("") + '<div class="axis-l"><span></span><div><span>← Roaming 유리</span><span>Local 유리 →</span></div><span></span></div>';

  const valid = stats.filter((s) => s.pct != null);
  if (!valid.length) { elements.premInsight.textContent = "Local/Roaming 비교 데이터가 부족합니다."; return; }
  const localWins = valid.filter((s) => s.pct > 0).length;
  const big = [...valid].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  elements.premInsight.innerHTML = `${valid.length}개국 중 <b>${localWins}개국</b>에서 Local이 더 저렴합니다. 차이가 가장 큰 곳은 <b>${escapeHtml(big.name)} (${big.pct >= 0 ? "+" : "−"}${Math.abs(big.pct).toFixed(1)}%)</b>입니다.`;
}

/* ── Value Table (Top 10) ───────────────── */
function renderValueTable(rows) {
  const valued = rows
    .map((r) => ({ ...r, _unit: calcUnitPrice(r) }))
    .filter((r) => r._unit != null)
    .sort((a, b) => a._unit - b._unit)
    .slice(0, 10);

  if (!valued.length) {
    elements.valueTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">가성비 계산 가능한 데이터가 없습니다.</td></tr>';
    return;
  }
  const lo = valued[0]._unit, hi = valued[valued.length - 1]._unit;
  elements.valueTableBody.innerHTML = valued.map((r, i) => `<tr>
    <td><span class="rkn${i < 3 ? " hi" : ""}">${i + 1}</span></td>
    <td class="nw">${ccBadge(r.country_code)} ${escapeHtml(r.country_name_ko)}</td>
    <td class="nw">${siteDot(r.site)} ${escapeHtml(r.site_label)}</td>
    <td class="num">${escapeHtml(String(r.days))}일</td>
    <td class="num">${escapeHtml(r.data_quota_label || "-")}</td>
    <td>${networkBadge(r.network_type)}</td>
    <td class="r px">${won(r.lowest_price_krw)}</td>
    <td class="r"><span class="ubar"><i style="--w:${Math.max(8, (r._unit / hi) * 100)}%;--c:${r._unit <= lo * 1.15 ? "#15803D" : "#2563EB"}"></i><b>${r._unit.toFixed(1)}</b></span></td>
  </tr>`).join("");
}

function parseDataQuotaGB(label) {
  if (!label) return 0;
  if (label === "unlimited") return 100; // 무제한은 100GB로 가정
  const match = label.match(/^(\d+(?:\.\d+)?)\s*GB$/i);
  if (match) return parseFloat(match[1]);
  const mbMatch = label.match(/^(\d+(?:\.\d+)?)\s*MB$/i);
  if (mbMatch) return parseFloat(mbMatch[1]) / 1024;
  return 0;
}

/* ── Snapshot Diff ──────────────────────── */
function renderSnapshotDiff(rows) {
  const comparisonSnapshots = getSelectedComparisonSnapshots();
  elements.snapshotDiffList.innerHTML = "";
  elements.diffPill.hidden = true;

  if (!comparisonSnapshots.length) {
    elements.snapshotDiffMeta.textContent = "우측 상단에서 시점 2개를 선택하면 가격 또는 노출 여부가 달라진 상품만 표시합니다.";
    elements.snapshotDiffList.innerHTML = '<div class="empty-state">비교할 시점을 2개 선택해 주세요.</div>';
    return;
  }

  const changed = getChangedComparisonEntries(rows);
  const compare = comparisonSnapshots[0];
  elements.snapshotDiffMeta.textContent = `${formatDate(compare.collected_at)} → ${formatDate(state.currentSnapshot?.collected_at)}`;
  elements.diffPill.textContent = `${fmt.format(changed.length)}건`;
  elements.diffPill.hidden = false;

  if (!changed.length) {
    elements.snapshotDiffList.innerHTML = '<div class="empty-state">현재 필터 조건에서 달라진 상품이 없습니다.</div>';
    return;
  }

  elements.snapshotDiffList.innerHTML = changed.slice(0, 50).map(({ row, primaryRow, compareRow }) => {
    let chg;
    if (!compareRow) chg = `<span class="badge-new">기준 시점에만 노출</span> ${won(primaryRow.lowest_price_krw ?? 0)}`;
    else if (!primaryRow) chg = `<span class="badge-end">비교 시점에만 노출</span> <s>${won(compareRow.lowest_price_krw ?? 0)}</s>`;
    else if (primaryRow.lowest_price_krw == null || compareRow.lowest_price_krw == null) chg = '<span class="badge-end">비교 불가</span>';
    else {
      const pct = Math.round(((primaryRow.lowest_price_krw - compareRow.lowest_price_krw) / compareRow.lowest_price_krw) * 100);
      chg = `<s>${won(compareRow.lowest_price_krw)}</s>${won(primaryRow.lowest_price_krw)} ${deltaChip(pct)}`;
    }
    return `<div class="diff">
      <div><div class="t1">${ccBadge(row.country_code)} ${siteDot(row.site)} ${escapeHtml(row.site_label)}</div>
        <div class="t2">${escapeHtml(row.country_name_ko)} · ${escapeHtml(String(row.days))}일 · ${escapeHtml(row.data_quota_label || "-")} · ${escapeHtml(row.network_type || "-")}</div></div>
      <div class="chg">${chg}</div>
    </div>`;
  }).join("");
}

/* ── Detail Table ───────────────────────── */
function renderDetailTable(rows) {
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pagination.pageSize));
  const currentPage = Math.min(state.pagination.currentPage, pageCount);
  state.pagination.currentPage = currentPage;
  const startIndex = (currentPage - 1) * state.pagination.pageSize;
  const pagedRows = rows.slice(startIndex, startIndex + state.pagination.pageSize);

  elements.detailCount.textContent = fmt.format(rows.length);
  const sortLabels = { price: "최저가 낮은순", days: "사용일수 낮은순", unit_price: "가성비순", site: "사이트명 순" };
  elements.detailSortLabel.textContent = sortLabels[state.filters.sort] || state.filters.sort;
  elements.downloadCsv.disabled = rows.length === 0;
  renderPagination(pageCount, currentPage, rows.length === 0);

  if (!rows.length) {
    elements.comparisonBody.innerHTML = '<tr><td class="empty-state" colspan="9">선택한 필터에 맞는 결과가 없습니다.</td></tr>';
    return;
  }

  elements.comparisonBody.innerHTML = pagedRows.map((row) => `<tr>
    <td class="nw">${ccBadge(row.country_code)} ${escapeHtml(row.country_name_ko)}</td>
    <td class="nw">${siteDot(row.site)} ${escapeHtml(row.site_label)}</td>
    <td class="num">${escapeHtml(String(row.days))}일</td>
    <td class="num">${escapeHtml(row.data_quota_label || "-")}</td>
    <td>${networkBadge(row.network_type)}</td>
    <td class="r px">${row.lowest_price_krw != null ? won(row.lowest_price_krw) : "-"}</td>
    <td class="r num">${fmt.format(row.option_count)}</td>
    <td class="samp">${escapeHtml(row.sample_option_name || "-")}</td>
    <td><a class="ext" href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a></td>
  </tr>`).join("");
}

function renderPagination(pageCount, currentPage, isEmpty) {
  elements.pageFirst.disabled = isEmpty || currentPage <= 1;
  elements.pagePrev.disabled = isEmpty || currentPage <= 1;
  elements.pageNext.disabled = isEmpty || currentPage >= pageCount;
  elements.pageLast.disabled = isEmpty || currentPage >= pageCount;
  elements.pageNumbers.innerHTML = "";

  if (isEmpty) return;

  const windowStart = Math.floor((currentPage - 1) / PAGE_WINDOW_SIZE) * PAGE_WINDOW_SIZE + 1;
  const windowEnd = Math.min(pageCount, windowStart + PAGE_WINDOW_SIZE - 1);

  for (let page = windowStart; page <= windowEnd; page++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn page-button${page === currentPage ? " is-active" : ""}`;
    button.textContent = String(page);
    button.disabled = page === currentPage;
    button.addEventListener("click", () => goToPage(page));
    elements.pageNumbers.appendChild(button);
  }
}

/* ═══ Data Filtering ═══════════════════════ */

function getFilteredRows() {
  return sortRows(rowsOf().filter(matchesGlobalFilters));
}

function sortRows(rows) {
  const sorted = [...rows];
  if (state.filters.sort === "days") {
    sorted.sort((a, b) => (a.days ?? 0) - (b.days ?? 0) || (a.lowest_price_krw ?? 0) - (b.lowest_price_krw ?? 0));
  } else if (state.filters.sort === "site") {
    sorted.sort((a, b) => a.site.localeCompare(b.site) || (a.days ?? 0) - (b.days ?? 0));
  } else if (state.filters.sort === "unit_price") {
    sorted.sort((a, b) => (calcUnitPrice(a) ?? Infinity) - (calcUnitPrice(b) ?? Infinity));
  } else {
    sorted.sort((a, b) => (a.lowest_price_krw ?? Infinity) - (b.lowest_price_krw ?? Infinity) || (a.days ?? 0) - (b.days ?? 0));
  }
  return sorted;
}

function calcUnitPrice(row) {
  if (row.lowest_price_krw == null || !row.days) return null;
  const gb = parseDataQuotaGB(row.data_quota_label);
  return gb > 0 ? row.lowest_price_krw / gb / row.days : null;
}

/* ═══ Snapshot Comparison ══════════════════ */

function getSelectedComparisonSnapshots() {
  return state.selectedSnapshotRunIds
    .filter((runId) => runId !== state.primarySnapshotRunId)
    .map((runId) => getSnapshotByRunId(runId))
    .filter(Boolean);
}

function createComparisonKey(row) {
  return [row.country_code ?? "", row.site ?? "", row.days ?? "", row.data_quota_label ?? "", row.network_type ?? ""].join("|");
}

function buildComparisonLookup(rows) {
  const lookup = new Map();
  for (const row of rows) lookup.set(createComparisonKey(row), row);
  return lookup;
}

// 기준(primary)과 비교 스냅샷에서 가격이 다르거나 한쪽에만 있는 행을 반환한다.
function getChangedComparisonEntries(rows) {
  const comparisonSnapshots = getSelectedComparisonSnapshots();
  if (!comparisonSnapshots.length) return [];

  const comparePayload = state.snapshotPayloadCache.get(comparisonSnapshots[0].run_id);
  if (!comparePayload || typeof comparePayload.then === "function") return [];

  const primaryLookup = buildComparisonLookup(rows);
  const compareLookup = buildComparisonLookup(rowsOf(comparePayload).filter(matchesGlobalFilters));

  return Array.from(new Set([...primaryLookup.keys(), ...compareLookup.keys()]))
    .map((key) => {
      const primaryRow = primaryLookup.get(key) ?? null;
      const compareRow = compareLookup.get(key) ?? null;
      const changed = !primaryRow || !compareRow
        || primaryRow.lowest_price_krw == null || compareRow.lowest_price_krw == null
        || primaryRow.lowest_price_krw !== compareRow.lowest_price_krw;
      return changed ? { row: primaryRow ?? compareRow, primaryRow, compareRow } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.row.lowest_price_krw ?? Infinity) - (b.row.lowest_price_krw ?? Infinity) || (a.row.days ?? 0) - (b.row.days ?? 0));
}

/* ═══ Filter Management ════════════════════ */

function applyFilters(nextFilters) {
  state.filters = { ...state.filters, ...nextFilters };
  state.pagination.currentPage = 1;
  render();
}

function resetFiltersAndViews() {
  state.pagination.currentPage = 1;
  state.filters = {
    country: "all",
    sites: state.payload?.filters?.sites?.slice() ?? [],
    days: "all",
    quota: "all",
    network: "all",
    sort: "price",
  };
}

function goToPage(page) {
  const rows = getFilteredRows();
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pagination.pageSize));
  state.pagination.currentPage = Math.max(1, Math.min(page, pageCount));
  renderDetailTable(rows);
}

/* ═══ CSV Download ═════════════════════════ */

function downloadComparisonRows(rows) {
  if (!rows.length) return;
  const headers = [
    ["country_name_ko", "국가"], ["country_code", "국가코드"], ["site_label", "사이트"], ["site", "사이트ID"],
    ["days", "일수"], ["data_quota_label", "데이터"], ["network_type", "망유형"], ["lowest_price_krw", "최저가KRW"],
    ["option_count", "옵션수"], ["sample_option_name", "대표옵션"], ["last_collected_at", "수집시각"], ["source_url", "원본URL"],
  ];
  const lines = [
    headers.map(([, label]) => toCsvCell(label)).join(","),
    ...rows.map((row) => headers.map(([key]) => toCsvCell(key === "last_collected_at" ? formatDate(row[key]) : row[key] ?? "")).join(",")),
  ];
  const csv = `﻿${lines.join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.payload?.summary?.run_id ?? "dashboard"}-comparison.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsvCell(value) { return `"${String(value).replaceAll('"', '""')}"`; }

/* ═══ Utilities ════════════════════════════ */

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function setSnapshotDropdownOpen(open) {
  elements.snapshotDropdownButton.setAttribute("aria-expanded", String(open));
  elements.snapshotDropdownPanel.hidden = !open;
}

/* ═══ Bootstrap ════════════════════════════ */

loadDashboard().catch((error) => {
  elements.snapshotDiffMeta.textContent = error.message;
  elements.snapshotDiffList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  elements.comparisonBody.innerHTML = `<tr><td class="empty-state" colspan="9">${escapeHtml(error.message)}</td></tr>`;
});

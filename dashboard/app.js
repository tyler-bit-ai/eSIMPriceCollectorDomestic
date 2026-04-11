const state = {
  payload: null,
  snapshotIndex: null,
  currentSnapshot: null,
  primarySnapshotRunId: null,
  selectedSnapshotRunIds: [],
  snapshotPayloadCache: new Map(),
  detailOpen: false,
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

const COUNTRY_FLAGS = { JP: "\u{1F1EF}\u{1F1F5}", PH: "\u{1F1F5}\u{1F1ED}", US: "\u{1F1FA}\u{1F1F8}", VN: "\u{1F1FB}\u{1F1F3}" };
const HEATMAP_DAYS = [1, 3, 5, 7, 10, 15, 30];
const QUICK_DAYS = [1, 3, 5, 7, 10, 15, 30];

const elements = {
  lastCollected: document.getElementById("last-collected"),
  kpiTotal: document.getElementById("kpi-total"),
  kpiCountries: document.getElementById("kpi-countries"),
  kpiSites: document.getElementById("kpi-sites"),
  snapshotDropdownButton: document.getElementById("snapshot-dropdown-button"),
  snapshotDropdownLabel: document.getElementById("snapshot-dropdown-label"),
  snapshotDropdownPanel: document.getElementById("snapshot-dropdown-panel"),
  snapshotChecklist: document.getElementById("snapshot-checklist"),
  snapshotSelectionHelp: document.getElementById("snapshot-selection-help"),
  snapshotMeta: document.getElementById("snapshot-meta"),
  helpButton: document.getElementById("help-button"),
  helpModal: document.getElementById("help-modal"),
  helpOverlay: document.getElementById("help-overlay"),
  helpClose: document.getElementById("help-close"),
  countryTabs: document.getElementById("country-tabs"),
  siteCheckboxes: document.getElementById("site-checkboxes"),
  daysGroup: document.getElementById("days-group"),
  networkFilter: document.getElementById("network-filter"),
  quotaFilter: document.getElementById("quota-filter"),
  sortFilter: document.getElementById("sort-filter"),
  resetFilters: document.getElementById("reset-filters"),
  summaryGrid: document.getElementById("summary-grid"),
  heatmapHeadRow: document.getElementById("heatmap-head-row"),
  heatmapBody: document.getElementById("heatmap-body"),
  rankList: document.getElementById("rank-list"),
  premiumList: document.getElementById("premium-list"),
  premiumInsight: document.getElementById("premium-insight"),
  valueTableBody: document.getElementById("value-table-body"),
  snapshotDiffMeta: document.getElementById("snapshot-diff-meta"),
  snapshotDiffList: document.getElementById("snapshot-diff-list"),
  detailToggle: document.getElementById("detail-toggle"),
  detailBody: document.getElementById("detail-body"),
  detailCount: document.getElementById("detail-count"),
  detailSortLabel: document.getElementById("detail-sort-label"),
  downloadCsv: document.getElementById("download-csv"),
  comparisonBody: document.getElementById("comparison-body"),
  pageFirst: document.getElementById("page-first"),
  pagePrev: document.getElementById("page-prev"),
  pageNext: document.getElementById("page-next"),
  pageLast: document.getElementById("page-last"),
  pageNumbers: document.getElementById("page-numbers"),
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

  elements.snapshotMeta.textContent = "선택한 스냅샷을 불러오는 중입니다.";
  await Promise.all(selectedSnapshots.map((snapshot) => ensureSnapshotPayload(snapshot)));
  const primaryPayload = await ensureSnapshotPayload(primarySnapshot);

  state.primarySnapshotRunId = primaryRunId;
  state.selectedSnapshotRunIds = normalizedSelectedRunIds;
  state.currentSnapshot = primarySnapshot;
  applyPayload(primaryPayload, { resetFilters });
}

function applyPayload(payload, { resetFilters }) {
  state.payload = payload;
  if (resetFilters) resetFiltersAndViews();
  initializeFilters();
  renderSnapshotControls();
  render();
}

/* ═══ Filter Initialization ═════════════════ */

function initializeFilters() {
  const { filters } = state.payload;

  // 국가 탭
  elements.countryTabs.innerHTML = "";
  const allTab = createCountryTab("all", "전체");
  allTab.classList.add("active");
  elements.countryTabs.appendChild(allTab);
  for (const [code, name] of filters.countries) {
    elements.countryTabs.appendChild(createCountryTab(code, `${COUNTRY_FLAGS[code] || ""} ${name}`));
  }

  // 사이트 칩
  elements.siteCheckboxes.innerHTML = "";
  if (state.filters.sites.length === 0) {
    state.filters.sites = filters.sites.slice();
  }
  for (const site of filters.sites) {
    const label = filters.site_labels[filters.sites.indexOf(site)] || site;
    const chip = document.createElement("label");
    chip.className = "site-chip" + (state.filters.sites.includes(site) ? " active" : "");
    chip.dataset.site = site;
    chip.innerHTML = `<span class="chip-check">\u2713</span> ${escapeHtml(label)}`;
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      chip.classList.toggle("active");
      syncSiteFilter();
      applyFilters({ sites: state.filters.sites.slice() });
    });
    elements.siteCheckboxes.appendChild(chip);
  }

  // 일수 버튼
  elements.daysGroup.innerHTML = "";
  const allBtn = createDaysButton("all", "전체");
  if (state.filters.days === "all") allBtn.classList.add("active");
  elements.daysGroup.appendChild(allBtn);
  for (const d of QUICK_DAYS) {
    const btn = createDaysButton(String(d), `${d}일`);
    if (state.filters.days === String(d)) btn.classList.add("active");
    elements.daysGroup.appendChild(btn);
  }

  // 네트워크
  populateSelect(elements.networkFilter, [["all", "전체"], ...filters.network_types.map((t) => [t, t])]);
  setSelectValue(elements.networkFilter, state.filters.network);

  // 용량
  populateSelect(elements.quotaFilter, [["all", "전체"], ...filters.data_quota_labels.map((l) => [l, l])]);
  setSelectValue(elements.quotaFilter, state.filters.quota);

  // 정렬
  setSelectValue(elements.sortFilter, state.filters.sort);
}

function createCountryTab(value, label) {
  const btn = document.createElement("button");
  btn.className = "country-tab";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    elements.countryTabs.querySelectorAll(".country-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    applyFilters({ country: value });
  });
  return btn;
}

function createDaysButton(value, label) {
  const btn = document.createElement("button");
  btn.className = "days-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    elements.daysGroup.querySelectorAll(".days-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyFilters({ days: value });
  });
  return btn;
}

function syncSiteFilter() {
  state.filters.sites = [];
  elements.siteCheckboxes.querySelectorAll(".site-chip.active").forEach((chip) => {
    state.filters.sites.push(chip.dataset.site);
  });
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
    ? selectedSnapshots.map((s, i) => `${i === 0 ? "기준" : "비교"}: ${formatDate(s.collected_at)}`).join(" / ")
    : "시점 선택";

  elements.snapshotSelectionHelp.textContent = selectionCount === 2
    ? "2개 선택 완료"
    : "최대 2개까지 체크 가능";
}

function buildSnapshotScope(snapshot) {
  const siteText = snapshot.selected_sites?.length ? snapshot.selected_sites.join(", ") : "전체 사이트";
  const countryText = snapshot.selected_countries?.length ? snapshot.selected_countries.join(", ") : "전체 국가";
  return `${siteText} \u00B7 ${countryText}`;
}

/* ═══ Event Binding ════════════════════════ */

function bindEvents() {
  elements.networkFilter.addEventListener("change", () => applyFilters({ network: elements.networkFilter.value }));
  elements.quotaFilter.addEventListener("change", () => applyFilters({ quota: elements.quotaFilter.value }));
  elements.sortFilter.addEventListener("change", () => applyFilters({ sort: elements.sortFilter.value }));

  elements.resetFilters.addEventListener("click", () => {
    resetFiltersAndViews();
    initializeFilters();
    render();
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
    elements.detailBody.classList.toggle("open", state.detailOpen);
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
}

/* ═══ Rendering ════════════════════════════ */

function render() {
  const rows = getFilteredRows();
  renderHeader();
  renderSummaryCards();
  renderHeatmap();
  renderVendorRanking();
  renderPremiumAnalysis();
  renderValueTable(rows);
  renderSnapshotDiff(rows);
  renderDetailTable(rows);
}

function renderHeader() {
  const { summary } = state.payload;
  elements.lastCollected.textContent = formatDate(summary.last_collected_at);
  elements.kpiTotal.textContent = fmt.format(summary.record_count);
  elements.kpiCountries.textContent = String(summary.country_count);
  elements.kpiSites.textContent = String(summary.site_count);
  elements.snapshotMeta.textContent = buildSnapshotMeta();
}

function buildSnapshotMeta() {
  const snapshot = state.currentSnapshot;
  if (!snapshot) return "선택된 스냅샷 정보가 없습니다.";
  const parts = [`${formatDate(snapshot.collected_at)} 기준`, buildSnapshotScope(snapshot)];
  const comparisonSnapshots = getSelectedComparisonSnapshots();
  if (comparisonSnapshots.length) {
    parts.push(`비교 ${comparisonSnapshots.map((item) => formatDate(item.collected_at)).join(", ")}`);
  }
  return parts.join(" \u00B7 ");
}

/* ── Summary Cards ─────────────────────── */
function renderSummaryCards() {
  const countrySummary = state.payload.country_summary ?? [];
  elements.summaryGrid.innerHTML = "";

  for (const cs of countrySummary) {
    const card = document.createElement("div");
    card.className = "summary-card" + (state.filters.country === cs.country_code ? " selected" : "");
    const flag = COUNTRY_FLAGS[cs.country_code] || "";

    // 필터링된 최저가 사이트 찾기
    const filteredRows = (state.payload.comparison_rows ?? [])
      .filter((r) => r.country_code === cs.country_code && matchesGlobalFilters(r));
    const filteredLowest = filteredRows.length
      ? filteredRows.reduce((min, r) => r.lowest_price_krw < min ? r.lowest_price_krw : min, Infinity)
      : cs.lowest_price_krw;
    const winnerRow = filteredRows.find((r) => r.lowest_price_krw === filteredLowest);

    card.innerHTML = `
      <div class="card-country">
        <span>${flag} ${escapeHtml(cs.country_name_ko)}</span>
      </div>
      <div class="card-price"><span class="won">\u20A9</span>${fmt.format(filteredLowest)}</div>
      <div class="card-detail">
        <span>${fmt.format(filteredRows.length || cs.option_count)}개 옵션</span>
        ${winnerRow ? `<span class="card-badge">${escapeHtml(winnerRow.site_label)}</span>` : ""}
      </div>
    `;
    card.addEventListener("click", () => {
      const newCountry = state.filters.country === cs.country_code ? "all" : cs.country_code;
      elements.countryTabs.querySelectorAll(".country-tab").forEach((t) => t.classList.remove("active"));
      const targetTab = elements.countryTabs.querySelector(`.country-tab:nth-child(${newCountry === "all" ? 1 : countrySummary.findIndex((c) => c.country_code === cs.country_code) + 2})`);
      if (targetTab) targetTab.classList.add("active");
      applyFilters({ country: newCountry });
    });
    elements.summaryGrid.appendChild(card);
  }
}

/* ── Heatmap ────────────────────────────── */
function renderHeatmap() {
  const matrix = state.payload.price_band_matrix ?? [];
  const filteredMatrix = matrix
    .filter((band) => state.filters.country === "all" || band.country_code === state.filters.country)
    .filter((band) => state.filters.sites.length === 0 || true); // sites는 comparison 기반 필터

  // 헤더
  elements.heatmapHeadRow.innerHTML = "<th></th>" + HEATMAP_DAYS.map((d) => `<th>${d}일</th>`).join("");

  // 전체 가격 범위 계산 (색상 스케일링용)
  const allPrices = filteredMatrix.flatMap((band) =>
    band.day_cells
      .filter((c) => HEATMAP_DAYS.includes(c.days))
      .map((c) => c.lowest_price_krw)
      .filter((p) => p != null)
  );
  const maxPrice = Math.max(...allPrices, 1);

  elements.heatmapBody.innerHTML = "";
  for (const band of filteredMatrix) {
    const tr = document.createElement("tr");
    const flag = COUNTRY_FLAGS[band.country_code] || "";
    tr.innerHTML = `<td class="row-label"><span class="flag">${flag}</span> ${escapeHtml(band.country_name_ko)}</td>`;

    for (const d of HEATMAP_DAYS) {
      const cell = band.day_cells.find((c) => c.days === d);
      const td = document.createElement("td");
      if (cell && cell.lowest_price_krw != null) {
        const hmLevel = getHeatmapLevel(cell.lowest_price_krw, maxPrice);
        td.className = `hm-${hmLevel}`;
        td.innerHTML = `\u20A9${fmt.format(cell.lowest_price_krw)}`;
        if (cell.site_winners?.length) {
          td.innerHTML += `<span class="cell-winner">${escapeHtml(cell.site_winners.join(", "))}</span>`;
        }
        td.addEventListener("click", () => {
          applyFilters({ country: band.country_code, days: String(d), sort: "price" });
          syncCountryTab(band.country_code);
          syncDaysButton(String(d));
        });
      } else {
        td.textContent = "-";
        td.style.color = "var(--muted)";
      }
      tr.appendChild(td);
    }
    elements.heatmapBody.appendChild(tr);
  }
}

function getHeatmapLevel(price, maxPrice) {
  const ratio = price / maxPrice;
  if (ratio <= 0.1) return 1;
  if (ratio <= 0.2) return 2;
  if (ratio <= 0.35) return 3;
  if (ratio <= 0.5) return 4;
  if (ratio <= 0.65) return 5;
  if (ratio <= 0.8) return 6;
  if (ratio <= 0.9) return 7;
  return 8;
}

function syncCountryTab(countryCode) {
  elements.countryTabs.querySelectorAll(".country-tab").forEach((t) => t.classList.remove("active"));
  const tabs = elements.countryTabs.querySelectorAll(".country-tab");
  if (countryCode === "all" && tabs[0]) tabs[0].classList.add("active");
  else {
    const idx = (state.payload.filters?.countries ?? []).findIndex(([c]) => c === countryCode);
    if (idx >= 0 && tabs[idx + 1]) tabs[idx + 1].classList.add("active");
  }
}

function syncDaysButton(daysValue) {
  elements.daysGroup.querySelectorAll(".days-btn").forEach((b) => b.classList.remove("active"));
  const btns = elements.daysGroup.querySelectorAll(".days-btn");
  if (daysValue === "all" && btns[0]) btns[0].classList.add("active");
  else {
    const idx = QUICK_DAYS.indexOf(Number(daysValue));
    if (idx >= 0 && btns[idx + 1]) btns[idx + 1].classList.add("active");
  }
}

/* ── Vendor Ranking ─────────────────────── */
function renderVendorRanking() {
  const siteSummary = [...(state.payload.site_summary ?? [])].sort((a, b) => a.lowest_price_krw - b.lowest_price_krw);
  elements.rankList.innerHTML = "";

  const maxPrice = Math.max(...siteSummary.map((s) => s.lowest_price_krw), 1);

  siteSummary.forEach((site, index) => {
    const li = document.createElement("li");
    li.className = "rank-item";
    const medalClass = index < 4 ? `medal-${index + 1}` : "medal-4";
    const barWidth = Math.max(10, Math.round((site.lowest_price_krw / maxPrice) * 100));
    const barColor = index === 0 ? "var(--green)" : index === 1 ? "var(--amber)" : "var(--highlight)";

    li.innerHTML = `
      <div class="rank-medal ${medalClass}">${index + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${escapeHtml(site.site_label)}</div>
        <div class="rank-sub">${fmt.format(site.option_count)}개 옵션 \u00B7 ${fmt.format(site.country_count)}개국</div>
        <div class="rank-bar-bg"><div class="rank-bar" style="width:${barWidth}%;background:${barColor}"></div></div>
      </div>
      <div class="rank-price">\u20A9${fmt.format(site.lowest_price_krw)}</div>
    `;
    elements.rankList.appendChild(li);
  });
}

/* ── Premium Analysis ───────────────────── */
function renderPremiumAnalysis() {
  const premiumRows = state.payload.network_premium_summary ?? [];
  elements.premiumList.innerHTML = "";

  // 국가별 평균 premium 계산
  const countryPremiums = {};
  for (const row of premiumRows) {
    if (!countryPremiums[row.country_code]) {
      countryPremiums[row.country_code] = { name: row.country_name_ko, localTotal: 0, roamingTotal: 0, count: 0 };
    }
    const cp = countryPremiums[row.country_code];
    if (row.local_price_krw != null) cp.localTotal += row.local_price_krw;
    if (row.roaming_price_krw != null) cp.roamingTotal += row.roaming_price_krw;
    cp.count++;
  }

  const countrySummary = state.payload.country_summary ?? [];
  for (const cs of countrySummary) {
    const cp = countryPremiums[cs.country_code];
    if (!cp) continue;

    const avgLocal = cp.count > 0 ? cp.localTotal / cp.count : 0;
    const avgRoaming = cp.count > 0 ? cp.roamingTotal / cp.count : 0;
    const localIsCheaper = avgLocal < avgRoaming;
    const diffPct = avgRoaming > 0 ? Math.abs(((avgLocal - avgRoaming) / avgRoaming) * 100) : 0;

    const div = document.createElement("div");
    div.className = "premium-row";
    const flag = COUNTRY_FLAGS[cs.country_code] || "";
    div.innerHTML = `
      <div class="premium-country">${flag} ${escapeHtml(cp.name)}</div>
      <span class="premium-badge ${localIsCheaper ? "badge-local" : "badge-roaming"}">${localIsCheaper ? "Local 유리" : "Roaming 유리"}</span>
      <div class="premium-diff ${localIsCheaper ? "diff-negative" : "diff-positive"}">${localIsCheaper ? "-" : "+"}${Math.round(diffPct)}%</div>
    `;
    elements.premiumList.appendChild(div);
  }

  // 인사이트
  const localWins = Object.values(countryPremiums).filter((cp) => {
    const avgL = cp.count > 0 ? cp.localTotal / cp.count : 0;
    const avgR = cp.count > 0 ? cp.roamingTotal / cp.count : 0;
    return avgL < avgR;
  }).length;
  const totalCountries = Object.keys(countryPremiums).length;

  elements.premiumInsight.innerHTML = totalCountries > 0
    ? `<strong>인사이트:</strong> ${totalCountries}개국 중 ${localWins}개국에서 Local 네트워크가 더 저렴합니다. ${totalCountries - localWins > 0 ? `${totalCountries - localWins}개국은 Roaming이 더 유리할 수 있습니다.` : ""}`
    : `<strong>인사이트:</strong> Local/Roaming 비교 데이터가 부족합니다.`;
}

/* ── Value Table (Top 10) ───────────────── */
function renderValueTable(rows) {
  elements.valueTableBody.innerHTML = "";

  // ₩/GB/일 계산 가능한 행 필터링
  const valuedRows = rows
    .filter((r) => r.lowest_price_krw != null && r.days > 0)
    .map((r) => {
      const gb = parseDataQuotaGB(r.data_quota_label);
      const unitPrice = gb > 0 ? r.lowest_price_krw / gb / r.days : null;
      return { ...r, _gb: gb, _unitPrice: unitPrice };
    })
    .filter((r) => r._unitPrice != null)
    .sort((a, b) => a._unitPrice - b._unitPrice)
    .slice(0, 10);

  if (!valuedRows.length) {
    elements.valueTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">가성비 계산 가능한 데이터가 없습니다.</td></tr>';
    return;
  }

  const bestUnitPrice = valuedRows[0]._unitPrice;

  valuedRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (index < 3) tr.className = "rank-top";
    const flag = COUNTRY_FLAGS[row.country_code] || "";
    const unitClass = row._unitPrice <= bestUnitPrice * 1.2 ? "unit-best"
      : row._unitPrice <= bestUnitPrice * 2 ? "unit-good"
      : row._unitPrice <= bestUnitPrice * 4 ? "unit-mid"
      : "unit-exp";

    tr.innerHTML = `
      <td><span class="rank-num">${index + 1}</span></td>
      <td>${flag} ${escapeHtml(row.country_name_ko)}</td>
      <td>${escapeHtml(row.site_label)}</td>
      <td class="mono">${row.days}</td>
      <td>${escapeHtml(row.data_quota_label || "-")}</td>
      <td><span class="premium-badge ${row.network_type === "local" ? "badge-local" : "badge-roaming"}">${escapeHtml(row.network_type || "-")}</span></td>
      <td class="price-cell" style="text-align:right;">\u20A9${fmt.format(row.lowest_price_krw)}</td>
      <td style="text-align:right;"><span class="unit-price ${unitClass}">\u20A9${row._unitPrice.toFixed(1)}</span></td>
    `;
    elements.valueTableBody.appendChild(tr);
  });
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

  if (!comparisonSnapshots.length) {
    elements.snapshotDiffMeta.textContent = "시점 2개를 선택하면 가격 또는 노출 여부가 달라진 상품만 표시합니다.";
    elements.snapshotDiffList.innerHTML = '<div class="empty-state" style="padding:14px;color:var(--muted);font-size:13px;">비교할 시점을 2개 선택해 주세요.</div>';
    return;
  }

  const changedEntries = getChangedComparisonEntries(rows);
  elements.snapshotDiffMeta.textContent = `${formatDate(state.currentSnapshot?.collected_at)} 기준 ${fmt.format(changedEntries.length)}개 상품이 달라졌습니다.`;

  if (!changedEntries.length) {
    elements.snapshotDiffList.innerHTML = '<div class="empty-state" style="padding:14px;color:var(--muted);font-size:13px;">현재 필터 조건에서 달라진 상품이 없습니다.</div>';
    return;
  }

  for (const entry of changedEntries.slice(0, 50)) {
    const { row, items } = entry;
    const item = items[0];
    const card = document.createElement("article");
    card.className = "snapshot-diff-card";
    card.innerHTML = `
      <div class="snapshot-diff-head">
        <div>
          <strong>${escapeHtml(row.country_name_ko)} \u00B7 ${escapeHtml(row.site_label)} \u00B7 ${escapeHtml(String(row.days))}일</strong>
          <small>${escapeHtml(row.data_quota_label || "-")} \u00B7 ${escapeHtml(row.network_type || "-")}</small>
        </div>
        <span class="comparison-chip ${item.tone} snapshot-diff-badge">
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.label)}</small>
        </span>
      </div>
      <div class="snapshot-diff-values">
        <span>기준가 ${row.lowest_price_krw != null ? `\u20A9${fmt.format(row.lowest_price_krw)}` : "-"}</span>
        <span>${escapeHtml(item.detail)}</span>
      </div>
      <div class="snapshot-diff-foot">
        <span>${fmt.format(row.option_count)}개 옵션</span>
        <a class="source-link" href="${row.source_url}" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
    `;
    elements.snapshotDiffList.appendChild(card);
  }
}

/* ── Detail Table ───────────────────────── */
function renderDetailTable(rows) {
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pagination.pageSize));
  const currentPage = Math.min(state.pagination.currentPage, pageCount);
  state.pagination.currentPage = currentPage;
  const startIndex = (currentPage - 1) * state.pagination.pageSize;
  const pagedRows = rows.slice(startIndex, startIndex + state.pagination.pageSize);

  elements.comparisonBody.innerHTML = "";
  elements.detailCount.textContent = fmt.format(rows.length);

  const sortLabels = { price: "최저가 낮은순", days: "사용일수 낮은순", unit_price: "가성비순", site: "사이트명 순" };
  elements.detailSortLabel.textContent = sortLabels[state.filters.sort] || state.filters.sort;
  elements.downloadCsv.disabled = rows.length === 0;
  renderPagination(pageCount, currentPage, rows.length === 0);

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td class="empty-state" colspan="9">선택한 필터에 맞는 결과가 없습니다.</td>';
    elements.comparisonBody.appendChild(tr);
    return;
  }

  for (const row of pagedRows) {
    const tr = document.createElement("tr");
    const flag = COUNTRY_FLAGS[row.country_code] || "";
    tr.innerHTML = `
      <td><strong>${flag} ${escapeHtml(row.country_name_ko)}</strong><small>${escapeHtml(row.country_code)}</small></td>
      <td><strong>${escapeHtml(row.site_label)}</strong></td>
      <td>${escapeHtml(String(row.days))}일</td>
      <td>${escapeHtml(row.data_quota_label || "-")}</td>
      <td><span class="premium-badge ${row.network_type === "local" ? "badge-local" : "badge-roaming"}">${escapeHtml(row.network_type || "-")}</span></td>
      <td><strong>\u20A9${row.lowest_price_krw != null ? fmt.format(row.lowest_price_krw) : "-"}</strong></td>
      <td>${fmt.format(row.option_count)}</td>
      <td style="font-size:12px;color:var(--muted);">${escapeHtml(row.sample_option_name || "-")}</td>
      <td><a class="source-link" href="${row.source_url}" target="_blank" rel="noopener noreferrer">Open</a></td>
    `;
    elements.comparisonBody.appendChild(tr);
  }
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
    button.className = `ghost-button page-button${page === currentPage ? " is-active" : ""}`;
    button.textContent = String(page);
    button.disabled = page === currentPage;
    button.addEventListener("click", () => goToPage(page));
    elements.pageNumbers.appendChild(button);
  }
}

/* ═══ Data Filtering ═══════════════════════ */

function getFilteredRows() {
  return sortRows((state.payload?.comparison_rows ?? []).filter(matchesGlobalFilters));
}

function matchesGlobalFilters(row) {
  if (state.filters.country !== "all" && row.country_code !== state.filters.country) return false;
  if (state.filters.sites.length > 0 && !state.filters.sites.includes(row.site)) return false;
  if (state.filters.days !== "all" && String(row.days) !== state.filters.days) return false;
  if (state.filters.quota !== "all" && row.data_quota_label !== state.filters.quota) return false;
  if (state.filters.network !== "all" && row.network_type !== state.filters.network) return false;
  return true;
}

function sortRows(rows) {
  const sorted = [...rows];
  if (state.filters.sort === "days") {
    sorted.sort((a, b) => (a.days ?? 0) - (b.days ?? 0) || (a.lowest_price_krw ?? 0) - (b.lowest_price_krw ?? 0));
  } else if (state.filters.sort === "site") {
    sorted.sort((a, b) => a.site.localeCompare(b.site) || (a.days ?? 0) - (b.days ?? 0));
  } else if (state.filters.sort === "unit_price") {
    sorted.sort((a, b) => {
      const ua = calcUnitPrice(a);
      const ub = calcUnitPrice(b);
      return (ua ?? Infinity) - (ub ?? Infinity);
    });
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

function buildComparisonItem(primaryRow, compareRow, primarySnapshot, compareSnapshot) {
  if (!primaryRow && compareRow) {
    return { label: `${formatDate(compareSnapshot.collected_at)} 비교`, value: "신규 노출", detail: compareRow.lowest_price_krw != null ? `\u20A9${fmt.format(compareRow.lowest_price_krw)}` : "가격 정보 없음", tone: "is-up", changed: true };
  }
  if (primaryRow && !compareRow) {
    return { label: `${formatDate(compareSnapshot.collected_at)} 비교`, value: "비교 시점 없음", detail: `${formatDate(primarySnapshot?.collected_at)} \u20A9${fmt.format(primaryRow.lowest_price_krw ?? 0)}`, tone: "is-missing", changed: true };
  }
  if (!primaryRow || !compareRow || compareRow.lowest_price_krw == null || primaryRow.lowest_price_krw == null) {
    return { label: `${formatDate(compareSnapshot.collected_at)} 비교`, value: "비교 불가", detail: compareRow?.lowest_price_krw != null ? `\u20A9${fmt.format(compareRow.lowest_price_krw)}` : "동일 조건 없음", tone: "is-missing", changed: true };
  }
  const delta = compareRow.lowest_price_krw - primaryRow.lowest_price_krw;
  const sign = delta > 0 ? "+" : "";
  return { label: `${formatDate(compareSnapshot.collected_at)} 비교`, value: `${sign}${fmt.format(delta)}\uC6D0`, detail: `${formatDate(primarySnapshot?.collected_at)} \u20A9${fmt.format(primaryRow.lowest_price_krw)} \u2192 \u20A9${fmt.format(compareRow.lowest_price_krw)}`, tone: delta > 0 ? "is-up" : delta < 0 ? "is-down" : "", changed: delta !== 0 };
}

function getChangedComparisonEntries(rows) {
  const comparisonSnapshots = getSelectedComparisonSnapshots();
  if (!comparisonSnapshots.length) return [];

  const primarySnapshot = state.currentSnapshot;
  const compareSnapshot = comparisonSnapshots[0];
  const comparePayload = state.snapshotPayloadCache.get(compareSnapshot.run_id);
  if (!comparePayload || typeof comparePayload.then === "function") return [];

  const primaryRows = sortRows(rows);
  const compareRows = sortRows((comparePayload.comparison_rows ?? []).filter(matchesGlobalFilters));
  const primaryLookup = buildComparisonLookup(primaryRows);
  const compareLookup = buildComparisonLookup(compareRows);
  const unionKeys = Array.from(new Set([...primaryLookup.keys(), ...compareLookup.keys()]));

  return unionKeys
    .map((key) => {
      const primaryRow = primaryLookup.get(key) ?? null;
      const compareRow = compareLookup.get(key) ?? null;
      const row = primaryRow ?? compareRow;
      const item = buildComparisonItem(primaryRow, compareRow, primarySnapshot, compareSnapshot);
      return row ? { row, items: [item] } : null;
    })
    .filter((entry) => entry && entry.items.some((item) => item.changed))
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
    ["country_name_ko", "\uAD6D\uAC00"], ["country_code", "\uAD6D\uAC00\uCF54\uB4DC"], ["site_label", "\uC0AC\uC774\uD2B8"], ["site", "\uC0AC\uC774\uD2B8ID"],
    ["days", "\uC77C\uC218"], ["data_quota_label", "\uB370\uC774\uD130"], ["network_type", "\uB9DD\uC720\uD615"], ["lowest_price_krw", "\uCD5C\uC800\uAC00KRW"],
    ["option_count", "\uC635\uC158\uC218"], ["sample_option_name", "\uB300\uD45C\uC635\uC158"], ["last_collected_at", "\uC218\uC9D1\uC2DC\uAC01"], ["source_url", "\uC6D0\uBCF8URL"],
  ];
  const lines = [
    headers.map(([, label]) => toCsvCell(label)).join(","),
    ...rows.map((row) => headers.map(([key]) => toCsvCell(key === "last_collected_at" ? formatDate(row[key]) : row[key] ?? "")).join(",")),
  ];
  const csv = `\uFEFF${lines.join("\r\n")}`;
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
  elements.snapshotMeta.textContent = error.message;
  elements.snapshotDiffList.innerHTML = `<div class="empty-state" style="padding:14px;color:var(--muted);font-size:13px;">${escapeHtml(error.message)}</div>`;
  elements.comparisonBody.innerHTML = `<tr><td class="empty-state" colspan="9">${escapeHtml(error.message)}</td></tr>`;
});

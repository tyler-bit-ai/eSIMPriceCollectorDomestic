const state = {
  payload: null,
  snapshotIndex: null,
  currentSnapshot: null,
  primarySnapshotRunId: null,
  selectedSnapshotRunIds: [],
  snapshotPayloadCache: new Map(),
  pagination: {
    currentPage: 1,
    pageSize: 10,
  },
  filters: {
    site: "all",
    country: "all",
    days: "all",
    quota: "all",
    network: "all",
    sort: "price",
  },
  views: {
    priceBandCountry: "all",
    priceBandLimit: "3",
    premiumSite: "all",
    premiumLimit: "6",
  },
  panels: {
    distribution: false,
    premium: false,
  },
  drilldowns: {
    distribution: null,
    premium: null,
  },
};

const elements = {
  lastCollected: document.getElementById("last-collected"),
  runId: document.getElementById("run-id"),
  primarySnapshotFilter: document.getElementById("primary-snapshot-filter"),
  snapshotChecklist: document.getElementById("snapshot-checklist"),
  snapshotSelectionHelp: document.getElementById("snapshot-selection-help"),
  snapshotMeta: document.getElementById("snapshot-meta"),
  helpButton: document.getElementById("help-button"),
  helpModal: document.getElementById("help-modal"),
  helpOverlay: document.getElementById("help-overlay"),
  helpClose: document.getElementById("help-close"),
  siteFilter: document.getElementById("site-filter"),
  countryFilter: document.getElementById("country-filter"),
  daysFilter: document.getElementById("days-filter"),
  quotaFilter: document.getElementById("quota-filter"),
  networkFilter: document.getElementById("network-filter"),
  sortFilter: document.getElementById("sort-filter"),
  resetFilters: document.getElementById("reset-filters"),
  kpiRows: document.getElementById("kpi-rows"),
  kpiLowest: document.getElementById("kpi-lowest"),
  kpiSites: document.getElementById("kpi-sites"),
  kpiCountries: document.getElementById("kpi-countries"),
  distributionToggle: document.getElementById("distribution-toggle"),
  distributionBody: document.getElementById("distribution-body"),
  distributionClear: document.getElementById("distribution-clear"),
  priceBandCountryFilter: document.getElementById("price-band-country-filter"),
  priceBandLimitFilter: document.getElementById("price-band-limit-filter"),
  priceBandList: document.getElementById("price-band-list"),
  premiumToggle: document.getElementById("premium-toggle"),
  premiumBody: document.getElementById("premium-body"),
  premiumClear: document.getElementById("premium-clear"),
  premiumSiteFilter: document.getElementById("premium-site-filter"),
  premiumLimitFilter: document.getElementById("premium-limit-filter"),
  premiumList: document.getElementById("premium-list"),
  downloadCsv: document.getElementById("download-csv"),
  comparisonBody: document.getElementById("comparison-body"),
  tableMeta: document.getElementById("table-meta"),
  pageFirst: document.getElementById("page-first"),
  pagePrev: document.getElementById("page-prev"),
  pageNext: document.getElementById("page-next"),
  pageLast: document.getElementById("page-last"),
  pageNumbers: document.getElementById("page-numbers"),
};

const fmt = new Intl.NumberFormat("ko-KR");
const PAGE_WINDOW_SIZE = 5;

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

  elements.primarySnapshotFilter.disabled = true;
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
  try {
    return await fetchJson("./data/index.json");
  } catch (error) {
    return null;
  }
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, window.location.href));
  if (!response.ok) {
    throw new Error(`Failed to load dashboard data: ${response.status}`);
  }
  return response.json();
}

async function ensureSnapshotPayload(snapshot) {
  const cached = state.snapshotPayloadCache.get(snapshot.run_id);
  if (cached) {
    return cached;
  }

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
    if (knownRunIds.includes(runId) && !normalized.includes(runId)) {
      normalized.push(runId);
    }
  }

  if (primaryRunId && !normalized.includes(primaryRunId)) {
    normalized.unshift(primaryRunId);
  }

  return normalized;
}

async function updateSnapshotSelection({ primaryRunId, selectedRunIds, resetFilters = false }) {
  const primarySnapshot = getSnapshotByRunId(primaryRunId);
  if (!primarySnapshot) {
    return;
  }

  const normalizedSelectedRunIds = normalizeSelectedSnapshotRunIds(selectedRunIds, primaryRunId);
  const selectedSnapshots = normalizedSelectedRunIds
    .map((runId) => getSnapshotByRunId(runId))
    .filter((snapshot) => snapshot != null);

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
  if (resetFilters) {
    resetFiltersAndViews();
  }
  initializeFilters();
  initializeSectionControls();
  renderSnapshotControls();
  render();
}

function initializeFilters() {
  const { filters } = state.payload;
  populateSelect(elements.siteFilter, [["all", "전체 사이트"], ...filters.sites.map((site) => [site, site])]);
  populateSelect(
    elements.countryFilter,
    [["all", "전체 국가"], ...filters.countries.map(([code, name]) => [code, `${name} (${code})`])]
  );
  populateSelect(elements.daysFilter, [["all", "전체 일수"], ...filters.days.map((days) => [String(days), `${days}일`])]);
  populateSelect(
    elements.quotaFilter,
    [["all", "전체 데이터"], ...filters.data_quota_labels.map((label) => [label, label])]
  );
  populateSelect(elements.networkFilter, [["all", "전체 망"], ...filters.network_types.map((type) => [type, type])]);
  syncGlobalFilterInputs();
}

function initializeSectionControls() {
  const priceBandCountries = (state.payload.price_band_matrix ?? []).map((item) => [item.country_code, item.country_name_ko]);
  populateSelect(elements.priceBandCountryFilter, [["all", "전체 국가"], ...priceBandCountries]);
  populateSelect(elements.priceBandLimitFilter, buildLimitOptions("3"));

  const premiumSites = Array.from(
    new Map((state.payload.network_premium_summary ?? []).map((item) => [item.site, item.site_label])).entries()
  );
  populateSelect(elements.premiumSiteFilter, [["all", "전체 사이트"], ...premiumSites]);
  populateSelect(elements.premiumLimitFilter, buildLimitOptions("6"));

  syncViewInputs();
  updateDrilldownButtons();
}

function buildLimitOptions(defaultValue) {
  return [
    [defaultValue, `상위 ${defaultValue}개`],
    ["6", "상위 6개"],
    ["12", "상위 12개"],
    ["all", "전체"],
  ].filter((item, index, array) => array.findIndex((entry) => entry[0] === item[0]) === index);
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

function renderSnapshotControls() {
  const snapshots = state.snapshotIndex?.snapshots ?? [];
  if (!snapshots.length) {
    return;
  }

  populateSelect(
    elements.primarySnapshotFilter,
    snapshots.map((snapshot) => [snapshot.run_id, buildSnapshotLabel(snapshot)])
  );
  elements.primarySnapshotFilter.disabled = false;
  setSelectValue(elements.primarySnapshotFilter, state.primarySnapshotRunId);

  elements.snapshotChecklist.innerHTML = "";
  for (const snapshot of snapshots) {
    const isPrimary = snapshot.run_id === state.primarySnapshotRunId;
    const isChecked = state.selectedSnapshotRunIds.includes(snapshot.run_id);
    const wrapper = document.createElement("label");
    wrapper.className = `snapshot-option${isPrimary ? " is-primary" : ""}`;
    wrapper.innerHTML = `
      <input type="checkbox" value="${escapeHtml(snapshot.run_id)}" ${isChecked ? "checked" : ""}>
      <span class="snapshot-option-copy">
        <strong>${escapeHtml(formatDate(snapshot.collected_at))}</strong>
        <small>${escapeHtml(buildSnapshotScope(snapshot))}</small>
      </span>
    `;
    elements.snapshotChecklist.appendChild(wrapper);
  }

  const comparisonCount = Math.max(0, state.selectedSnapshotRunIds.length - 1);
  elements.snapshotSelectionHelp.textContent = comparisonCount
    ? `기준 시점 대비 ${comparisonCount}개 시점의 가격 차이를 상세 비교표에 표시합니다.`
    : "비교할 시점을 추가 선택하면 기준 시점 대비 가격 차이를 함께 표시합니다.";
}

function bindEvents() {
  const mapping = [
    [elements.siteFilter, "site"],
    [elements.countryFilter, "country"],
    [elements.daysFilter, "days"],
    [elements.quotaFilter, "quota"],
    [elements.networkFilter, "network"],
    [elements.sortFilter, "sort"],
  ];

  for (const [element, key] of mapping) {
    element.addEventListener("change", () => {
      applyFilters({ [key]: element.value });
    });
  }

  elements.primarySnapshotFilter.addEventListener("change", async () => {
    const primaryRunId = elements.primarySnapshotFilter.value;
    const selectedRunIds = state.selectedSnapshotRunIds.includes(primaryRunId)
      ? state.selectedSnapshotRunIds
      : [primaryRunId, ...state.selectedSnapshotRunIds];

    await updateSnapshotSelection({
      primaryRunId,
      selectedRunIds,
      resetFilters: true,
    });
  });

  elements.snapshotChecklist.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
      return;
    }

    const checkedRunIds = Array.from(
      elements.snapshotChecklist.querySelectorAll('input[type="checkbox"]:checked')
    ).map((input) => input.value);

    let primaryRunId = state.primarySnapshotRunId;
    if (!checkedRunIds.includes(primaryRunId)) {
      primaryRunId = checkedRunIds[0] ?? state.primarySnapshotRunId;
    }

    if (!primaryRunId) {
      renderSnapshotControls();
      return;
    }

    await updateSnapshotSelection({
      primaryRunId,
      selectedRunIds: checkedRunIds.length ? checkedRunIds : [primaryRunId],
      resetFilters: false,
    });
  });

  elements.distributionToggle.addEventListener("click", () => {
    togglePanel("distribution");
  });

  elements.premiumToggle.addEventListener("click", () => {
    togglePanel("premium");
  });

  elements.distributionClear.addEventListener("click", () => {
    clearDrilldown("distribution");
  });

  elements.premiumClear.addEventListener("click", () => {
    clearDrilldown("premium");
  });

  elements.priceBandCountryFilter.addEventListener("change", () => {
    state.views.priceBandCountry = elements.priceBandCountryFilter.value;
    renderPriceBands();
  });

  elements.priceBandLimitFilter.addEventListener("change", () => {
    state.views.priceBandLimit = elements.priceBandLimitFilter.value;
    renderPriceBands();
  });

  elements.premiumSiteFilter.addEventListener("change", () => {
    state.views.premiumSite = elements.premiumSiteFilter.value;
    renderPremiumRows();
  });

  elements.premiumLimitFilter.addEventListener("change", () => {
    state.views.premiumLimit = elements.premiumLimitFilter.value;
    renderPremiumRows();
  });

  elements.resetFilters.addEventListener("click", () => {
    resetFiltersAndViews();
    initializeFilters();
    initializeSectionControls();
    render();
  });

  elements.helpButton.addEventListener("click", openHelpModal);
  elements.helpClose.addEventListener("click", closeHelpModal);
  elements.helpOverlay.addEventListener("click", closeHelpModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.helpModal.hidden) {
      closeHelpModal();
    }
  });

  elements.downloadCsv.addEventListener("click", () => {
    downloadComparisonRows(getFilteredRows());
  });

  elements.pagePrev.addEventListener("click", () => {
    goToPage(state.pagination.currentPage - 1);
  });

  elements.pageNext.addEventListener("click", () => {
    goToPage(state.pagination.currentPage + 1);
  });

  elements.pageFirst.addEventListener("click", () => {
    goToPage(1);
  });

  elements.pageLast.addEventListener("click", () => {
    const rows = getFilteredRows();
    goToPage(Math.max(1, Math.ceil(rows.length / state.pagination.pageSize)));
  });
}

function render() {
  const rows = getFilteredRows();
  renderHeader();
  renderPanels();
  renderSummary(rows);
  renderPriceBands();
  renderPremiumRows();
  renderTable(rows);
  updateDrilldownButtons();
}

function renderPanels() {
  elements.distributionToggle.setAttribute("aria-expanded", String(state.panels.distribution));
  elements.distributionBody.hidden = !state.panels.distribution;
  updatePanelStatus(elements.distributionToggle, state.panels.distribution);
  elements.premiumToggle.setAttribute("aria-expanded", String(state.panels.premium));
  elements.premiumBody.hidden = !state.panels.premium;
  updatePanelStatus(elements.premiumToggle, state.panels.premium);
}

function renderHeader() {
  const { summary } = state.payload;
  elements.lastCollected.textContent = formatDate(summary.last_collected_at);
  elements.runId.textContent = summary.run_id;
  elements.snapshotMeta.textContent = buildSnapshotMeta();
}

function buildSnapshotMeta() {
  const snapshot = state.currentSnapshot;
  if (!snapshot) {
    return "선택된 스냅샷 정보가 없습니다.";
  }

  const parts = [`${formatDate(snapshot.collected_at)} 기준`, buildSnapshotScope(snapshot)];
  const comparisonSnapshots = getSelectedComparisonSnapshots();
  if (comparisonSnapshots.length) {
    parts.push(`비교 ${comparisonSnapshots.map((item) => formatDate(item.collected_at)).join(", ")}`);
  }

  return parts.join(" · ");
}

function buildSnapshotScope(snapshot) {
  const siteText = snapshot.selected_sites?.length ? snapshot.selected_sites.join(", ") : "전체 사이트";
  const countryText = snapshot.selected_countries?.length ? snapshot.selected_countries.join(", ") : "전체 국가";
  return `${siteText} · ${countryText}`;
}

function renderSummary(rows) {
  const prices = rows.map((row) => row.lowest_price_krw).filter((value) => value != null);
  elements.kpiRows.textContent = fmt.format(rows.length);
  elements.kpiLowest.textContent = prices.length ? `${fmt.format(Math.min(...prices))}원` : "-";
  elements.kpiSites.textContent = fmt.format(new Set(rows.map((row) => row.site)).size);
  elements.kpiCountries.textContent = fmt.format(new Set(rows.map((row) => row.country_code)).size);
}

function renderPriceBands() {
  if (!state.panels.distribution) {
    elements.priceBandList.innerHTML = "";
    return;
  }

  const bands = getFilteredPriceBands();
  elements.priceBandList.innerHTML = "";

  if (!bands.length) {
    elements.priceBandList.innerHTML = '<div class="empty-state-card">선택한 조건에 맞는 가격 분포 데이터가 없습니다.</div>';
    return;
  }

  const maxPrice = Math.max(
    ...bands.flatMap((band) => band.day_cells.map((cell) => cell.lowest_price_krw || 0)),
    1
  );

  for (const band of bands) {
    const section = document.createElement("section");
    section.className = "price-band-country";
    section.innerHTML = `
      <div class="price-band-header">
        <div>
          <h3>${escapeHtml(band.country_name_ko)}</h3>
          <p>${fmt.format(band.day_cells.length)}개 일수 구간</p>
        </div>
      </div>
    `;

    const list = document.createElement("div");
    list.className = "price-band-grid";

    for (const cell of band.day_cells) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "price-band-item";
      const width = Math.max(12, Math.round(((cell.lowest_price_krw || 0) / maxPrice) * 100));
      item.innerHTML = `
        <div class="price-band-meta">
          <strong>${escapeHtml(String(cell.days))}일</strong>
          <span>${fmt.format(cell.quota_count || 0)}개 용량 구간</span>
        </div>
        <div class="price-band-track">
          <span class="price-band-fill" style="width: ${width}%"></span>
        </div>
        <div class="price-band-value">
          <span>${cell.lowest_price_krw != null ? `${fmt.format(cell.lowest_price_krw)}원` : "-"}</span>
          <small>${escapeHtml((cell.site_winners || []).join(", ") || "-")}</small>
        </div>
      `;
      item.addEventListener("click", () => {
        applySectionDrilldown("distribution", {
          country: band.country_code ?? "all",
          days: cell.days != null ? String(cell.days) : "all",
          sort: "price",
        });
      });
      list.appendChild(item);
    }

    section.appendChild(list);
    elements.priceBandList.appendChild(section);
  }
}

function renderPremiumRows() {
  if (!state.panels.premium) {
    elements.premiumList.innerHTML = "";
    return;
  }

  const rows = getFilteredPremiumRows();
  elements.premiumList.innerHTML = "";

  if (!rows.length) {
    elements.premiumList.innerHTML = '<div class="empty-state-card">선택한 조건에서 local / roaming 비교 가능한 데이터가 없습니다.</div>';
    return;
  }

  for (const row of rows) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "premium-card";
    card.innerHTML = `
      <div class="premium-head">
        <strong>${escapeHtml(row.country_name_ko)} · ${escapeHtml(String(row.days))}일 · ${escapeHtml(row.data_quota_label)}</strong>
        <span class="premium-direction ${escapeHtml(row.price_gap_direction)}">${formatDirection(row.price_gap_direction)}</span>
      </div>
      <p class="premium-site">${escapeHtml(row.site_label)}</p>
      <div class="premium-values">
        <span>local ${fmt.format(row.local_price_krw)}원</span>
        <span>roaming ${fmt.format(row.roaming_price_krw)}원</span>
      </div>
      <div class="premium-diff">
        <strong>차이 ${fmt.format(Math.abs(row.premium_krw || 0))}원</strong>
        <small>${row.premium_pct != null ? `${Math.abs(row.premium_pct)}%` : "비율 없음"}</small>
      </div>
    `;
    card.addEventListener("click", () => {
      applySectionDrilldown("premium", {
        site: row.site ?? "all",
        country: row.country_code ?? "all",
        days: row.days != null ? String(row.days) : "all",
        quota: row.data_quota_label ?? "all",
        sort: "price",
      });
    });
    elements.premiumList.appendChild(card);
  }
}

function getFilteredRows() {
  const rows = [...(state.payload?.comparison_rows ?? [])];
  const filtered = rows.filter((row) => {
    if (state.filters.site !== "all" && row.site !== state.filters.site) return false;
    if (state.filters.country !== "all" && row.country_code !== state.filters.country) return false;
    if (state.filters.days !== "all" && String(row.days) !== state.filters.days) return false;
    if (state.filters.quota !== "all" && row.data_quota_label !== state.filters.quota) return false;
    if (state.filters.network !== "all" && row.network_type !== state.filters.network) return false;
    return true;
  });

  if (state.filters.sort === "days") {
    filtered.sort((a, b) => (a.days ?? 0) - (b.days ?? 0) || (a.lowest_price_krw ?? 0) - (b.lowest_price_krw ?? 0));
  } else if (state.filters.sort === "site") {
    filtered.sort((a, b) => a.site.localeCompare(b.site) || (a.days ?? 0) - (b.days ?? 0));
  } else {
    filtered.sort(
      (a, b) =>
        (a.lowest_price_krw ?? Number.MAX_SAFE_INTEGER) - (b.lowest_price_krw ?? Number.MAX_SAFE_INTEGER)
        || (a.days ?? 0) - (b.days ?? 0)
    );
  }

  return filtered;
}

function getFilteredPriceBands() {
  const filtered = (state.payload?.price_band_matrix ?? [])
    .filter((band) => state.filters.country === "all" || band.country_code === state.filters.country)
    .filter((band) => state.views.priceBandCountry === "all" || band.country_code === state.views.priceBandCountry)
    .map((band) => ({
      ...band,
      day_cells: band.day_cells.filter((cell) => state.filters.days === "all" || String(cell.days) === state.filters.days),
    }))
    .filter((band) => band.day_cells.length > 0)
    .sort((a, b) => {
      const aLowest = Math.min(...a.day_cells.map((cell) => cell.lowest_price_krw || Number.MAX_SAFE_INTEGER));
      const bLowest = Math.min(...b.day_cells.map((cell) => cell.lowest_price_krw || Number.MAX_SAFE_INTEGER));
      return aLowest - bLowest;
    });

  return applyLimit(filtered, state.views.priceBandLimit);
}

function getFilteredPremiumRows() {
  const filtered = [...(state.payload?.network_premium_summary ?? [])]
    .filter((row) => {
      if (state.filters.site !== "all" && row.site !== state.filters.site) return false;
      if (state.filters.country !== "all" && row.country_code !== state.filters.country) return false;
      if (state.filters.days !== "all" && String(row.days) !== state.filters.days) return false;
      if (state.filters.quota !== "all" && row.data_quota_label !== state.filters.quota) return false;
      if (state.views.premiumSite !== "all" && row.site !== state.views.premiumSite) return false;
      return true;
    })
    .sort((a, b) => Math.abs(b.premium_krw || 0) - Math.abs(a.premium_krw || 0) || (a.days ?? 0) - (b.days ?? 0));

  return applyLimit(filtered, state.views.premiumLimit);
}

function applyLimit(rows, limitValue) {
  if (limitValue === "all") {
    return rows;
  }
  const limit = Number.parseInt(limitValue, 10);
  if (Number.isNaN(limit) || limit <= 0) {
    return rows;
  }
  return rows.slice(0, limit);
}

function getSelectedComparisonSnapshots() {
  return state.selectedSnapshotRunIds
    .filter((runId) => runId !== state.primarySnapshotRunId)
    .map((runId) => getSnapshotByRunId(runId))
    .filter((snapshot) => snapshot != null);
}

function createComparisonKey(row) {
  return [
    row.country_code ?? "",
    row.site ?? "",
    row.days ?? "",
    row.data_quota_label ?? "",
    row.network_type ?? "",
  ].join("|");
}

function buildComparisonLookup(rows) {
  const lookup = new Map();
  for (const row of rows) {
    lookup.set(createComparisonKey(row), row);
  }
  return lookup;
}

function getComparisonDescriptors(rows) {
  const primarySnapshot = state.currentSnapshot;
  const lookups = new Map();
  const snapshots = [];

  for (const snapshot of getSelectedComparisonSnapshots()) {
    const payload = state.snapshotPayloadCache.get(snapshot.run_id);
    if (!payload || typeof payload.then === "function") {
      continue;
    }
    lookups.set(snapshot.run_id, buildComparisonLookup(payload.comparison_rows ?? []));
    snapshots.push(snapshot);
  }

  return rows.map((row) => {
    const key = createComparisonKey(row);
    const items = snapshots.map((snapshot) => {
      const compareRow = lookups.get(snapshot.run_id)?.get(key) ?? null;
      return buildComparisonItem(row, compareRow, primarySnapshot, snapshot);
    });
    return { row, items };
  });
}

function buildComparisonItem(primaryRow, compareRow, primarySnapshot, compareSnapshot) {
  if (!compareRow || compareRow.lowest_price_krw == null || primaryRow.lowest_price_krw == null) {
    return {
      label: `${formatDate(compareSnapshot.collected_at)} 비교`,
      value: "비교 불가",
      detail: compareRow?.lowest_price_krw != null ? `${fmt.format(compareRow.lowest_price_krw)}원` : "동일 조건 없음",
      tone: "is-missing",
    };
  }

  const delta = compareRow.lowest_price_krw - primaryRow.lowest_price_krw;
  const sign = delta > 0 ? "+" : "";
  return {
    label: `${formatDate(compareSnapshot.collected_at)} 비교`,
    value: `${sign}${fmt.format(delta)}원`,
    detail: `${formatDate(primarySnapshot?.collected_at)} ${fmt.format(primaryRow.lowest_price_krw)}원 → ${fmt.format(compareRow.lowest_price_krw)}원`,
    tone: delta > 0 ? "is-up" : delta < 0 ? "is-down" : "",
  };
}

function buildComparisonMarkup(items) {
  if (!items.length) {
    return '<span class="comparison-empty">기준 시점만 선택됨</span>';
  }

  return `
    <div class="comparison-stack">
      ${items.map((item) => `
        <div class="comparison-chip ${item.tone}">
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.label)} · ${escapeHtml(item.detail)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function buildComparisonSummary(items) {
  if (!items.length) {
    return "기준 시점만 선택됨";
  }
  return items.map((item) => `${item.label}: ${item.value} (${item.detail})`).join(" | ");
}

function renderTable(rows) {
  const rowComparisons = getComparisonDescriptors(rows);
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pagination.pageSize));
  const currentPage = Math.min(state.pagination.currentPage, pageCount);
  state.pagination.currentPage = currentPage;
  const startIndex = (currentPage - 1) * state.pagination.pageSize;
  const pagedRows = rowComparisons.slice(startIndex, startIndex + state.pagination.pageSize);

  elements.comparisonBody.innerHTML = "";
  elements.tableMeta.textContent = buildTableMetaText(rows.length, currentPage, pageCount);
  elements.downloadCsv.disabled = rows.length === 0;
  renderPagination(pageCount, currentPage, rows.length === 0);

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.className = "empty-state";
    td.textContent = "선택한 필터에 맞는 결과가 없습니다.";
    tr.appendChild(td);
    elements.comparisonBody.appendChild(tr);
    return;
  }

  for (const entry of pagedRows) {
    const { row, items } = entry;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(row.country_name_ko)}</strong><small>${escapeHtml(row.country_code)}</small></td>
      <td><strong>${escapeHtml(row.site_label)}</strong><small>${escapeHtml(row.site)}</small></td>
      <td>${escapeHtml(String(row.days))}일</td>
      <td>${escapeHtml(row.data_quota_label || "-")}</td>
      <td>${escapeHtml(row.network_type || "-")}</td>
      <td><strong>${row.lowest_price_krw != null ? `${fmt.format(row.lowest_price_krw)}원` : "-"}</strong><small>${formatDate(row.last_collected_at)}</small></td>
      <td class="comparison-cell">${buildComparisonMarkup(items)}</td>
      <td>${fmt.format(row.option_count)}</td>
      <td>${escapeHtml(row.sample_option_name || "-")}</td>
      <td><a class="source-link" href="${row.source_url}" target="_blank" rel="noopener noreferrer">Open</a></td>
    `;
    elements.comparisonBody.appendChild(tr);
  }
}

function buildTableMetaText(rowCount, currentPage, pageCount) {
  const base = `${fmt.format(rowCount)}개 비교 행 · ${fmt.format(currentPage)}/${fmt.format(pageCount)} 페이지`;
  const comparisonSnapshots = getSelectedComparisonSnapshots();
  if (!comparisonSnapshots.length) {
    return base;
  }
  const labels = comparisonSnapshots.map((snapshot) => formatDate(snapshot.collected_at)).join(", ");
  return `${base} · 기준 ${formatDate(state.currentSnapshot?.collected_at)} vs ${labels}`;
}

function renderPagination(pageCount, currentPage, isEmpty) {
  elements.pageFirst.disabled = isEmpty || currentPage <= 1;
  elements.pagePrev.disabled = isEmpty || currentPage <= 1;
  elements.pageNext.disabled = isEmpty || currentPage >= pageCount;
  elements.pageLast.disabled = isEmpty || currentPage >= pageCount;
  elements.pageNumbers.innerHTML = "";

  if (isEmpty) {
    return;
  }

  const windowStart = Math.floor((currentPage - 1) / PAGE_WINDOW_SIZE) * PAGE_WINDOW_SIZE + 1;
  const windowEnd = Math.min(pageCount, windowStart + PAGE_WINDOW_SIZE - 1);

  for (let page = windowStart; page <= windowEnd; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ghost-button page-button${page === currentPage ? " is-active" : ""}`;
    button.textContent = String(page);
    button.disabled = page === currentPage;
    button.addEventListener("click", () => {
      goToPage(page);
    });
    elements.pageNumbers.appendChild(button);
  }
}

function downloadComparisonRows(rows) {
  if (!rows.length) {
    return;
  }

  const rowComparisons = getComparisonDescriptors(rows);
  const headers = [
    ["country_name_ko", "국가"],
    ["country_code", "국가코드"],
    ["site_label", "사이트"],
    ["site", "사이트ID"],
    ["days", "일수"],
    ["data_quota_label", "데이터"],
    ["network_type", "망유형"],
    ["lowest_price_krw", "최저가KRW"],
    ["comparison_summary", "시점비교"],
    ["option_count", "옵션수"],
    ["sample_option_name", "대표옵션"],
    ["last_collected_at", "수집시각"],
    ["source_url", "원본URL"],
  ];

  const lines = [
    headers.map(([, label]) => toCsvCell(label)).join(","),
    ...rowComparisons.map(({ row, items }) =>
      headers
        .map(([key]) => {
          if (key === "comparison_summary") {
            return toCsvCell(buildComparisonSummary(items));
          }
          const value = key === "last_collected_at" ? formatDate(row[key]) : row[key];
          return toCsvCell(value ?? "");
        })
        .join(",")
    ),
  ];

  const csv = `\uFEFF${lines.join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const runId = state.payload?.summary?.run_id ?? "dashboard";
  anchor.href = url;
  anchor.download = `${runId}-comparison.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatDirection(direction) {
  if (direction === "local_higher") return "local이 더 비쌈";
  if (direction === "roaming_higher") return "roaming이 더 비쌈";
  return "동일";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resetFiltersAndViews() {
  state.pagination.currentPage = 1;
  state.filters = {
    site: "all",
    country: "all",
    days: "all",
    quota: "all",
    network: "all",
    sort: "price",
  };
  state.views = {
    priceBandCountry: "all",
    priceBandLimit: "3",
    premiumSite: "all",
    premiumLimit: "6",
  };
  state.drilldowns = {
    distribution: null,
    premium: null,
  };
}

function syncGlobalFilterInputs() {
  setSelectValue(elements.siteFilter, state.filters.site);
  setSelectValue(elements.countryFilter, state.filters.country);
  setSelectValue(elements.daysFilter, state.filters.days);
  setSelectValue(elements.quotaFilter, state.filters.quota);
  setSelectValue(elements.networkFilter, state.filters.network);
  setSelectValue(elements.sortFilter, state.filters.sort);
}

function syncViewInputs() {
  setSelectValue(elements.priceBandCountryFilter, state.views.priceBandCountry);
  setSelectValue(elements.priceBandLimitFilter, state.views.priceBandLimit);
  setSelectValue(elements.premiumSiteFilter, state.views.premiumSite);
  setSelectValue(elements.premiumLimitFilter, state.views.premiumLimit);
}

function setSelectValue(select, value) {
  const optionValues = Array.from(select.options).map((option) => option.value);
  select.value = optionValues.includes(value) ? value : optionValues[0] ?? "";
}

function applyFilters(nextFilters, options = {}) {
  const { preserveDrilldowns = false } = options;
  state.filters = {
    ...state.filters,
    ...nextFilters,
  };
  state.pagination.currentPage = 1;

  if (!preserveDrilldowns) {
    state.drilldowns = {
      distribution: null,
      premium: null,
    };
  }

  syncGlobalFilterInputs();
  render();
}

function applySectionDrilldown(source, patch) {
  const previousValues = {};
  for (const key of Object.keys(patch)) {
    previousValues[key] = state.filters[key];
  }

  state.drilldowns = {
    distribution: null,
    premium: null,
    [source]: { previousValues },
  };

  applyFilters(patch, { preserveDrilldowns: true });
}

function clearDrilldown(source) {
  const entry = state.drilldowns[source];
  if (!entry) {
    return;
  }

  state.drilldowns = {
    distribution: null,
    premium: null,
  };

  applyFilters(entry.previousValues ?? {}, { preserveDrilldowns: true });
}

function updateDrilldownButtons() {
  elements.distributionClear.disabled = !state.drilldowns.distribution;
  elements.premiumClear.disabled = !state.drilldowns.premium;
}

function goToPage(page) {
  const rows = getFilteredRows();
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pagination.pageSize));
  state.pagination.currentPage = Math.max(1, Math.min(page, pageCount));
  renderTable(rows);
}

function togglePanel(panelKey) {
  state.panels[panelKey] = !state.panels[panelKey];
  renderPanels();
  if (panelKey === "distribution") {
    renderPriceBands();
  }
  if (panelKey === "premium") {
    renderPremiumRows();
  }
}

function updatePanelStatus(toggleElement, expanded) {
  const badge = toggleElement.querySelector(".panel-toggle-badge");
  const hint = toggleElement.querySelector(".panel-toggle-hint");
  if (badge) {
    badge.textContent = expanded ? "펼쳐짐" : "접힘 상태";
  }
  if (hint) {
    hint.textContent = expanded ? "다시 누르면 접힙니다" : hint.textContent;
    if (!expanded) {
      if (toggleElement === elements.distributionToggle) {
        hint.textContent = "클릭하여 가격 분포 밴드 펼치기";
      }
      if (toggleElement === elements.premiumToggle) {
        hint.textContent = "클릭하여 local / roaming 비교 펼치기";
      }
    }
  }
}

function buildSnapshotLabel(snapshot) {
  return `${formatDate(snapshot.collected_at)} · ${buildSnapshotScope(snapshot)}`;
}

function openHelpModal() {
  elements.helpModal.hidden = false;
}

function closeHelpModal() {
  elements.helpModal.hidden = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

loadDashboard().catch((error) => {
  elements.snapshotMeta.textContent = error.message;
  elements.tableMeta.textContent = error.message;
  elements.comparisonBody.innerHTML = `<tr><td class="empty-state" colspan="10">${escapeHtml(error.message)}</td></tr>`;
});

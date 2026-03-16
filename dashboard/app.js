const state = {
  payload: null,
  snapshotIndex: null,
  currentSnapshot: null,
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
};

const elements = {
  lastCollected: document.getElementById("last-collected"),
  runId: document.getElementById("run-id"),
  snapshotFilter: document.getElementById("snapshot-filter"),
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
  priceBandCountryFilter: document.getElementById("price-band-country-filter"),
  priceBandLimitFilter: document.getElementById("price-band-limit-filter"),
  priceBandList: document.getElementById("price-band-list"),
  premiumSiteFilter: document.getElementById("premium-site-filter"),
  premiumLimitFilter: document.getElementById("premium-limit-filter"),
  premiumList: document.getElementById("premium-list"),
  downloadCsv: document.getElementById("download-csv"),
  comparisonBody: document.getElementById("comparison-body"),
  tableMeta: document.getElementById("table-meta"),
};

const fmt = new Intl.NumberFormat("ko-KR");

async function loadDashboard() {
  const snapshotIndex = await tryLoadIndex();
  state.snapshotIndex = snapshotIndex;

  if (snapshotIndex?.snapshots?.length) {
    initializeSnapshotSelector(snapshotIndex);
    const selected = snapshotIndex.snapshots.find((item) => item.run_id === snapshotIndex.latest_run_id)
      ?? snapshotIndex.snapshots[0];
    await loadSnapshot(selected.relative_path, selected);
  } else {
    populateSelect(elements.snapshotFilter, [["latest", "기본 최신 데이터"]]);
    elements.snapshotFilter.disabled = true;
    const payload = await fetchJson("./data/latest.json");
    state.currentSnapshot = {
      run_id: payload.summary?.run_id ?? "latest",
      collected_at: payload.summary?.last_collected_at ?? null,
      label: "기본 최신 데이터",
      relative_path: "latest.json",
      selected_sites: payload.summary?.selected_sites ?? [],
      selected_countries: payload.summary?.selected_countries ?? [],
    };
    applyPayload(payload, { resetFilters: true });
  }

  bindEvents();
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

async function loadSnapshot(relativePath, snapshot) {
  elements.snapshotMeta.textContent = "선택한 스냅샷을 불러오는 중입니다.";
  const payload = await fetchJson(`./data/${relativePath}`);
  state.currentSnapshot = snapshot;
  applyPayload(payload, { resetFilters: true });
}

function applyPayload(payload, { resetFilters }) {
  state.payload = payload;
  if (resetFilters) {
    resetFiltersAndViews();
  }
  initializeFilters();
  initializeSectionControls();
  render();
}

function initializeSnapshotSelector(indexPayload) {
  const options = (indexPayload.snapshots ?? []).map((snapshot) => [snapshot.run_id, buildSnapshotLabel(snapshot)]);
  populateSelect(elements.snapshotFilter, options);
  const latestRunId = indexPayload.latest_run_id ?? options[0]?.[0] ?? "latest";
  elements.snapshotFilter.disabled = options.length === 0;
  elements.snapshotFilter.value = latestRunId;
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
  populateSelect(
    elements.networkFilter,
    [["all", "전체 망"], ...filters.network_types.map((type) => [type, type])]
  );
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
      state.filters[key] = element.value;
      render();
    });
  }

  elements.snapshotFilter.addEventListener("change", async () => {
    const snapshot = state.snapshotIndex?.snapshots?.find((item) => item.run_id === elements.snapshotFilter.value);
    if (!snapshot) {
      return;
    }
    await loadSnapshot(snapshot.relative_path, snapshot);
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
}

function render() {
  const rows = getFilteredRows();
  renderHeader();
  renderSummary(rows);
  renderPriceBands();
  renderPremiumRows();
  renderTable(rows);
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

  const siteText = snapshot.selected_sites?.length ? snapshot.selected_sites.join(", ") : "전체 사이트";
  const countryText = snapshot.selected_countries?.length ? snapshot.selected_countries.join(", ") : "전체 국가";
  return `${formatDate(snapshot.collected_at)} 기준 · ${siteText} · ${countryText}`;
}

function renderSummary(rows) {
  const prices = rows.map((row) => row.lowest_price_krw).filter((value) => value != null);
  elements.kpiRows.textContent = fmt.format(rows.length);
  elements.kpiLowest.textContent = prices.length ? `${fmt.format(Math.min(...prices))}원` : "-";
  elements.kpiSites.textContent = fmt.format(new Set(rows.map((row) => row.site)).size);
  elements.kpiCountries.textContent = fmt.format(new Set(rows.map((row) => row.country_code)).size);
}

function renderPriceBands() {
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
        applyFilters({
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
      applyFilters({
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
  const rows = [...state.payload.comparison_rows];
  const filtered = rows.filter((row) => {
    if (state.filters.site !== "all" && row.site !== state.filters.site) return false;
    if (state.filters.country !== "all" && row.country_code !== state.filters.country) return false;
    if (state.filters.days !== "all" && String(row.days) !== state.filters.days) return false;
    if (state.filters.quota !== "all" && row.data_quota_label !== state.filters.quota) return false;
    if (state.filters.network !== "all" && row.network_type !== state.filters.network) return false;
    return true;
  });

  if (state.filters.sort === "days") {
    filtered.sort((a, b) => a.days - b.days || a.lowest_price_krw - b.lowest_price_krw);
  } else if (state.filters.sort === "site") {
    filtered.sort((a, b) => a.site.localeCompare(b.site) || a.days - b.days);
  } else {
    filtered.sort((a, b) => a.lowest_price_krw - b.lowest_price_krw || a.days - b.days);
  }

  return filtered;
}

function getFilteredPriceBands() {
  const filtered = (state.payload.price_band_matrix ?? [])
    .filter((band) => state.filters.country === "all" || band.country_code === state.filters.country)
    .filter((band) => state.views.priceBandCountry === "all" || band.country_code === state.views.priceBandCountry)
    .map((band) => ({
      ...band,
      day_cells: band.day_cells.filter((cell) => {
        if (state.filters.days !== "all" && String(cell.days) !== state.filters.days) return false;
        return true;
      }),
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
  const filtered = [...(state.payload.network_premium_summary ?? [])]
    .filter((row) => {
      if (state.filters.site !== "all" && row.site !== state.filters.site) return false;
      if (state.filters.country !== "all" && row.country_code !== state.filters.country) return false;
      if (state.filters.days !== "all" && String(row.days) !== state.filters.days) return false;
      if (state.filters.quota !== "all" && row.data_quota_label !== state.filters.quota) return false;
      if (state.views.premiumSite !== "all" && row.site !== state.views.premiumSite) return false;
      return true;
    })
    .sort((a, b) => Math.abs(b.premium_krw || 0) - Math.abs(a.premium_krw || 0) || a.days - b.days);

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

function renderTable(rows) {
  elements.comparisonBody.innerHTML = "";
  elements.tableMeta.textContent = `${fmt.format(rows.length)}개 비교 행`;
  elements.downloadCsv.disabled = rows.length === 0;

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "empty-state";
    td.textContent = "선택한 필터에 맞는 결과가 없습니다.";
    tr.appendChild(td);
    elements.comparisonBody.appendChild(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(row.country_name_ko)}</strong><small>${escapeHtml(row.country_code)}</small></td>
      <td><strong>${escapeHtml(row.site_label)}</strong><small>${escapeHtml(row.site)}</small></td>
      <td>${escapeHtml(String(row.days))}일</td>
      <td>${escapeHtml(row.data_quota_label || "-")}</td>
      <td>${escapeHtml(row.network_type || "-")}</td>
      <td><strong>${fmt.format(row.lowest_price_krw)}원</strong><small>${formatDate(row.last_collected_at)}</small></td>
      <td>${fmt.format(row.option_count)}</td>
      <td>${escapeHtml(row.sample_option_name || "-")}</td>
      <td><a class="source-link" href="${row.source_url}" target="_blank" rel="noopener noreferrer">Open</a></td>
    `;
    elements.comparisonBody.appendChild(tr);
  }
}

function downloadComparisonRows(rows) {
  if (!rows.length) {
    return;
  }

  const headers = [
    ["country_name_ko", "국가"],
    ["country_code", "국가코드"],
    ["site_label", "사이트"],
    ["site", "사이트ID"],
    ["days", "일수"],
    ["data_quota_label", "데이터"],
    ["network_type", "망유형"],
    ["lowest_price_krw", "최저가KRW"],
    ["option_count", "옵션수"],
    ["sample_option_name", "대표옵션"],
    ["last_collected_at", "수집시각"],
    ["source_url", "원본URL"],
  ];

  const lines = [
    headers.map(([, label]) => toCsvCell(label)).join(","),
    ...rows.map((row) =>
      headers
        .map(([key]) => {
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

function applyFilters(nextFilters) {
  state.filters = {
    ...state.filters,
    ...nextFilters,
  };
  syncGlobalFilterInputs();
  render();
}

function buildSnapshotLabel(snapshot) {
  const base = formatDate(snapshot.collected_at);
  const scope = [
    snapshot.selected_sites?.length ? snapshot.selected_sites.join(", ") : "전체 사이트",
    snapshot.selected_countries?.length ? snapshot.selected_countries.join(", ") : "전체 국가",
  ].join(" · ");
  return `${base} · ${scope}`;
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
  elements.comparisonBody.innerHTML = `<tr><td class="empty-state" colspan="9">${escapeHtml(error.message)}</td></tr>`;
});

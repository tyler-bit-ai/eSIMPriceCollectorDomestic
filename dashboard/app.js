const state = {
  payload: null,
  filters: {
    site: "all",
    country: "all",
    days: "all",
    quota: "all",
    network: "all",
    sort: "price",
  },
};

const elements = {
  lastCollected: document.getElementById("last-collected"),
  runId: document.getElementById("run-id"),
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
  siteSummary: document.getElementById("site-summary"),
  countrySummary: document.getElementById("country-summary"),
  comparisonBody: document.getElementById("comparison-body"),
  tableMeta: document.getElementById("table-meta"),
  summaryItemTemplate: document.getElementById("summary-item-template"),
};

const fmt = new Intl.NumberFormat("ko-KR");

async function loadDashboard() {
  const response = await fetch(new URL("./data/latest.json", window.location.href));
  if (!response.ok) {
    throw new Error(`Failed to load dashboard data: ${response.status}`);
  }
  state.payload = await response.json();
  initializeFilters();
  bindEvents();
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
  populateSelect(
    elements.networkFilter,
    [["all", "전체 망"], ...filters.network_types.map((type) => [type, type])]
  );
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

  elements.resetFilters.addEventListener("click", () => {
    state.filters = {
      site: "all",
      country: "all",
      days: "all",
      quota: "all",
      network: "all",
      sort: "price",
    };
    elements.siteFilter.value = "all";
    elements.countryFilter.value = "all";
    elements.daysFilter.value = "all";
    elements.quotaFilter.value = "all";
    elements.networkFilter.value = "all";
    elements.sortFilter.value = "price";
    render();
  });
}

function render() {
  const rows = getFilteredRows();
  renderHeader();
  renderKpis(rows);
  renderSummaryList(elements.siteSummary, getFilteredSiteSummary(rows), "site");
  renderSummaryList(elements.countrySummary, getFilteredCountrySummary(rows), "country");
  renderTable(rows);
}

function renderHeader() {
  const { summary } = state.payload;
  elements.lastCollected.textContent = formatDate(summary.last_collected_at);
  elements.runId.textContent = summary.run_id;
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

function renderKpis(rows) {
  const prices = rows.map((row) => row.lowest_price_krw).filter((value) => value != null);
  elements.kpiRows.textContent = fmt.format(rows.length);
  elements.kpiLowest.textContent = prices.length ? `${fmt.format(Math.min(...prices))}원` : "-";
  elements.kpiSites.textContent = fmt.format(new Set(rows.map((row) => row.site)).size);
  elements.kpiCountries.textContent = fmt.format(new Set(rows.map((row) => row.country_code)).size);
}

function renderSummaryList(container, items, kind) {
  container.innerHTML = "";
  for (const item of items) {
    const fragment = elements.summaryItemTemplate.content.cloneNode(true);
    const title = fragment.querySelector(".summary-title");
    const meta = fragment.querySelector(".summary-meta");
    const price = fragment.querySelector(".summary-price");
    if (kind === "site") {
      title.textContent = item.site_label;
      meta.textContent = `${item.option_count}개 옵션 · ${item.country_count}개 국가 · ${formatDate(item.last_collected_at)}`;
    } else {
      title.textContent = item.country_name_ko;
      meta.textContent = `${item.option_count}개 옵션 · ${item.site_count}개 사이트 · ${formatDate(item.last_collected_at)}`;
    }
    price.textContent = item.lowest_price_krw != null ? `${fmt.format(item.lowest_price_krw)}원부터` : "-";
    container.appendChild(fragment);
  }
}

function getFilteredSiteSummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.site);
    if (!current) {
      map.set(row.site, {
        site: row.site,
        site_label: row.site_label,
        country_count: 1,
        option_count: row.option_count,
        lowest_price_krw: row.lowest_price_krw,
        last_collected_at: row.last_collected_at,
        countries: new Set([row.country_code]),
      });
      continue;
    }
    current.country_count = current.countries.add(row.country_code).size;
    current.option_count += row.option_count;
    current.lowest_price_krw = Math.min(current.lowest_price_krw, row.lowest_price_krw);
    if (row.last_collected_at > current.last_collected_at) {
      current.last_collected_at = row.last_collected_at;
    }
  }
  return [...map.values()].sort((a, b) => a.lowest_price_krw - b.lowest_price_krw);
}

function getFilteredCountrySummary(rows) {
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.country_code);
    if (!current) {
      map.set(row.country_code, {
        country_code: row.country_code,
        country_name_ko: row.country_name_ko,
        site_count: 1,
        option_count: row.option_count,
        lowest_price_krw: row.lowest_price_krw,
        last_collected_at: row.last_collected_at,
        sites: new Set([row.site]),
      });
      continue;
    }
    current.site_count = current.sites.add(row.site).size;
    current.option_count += row.option_count;
    current.lowest_price_krw = Math.min(current.lowest_price_krw, row.lowest_price_krw);
    if (row.last_collected_at > current.last_collected_at) {
      current.last_collected_at = row.last_collected_at;
    }
  }
  return [...map.values()].sort((a, b) => a.lowest_price_krw - b.lowest_price_krw);
}

function renderTable(rows) {
  elements.comparisonBody.innerHTML = "";
  elements.tableMeta.textContent = `${fmt.format(rows.length)}개 비교 행`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

loadDashboard().catch((error) => {
  elements.tableMeta.textContent = error.message;
  elements.comparisonBody.innerHTML = `<tr><td class="empty-state" colspan="9">${escapeHtml(error.message)}</td></tr>`;
});

class CarManagerRomaniaPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._panel = null;
    this._activeTab = this._loadPreference("active_tab") || "overview";
    this._vehicleFilter = this._loadPreference("vehicle_filter") || "all";
    this._tooltip = null;
    this._lastSignature = "";
    this._serviceFormOpen = new Set();
    this._serviceRecordEditOpen = new Set();
    this._serviceRecordDrafts = {};
    this._serviceRecordEditDrafts = {};
    this._serviceRecordMessage = {};
    this._serviceRecordBusy = null;
    this._fuelFormOpen = new Set();
    this._fuelReceiptEditOpen = new Set();
    this._fuelReceiptDrafts = {};
    this._fuelReceiptEditDrafts = {};
    this._fuelReceiptMessage = {};
    this._fuelReceiptBusy = null;
    this._fuelPeriod = this._loadPreference("fuel_period") || "year";
    this._tireFormOpen = new Set();
    this._tireSetEditOpen = new Set();
    this._tireSetDrafts = {};
    this._tireSetEditDrafts = {};
    this._tireSetMessage = {};
    this._tireSetBusy = null;
    this._equipmentFormOpen = new Set();
    this._equipmentEditOpen = new Set();
    this._equipmentDrafts = {};
    this._equipmentEditDrafts = {};
    this._equipmentMessage = {};
    this._equipmentBusy = null;
    this._batteryFormOpen = new Set();
    this._batteryEditOpen = new Set();
    this._batteryDrafts = {};
    this._batteryEditDrafts = {};
    this._batteryMessage = {};
    this._batteryBusy = null;
    this._licenseDraft = null;
    this._licenseMessage = "";
    this._licenseBusy = null;
    this._notificationOptionsDraft = null;
    this._notificationBusy = false;
    this._notificationMessage = "";
    this._featureOptionsDraft = null;
    this._featureBusy = false;
    this._featureMessage = "";
    this._backupBusy = null;
    this._backupFilename = "car_manager_romania_backup.json";
    this._backupMessage = "";
    this._rovinietaAccountBusy = false;
    this._rovinietaAccountMessage = "";
    this._rovinietaSavedUsername = "";
    this._rovinietaSavedProvider = this._loadPreference("rovinieta_provider") || "cnair";
    this._rovinietaSavedInterval = Number(this._loadPreference("rovinieta_scan_interval") || 21600) || 21600;
    this._rovinietaHasSavedPassword = false;
    this._rovinietaAccountLoaded = false;
    this._rovinietaAccountLoadBusy = false;
    this._rovinietaImportBusy = false;
    this._rovinietaImportMessage = "";
    this._rovinietaImportVehicles = [];
    this._rovinietaRefreshBusy = false;
    this._rovinietaRefreshMessage = "";
    this._itpRefreshBusy = false;
    this._itpRefreshMessage = "";
    this._vehicleAddOpen = false;
    this._vehicleAddBusy = false;
    this._vehicleAddMessage = "";
    this._vehicleEditOpen = new Set();
    this._vehicleEditDrafts = {};
    this._vehicleEditMessage = {};
    this._vehicleEditBusy = null;
    this._vehicleDeleteBusy = null;
    this._vehicleLocalOverrides = {};
    this._lastCenteredTab = null;
  }

  set panel(panel) {
    this._panel = panel;
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    const signature = this._buildSignature();
    if (signature === this._lastSignature && this.shadowRoot?.querySelector(".cmr-panel")) return;
    this._lastSignature = signature;
    this._render(false);
  }

  connectedCallback() {
    this._render(true);
  }

  _storageKey(name) {
    return `car_manager_romania_panel_redesign__${name}`;
  }

  _loadPreference(name) {
    try { return window.localStorage?.getItem(this._storageKey(name)); } catch (_err) { return null; }
  }

  _savePreference(name, value) {
    try { window.localStorage?.setItem(this._storageKey(name), value); } catch (_err) {}
  }

  _removePreference(name) {
    try { window.localStorage?.removeItem(this._storageKey(name)); } catch (_err) {}
  }

  _isCompactLayout() {
    // Layout mobil decis explicit din JavaScript, nu doar din CSS.
    // În aplicația Home Assistant, cardul/panelul poate primi o lățime CSS diferită de ecranul real.
    const viewportWidth = Math.min(
      window.innerWidth || 9999,
      window.visualViewport?.width || 9999,
      document.documentElement?.clientWidth || 9999,
    );
    const ownWidth = this.getBoundingClientRect?.().width || viewportWidth;
    const userAgent = navigator.userAgent || "";
    const isPhoneOrMobileApp = /Android|iPhone|iPod|Mobile/i.test(userAgent);
    return isPhoneOrMobileApp || viewportWidth <= 900 || ownWidth <= 900;
  }

  _tabs() {
    return [
      ["overview", "Acasă", "mdi:view-dashboard-outline"],
      ["vehicles", "Mașini", "mdi:car-multiple"],
      ["costs", "Costuri", "mdi:cash-multiple"],
      ["statistics", "Statistici", "mdi:chart-line"],
      ["fuel", "Combustibil", "mdi:gas-station"],
      ["tires", "Anvelope", "mdi:tire"],
      ["equipment", "Dotări", "mdi:shield-car"],
      ["battery", "Baterie", "mdi:car-battery"],
      ["license", "Licență", "mdi:shield-key-outline"],
      ["settings", "Setări", "mdi:cog-outline"],
    ].filter(([id]) => this._tabIsVisible(id));
  }

  _tabFeatureKey(id) {
    return {
      costs: "feature_costs",
      statistics: "feature_statistics",
      fuel: "feature_fuel",
      tires: "feature_tires",
      equipment: "feature_equipment",
      battery: "feature_battery",
    }[id] || null;
  }

  _tabIsVisible(id) {
    const key = this._tabFeatureKey(id);
    return !key || this._featureEnabled(key);
  }

  _featureEnabled(key) {
    return Boolean(this._featureOptionsForForm()[key]);
  }

  _vehicleFeatureOptionDefinitions() {
    return this._featureOptionDefinitions().filter(([key]) => !["feature_rovinieta_online", "feature_itp_online"].includes(key));
  }

  _vehicleFeatureOptions(vehicle) {
    const defaults = Object.fromEntries(this._vehicleFeatureOptionDefinitions().map(([key]) => [key, true]));
    const raw = vehicle?.attrs?.vehicle_feature_options || vehicle?.attrs?.vehicleFeatureOptions || vehicle?.vehicle_feature_options || {};
    if (!raw || typeof raw !== "object") return defaults;
    const normalized = { ...defaults };
    this._vehicleFeatureOptionDefinitions().forEach(([key]) => {
      if (Object.prototype.hasOwnProperty.call(raw, key)) normalized[key] = Boolean(raw[key]);
    });
    return normalized;
  }

  _vehicleFeatureEnabled(vehicle, key) {
    if (!key) return true;
    return this._featureEnabled(key) && Boolean(this._vehicleFeatureOptions(vehicle)[key]);
  }

  _featureByLegalType(key) {
    return { rca: "feature_rca", casco: "feature_casco", itp: "feature_itp", rovinieta: "feature_rovinieta" }[key] || null;
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  _normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  _toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  _formatNumber(value, digits = 0) {
    const number = this._toNumber(value);
    try {
      return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(number);
    } catch (_err) {
      return String(number);
    }
  }

  _formatMoney(value, digits = 0) {
    const number = this._toNumber(value);
    try {
      return new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: digits }).format(number);
    } catch (_err) {
      return `${this._formatNumber(number, digits)} RON`;
    }
  }

  _parseDate(value) {
    const text = String(value || "").trim();
    if (!text || text === "unknown" || text === "unavailable" || text === "—") return null;

    const roMatch = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[\sT].*)?$/);
    if (roMatch) {
      const day = roMatch[1].padStart(2, "0");
      const month = roMatch[2].padStart(2, "0");
      const parsed = new Date(`${roMatch[3]}-${month}-${day}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT].*)?$/);
    if (isoMatch) {
      const month = isoMatch[2].padStart(2, "0");
      const day = isoMatch[3].padStart(2, "0");
      const parsed = new Date(`${isoMatch[1]}-${month}-${day}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  _formatDate(value) {
    const parsed = this._parseDate(value);
    if (!parsed) return value ? String(value).replace(/[\sT]+\d{1,2}:\d{2}(?::\d{2})?.*$/, "") : "—";
    try { return new Intl.DateTimeFormat("ro-RO").format(parsed); } catch (_err) { return String(value).replace(/[\sT]+\d{1,2}:\d{2}(?::\d{2})?.*$/, ""); }
  }

  _formatMonth(value) {
    const text = String(value || "");
    const match = text.match(/^(\d{4})-(\d{2})$/);
    if (!match) return text || "—";
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    try { return new Intl.DateTimeFormat("ro-RO", { month: "short", year: "numeric" }).format(parsed); } catch (_err) { return text; }
  }

  _supportedEntity(entityId) {
    return /^(sensor|number|date|text|button)\./.test(entityId || "");
  }

  _friendly(entityId, stateObj) {
    return String(stateObj?.attributes?.friendly_name || entityId || "");
  }

  _shortLabel(label) {
    return String(label || "")
      .replace(/^Car Manager România\s*/i, "")
      .replace(/^Autovehicul\s*/i, "")
      .trim();
  }

  _buildSignature() {
    const states = this._hass?.states || {};
    const relevant = Object.entries(states)
      .filter(([entityId, stateObj]) => this._isCarManagerEntity(entityId, stateObj))
      .map(([entityId, stateObj]) => `${entityId}:${stateObj.state}:${JSON.stringify(stateObj.attributes || {})}`)
      .join("|");
    return `${this._activeTab}|${this._vehicleFilter}|${relevant}`;
  }

  _isCarManagerEntity(entityId, stateObj) {
    const registry = this._hass?.entities?.[entityId] || {};
    if (registry.platform === "car_manager_romania") return true;
    const attrs = stateObj?.attributes || {};
    if (attrs.vehicle_id || attrs.license_plate || attrs.vehicle_statistics || attrs.vehicle_chart_data) return true;
    return this._normalize(attrs.friendly_name || entityId).includes("car manager");
  }

  _isVehicleStatusSensor(entityId, stateObj) {
    const attrs = stateObj?.attributes || {};
    if (!entityId.startsWith("sensor.")) return false;
    if (!attrs.vehicle_id) return false;
    if (!attrs.license_plate && !attrs.vin && !attrs.name) return false;
    return Boolean(attrs.vehicle_statistics || attrs.vehicle_chart_data || this._normalize(attrs.friendly_name || "").endsWith("status"));
  }

  _buildVehicles() {
    const states = this._hass?.states || {};
    const vehicles = [];
    const seen = new Set();

    for (const [entityId, stateObj] of Object.entries(states)) {
      if (!this._isVehicleStatusSensor(entityId, stateObj)) continue;
      const attrs = stateObj.attributes || {};
      const vehicleId = String(attrs.vehicle_id || attrs.license_plate || attrs.vin || entityId).trim();
      if (!vehicleId || seen.has(vehicleId)) continue;
      seen.add(vehicleId);
      const localOverride = this._vehicleLocalOverrides?.[vehicleId] || {};
      const mergedAttrs = { ...attrs, ...localOverride };
      vehicles.push({
        entityId,
        vehicle_id: vehicleId,
        label: mergedAttrs.name || mergedAttrs.license_plate || mergedAttrs.vin || this._shortLabel(attrs.friendly_name || "Autovehicul"),
        plate: mergedAttrs.license_plate || "",
        vin: mergedAttrs.vin || "",
        status: stateObj.state || "—",
        attrs: mergedAttrs,
        entities: [{ entityId, stateObj, registry: this._hass?.entities?.[entityId] || {} }],
        statistics: mergedAttrs.vehicle_statistics || {},
        charts: mergedAttrs.vehicle_chart_data || {},
        service_history: Array.isArray(mergedAttrs.service_history) ? mergedAttrs.service_history : [],
        fuel_receipts: Array.isArray(mergedAttrs.fuel_receipts) ? mergedAttrs.fuel_receipts : [],
        fuel_intervals: Array.isArray(mergedAttrs.fuel_consumption_intervals) ? mergedAttrs.fuel_consumption_intervals : [],
        tire_sets: Array.isArray(mergedAttrs.tire_sets) ? mergedAttrs.tire_sets : [],
        equipment_items: Array.isArray(mergedAttrs.equipment_items) ? mergedAttrs.equipment_items : [],
        battery_items: Array.isArray(mergedAttrs.battery_items) ? mergedAttrs.battery_items : [],
        current_battery: mergedAttrs.current_battery || null,
        summary: mergedAttrs,
      });
    }

    for (const vehicle of vehicles) {
      const keys = [
        vehicle.vehicle_id,
        vehicle.label,
        vehicle.plate,
        vehicle.vin,
        this._normalize(vehicle.vehicle_id),
        this._normalize(vehicle.label),
        this._normalize(vehicle.plate),
        this._normalize(vehicle.vin),
      ].filter(Boolean);

      for (const [entityId, stateObj] of Object.entries(states)) {
        if (!this._isCarManagerEntity(entityId, stateObj)) continue;
        if (!this._supportedEntity(entityId)) continue;

        const attrs = stateObj.attributes || {};
        const haystack = this._normalize(`${entityId} ${attrs.friendly_name || ""} ${attrs.vehicle_id || ""} ${attrs.license_plate || ""} ${attrs.vin || ""}`);
        const directMatch = attrs.vehicle_id === vehicle.vehicle_id
          || attrs.license_plate === vehicle.plate
          || attrs.vin === vehicle.vin;
        const textMatch = keys.some((key) => {
          const normalizedKey = this._normalize(key);
          return normalizedKey && normalizedKey.length >= 3 && haystack.includes(normalizedKey);
        });

        if (!directMatch && !textMatch) continue;
        if (vehicle.entities.some((item) => item.entityId === entityId)) continue;
        vehicle.entities.push({ entityId, stateObj, registry: this._hass?.entities?.[entityId] || {} });
      }
    }

    return vehicles.sort((a, b) => a.label.localeCompare(b.label, "ro"));
  }

  _inactiveVehicles() {
    const states = this._hass?.states || {};
    const inactive = [];
    const seen = new Set();

    for (const stateObj of Object.values(states)) {
      const attrs = stateObj?.attributes || {};
      const items = Array.isArray(attrs.inactive_vehicles) ? attrs.inactive_vehicles : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const vehicleId = String(item.vehicle_id || item.license_plate || item.vin || item.name || "").trim();
        if (!vehicleId || seen.has(vehicleId)) continue;
        seen.add(vehicleId);
        inactive.push({
          vehicle_id: vehicleId,
          label: item.name || item.license_plate || item.vin || vehicleId,
          plate: item.license_plate || "",
          vin: item.vin || "",
          km: item.km || 0,
        });
      }
    }

    return inactive.sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), "ro"));
  }

  _selectedVehicles() {
    const vehicles = this._buildVehicles();
    if (this._vehicleFilter === "all") return vehicles;
    return vehicles.filter((vehicle) => vehicle.vehicle_id === this._vehicleFilter);
  }

  _vehicleOptions() {
    const vehicles = this._buildVehicles();
    const rovinietaSource = this._rovinietaSourceSummary(vehicles);
    return `
      <option value="all" ${this._vehicleFilter === "all" ? "selected" : ""}>Toate mașinile</option>
      ${vehicles.map((vehicle) => `<option value="${this._escape(vehicle.vehicle_id)}" ${this._vehicleFilter === vehicle.vehicle_id ? "selected" : ""}>${this._escape(vehicle.label)}</option>`).join("")}
    `;
  }

  _vehicleCurrentKm(vehicle) {
    const statKm = vehicle.statistics?.mileage?.current_km;
    if (statKm !== undefined && statKm !== null) return this._toNumber(statKm);
    const points = Array.isArray(vehicle.charts?.mileage) ? vehicle.charts.mileage : [];
    if (points.length) return this._toNumber(points[points.length - 1].km ?? points[points.length - 1].value);
    return this._toNumber(vehicle.attrs?.km || vehicle.attrs?.kilometri || 0);
  }

  _vehicleYearFuelCost(vehicle) {
    const stat = vehicle.statistics?.fuel?.current_year_total;
    if (stat !== undefined && stat !== null) return this._toNumber(stat);
    const year = new Date().getFullYear();
    return vehicle.fuel_receipts
      .filter((item) => String(item.date || "").startsWith(`${year}-`))
      .reduce((sum, item) => sum + this._toNumber(item.total_cost ?? item.cost ?? item.amount), 0);
  }

  _vehicleYearServiceCost(vehicle) {
    const stat = vehicle.statistics?.service_history_current_year_cost;
    if (stat !== undefined && stat !== null) return this._toNumber(stat);
    const year = new Date().getFullYear();
    return vehicle.service_history
      .filter((item) => String(item.date || "").startsWith(`${year}-`))
      .reduce((sum, item) => sum + this._toNumber(item.cost), 0);
  }

  _vehicleAverageConsumption(vehicle) {
    const candidates = [
      vehicle.statistics?.fuel?.average_consumption,
      vehicle.statistics?.fuel?.average_consumption_l_100km,
      vehicle.statistics?.fuel?.avg_consumption,
      vehicle.attrs?.average_consumption,
      vehicle.attrs?.average_consumption_l_100km,
      vehicle.attrs?.fuel_average_consumption,
      vehicle.attrs?.fuel_average_consumption_l_100km,
      vehicle.attrs?.consum_mediu,
    ];
    for (const candidate of candidates) {
      const value = this._toNumber(candidate);
      if (value > 0) return value;
    }

    const chartPoints = this._normalizeConsumptionPoints(vehicle);
    const chartValues = chartPoints.map((item) => this._toNumber(item.value)).filter((value) => value > 0);
    if (chartValues.length) return chartValues.reduce((sum, value) => sum + value, 0) / chartValues.length;

    const intervals = Array.isArray(vehicle.fuel_intervals) ? vehicle.fuel_intervals : [];
    const values = intervals
      .map((item) => this._toNumber(item.consumption ?? item.average_consumption ?? item.consumption_l_100km ?? item.value))
      .filter((value) => value > 0);
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  _vehicleCostPerKm(vehicle) {
    const receiptCostPerKm = this._vehicleLastReceiptCostPerKm(vehicle);
    if (receiptCostPerKm > 0) return receiptCostPerKm;

    const candidates = [
      vehicle.statistics?.fuel?.cost_per_km,
      vehicle.statistics?.fuel?.cost_per_km_ron,
      vehicle.statistics?.cost_per_km,
      vehicle.attrs?.cost_per_km,
      vehicle.attrs?.cost_per_km_ron,
      vehicle.attrs?.fuel_cost_per_km,
    ];
    for (const candidate of candidates) {
      const value = this._toNumber(candidate);
      if (value > 0) return value;
    }

    return 0;
  }

  _vehicleLastReceiptCostPerKm(vehicle) {
    const receipts = Array.isArray(vehicle.fuel_receipts)
      ? vehicle.fuel_receipts
          .map((receipt) => ({
            ...receipt,
            kmValue: this._toNumber(receipt.km ?? receipt.odometer ?? receipt.mileage),
            costValue: this._toNumber(receipt.total_cost ?? receipt.cost ?? receipt.amount),
            sortDate: String(receipt.date || ""),
          }))
          .filter((receipt) => receipt.kmValue > 0 && receipt.costValue > 0)
      : [];

    if (receipts.length < 2) return 0;

    receipts.sort((a, b) => {
      const dateCompare = a.sortDate.localeCompare(b.sortDate);
      if (dateCompare) return dateCompare;
      return a.kmValue - b.kmValue;
    });

    const latest = receipts[receipts.length - 1];
    const previous = [...receipts]
      .slice(0, -1)
      .reverse()
      .find((receipt) => receipt.kmValue < latest.kmValue);

    if (!previous) return 0;

    const distance = latest.kmValue - previous.kmValue;
    if (distance <= 0) return 0;

    return latest.costValue / distance;
  }


  _fleetSummary() {
    const vehicles = this._buildVehicles();
    const now = new Date();
    const year = now.getFullYear();
    let critical = 0;
    let warnings = 0;
    let yearCost = 0;
    let fuelCost = 0;
    let serviceCost = 0;

    for (const vehicle of vehicles) {
      fuelCost += this._vehicleYearFuelCost(vehicle);
      serviceCost += this._vehicleYearServiceCost(vehicle);
      yearCost += this._vehicleYearFuelCost(vehicle) + this._vehicleYearServiceCost(vehicle)
        + this._toNumber(vehicle.attrs?.tire_costs_current_year)
        + this._toNumber(vehicle.attrs?.equipment_costs_current_year)
        + this._toNumber(vehicle.attrs?.battery_costs_current_year);
      for (const [key, value] of Object.entries(vehicle.attrs || {})) {
        const name = this._normalize(key);
        if (!name.includes("days") && !name.includes("zile")) continue;
        const days = this._toNumber(value);
        if (days <= 0) critical += 1;
        else if (days <= 30) warnings += 1;
      }
    }

    return { vehicles: vehicles.length, critical, warnings, yearCost, fuelCost, serviceCost, year };
  }

  _render(force = false) {
    if (!this.shadowRoot) return;
    const hadPanel = Boolean(this.shadowRoot?.querySelector(".cmr-panel"));
    const previousScrollY = window.scrollY || document.documentElement?.scrollTop || 0;
    const vehicles = this._buildVehicles();
    const summary = this._fleetSummary();
    if (!vehicles.some((vehicle) => vehicle.vehicle_id === this._vehicleFilter)) this._vehicleFilter = "all";

    const compactClass = this._isCompactLayout() ? " is-compact" : "";

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="cmr-panel${compactClass}">
        ${this._renderHero(summary)}
        ${this._renderTabs()}
        ${this._renderFilterBar(vehicles)}
        ${this._renderContent()}
      </div>
      <div class="cmr-tooltip" hidden></div>
    `;
    this._tooltip = this.shadowRoot.querySelector(".cmr-tooltip");
    this._attachEvents();
    if ((force || hadPanel) && previousScrollY > 0) {
      // Păstrăm poziția în pagină după randări interne ca să evităm salturile pe mobil.
      requestAnimationFrame(() => {
        window.scrollTo({ top: previousScrollY, left: 0, behavior: "auto" });
        requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, left: 0, behavior: "auto" }));
      });
    }
  }

  _renderHero(summary) {
    const stateLabel = summary.critical > 0 ? "Critic" : summary.warnings > 0 ? "Atenție" : "OK";
    if (this._isCompactLayout()) {
      return `
        <section class="cmr-hero" style="display:block;width:100%;max-width:100%;margin-bottom:18px;overflow:hidden;">
          <div class="cmr-hero-main" style="position:relative;min-height:360px;width:100%;max-width:100%;box-sizing:border-box;border-radius:30px;padding:24px 18px 150px;display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;align-items:start;overflow:hidden;">
            <div class="cmr-hero-car" aria-hidden="true" style="position:absolute;left:50%;right:auto;top:auto;bottom:18px;width:112%;height:170px;transform:translateX(-50%);opacity:.95;z-index:1;pointer-events:none;overflow:visible;filter:drop-shadow(0 18px 28px rgba(4,28,46,.45));">
              <img src="/car_manager_romania_brand/header-car.png" alt="" style="position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;">
            </div>
            <div class="cmr-logo" style="position:relative;z-index:3;width:76px;height:76px;border-radius:22px;display:grid;place-items:center;">
              <img src="/car_manager_romania_brand/icon.png" alt="Car Manager România" style="width:58px;height:58px;object-fit:contain;">
            </div>
            <div class="cmr-hero-copy" style="position:relative;z-index:3;min-width:0;max-width:100%;">
              <h1 style="margin:0 0 14px;font-size:clamp(36px,10vw,46px);line-height:.94;letter-spacing:-.06em;">Car<br>Manager<br>România</h1>
              <p style="margin:0;font-size:16px;line-height:1.34;font-weight:850;max-width:260px;">Administrare auto într-un singur loc: termene legale, revizii, costuri, consum, anvelope, dotări și baterie.</p>
            </div>
            <a class="cmr-haforge-badge" href="https://haforgelabs.ro" target="_blank" rel="noopener noreferrer" title="HAForge Labs" style="position:absolute;right:12px;top:12px;bottom:auto;z-index:4;">
              <img src="/car_manager_romania_brand/haforge-logo.png" alt="HAForge Labs">
              <span class="cmr-haforge-text"><span>HAForge Labs</span><small>v1.2.2</small></span>
            </a>
          </div>
          <aside class="cmr-hero-side" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%;max-width:100%;margin-top:14px;">
            <div class="cmr-state ${stateLabel === "Critic" ? "bad" : stateLabel === "Atenție" ? "warn" : "ok"}" style="min-width:0;">
              <span>Stare flotă</span>
              <strong>${stateLabel}</strong>
            </div>
            <div class="cmr-side-card" style="min-width:0;"><strong>${summary.vehicles}</strong><span>mașini</span></div>
            <div class="cmr-side-card" style="min-width:0;"><strong>${summary.critical + summary.warnings}</strong><span>alerte</span></div>
            <div class="cmr-side-card" style="min-width:0;"><strong>${this._formatMoney(summary.yearCost)}</strong><span>an curent</span></div>
          </aside>
        </section>
      `;
    }
    return `
      <section class="cmr-hero">
        <div class="cmr-hero-main">
          <div class="cmr-logo"><img src="/car_manager_romania_brand/icon.png" alt="Car Manager România"></div>
          <div class="cmr-hero-copy">
            <h1>Car Manager România</h1>
            <p>Administrare auto într-un singur loc: termene legale, revizii, costuri, consum, anvelope, dotări și baterie.</p>
          </div>
          ${this._renderHeroCar()}
          <a class="cmr-haforge-badge" href="https://haforgelabs.ro" target="_blank" rel="noopener noreferrer" title="HAForge Labs">
            <img src="/car_manager_romania_brand/haforge-logo.png" alt="HAForge Labs">
            <span class="cmr-haforge-text"><span>HAForge Labs</span><small>v1.2.2</small></span>
          </a>
        </div>
        <aside class="cmr-hero-side">
          <div class="cmr-state ${stateLabel === "Critic" ? "bad" : stateLabel === "Atenție" ? "warn" : "ok"}">
            <span>Stare flotă</span>
            <strong>${stateLabel}</strong>
          </div>
          <div class="cmr-side-card"><strong>${summary.vehicles}</strong><span>mașini</span></div>
          <div class="cmr-side-card"><strong>${summary.critical + summary.warnings}</strong><span>alerte</span></div>
          <div class="cmr-side-card"><strong>${this._formatMoney(summary.yearCost)}</strong><span>an curent</span></div>
        </aside>
      </section>
    `;
  }

  _renderHeroCar() {
    return `
      <div class="cmr-hero-car" aria-hidden="true">
        <img src="/car_manager_romania_brand/header-car.png" alt="">
      </div>
    `;
  }

  _renderTabs() {
    if (this._isCompactLayout()) {
      return `
        <div class="cmr-tabs-shell" style="display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px;align-items:center;width:100%;max-width:100%;margin-bottom:18px;overflow:hidden;">
          <button class="cmr-tabs-arrow" data-action="scroll-tabs" data-direction="-1" title="Derulează meniul spre stânga" aria-label="Derulează meniul spre stânga" style="display:flex;width:44px;height:44px;align-items:center;justify-content:center;">
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <nav class="cmr-tabs" aria-label="Navigare Car Manager România" style="display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;max-width:100%;min-width:0;scrollbar-width:none;">
            ${this._tabs().map(([id, label, icon]) => `
              <button class="cmr-tab ${this._activeTab === id ? "active" : ""}" data-tab="${id}" title="${this._escape(label)}" style="flex:0 0 58px;min-width:58px;max-width:58px;scroll-snap-align:center;">
                <ha-icon icon="${icon}"></ha-icon><span style="display:none;">${this._escape(label)}</span>
              </button>
            `).join("")}
          </nav>
          <button class="cmr-tabs-arrow" data-action="scroll-tabs" data-direction="1" title="Derulează meniul spre dreapta" aria-label="Derulează meniul spre dreapta" style="display:flex;width:44px;height:44px;align-items:center;justify-content:center;">
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>
      `;
    }
    return `
      <div class="cmr-tabs-shell">
        <button class="cmr-tabs-arrow" data-action="scroll-tabs" data-direction="-1" title="Derulează meniul spre stânga" aria-label="Derulează meniul spre stânga">
          <ha-icon icon="mdi:chevron-left"></ha-icon>
        </button>
        <nav class="cmr-tabs" aria-label="Navigare Car Manager România">
          ${this._tabs().map(([id, label, icon]) => `
            <button class="cmr-tab ${this._activeTab === id ? "active" : ""}" data-tab="${id}" title="${this._escape(label)}">
              <ha-icon icon="${icon}"></ha-icon><span>${this._escape(label)}</span>
            </button>
          `).join("")}
        </nav>
        <button class="cmr-tabs-arrow" data-action="scroll-tabs" data-direction="1" title="Derulează meniul spre dreapta" aria-label="Derulează meniul spre dreapta">
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
      </div>
    `;
  }

  _renderFilterBar(vehicles) {
    return `
      <section class="cmr-filterbar">
        <div>
          <strong>${this._vehicleFilter === "all" ? "Toate autovehiculele" : this._escape(vehicles.find((vehicle) => vehicle.vehicle_id === this._vehicleFilter)?.label || "Autovehicul")}</strong>
          <span>${this._vehicleFilter === "all" ? `${vehicles.length} mașini afișate` : "Filtru activ"}</span>
        </div>
        <label>
          <span>Mașină</span>
          <select data-action="vehicle-filter">${this._vehicleOptions()}</select>
        </label>
      </section>
    `;
  }

  _renderContent() {
    if (!this._tabIsVisible(this._activeTab)) {
      this._activeTab = "overview";
      this._savePreference("active_tab", "overview");
    }
    if (this._activeTab === "statistics") return this._renderStatisticsPage();
    if (this._activeTab === "vehicles") return this._renderVehiclesPage();
    if (this._activeTab === "costs") return this._renderCostsPage();
    if (this._activeTab === "fuel") return this._renderFuelPage();
    if (this._activeTab === "tires") return this._renderTiresPage();
    if (this._activeTab === "equipment") return this._renderEquipmentPage();
    if (this._activeTab === "battery") return this._renderBatteryPage();
    if (this._activeTab === "license") return this._renderLicensePage();
    if (this._activeTab === "settings") return this._renderSettingsPage();
    if (this._activeTab === "overview") return this._renderOverviewPage();
    return this._renderModuleScaffold();
  }

  _renderOverviewPage() {
    const vehicles = this._selectedVehicles();
    const summary = this._overviewSummary(vehicles);
    const alerts = this._overviewAlerts(vehicles).slice(0, 6);
    return `
      <main class="cmr-page cmr-overview-page">
        <div class="cmr-page-title">
          <span>Acasă</span>
          <h2>Privire de ansamblu</h2>
          <p>Starea flotei, costurile principale și atenționările importante, într-o pagină de lucru rapidă.</p>
        </div>

        <section class="cmr-overview-hero ${summary.critical ? "is-critical" : summary.warnings ? "is-warning" : "is-ok"}">
          <div>
            <span>Stare flotă</span>
            <strong>${this._escape(summary.stateLabel)}</strong>
            <p>${this._escape(summary.stateText)}</p>
          </div>
          <div class="cmr-overview-hero-actions">
            <button data-tab="statistics">Vezi statistici</button>
            <button data-tab="costs">Vezi costuri</button>
          </div>
        </section>

        <div class="cmr-overview-kpis">
          ${this._kpi("Autovehicule", summary.vehicles, summary.filterText, "mdi:car-multiple", "blue")}
          ${this._kpi("Alerte", summary.alerts, `${summary.critical} critice · ${summary.warnings} atenționări`, "mdi:alert-circle-outline", summary.critical ? "red" : summary.warnings ? "amber" : "green")}
          ${this._kpi("Cost an curent", this._formatMoney(summary.yearCost), "combustibil, service și articole", "mdi:cash-multiple", "blue")}
          ${this._kpi("Combustibil", this._formatMoney(summary.fuelCost), `total ${summary.year}`, "mdi:gas-station", "cyan")}
          ${this._kpi("Intervenții", this._formatMoney(summary.serviceCost), `total ${summary.year}`, "mdi:wrench", "purple")}
          ${this._kpi("Cost mediu / mașină", this._formatMoney(summary.averageCost), "calculat pentru filtrul activ", "mdi:calculator-variant-outline", "blue")}
        </div>

        <section class="cmr-overview-section">
          <div class="cmr-section-head">
            <div>
              <span>Autovehicule</span>
              <h3>${this._vehicleFilter === "all" ? "Toate mașinile" : "Mașina selectată"}</h3>
            </div>
            <button data-tab="vehicles">Administrare mașini</button>
          </div>
          <div class="cmr-overview-vehicles">
            ${vehicles.map((vehicle) => this._renderVehicleCard(vehicle)).join("") || this._empty("Nu există autovehicule de afișat pentru filtrul curent.")}
          </div>
        </section>

        <section class="cmr-overview-section">
          <div class="cmr-section-head">
            <div><span>Atenționări rapide</span><h3>Ce trebuie urmărit</h3></div>
            <button data-tab="costs">Estimări și termene</button>
          </div>
          ${alerts.length ? `<div class="cmr-alert-list">${alerts.map((item) => this._renderOverviewAlert(item)).join("")}</div>` : `<div class="cmr-good-news"><ha-icon icon="mdi:check-circle-outline"></ha-icon><div><strong>Nu sunt alerte active.</strong><span>Toate elementele urmărite par în regulă pentru filtrul curent.</span></div></div>`}
        </section>
      </main>
    `;
  }

  _overviewSummary(vehicles) {
    const year = new Date().getFullYear();
    let critical = 0;
    let warnings = 0;
    let yearCost = 0;
    let fuelCost = 0;
    let serviceCost = 0;

    for (const vehicle of vehicles) {
      const alerts = this._vehicleAlerts(vehicle);
      critical += alerts.filter((item) => item.level === "critical").length;
      warnings += alerts.filter((item) => item.level === "warning").length;
      fuelCost += this._vehicleYearFuelCost(vehicle);
      serviceCost += this._vehicleYearServiceCost(vehicle);
      yearCost += this._vehicleYearFuelCost(vehicle) + this._vehicleYearServiceCost(vehicle)
        + this._toNumber(vehicle.attrs?.tire_costs_current_year)
        + this._toNumber(vehicle.attrs?.equipment_costs_current_year)
        + this._toNumber(vehicle.attrs?.battery_costs_current_year);
    }

    const alerts = critical + warnings;
    const stateLabel = critical ? "Critic" : warnings ? "Atenție" : "OK";
    const stateText = critical
      ? `${critical} elemente critice necesită verificare.`
      : warnings
        ? `${warnings} atenționări trebuie urmărite.`
        : "Nu sunt probleme active pentru filtrul curent.";
    return {
      vehicles: vehicles.length,
      critical,
      warnings,
      alerts,
      yearCost,
      fuelCost,
      serviceCost,
      averageCost: vehicles.length ? yearCost / vehicles.length : 0,
      year,
      stateLabel,
      stateText,
      filterText: this._vehicleFilter === "all" ? "mașini afișate" : "filtru activ",
    };
  }

  _overviewAlerts(vehicles) {
    return vehicles
      .flatMap((vehicle) => this._vehicleAlerts(vehicle).map((item) => ({ ...item, vehicle })))
      .sort((a, b) => (a.level === "critical" ? 0 : 1) - (b.level === "critical" ? 0 : 1) || (a.days_remaining - b.days_remaining));
  }

  _vehicleAlerts(vehicle) {
    const attrs = vehicle.attrs || {};
    const criticalItems = Array.isArray(attrs.critical_items) ? attrs.critical_items : [];
    const warningItems = Array.isArray(attrs.warning_items) ? attrs.warning_items : [];
    const fromStatus = [
      ...criticalItems.map((item) => ({ ...item, level: "critical" })),
      ...warningItems.map((item) => ({ ...item, level: "warning" })),
    ];
    if (fromStatus.length) return fromStatus.map((item) => this._normalizeAlertItem(item));

    const generated = [];
    for (const [key, value] of Object.entries(attrs)) {
      const name = this._normalize(key);
      if (!name.includes("days") && !name.includes("zile")) continue;
      const days = this._toNumber(value);
      if (!Number.isFinite(days) || days > 30) continue;
      const label = key.replace(/_/g, " ").replace(/days|zile/gi, "").trim() || "Termen";
      generated.push({
        label,
        summary: days <= 0 ? "scadent" : `în ${days} zile`,
        days_remaining: days,
        level: days <= 0 ? "critical" : "warning",
      });
    }
    return generated.map((item) => this._normalizeAlertItem(item));
  }

  _normalizeAlertItem(item) {
    const rawDays = item.days_remaining ?? item.days ?? item.remaining_days;
    const hasDays = rawDays !== undefined && rawDays !== null && rawDays !== "";
    const days = hasDays ? this._toNumber(rawDays) : null;
    const summary = item.summary || item.status || (hasDays ? (days <= 0 ? "scadent" : `în ${days} zile`) : "atenție");
    return {
      label: item.label || item.name || item.key || "Element",
      summary,
      days_remaining: hasDays ? days : 9999,
      category: item.category || "general",
      level: item.level || (String(summary).toLowerCase().includes("scadent") ? "critical" : "warning"),
    };
  }

  _renderLegalOverview(vehicles) {
    const terms = vehicles.flatMap((vehicle) => this._vehicleLegalTerms(vehicle));
    if (!terms.length) {
      return `
        <section class="cmr-overview-section cmr-legal-section">
          <div class="cmr-section-head">
            <div><span>Termene legale</span><h3>RCA, ITP și rovinietă</h3></div>
            <button data-tab="vehicles">Configurează termene</button>
          </div>
          ${this._empty("Nu am găsit termene legale configurate pentru filtrul curent.")}
        </section>
      `;
    }

    const ordered = [...terms].sort((a, b) => a.sort - b.sort);
    return `
      <section class="cmr-overview-section cmr-legal-section">
        <div class="cmr-section-head">
          <div>
            <span>Termene legale</span>
            <h3>RCA, ITP și rovinietă</h3>
          </div>
          <button data-tab="vehicles">Administrare termene</button>
        </div>
        <div class="cmr-legal-grid">
          ${ordered.map((term) => this._renderLegalTerm(term)).join("")}
        </div>
      </section>
    `;
  }

  _renderLegalTerm(term) {
    const icon = term.key === "rca" ? "mdi:shield-check" : term.key === "itp" ? "mdi:clipboard-check" : term.key === "casco" ? "mdi:shield-star" : "mdi:road-variant";
    const plate = term.vehicle.plate || term.vehicle.vin || term.vehicle.vehicle_id || "";
    const sourceBadge = ["itp", "rovinieta"].includes(term.key) ? this._renderLegalSourceLine(term.key, term.source || "manual") : "";
    return `
      <article class="cmr-legal-card ${term.level}">
        <div class="cmr-legal-icon"><ha-icon icon="${icon}"></ha-icon></div>
        <div class="cmr-legal-body">
          <div class="cmr-legal-top">
            <span>${this._escape(term.label)}</span>
            <em>${this._escape(term.vehicle.label)}</em>
          </div>
          <strong>${this._escape(term.valueText)}</strong>
          <small>${plate ? `${this._escape(plate)} · ` : ""}${term.expiryText ? `expiră la ${this._escape(term.expiryText)}` : this._escape(term.status || "configurat")}</small>
          ${sourceBadge}
        </div>
      </article>
    `;
  }

  _vehicleLegalTerms(vehicle) {
    const specs = [
      ["rca", "RCA", ["rca"]],
      ["itp", "ITP", ["itp"]],
      ["rovinieta", "Rovinietă", ["roviniet"]],
      ["casco", "CASCO", ["casco"]],
    ];

    return specs
      .filter(([key]) => {
        const featureKey = this._featureByLegalType(key);
        return !featureKey || this._vehicleFeatureEnabled(vehicle, featureKey);
      })
      .map(([key, label, terms]) => this._legalTermFromVehicle(vehicle, key, label, terms))
      .filter(Boolean);
  }

  _legalTermFromVehicle(vehicle, key, label, terms) {
    const attrs = vehicle.attrs || {};
    const directDays = this._pickAttrNumber(attrs, [
      `${key}_days_remaining`, `${key}_remaining_days`, `${key}_days`, `${key}_zile_ramase`,
      `${key}Days`, `${key}RemainingDays`, `${key}_zile`, `${key}_remaining`,
    ]);
    const directExpiry = this._pickAttrValue(attrs, [
      `${key}_expiry`, `${key}_expiry_date`, `${key}_expires_at`, `${key}_expiration_date`,
      `${key}_expira_la`, `${key}_data_expirare`, `${key}Expiry`, `${key}ExpiryDate`,
    ]);
    const directStatus = this._pickAttrValue(attrs, [
      `${key}_status`, `${key}Status`, `${key}_state`,
    ]);

    const foundDays = directDays !== null
      ? directDays
      : this._findEntityNumber(vehicle, terms.concat(["zile", "ramase"]))
        ?? this._findEntityNumber(vehicle, terms.concat(["zile"]))
        ?? this._findEntityNumber(vehicle, terms, ["expir", "status", "serie", "categorie", "perioad"]);
    const foundExpiry = directExpiry
      || this._findEntityValue(vehicle, terms.concat(["expir"]))
      || this._findEntityValue(vehicle, terms.concat(["data"]));
    const foundStatus = directStatus
      || this._findEntityValue(vehicle, terms.concat(["status"]));
    const source = ["itp", "rovinieta"].includes(key) ? this._legalSourceFromVehicle(vehicle, key) : "";

    const daysFromExpiry = foundDays !== null ? foundDays : this._daysUntil(foundExpiry);
    const hasAny = foundStatus || foundExpiry || daysFromExpiry !== null;
    if (!hasAny) return null;

    const level = daysFromExpiry !== null && daysFromExpiry <= 0 ? "critical" : daysFromExpiry !== null && daysFromExpiry <= 30 ? "warning" : "ok";
    const valueText = daysFromExpiry !== null
      ? (daysFromExpiry <= 0 ? `Depășit · ${Math.abs(daysFromExpiry)} zile` : `${daysFromExpiry} zile rămase`)
      : (foundStatus || "configurat");
    return {
      key,
      label,
      vehicle,
      status: foundStatus || "",
      days: daysFromExpiry,
      expiryText: this._formatDate(foundExpiry),
      valueText,
      source,
      level,
      sort: daysFromExpiry !== null ? daysFromExpiry : 99999,
    };
  }

  _legalSourceFromVehicle(vehicle, key) {
    if (key === "rovinieta") return this._rovinietaSourceFromVehicle(vehicle) || "manual";
    if (key === "itp") return this._itpSourceFromVehicle(vehicle) || "manual";
    return "";
  }

  _itpSourceFromVehicle(vehicle) {
    const attrs = vehicle.attrs || {};
    const legalTerms = attrs.legal_terms || attrs.terms || {};
    const itpTerm = legalTerms.itp || {};
    const directSource = this._pickAttrValue(attrs, [
      "itp_data_source", "itp_source", "sursa_itp", "sursa_date_itp",
    ]) || itpTerm.data_source || itpTerm.source || itpTerm.sursa;
    if (directSource) return directSource;

    const entity = this._findEntity(vehicle, ["itp"], []);
    const entityAttrs = entity?.stateObj?.attributes || {};
    return this._pickAttrValue(entityAttrs, [
      "sursa_date", "itp_source", "data_source", "source",
    ]) || "manual";
  }

  _legalSourceLabel(key, source) {
    if (key === "rovinieta") return this._rovinietaSourceLabel(source);
    const value = this._normalize(source);
    if (value.includes("rar") || value.includes("autopass")) return "RAR AutoPass";
    if (value.includes("manual")) return "manual";
    return source || "manual";
  }

  _normalizeItpSourceValue(source) {
    const value = this._normalize(source);
    if (value.includes("rar") || value.includes("autopass")) return "rar_autopass";
    return "manual";
  }

  _legalSourceDescription(key, source) {
    if (key === "rovinieta") return this._rovinietaSourceDescription(source);
    const normalized = this._normalizeItpSourceValue(source);
    if (normalized === "rar_autopass") return "Date verificate online prin RAR AutoPass.";
    return "Date introduse sau actualizate manual în Car Manager România.";
  }

  _renderLegalSourceLine(key, source) {
    const normalized = key === "itp" ? this._normalizeItpSourceValue(source) : this._normalizeRovinietaSourceValue(source);
    const label = this._legalSourceLabel(key, normalized);
    const description = this._legalSourceDescription(key, normalized);
    return `<small class="cmr-legal-source-line ${this._escape(key)} ${this._escape(normalized.replace(/[^a-z0-9_-]/gi, "-"))}" title="${this._escape(description)}" aria-label="${this._escape(description)}">Sursă: ${this._escape(label)}</small>`;
  }

  _rovinietaSourceFromVehicle(vehicle) {
    const attrs = vehicle.attrs || {};
    const legalTerms = attrs.legal_terms || attrs.terms || {};
    const rovinietaTerm = legalTerms.rovinieta || {};
    const directSource = this._pickAttrValue(attrs, [
      "rovinieta_data_source", "rovinieta_source", "sursa_rovinieta",
      "sursa_rovinieta_activa", "sursa_date", "data_source",
    ]) || rovinietaTerm.data_source || rovinietaTerm.source || rovinietaTerm.sursa;
    if (directSource) return directSource;

    const entity = this._findEntity(vehicle, ["roviniet"], []);
    const entityAttrs = entity?.stateObj?.attributes || {};
    return this._pickAttrValue(entityAttrs, [
      "sursa_rovinieta_activa", "sursa_date", "rovinieta_source", "data_source", "source",
    ]) || "";
  }

  _pickAttrValue(attrs, keys) {
    for (const key of keys) {
      if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== "" && attrs[key] !== "unknown" && attrs[key] !== "unavailable") return attrs[key];
    }
    return null;
  }

  _pickAttrNumber(attrs, keys) {
    for (const key of keys) {
      const value = this._pickAttrValue(attrs, [key]);
      if (value === null) continue;
      const number = this._toNumber(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  _findEntityValue(vehicle, terms, excludeTerms = []) {
    const entity = this._findEntity(vehicle, terms, excludeTerms);
    if (!entity) return null;
    const value = entity.stateObj?.state;
    if (value === undefined || value === null || value === "" || value === "unknown" || value === "unavailable") return null;
    return value;
  }

  _findEntityNumber(vehicle, terms, excludeTerms = []) {
    const value = this._findEntityValue(vehicle, terms, excludeTerms);
    if (value === null) return null;
    const number = this._toNumber(value);
    return Number.isFinite(number) ? number : null;
  }

  _findEntity(vehicle, terms, excludeTerms = []) {
    const normalizedTerms = terms.map((term) => this._normalize(term)).filter(Boolean);
    const normalizedExcludes = excludeTerms.map((term) => this._normalize(term)).filter(Boolean);
    const entities = Array.isArray(vehicle.entities) ? vehicle.entities : [];
    return entities.find((entity) => {
      const name = this._normalize(`${entity.entityId || ""} ${entity.stateObj?.attributes?.friendly_name || ""}`);
      return normalizedTerms.every((term) => name.includes(term)) && !normalizedExcludes.some((term) => name.includes(term));
    }) || null;
  }

  _daysUntil(value) {
    const date = this._parseDate(value);
    if (!date) return null;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return Math.ceil((target - start) / 86400000);
  }


  _kpi(label, value, helper, icon, tone = "blue") {
    return `<article class="cmr-kpi tone-${tone}"><div class="cmr-kpi-icon"><ha-icon icon="${icon}"></ha-icon></div><span>${this._escape(label)}</span><strong>${this._escape(value)}</strong><small>${this._escape(helper)}</small></article>`;
  }

  _renderVehicleCard(vehicle) {
    const km = this._vehicleCurrentKm(vehicle);
    const avg = this._vehicleAverageConsumption(vehicle);
    const fuel = this._vehicleYearFuelCost(vehicle);
    const service = this._vehicleYearServiceCost(vehicle);
    const alerts = this._vehicleAlerts(vehicle);
    const legalTerms = this._vehicleLegalTerms(vehicle);
    const maintenanceTerms = this._vehicleMaintenanceTerms(vehicle);
    const critical = alerts.filter((item) => item.level === "critical").length;
    const warnings = alerts.filter((item) => item.level === "warning").length;
    const statusClass = critical ? "is-critical" : warnings ? "is-warning" : "is-ok";
    const statusText = critical ? `${critical} critic${critical === 1 ? "" : "e"}` : warnings ? `${warnings} atenționări` : "OK";
    return `
      <article class="cmr-vehicle-card ${statusClass}">
        <header>
          <div><h3>${this._escape(vehicle.label)}</h3><span>${this._escape(vehicle.plate || vehicle.vin || vehicle.vehicle_id)}</span></div>
          <span class="cmr-status-badge">${this._escape(statusText)}</span>
        </header>
        <div class="cmr-mini-grid">
          <div><span>Km actuali</span><strong>${this._formatNumber(km)} km</strong></div>
          <div><span>Consum mediu</span><strong>${avg ? `${this._formatNumber(avg, 2)} L/100 km` : "—"}</strong></div>
          ${this._vehicleFeatureEnabled(vehicle, "feature_fuel") ? `<div><span>Combustibil an</span><strong>${this._formatMoney(fuel)}</strong></div>` : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_costs") ? `<div><span>Service an</span><strong>${this._formatMoney(service)}</strong></div>` : ""}
        </div>
        ${maintenanceTerms.length ? `<div class="cmr-vehicle-maintenance">${maintenanceTerms.map((term) => this._renderVehicleMaintenanceChip(term)).join("")}</div>` : `<div class="cmr-vehicle-legal-empty">Revizia nu este configurată pentru această mașină.</div>`}
        ${legalTerms.length ? `<div class="cmr-vehicle-legal">${legalTerms.map((term) => this._renderVehicleLegalChip(term)).join("")}</div>` : `<div class="cmr-vehicle-legal-empty">RCA, ITP și rovinieta nu sunt configurate pentru această mașină.</div>`}
        ${alerts.length ? `<div class="cmr-vehicle-alerts">${alerts.slice(0, 3).map((item) => `<span class="${item.level}">${this._escape(item.label)} · ${this._escape(item.summary)}</span>`).join("")}</div>` : `<div class="cmr-vehicle-ok"><ha-icon icon="mdi:check-circle-outline"></ha-icon> Nu sunt alerte active.</div>`}
        <footer>
          ${this._vehicleFeatureEnabled(vehicle, "feature_statistics") ? `<button data-tab="statistics" data-vehicle="${this._escape(vehicle.vehicle_id)}">Statistici</button>` : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_fuel") ? `<button data-tab="fuel" data-vehicle="${this._escape(vehicle.vehicle_id)}">Combustibil</button>` : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_costs") ? `<button data-tab="costs" data-vehicle="${this._escape(vehicle.vehicle_id)}">Costuri</button>` : ""}
        </footer>
      </article>
    `;
  }

  _vehicleMaintenanceTerms(vehicle) {
    if (!this._vehicleFeatureEnabled(vehicle, "feature_maintenance")) return [];
    const attrs = vehicle.attrs || {};
    const serviceStatus = this._pickAttrValue(attrs, [
      "service_status", "maintenance_status", "revizie_status", "general_service_status",
      "revizie_generala_status", "oil_service_status",
    ]) || this._findEntityValue(vehicle, ["revizie", "status"]) || this._findEntityValue(vehicle, ["service", "status"]);

    const serviceDays = this._pickAttrNumber(attrs, [
      "service_days_remaining", "maintenance_days_remaining", "revizie_days_remaining",
      "revizie_zile_ramase", "revizie_generala_days_remaining", "oil_service_days_remaining",
    ]);
    const entityDays = serviceDays !== null
      ? serviceDays
      : this._findEntityNumber(vehicle, ["revizie", "zile", "ramase"])
        ?? this._findEntityNumber(vehicle, ["service", "zile", "ramase"])
        ?? this._findEntityNumber(vehicle, ["revizie", "zile"])
        ?? this._findEntityNumber(vehicle, ["service", "zile"]);

    const serviceKm = this._pickAttrNumber(attrs, [
      "service_km_remaining", "maintenance_km_remaining", "revizie_km_remaining",
      "revizie_km_ramasi", "revizie_generala_km_remaining", "oil_service_km_remaining",
    ]);
    const entityKm = serviceKm !== null
      ? serviceKm
      : this._findEntityNumber(vehicle, ["revizie", "km", "ramasi"], ["actuali", "interval"])
        ?? this._findEntityNumber(vehicle, ["service", "km", "ramasi"], ["actuali", "interval"])
        ?? this._findEntityNumber(vehicle, ["revizie", "km"], ["actuali", "interval"])
        ?? this._findEntityNumber(vehicle, ["service", "km"], ["actuali", "interval"]);

    const expiry = this._pickAttrValue(attrs, [
      "service_expiry", "maintenance_expiry", "revizie_expiry", "revizie_data",
      "revizie_generala_expiry", "oil_service_expiry",
    ]) || this._findEntityValue(vehicle, ["revizie", "expir"]) || this._findEntityValue(vehicle, ["service", "expir"]);

    if (!serviceStatus && entityDays === null && entityKm === null && !expiry) return [];

    const level = (entityDays !== null && entityDays <= 0) || (entityKm !== null && entityKm <= 0)
      ? "critical"
      : (entityDays !== null && entityDays <= 30) || (entityKm !== null && entityKm <= 1000)
        ? "warning"
        : "ok";

    const valueParts = [];
    if (entityKm !== null) valueParts.push(`${this._formatNumber(Math.abs(entityKm))} km${entityKm <= 0 ? " depășiți" : ""}`);
    if (entityDays !== null) valueParts.push(`${Math.abs(entityDays)} zile${entityDays <= 0 ? " depășite" : ""}`);

    return [{
      key: "revizie",
      label: "Revizie",
      valueText: valueParts.length ? valueParts.join(" · ") : (serviceStatus || "configurată"),
      helper: expiry ? `scadentă la ${this._formatDate(expiry)}` : (serviceStatus || "OK"),
      level,
    }];
  }

  _renderVehicleMaintenanceChip(term) {
    return `
      <div class="cmr-vehicle-maintenance-chip ${term.level}">
        <ha-icon icon="mdi:wrench-clock"></ha-icon>
        <div>
          <span>${this._escape(term.label)}</span>
          <strong>${this._escape(term.valueText)}</strong>
          <small>${this._escape(term.helper || "")}</small>
        </div>
      </div>
    `;
  }

  _renderVehicleLegalChip(term) {
    const icon = term.key === "rca" ? "mdi:shield-check" : term.key === "itp" ? "mdi:clipboard-check" : term.key === "casco" ? "mdi:shield-star" : "mdi:road-variant";
    const sourceLine = ["itp", "rovinieta"].includes(term.key) ? this._renderLegalSourceLine(term.key, term.source || "manual") : "";
    const expiry = term.expiryText ? `expiră la ${this._escape(term.expiryText)}` : this._escape(term.status || "configurat");
    return `
      <div class="cmr-vehicle-legal-chip ${term.level}">
        <ha-icon icon="${icon}"></ha-icon>
        <div>
          <span>${this._escape(term.label)}</span>
          <strong>${this._escape(term.valueText)}</strong>
          <small>${expiry}</small>
          ${sourceLine}
        </div>
      </div>
    `;
  }

  _renderOverviewAlert(item) {
    const icon = item.level === "critical" ? "mdi:alert-octagon-outline" : "mdi:alert-circle-outline";
    return `
      <article class="cmr-alert-item ${item.level}">
        <ha-icon icon="${icon}"></ha-icon>
        <div>
          <strong>${this._escape(item.label)}</strong>
          <span>${this._escape(item.vehicle.label)} · ${this._escape(item.summary)}</span>
        </div>
        <button data-tab="costs" data-vehicle="${this._escape(item.vehicle.vehicle_id)}">Detalii</button>
      </article>
    `;
  }

  _renderFuelPage() {
    const vehicles = this._selectedVehicles();
    const summaries = vehicles.map((vehicle) => this._fuelSummaryForVehicle(vehicle));
    const total = this._fuelSummaryTotals(summaries);
    return `
      <main class="cmr-page cmr-fuel-page">
        <div class="cmr-page-title">
          <span>Combustibil</span>
          <h2>Bonuri, consum și costuri combustibil</h2>
          <p>Administrare nativă în panel: adăugare, editare, ștergere, export și rapoarte calculate din bonurile salvate.</p>
        </div>

        <section class="cmr-fuel-toolbar">
          <div>
            <strong>${this._vehicleFilter === "all" ? "Toate autovehiculele" : summaries[0]?.label || "Autovehicul"}</strong>
            <span>${summaries.length} ${summaries.length === 1 ? "mașină afișată" : "mașini afișate"} · ${this._fuelPeriodLabel(this._fuelPeriod)}</span>
          </div>
          <div class="cmr-fuel-controls">
            <label><span>Perioadă statistici</span><select data-action="fuel-period">
              <option value="year" ${this._fuelPeriod === "year" ? "selected" : ""}>An curent</option>
              <option value="month" ${this._fuelPeriod === "month" ? "selected" : ""}>Luna curentă</option>
              <option value="all" ${this._fuelPeriod === "all" ? "selected" : ""}>Tot istoricul</option>
            </select></label>
            <button type="button" data-action="export-fuel-history">Export combustibil</button>
          </div>
        </section>

        <section class="cmr-fuel-hero">
          ${this._fuelHeroTile("Combustibil perioadă", this._formatMoney(total.cost, 2), this._fuelPeriodLabel(this._fuelPeriod), "mdi:cash-multiple")}
          ${this._fuelHeroTile("Cantitate perioadă", `${this._formatNumber(total.quantity, 2)} L/kWh`, `${total.receipts} bonuri`, "mdi:fuel")}
          ${this._fuelHeroTile("Preț mediu", total.quantity > 0 ? `${this._formatNumber(total.cost / total.quantity, 2)} RON/unitate` : "—", "calculat pentru perioada selectată", "mdi:calculator-variant-outline")}
          ${this._fuelHeroTile("Consum mediu", total.avgConsumption > 0 ? `${this._formatNumber(total.avgConsumption, 2)} L/100 km` : "—", "media autovehiculelor cu date", "mdi:chart-line")}
          ${this._fuelHeroTile("Ultimul bon", total.latest ? this._formatMoney(total.latest.total_cost, 2) : "—", total.latest ? `${this._formatDate(total.latest.date)} · ${total.latest.vehicleLabel}` : "fără bonuri", "mdi:receipt-text-outline")}
        </section>

        <div class="cmr-fuel-vehicles">
          ${summaries.map((summary) => this._renderFuelVehicleCard(summary)).join("") || this._empty("Nu există bonuri de combustibil pentru filtrul curent.")}
        </div>
      </main>
    `;
  }

  _fuelPeriodLabel(period) {
    if (period === "month") return "luna curentă";
    if (period === "all") return "tot istoricul";
    return "anul curent";
  }

  _fuelSummaryForVehicle(vehicle) {
    const receipts = Array.isArray(vehicle.fuel_receipts) ? vehicle.fuel_receipts : [];
    const filteredReceipts = receipts.filter((receipt) => this._fuelReceiptInPeriod(receipt, this._fuelPeriod));
    const latest = this._latestFuelReceipt(receipts);
    const periodStats = this._fuelReceiptStats(filteredReceipts);
    const allStats = this._fuelReceiptStats(receipts);
    return {
      vehicle,
      key: vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label,
      label: vehicle.label,
      plate: vehicle.plate || vehicle.vin || vehicle.vehicle_id,
      receipts,
      filteredReceipts,
      latest,
      cost: periodStats.cost,
      quantity: periodStats.quantity,
      receiptsCount: periodStats.receipts,
      averageUnitPrice: periodStats.quantity > 0 ? periodStats.cost / periodStats.quantity : 0,
      averageConsumption: this._vehicleAverageConsumption(vehicle),
      lastConsumption: this._toNumber(vehicle.statistics?.fuel?.last_consumption_l_100km),
      allReceiptsCount: allStats.receipts,
    };
  }

  _fuelSummaryTotals(summaries) {
    const total = summaries.reduce((acc, summary) => {
      acc.cost += summary.cost;
      acc.quantity += summary.quantity;
      acc.receipts += summary.receiptsCount;
      if (summary.averageConsumption > 0) {
        acc.consumptionSum += summary.averageConsumption;
        acc.consumptionCount += 1;
      }
      if (summary.latest && (!acc.latest || String(summary.latest.date || "").localeCompare(String(acc.latest.date || "")) > 0 || this._toNumber(summary.latest.km) > this._toNumber(acc.latest.km))) {
        acc.latest = { ...summary.latest, vehicleLabel: summary.label };
      }
      return acc;
    }, { cost: 0, quantity: 0, receipts: 0, consumptionSum: 0, consumptionCount: 0, latest: null });
    total.avgConsumption = total.consumptionCount ? total.consumptionSum / total.consumptionCount : 0;
    return total;
  }

  _fuelReceiptInPeriod(receipt, period) {
    if (period === "all") return true;
    const parts = this._dateParts(receipt?.date);
    if (!parts) return false;
    const now = new Date();
    if (period === "month") return parts.year === now.getFullYear() && parts.month === now.getMonth() + 1;
    return parts.year === now.getFullYear();
  }

  _fuelReceiptStats(receipts) {
    return (Array.isArray(receipts) ? receipts : []).reduce((acc, receipt) => {
      const quantity = this._toNumber(receipt.quantity);
      const cost = this._toNumber(receipt.total_cost ?? receipt.cost ?? receipt.amount);
      if (quantity > 0) acc.quantity += quantity;
      if (cost > 0) acc.cost += cost;
      acc.receipts += 1;
      return acc;
    }, { quantity: 0, cost: 0, receipts: 0 });
  }

  _dateParts(value) {
    const text = String(value || "").trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    const ro = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})(?:\s.*)?$/);
    if (ro) return { year: Number(ro[3]), month: Number(ro[2]), day: Number(ro[1]) };
    const parsed = this._parseDate(text);
    return parsed ? { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() } : null;
  }

  _latestFuelReceipt(receipts) {
    const items = Array.isArray(receipts) ? receipts.filter((receipt) => receipt && typeof receipt === "object") : [];
    if (!items.length) return null;
    return [...items].sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare) return dateCompare;
      return this._toNumber(b.km) - this._toNumber(a.km);
    })[0];
  }

  _renderFuelVehicleCard(summary) {
    const vehicle = summary.vehicle;
    const open = this._fuelFormOpen.has(summary.key);
    const message = this._fuelReceiptMessage[summary.key] || "";
    const receipts = [...summary.filteredReceipts].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || this._toNumber(b.km) - this._toNumber(a.km));
    return `
      <article class="cmr-fuel-vehicle-card">
        <header>
          <div><h3>${this._escape(summary.label)}</h3><span>${this._escape(summary.plate || "")}</span></div>
          <button type="button" data-action="toggle-fuel-form" data-vehicle="${this._escape(summary.key)}">${open ? "Închide" : "Adaugă bon"}</button>
        </header>

        <div class="cmr-fuel-metrics">
          ${this._fuelMetric("Total perioadă", this._formatMoney(summary.cost, 2), this._fuelPeriodLabel(this._fuelPeriod))}
          ${this._fuelMetric("Cantitate perioadă", `${this._formatNumber(summary.quantity, 2)} L/kWh`, `${summary.receiptsCount} bonuri`)}
          ${this._fuelMetric("Preț mediu", summary.averageUnitPrice ? `${this._formatNumber(summary.averageUnitPrice, 2)} RON/unitate` : "—", "perioada selectată")}
          ${this._fuelMetric("Consum mediu", summary.averageConsumption ? `${this._formatNumber(summary.averageConsumption, 2)} L/100 km` : "—", "calculat din intervale")}
          ${this._fuelMetric("Ultimul bon", summary.latest ? this._formatMoney(summary.latest.total_cost ?? summary.latest.cost, 2) : "—", summary.latest ? `${this._formatDate(summary.latest.date)} · ${this._formatNumber(summary.latest.quantity, 2)} L` : "fără bon")}
        </div>

        ${open ? this._renderFuelReceiptForm(vehicle, summary.key) : ""}
        ${message ? `<div class="cmr-fuel-message">${this._escape(message)}</div>` : ""}

        <section class="cmr-fuel-history">
          <div class="cmr-fuel-section-title"><strong>Istoric alimentări</strong><span>${this._fuelPeriodLabel(this._fuelPeriod)} · ${receipts.length} bonuri</span></div>
          ${receipts.length ? receipts.map((receipt) => this._renderFuelReceiptRow(vehicle, summary.key, receipt)).join("") : `<div class="cmr-admin-empty">Nu există bonuri în perioada selectată.</div>`}
        </section>
      </article>
    `;
  }

  _fuelHeroTile(label, value, helper, icon) {
    return `
      <article class="cmr-fuel-hero-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }

  _fuelMetric(label, value, helper) {
    return `<div><span>${this._escape(label)}</span><strong>${this._escape(value)}</strong><small>${this._escape(helper)}</small></div>`;
  }

  _renderFuelReceiptForm(vehicle, vehicleKey) {
    const draft = this._fuelReceiptDrafts[vehicleKey] || {};
    const today = new Date().toISOString().slice(0, 10);
    const fuelOptions = this._fuelTypeOptions(this._vehicleFuelProfile(vehicle), draft.fuel_type || "");
    return `
      <form class="cmr-fuel-form" data-form="fuel-receipt" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-fuel-form-grid">
          <label><span>Data alimentării</span><input type="date" name="date" value="${this._escape(this._formatDateInputValue(draft.date || today))}" required></label>
          <label><span>Kilometraj bord</span><input type="number" name="km" min="1" step="1" required value="${this._escape(draft.km || this._vehicleCurrentKm(vehicle) || "")}"></label>
          <label><span>Tip combustibil</span><select name="fuel_type" required>${fuelOptions}</select></label>
          <label><span>Litri / kWh</span><input type="number" name="quantity" min="0.001" step="0.001" required value="${this._escape(draft.quantity || "")}"></label>
          <label><span>Valoare bon</span><input type="number" name="total_cost" min="0.01" step="0.01" required value="${this._escape(draft.total_cost || "")}"></label>
          <label><span>Stație</span><input type="text" name="station" value="${this._escape(draft.station || "")}" placeholder="opțional"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes || "")}</textarea></label>
        </div>
        <label class="cmr-fuel-check"><input type="checkbox" name="full_tank" ${draft.full_tank === false ? "" : "checked"}> Plin făcut</label>
        <div class="cmr-fuel-form-actions"><button type="submit" ${this._fuelReceiptBusy === vehicleKey ? "disabled" : ""}>${this._fuelReceiptBusy === vehicleKey ? "Se salvează..." : "Salvează bonul"}</button></div>
      </form>
    `;
  }

  _renderFuelReceiptEditForm(vehicle, vehicleKey, receipt) {
    const receiptId = receipt.receipt_id || "";
    const draft = this._fuelReceiptEditDrafts[receiptId] || {};
    const fuelOptions = this._fuelTypeOptions(this._vehicleFuelProfile(vehicle), draft.fuel_type ?? receipt.fuel_type ?? "");
    const fullTank = Object.prototype.hasOwnProperty.call(draft, "full_tank") ? draft.full_tank : !!receipt.full_tank;
    return `
      <form class="cmr-fuel-form cmr-fuel-edit-form" data-form="fuel-receipt-edit" data-receipt-id="${this._escape(receiptId)}" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-fuel-form-grid">
          <label><span>Data alimentării</span><input type="date" name="date" value="${this._escape(this._formatDateInputValue(draft.date ?? receipt.date ?? ""))}" required></label>
          <label><span>Kilometraj bord</span><input type="number" name="km" min="1" step="1" required value="${this._escape(draft.km ?? receipt.km ?? "")}"></label>
          <label><span>Tip combustibil</span><select name="fuel_type" required>${fuelOptions}</select></label>
          <label><span>Litri / kWh</span><input type="number" name="quantity" min="0.001" step="0.001" required value="${this._escape(draft.quantity ?? receipt.quantity ?? "")}"></label>
          <label><span>Valoare bon</span><input type="number" name="total_cost" min="0.01" step="0.01" required value="${this._escape(draft.total_cost ?? receipt.total_cost ?? "")}"></label>
          <label><span>Stație</span><input type="text" name="station" value="${this._escape(draft.station ?? receipt.station ?? "")}" placeholder="opțional"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes ?? receipt.notes ?? "")}</textarea></label>
        </div>
        <label class="cmr-fuel-check"><input type="checkbox" name="full_tank" ${fullTank ? "checked" : ""}> Plin făcut</label>
        <div class="cmr-fuel-form-actions">
          <button type="submit" ${this._fuelReceiptBusy === receiptId ? "disabled" : ""}>${this._fuelReceiptBusy === receiptId ? "Se salvează..." : "Salvează modificările"}</button>
          <button type="button" class="secondary" data-action="cancel-edit-fuel-receipt" data-receipt-id="${this._escape(receiptId)}">Renunță</button>
        </div>
      </form>
    `;
  }

  _renderFuelReceiptRow(vehicle, vehicleKey, receipt) {
    const receiptId = receipt.receipt_id || "";
    const editOpen = receiptId && this._fuelReceiptEditOpen.has(receiptId);
    const title = this._fuelTypeLabel(receipt.fuel_type || "");
    const meta = [
      this._formatDate(receipt.date),
      receipt.km ? `${this._formatNumber(receipt.km)} km` : "",
      receipt.quantity ? `${this._formatNumber(receipt.quantity, 2)} L/kWh` : "",
      receipt.full_tank ? "plin" : "",
      receipt.station || "",
    ].filter(Boolean).join(" · ");
    return `
      <article class="cmr-fuel-receipt">
        <div class="cmr-fuel-receipt-main">
          <strong>${this._escape(title)}</strong>
          <span>${this._escape(meta)}</span>
          <b>${this._formatMoney(receipt.total_cost ?? receipt.cost, 2)}</b>
          ${receipt.notes ? `<p>${this._escape(receipt.notes)}</p>` : ""}
          ${editOpen ? this._renderFuelReceiptEditForm(vehicle, vehicleKey, receipt) : ""}
        </div>
        <div class="cmr-fuel-receipt-actions">
          ${receiptId ? `<button type="button" data-action="toggle-edit-fuel-receipt" data-receipt-id="${this._escape(receiptId)}"> ${editOpen ? "Închide" : "Editează"}</button>` : ""}
          ${receiptId ? `<button type="button" class="danger" data-action="delete-fuel-receipt" data-receipt-id="${this._escape(receiptId)}" data-vehicle="${this._escape(vehicleKey)}" data-receipt-label="${this._escape(title)} ${this._formatMoney(receipt.total_cost ?? receipt.cost, 2)}">Șterge</button>` : ""}
        </div>
      </article>
    `;
  }

  _normalizeFuelProfile(value) {
    const text = this._normalize(value || "diesel");
    if (text.includes("phev") || text.includes("plug-in") || text.includes("plugin") || text.includes("plug in")) {
      if (text.includes("diesel") || text.includes("motorina")) return "phev_diesel";
      return "phev_gasoline";
    }
    if (text.includes("hibrid") || text.includes("hybrid")) {
      if (text.includes("diesel") || text.includes("motorina")) return "hybrid_diesel";
      return "hybrid_gasoline";
    }
    if (text.includes("electric")) return "electric";
    if (text.includes("gpl") || text.includes("lpg")) return "lpg";
    if (text.includes("benz") || text.includes("gasoline") || text.includes("petrol")) return "gasoline";
    if (text.includes("diesel") || text.includes("motorina")) return "diesel";

    const allowed = new Set(["gasoline", "diesel", "lpg", "electric", "hybrid_gasoline", "hybrid_diesel", "phev_gasoline", "phev_diesel"]);
    return allowed.has(value) ? value : "diesel";
  }

  _fuelProfileOptions(selected) {
    const selectedProfile = this._normalizeFuelProfile(selected || "diesel");
    const options = [
      ["gasoline", "Benzină"],
      ["diesel", "Motorină"],
      ["lpg", "GPL"],
      ["electric", "Electric"],
      ["hybrid_gasoline", "Hibrid benzină"],
      ["hybrid_diesel", "Hibrid motorină"],
      ["phev_gasoline", "Plug-in hybrid benzină"],
      ["phev_diesel", "Plug-in hybrid motorină"],
    ];
    return options.map(([value, label]) => `<option value="${value}" ${value === selectedProfile ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _vehicleFuelProfile(vehicle) {
    const entity = (vehicle.entities || []).find((item) => item.entityId?.startsWith("text.") && this._normalize(`${item.entityId} ${item.stateObj?.attributes?.friendly_name || ""}`).includes("motorizare"));
    const value = entity?.stateObj?.state;
    return this._normalizeFuelProfile(value || vehicle.attrs?.fuel_profile || vehicle.attrs?.motorizare || "diesel");
  }

  _fuelTypeOptions(profile, selected) {
    const normalizedProfile = this._normalizeFuelProfile(profile);
    const byProfile = {
      gasoline: [["gasoline_standard", "Benzină standard"], ["gasoline_premium", "Benzină premium"]],
      diesel: [["diesel_standard", "Motorină standard"], ["diesel_premium", "Motorină premium"]],
      lpg: [["lpg", "GPL"], ["gasoline_standard", "Benzină standard"], ["gasoline_premium", "Benzină premium"]],
      electric: [["electric_charge", "Încărcare electrică"]],
    };
    const options = byProfile[normalizedProfile] || byProfile.diesel;
    const selectedValue = selected || options[0][0];
    return options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _fuelTypeLabel(type) {
    const labels = {
      gasoline_standard: "Benzină standard",
      gasoline_premium: "Benzină premium",
      diesel_standard: "Motorină standard",
      diesel_premium: "Motorină premium",
      lpg: "GPL",
      electric_charge: "Încărcare electrică",
    };
    return labels[type] || type || "Combustibil";
  }

  _validateFuelReceiptPayload(payload) {
    if (!payload?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date))) return "Completează data alimentării.";
    if (!payload.fuel_type) return "Selectează tipul de combustibil.";
    if (!Number.isFinite(payload.km) || payload.km <= 0) return "Kilometrajul din bord trebuie să fie mai mare decât 0.";
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return "Cantitatea alimentată trebuie să fie mai mare decât 0.";
    if (!Number.isFinite(payload.total_cost) || payload.total_cost <= 0) return "Valoarea bonului trebuie să fie mai mare decât 0.";
    return "";
  }

  _fuelPayloadFromForm(form, receiptId = "") {
    const data = new FormData(form);
    const payload = {
      vehicle_id: form.dataset.vehicleRef || form.dataset.vehicle,
      date: this._formDate(data, "date"),
      km: Math.round(Number(data.get("km") || 0)),
      fuel_type: (data.get("fuel_type") || "").toString(),
      quantity: Number(data.get("quantity") || 0),
      total_cost: Number(data.get("total_cost") || 0),
      full_tank: data.get("full_tank") === "on",
      station: (data.get("station") || "").toString().trim(),
      notes: (data.get("notes") || "").toString().trim(),
    };
    if (receiptId) payload.receipt_id = receiptId;
    return payload;
  }

  async _addFuelReceipt(form) {
    if (!this._hass || !form || this._fuelReceiptBusy) return;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._fuelPayloadFromForm(form);
    const error = this._validateFuelReceiptPayload(payload);
    if (error) {
      this._fuelReceiptMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._fuelReceiptBusy = vehicleKey;
    this._fuelReceiptMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "add_fuel_receipt", payload);
      this._fuelReceiptMessage[vehicleKey] = "Bonul a fost salvat. Integrarea se reîncarcă pentru actualizare.";
      this._fuelReceiptDrafts[vehicleKey] = {};
      this._fuelFormOpen.delete(vehicleKey);
    } catch (error) {
      this._fuelReceiptMessage[vehicleKey] = error?.message || "Nu am putut salva bonul.";
    } finally {
      this._fuelReceiptBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _updateFuelReceipt(form) {
    if (!this._hass || !form || this._fuelReceiptBusy) return;
    const receiptId = form.dataset.receiptId;
    const vehicleKey = form.dataset.vehicle;
    if (!receiptId) return;
    const payload = this._fuelPayloadFromForm(form, receiptId);
    const error = this._validateFuelReceiptPayload(payload);
    if (error) {
      this._fuelReceiptMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._fuelReceiptBusy = receiptId;
    this._fuelReceiptMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "update_fuel_receipt", payload);
      this._fuelReceiptMessage[vehicleKey] = "Bonul a fost actualizat. Integrarea se reîncarcă pentru recalcularea consumului.";
      delete this._fuelReceiptEditDrafts[receiptId];
      this._fuelReceiptEditOpen.delete(receiptId);
    } catch (error) {
      this._fuelReceiptMessage[vehicleKey] = error?.message || "Nu am putut actualiza bonul.";
    } finally {
      this._fuelReceiptBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deleteFuelReceipt(receiptId, vehicleKey, receiptLabel = "") {
    if (!this._hass || !receiptId || this._fuelReceiptBusy) return;
    const detail = receiptLabel ? `\n\nBon: ${receiptLabel}` : "";
    if (!window.confirm(`Ștergi definitiv acest bon de combustibil?${detail}\n\nDupă ștergere se recalculează costurile, prețul mediu și consumul.`)) return;
    this._fuelReceiptBusy = receiptId;
    this._fuelReceiptMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "delete_fuel_receipt", { receipt_id: receiptId });
      this._fuelReceiptMessage[vehicleKey] = "Bonul a fost șters. Integrarea se reîncarcă pentru recalcularea consumului.";
      delete this._fuelReceiptEditDrafts[receiptId];
      this._fuelReceiptEditOpen.delete(receiptId);
    } catch (error) {
      this._fuelReceiptMessage[vehicleKey] = error?.message || "Nu am putut șterge bonul.";
    } finally {
      this._fuelReceiptBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  _exportFuelHistory() {
    const rows = this._selectedVehicles().flatMap((vehicle) => (vehicle.fuel_receipts || []).map((receipt) => ({
      Masina: vehicle.label,
      Numar: vehicle.plate || "",
      Data: receipt.date || "",
      Km: receipt.km || "",
      Combustibil: this._fuelTypeLabel(receipt.fuel_type || ""),
      Cantitate: receipt.quantity || "",
      Cost: receipt.total_cost ?? receipt.cost ?? "",
      Statie: receipt.station || "",
      Plin: receipt.full_tank ? "Da" : "Nu",
      Observatii: receipt.notes || "",
    })));
    if (!rows.length) {
      window.alert("Nu există bonuri de combustibil de exportat pentru filtrul curent.");
      return;
    }
    const header = Object.keys(rows[0]);
    const csv = [header.join(";"), ...rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `car_manager_combustibil_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }


  _renderTiresPage() {
    const vehicles = this._selectedVehicles();
    const summaries = vehicles.map((vehicle) => this._tireSummaryForVehicle(vehicle));
    const totals = this._tireTotals(summaries);
    return `
      <main class="cmr-page cmr-tires-page">
        <div class="cmr-page-title">
          <span>Anvelope</span>
          <h2>Seturi anvelope și depozitare</h2>
          <p>Administrare nativă în panel pentru seturi vară / iarnă / all season, DOT, km, jante, costuri, presiuni și loc depozitare.</p>
        </div>

        <section class="cmr-tires-hero">
          ${this._tireHeroTile("Seturi salvate", totals.sets, "total seturi anvelope", "mdi:tire")}
          ${this._tireHeroTile("Montate acum", totals.mounted, "seturi marcate ca montate", "mdi:car-tire-alert")}
          ${this._tireHeroTile("Cost an curent", this._formatMoney(totals.yearCost, 2), "după data cumpărării", "mdi:cash-multiple")}
          ${this._tireHeroTile("Pe jante", totals.onRims, "seturi cu jante", "mdi:circle-double")}
          ${this._tireHeroTile("Depozitate", totals.stored, "seturi nemontate", "mdi:archive-outline")}
        </section>

        <div class="cmr-tire-vehicles">
          ${summaries.map((summary) => this._renderTireVehicleCard(summary)).join("") || this._empty("Nu există autovehicule pentru filtrul curent.")}
        </div>
      </main>
    `;
  }

  _tireSummaryForVehicle(vehicle) {
    const sets = Array.isArray(vehicle.tire_sets) ? vehicle.tire_sets : [];
    const year = new Date().getFullYear();
    const yearCost = sets.reduce((sum, item) => {
      const parts = this._dateParts(item.purchase_date);
      return sum + (parts && parts.year === year ? this._toNumber(item.cost) : 0);
    }, 0);
    return {
      vehicle,
      key: vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label,
      label: vehicle.label,
      plate: vehicle.plate || vehicle.vin || vehicle.vehicle_id,
      sets,
      mountedSets: sets.filter((item) => item?.installed),
      yearCost,
    };
  }

  _tireTotals(summaries) {
    return summaries.reduce((acc, summary) => {
      acc.sets += summary.sets.length;
      acc.mounted += summary.mountedSets.length;
      acc.yearCost += summary.yearCost;
      acc.onRims += summary.sets.filter((item) => item?.wheel_mount_type === "on_rims" || this._normalize(item?.wheel_mount_type_label).includes("jante")).length;
      acc.stored += summary.sets.filter((item) => !item?.installed).length;
      return acc;
    }, { sets: 0, mounted: 0, yearCost: 0, onRims: 0, stored: 0 });
  }

  _renderTireVehicleCard(summary) {
    const open = this._tireFormOpen.has(summary.key);
    const message = this._tireSetMessage[summary.key] || "";
    return `
      <article class="cmr-tire-vehicle-card">
        <header>
          <div><h3>${this._escape(summary.label)}</h3><span>${this._escape(summary.plate || "")}</span></div>
          <button type="button" data-action="toggle-tire-form" data-vehicle="${this._escape(summary.key)}">${open ? "Închide" : "Adaugă set"}</button>
        </header>

        <div class="cmr-tire-metrics">
          ${this._tireMetric("Seturi", summary.sets.length, `${summary.mountedSets.length} montate acum`)}
          ${this._tireMetric("Cost an curent", this._formatMoney(summary.yearCost, 2), "după data cumpărării")}
          ${summary.mountedSets[0] ? this._tireMetric("Montate", summary.mountedSets[0].tire_type_label || this._tireTypeLabel(summary.mountedSets[0].tire_type), `${summary.mountedSets[0].size || ""} ${summary.mountedSets[0].brand_model || ""}`.trim() || "set montat") : this._tireMetric("Montate", "—", "nu este marcat niciun set")}
          ${this._tireMetric("Depozitate", summary.sets.filter((item) => !item.installed).length, "seturi nemontate")}
        </div>

        ${open ? this._renderTireSetForm(summary.vehicle, summary.key) : ""}
        ${message ? `<div class="cmr-tire-message">${this._escape(message)}</div>` : ""}

        <section class="cmr-tire-list">
          <div class="cmr-tire-section-title"><strong>Seturi salvate</strong><span>${summary.sets.length} seturi</span></div>
          ${summary.sets.length ? summary.sets.map((item) => this._renderTireSetItem(summary, item)).join("") : `<div class="cmr-admin-empty">Nu există seturi de anvelope salvate pentru acest autovehicul.</div>`}
        </section>
      </article>
    `;
  }

  _tireHeroTile(label, value, helper, icon) {
    return `
      <article class="cmr-tire-hero-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }

  _tireMetric(label, value, helper) {
    return `<div><span>${this._escape(label)}</span><strong>${this._escape(value)}</strong><small>${this._escape(helper)}</small></div>`;
  }

  _renderTireSetForm(vehicle, vehicleKey) {
    const draft = this._tireSetDrafts[vehicleKey] || {};
    const today = new Date().toISOString().slice(0, 10);
    return `
      <form class="cmr-tire-form" data-form="tire-set" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-tire-form-grid">
          <label><span>Tip anvelope</span><select name="tire_type">${this._tireTypeOptions(draft.tire_type || "summer")}</select></label>
          <label><span>Marcă / model</span><input type="text" name="brand_model" value="${this._escape(draft.brand_model || "")}" placeholder="ex. Michelin Primacy 4"></label>
          <label><span>Dimensiune</span><input type="text" name="size" value="${this._escape(draft.size || "")}" placeholder="ex. 245/45 R18"></label>
          <label><span>DOT</span><input type="text" name="dot" value="${this._escape(draft.dot || "")}" placeholder="ex. 3523"></label>
          <label><span>Nr. bucăți</span><input type="number" name="quantity" min="1" max="12" step="1" value="${this._escape(draft.quantity || "4")}"></label>
          <label><span>Montaj</span><select name="wheel_mount_type">${this._tireMountTypeOptions(draft.wheel_mount_type || "tires_only")}</select></label>
          <label><span>Data cumpărării</span><input type="date" name="purchase_date" value="${this._escape(this._formatDateInputValue(draft.purchase_date || today))}"></label>
          <label><span>Data montării</span><input type="date" name="last_mount_date" value="${this._escape(this._formatDateInputValue(draft.last_mount_date || ""))}"></label>
          <label><span>Km la montare</span><input type="number" name="last_mount_km" min="0" step="1" value="${this._escape(draft.last_mount_km || "0")}"></label>
          <label><span>Km parcurși cu setul</span><input type="number" name="total_km" min="0" step="1" value="${this._escape(draft.total_km || "0")}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(draft.cost || "0")}"></label>
          <label><span>Depozitare</span><input type="text" name="storage_location" value="${this._escape(draft.storage_location || "")}" placeholder="acasă / service"></label>
          <label><span>Presiune față</span><input type="text" name="pressure_front" value="${this._escape(draft.pressure_front || "")}" placeholder="ex. 2.4 bar"></label>
          <label><span>Presiune spate</span><input type="text" name="pressure_rear" value="${this._escape(draft.pressure_rear || "")}" placeholder="ex. 2.3 bar"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes || "")}</textarea></label>
        </div>
        <label class="cmr-tire-check"><input type="checkbox" name="installed" ${draft.installed ? "checked" : ""}> Set montat acum</label>
        <div class="cmr-tire-form-actions"><button type="submit" ${this._tireSetBusy === vehicleKey ? "disabled" : ""}>${this._tireSetBusy === vehicleKey ? "Se salvează..." : "Salvează setul"}</button></div>
      </form>
    `;
  }

  _renderTireSetEditForm(vehicle, vehicleKey, item) {
    const setId = item.set_id || "";
    const draft = this._tireSetEditDrafts[setId] || {};
    const value = (key, fallback = "") => draft[key] ?? item[key] ?? fallback;
    const installed = Object.prototype.hasOwnProperty.call(draft, "installed") ? draft.installed : !!item.installed;
    return `
      <form class="cmr-tire-form cmr-tire-edit-form" data-form="tire-set-edit" data-set-id="${this._escape(setId)}" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-tire-form-grid">
          <label><span>Tip anvelope</span><select name="tire_type">${this._tireTypeOptions(value("tire_type", "summer"))}</select></label>
          <label><span>Marcă / model</span><input type="text" name="brand_model" value="${this._escape(value("brand_model"))}"></label>
          <label><span>Dimensiune</span><input type="text" name="size" value="${this._escape(value("size"))}"></label>
          <label><span>DOT</span><input type="text" name="dot" value="${this._escape(value("dot"))}"></label>
          <label><span>Nr. bucăți</span><input type="number" name="quantity" min="1" max="12" step="1" value="${this._escape(value("quantity", "4"))}"></label>
          <label><span>Montaj</span><select name="wheel_mount_type">${this._tireMountTypeOptions(value("wheel_mount_type", "tires_only"))}</select></label>
          <label><span>Data cumpărării</span><input type="date" name="purchase_date" value="${this._escape(this._formatDateInputValue(value("purchase_date")))}"></label>
          <label><span>Data montării</span><input type="date" name="last_mount_date" value="${this._escape(this._formatDateInputValue(value("last_mount_date")))}"></label>
          <label><span>Km la montare</span><input type="number" name="last_mount_km" min="0" step="1" value="${this._escape(value("last_mount_km", "0"))}"></label>
          <label><span>Km parcurși cu setul</span><input type="number" name="total_km" min="0" step="1" value="${this._escape(value("total_km", "0"))}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(value("cost", "0"))}"></label>
          <label><span>Depozitare</span><input type="text" name="storage_location" value="${this._escape(value("storage_location"))}"></label>
          <label><span>Presiune față</span><input type="text" name="pressure_front" value="${this._escape(value("pressure_front"))}"></label>
          <label><span>Presiune spate</span><input type="text" name="pressure_rear" value="${this._escape(value("pressure_rear"))}"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(value("notes"))}</textarea></label>
        </div>
        <label class="cmr-tire-check"><input type="checkbox" name="installed" ${installed ? "checked" : ""}> Set montat acum</label>
        <div class="cmr-tire-form-actions">
          <button type="submit" ${this._tireSetBusy === setId ? "disabled" : ""}>${this._tireSetBusy === setId ? "Se salvează..." : "Salvează modificările"}</button>
          <button type="button" class="secondary" data-action="cancel-edit-tire-set" data-set-id="${this._escape(setId)}">Renunță</button>
        </div>
      </form>
    `;
  }

  _renderTireSetItem(summary, item) {
    const setId = item.set_id || "";
    const editOpen = setId && this._tireSetEditOpen.has(setId);
    const title = [item.tire_type_label || this._tireTypeLabel(item.tire_type), item.brand_model || "", item.size || ""].filter(Boolean).join(" · ");
    const meta = [
      item.dot ? `DOT ${item.dot}` : "",
      item.quantity ? `${item.quantity} buc.` : "",
      item.wheel_mount_type_label || this._tireMountTypeLabel(item.wheel_mount_type),
      item.total_km ? `${this._formatNumber(item.total_km)} km` : "",
      item.last_mount_date ? `montate la ${this._formatDate(item.last_mount_date)}` : "",
      item.installed ? "montate acum" : "depozitate",
      item.storage_location || "",
    ].filter(Boolean).join(" · ");
    return `
      <article class="cmr-tire-set ${item.installed ? "is-mounted" : ""}">
        <div class="cmr-tire-set-main">
          <strong>${this._escape(title || "Set anvelope")} ${item.installed ? `<em>montat</em>` : ""}</strong>
          <span>${this._escape(meta)}</span>
          <div class="cmr-tire-set-details">
            ${item.purchase_date ? `<small>Cumpărate: ${this._escape(this._formatDate(item.purchase_date))}</small>` : ""}
            ${item.last_mount_km ? `<small>Km montare: ${this._formatNumber(item.last_mount_km)}</small>` : ""}
            ${item.pressure_front ? `<small>Presiune față: ${this._escape(item.pressure_front)}</small>` : ""}
            ${item.pressure_rear ? `<small>Presiune spate: ${this._escape(item.pressure_rear)}</small>` : ""}
          </div>
          ${item.notes ? `<p>${this._escape(item.notes)}</p>` : ""}
          ${editOpen ? this._renderTireSetEditForm(summary.vehicle, summary.key, item) : ""}
        </div>
        <div class="cmr-tire-set-side">
          <b>${this._formatMoney(item.cost, 2)}</b>
          <button type="button" data-action="toggle-edit-tire-set" data-set-id="${this._escape(setId)}">${editOpen ? "Închide" : "Editează"}</button>
          <button type="button" class="danger" data-action="delete-tire-set" data-set-id="${this._escape(setId)}" data-vehicle="${this._escape(summary.key)}" data-tire-label="${this._escape(title)}">Șterge</button>
        </div>
      </article>
    `;
  }

  _tireTypeOptions(selected) {
    const options = [["summer", "Vară"], ["winter", "Iarnă"], ["all_season", "All season"]];
    const selectedValue = selected || "summer";
    return options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _tireMountTypeOptions(selected) {
    const options = [["tires_only", "Doar cauciucuri"], ["on_rims", "Pe jante"]];
    const selectedValue = selected || "tires_only";
    return options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _tireTypeLabel(type) {
    const labels = { summer: "Vară", winter: "Iarnă", all_season: "All season" };
    return labels[type] || "Anvelope";
  }

  _tireMountTypeLabel(type) {
    const labels = { tires_only: "Doar cauciucuri", on_rims: "Pe jante" };
    return labels[type] || "";
  }

  _buildTirePayload(form, setId = "") {
    const data = new FormData(form);
    const payload = {
      vehicle_id: form.dataset.vehicleRef || form.dataset.vehicle,
      tire_type: (data.get("tire_type") || "summer").toString(),
      wheel_mount_type: (data.get("wheel_mount_type") || "tires_only").toString(),
      brand_model: (data.get("brand_model") || "").toString().trim(),
      size: (data.get("size") || "").toString().trim(),
      dot: (data.get("dot") || "").toString().trim(),
      quantity: Math.round(Number(data.get("quantity") || 4)),
      purchase_date: this._formDate(data, "purchase_date"),
      last_mount_date: this._formDate(data, "last_mount_date"),
      last_mount_km: Math.round(Number(data.get("last_mount_km") || 0)),
      total_km: Math.round(Number(data.get("total_km") || 0)),
      cost: Number(data.get("cost") || 0),
      installed: data.get("installed") === "on",
      storage_location: (data.get("storage_location") || "").toString().trim(),
      pressure_front: (data.get("pressure_front") || "").toString().trim(),
      pressure_rear: (data.get("pressure_rear") || "").toString().trim(),
      notes: (data.get("notes") || "").toString().trim(),
    };
    if (setId) payload.set_id = setId;
    return payload;
  }

  _validateTireSetPayload(payload) {
    if (!payload) return "Setul de anvelope nu conține date valide.";
    if (!payload.tire_type) return "Selectează tipul anvelopelor.";
    if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return "Numărul de bucăți trebuie să fie mai mare decât 0.";
    if (!Number.isFinite(payload.cost) || payload.cost < 0) return "Costul nu poate fi negativ.";
    if (!Number.isFinite(payload.last_mount_km) || payload.last_mount_km < 0) return "Km la montare nu poate fi negativ.";
    if (!Number.isFinite(payload.total_km) || payload.total_km < 0) return "Km parcurși cu setul nu poate fi negativ.";
    return "";
  }

  async _addTireSet(form) {
    if (!this._hass || !form || this._tireSetBusy) return;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._buildTirePayload(form);
    const error = this._validateTireSetPayload(payload);
    if (error) {
      this._tireSetMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._tireSetBusy = vehicleKey;
    this._tireSetMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "add_tire_set", payload);
      this._tireSetMessage[vehicleKey] = "Setul de anvelope a fost salvat. Integrarea se reîncarcă pentru actualizare.";
      this._tireSetDrafts[vehicleKey] = {};
      this._tireFormOpen.delete(vehicleKey);
    } catch (error) {
      this._tireSetMessage[vehicleKey] = error?.message || "Nu am putut salva setul de anvelope.";
    } finally {
      this._tireSetBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _updateTireSet(form) {
    if (!this._hass || !form || this._tireSetBusy) return;
    const setId = form.dataset.setId;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._buildTirePayload(form, setId);
    const error = this._validateTireSetPayload(payload);
    if (error) {
      this._tireSetMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._tireSetBusy = setId;
    this._tireSetMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "update_tire_set", payload);
      this._tireSetMessage[vehicleKey] = "Setul de anvelope a fost actualizat.";
      delete this._tireSetEditDrafts[setId];
      this._tireSetEditOpen.delete(setId);
    } catch (error) {
      this._tireSetMessage[vehicleKey] = error?.message || "Nu am putut actualiza setul de anvelope.";
    } finally {
      this._tireSetBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deleteTireSet(setId, vehicleKey, label = "") {
    if (!this._hass || !setId || this._tireSetBusy) return;
    if (!window.confirm(`Ștergi definitiv acest set de anvelope?${label ? `\n\nSet: ${label}` : ""}\n\nOperațiunea nu poate fi anulată din panel.`)) return;
    this._tireSetBusy = setId;
    this._tireSetMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "delete_tire_set", { set_id: setId });
      this._tireSetMessage[vehicleKey] = "Setul de anvelope a fost șters.";
      delete this._tireSetEditDrafts[setId];
      this._tireSetEditOpen.delete(setId);
    } catch (error) {
      this._tireSetMessage[vehicleKey] = error?.message || "Nu am putut șterge setul de anvelope.";
    } finally {
      this._tireSetBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _renderEquipmentPage() {
    const vehicles = this._selectedVehicles();
    const summaries = vehicles.map((vehicle) => this._equipmentSummaryForVehicle(vehicle));
    const totals = this._equipmentTotals(summaries);
    return `
      <main class="cmr-page cmr-equipment-page">
        <div class="cmr-page-title">
          <span>Dotări</span>
          <h2>Echipamente și siguranță</h2>
          <p>Administrare nativă în panel pentru trusă medicală, stingător, triunghiuri, vestă, kit pană și alte dotări.</p>
        </div>

        <section class="cmr-equipment-hero">
          ${this._equipmentHeroTile("Echipamente", totals.active, "elemente salvate", "mdi:shield-car")}
          ${this._equipmentHeroTile("Prezente", totals.present, "marcate ca existente în mașină", "mdi:check-circle-outline")}
          ${this._equipmentHeroTile("Alerte", totals.alerts, `${totals.missing} lipsă / neconfigurate`, "mdi:alert-circle-outline")}
          ${this._equipmentHeroTile("Cost an curent", this._formatMoney(totals.yearCost, 2), "după data cumpărării", "mdi:cash-multiple")}
          ${this._equipmentHeroTile("Ignorate", totals.ignored, "ascunse din alerte", "mdi:eye-off-outline")}
        </section>

        <div class="cmr-equipment-vehicles">
          ${summaries.map((summary) => this._renderEquipmentVehicleCard(summary)).join("") || this._empty("Nu există autovehicule pentru filtrul curent.")}
        </div>
      </main>
    `;
  }

  _equipmentSummaryForVehicle(vehicle) {
    const items = Array.isArray(vehicle.equipment_items) ? vehicle.equipment_items : [];
    const activeItems = items.filter((item) => item && !item.ignored);
    const ignoredItems = items.filter((item) => item && item.ignored);
    const ignoredTypes = new Set(ignoredItems.map((item) => item.equipment_type).filter(Boolean));
    const currentYear = new Date().getFullYear();
    const yearCost = activeItems.reduce((sum, item) => {
      const parts = this._dateParts(item.purchase_date);
      return sum + (parts && parts.year === currentYear ? this._toNumber(item.cost) : 0);
    }, 0);
    const expiredItems = activeItems.filter((item) => item && item.status === "expirat");
    const soonItems = activeItems.filter((item) => item && (item.status === "critic" || item.status === "în curând"));
    const missingMandatory = this._mandatoryEquipmentTypes()
      .filter(([type]) => !ignoredTypes.has(type) && !activeItems.some((item) => item.equipment_type === type))
      .map(([type, label]) => ({ equipment_type: type, equipment_type_label: label }));
    return {
      vehicle,
      key: vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label,
      label: vehicle.label,
      plate: vehicle.plate || vehicle.vin || vehicle.vehicle_id,
      items,
      activeItems,
      ignoredItems,
      missingMandatory,
      presentItems: activeItems.filter((item) => item && item.present),
      expiredItems,
      soonItems,
      yearCost,
    };
  }

  _equipmentTotals(summaries) {
    return summaries.reduce((acc, summary) => {
      acc.active += summary.activeItems.length;
      acc.present += summary.presentItems.length;
      acc.ignored += summary.ignoredItems.length;
      acc.missing += summary.missingMandatory.length;
      acc.expired += summary.expiredItems.length;
      acc.soon += summary.soonItems.length;
      acc.yearCost += summary.yearCost;
      return acc;
    }, { active: 0, present: 0, ignored: 0, missing: 0, expired: 0, soon: 0, yearCost: 0, get alerts() { return this.missing + this.expired + this.soon; } });
  }

  _renderEquipmentVehicleCard(summary) {
    const open = this._equipmentFormOpen.has(summary.key);
    const message = this._equipmentMessage[summary.key] || "";
    return `
      <article class="cmr-equipment-vehicle-card">
        <header>
          <div><h3>${this._escape(summary.label)}</h3><span>${this._escape(summary.plate || "")}</span></div>
          <button type="button" data-action="toggle-equipment-form" data-vehicle="${this._escape(summary.key)}">${open ? "Închide" : "Adaugă"}</button>
        </header>

        <div class="cmr-equipment-metrics">
          ${this._equipmentMetric("Elemente", summary.activeItems.length, `${summary.presentItems.length} prezente`)}
          ${this._equipmentMetric("Alerte", summary.missingMandatory.length + summary.expiredItems.length + summary.soonItems.length, summary.missingMandatory.length ? `${summary.missingMandatory.length} lipsă / neconfigurate` : `${summary.expiredItems.length} expirate`)}
          ${this._equipmentMetric("Cost an curent", this._formatMoney(summary.yearCost, 2), "după data cumpărării")}
          ${this._equipmentMetric("Ignorate", summary.ignoredItems.length, "ascunse din alerte")}
        </div>

        ${open ? this._renderEquipmentForm(summary.vehicle, summary.key) : ""}
        ${message ? `<div class="cmr-equipment-message">${this._escape(message)}</div>` : ""}

        ${this._renderEquipmentItems(summary)}
      </article>
    `;
  }

  _equipmentHeroTile(label, value, helper, icon) {
    return `
      <article class="cmr-equipment-hero-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }

  _equipmentMetric(label, value, helper) {
    return `<div><span>${this._escape(label)}</span><strong>${this._escape(value)}</strong><small>${this._escape(helper)}</small></div>`;
  }

  _renderEquipmentItems(summary) {
    const parts = [];
    if (summary.missingMandatory.length) {
      parts.push(`
        <section class="cmr-equipment-block">
          <div class="cmr-equipment-section-title"><strong>Echipamente obligatorii lipsă / neconfigurate</strong><span>${summary.missingMandatory.length} elemente</span></div>
          <div class="cmr-equipment-required-grid">
            ${summary.missingMandatory.map((item) => this._renderMissingEquipmentItem(summary, item)).join("")}
          </div>
        </section>
      `);
    }
    if (summary.activeItems.length) {
      parts.push(`
        <section class="cmr-equipment-block">
          <div class="cmr-equipment-section-title"><strong>Echipamente salvate</strong><span>${summary.activeItems.length} elemente</span></div>
          <div class="cmr-equipment-list">
            ${summary.activeItems.map((item) => this._renderEquipmentItem(summary, item)).join("")}
          </div>
        </section>
      `);
    }
    if (summary.ignoredItems.length) {
      parts.push(`
        <section class="cmr-equipment-block">
          <div class="cmr-equipment-section-title"><strong>Echipamente neafișate la alerte</strong><span>${summary.ignoredItems.length} ignorate</span></div>
          <div class="cmr-equipment-required-grid">
            ${summary.ignoredItems.map((item) => this._renderIgnoredEquipmentItem(summary, item)).join("")}
          </div>
        </section>
      `);
    }
    return parts.join("") || `<div class="cmr-admin-empty">Nu există echipamente salvate pentru acest autovehicul.</div>`;
  }

  _renderMissingEquipmentItem(summary, item) {
    const type = item.equipment_type || "";
    const label = item.equipment_type_label || this._equipmentTypeLabel(type);
    return `
      <article class="cmr-equipment-required-card">
        <div><strong>${this._escape(label)}</strong><span>neconfigurat</span></div>
        <p>Element recomandat pentru siguranță. Adaugă-l sau ascunde-l dacă nu vrei să îl urmărești.</p>
        <footer>
          <button type="button" data-action="prepare-missing-equipment" data-vehicle="${this._escape(summary.key)}" data-equipment-type="${this._escape(type)}">Adaugă</button>
          <button type="button" class="danger" data-action="ignore-equipment-type" data-vehicle="${this._escape(summary.key)}" data-vehicle-ref="${this._escape(summary.vehicle.vehicle_id || summary.vehicle.plate || summary.vehicle.label || "")}" data-equipment-type="${this._escape(type)}" data-equipment-label="${this._escape(label)}">Nu urmăresc</button>
        </footer>
      </article>
    `;
  }

  _renderIgnoredEquipmentItem(summary, item) {
    const itemId = item.item_id || "";
    const label = item.equipment_type_label || this._equipmentTypeLabel(item.equipment_type);
    return `
      <article class="cmr-equipment-required-card is-ignored">
        <div><strong>${this._escape(label)}</strong><span>ignorat</span></div>
        <p>Nu apare în alerte și nu este inclus în costuri.</p>
        <footer>
          <button type="button" data-action="reactivate-equipment-type" data-item-id="${this._escape(itemId)}" data-vehicle="${this._escape(summary.key)}" data-equipment-label="${this._escape(label)}">Reactivează</button>
        </footer>
      </article>
    `;
  }

  _renderEquipmentItem(summary, item) {
    const itemId = item.item_id || "";
    const editOpen = itemId && this._equipmentEditOpen.has(itemId);
    const title = [item.equipment_type_label || this._equipmentTypeLabel(item.equipment_type), item.name || ""].filter(Boolean).join(" · ");
    const expiry = item.expiry_date ? `expiră ${this._formatDate(item.expiry_date)}` : "fără expirare";
    const status = item.status || "—";
    const level = status === "expirat" ? "critical" : (status === "critic" || status === "în curând") ? "warning" : "ok";
    const meta = [expiry, status, item.present ? "prezent" : "lipsă", item.storage_location || ""].filter(Boolean).join(" · ");
    return `
      <article class="cmr-equipment-item ${level}">
        <div class="cmr-equipment-item-main">
          <strong>${this._escape(title || "Echipament")} ${status === "expirat" ? `<em>expirat</em>` : ""}</strong>
          <span>${this._escape(meta)}</span>
          ${item.notes ? `<p>${this._escape(item.notes)}</p>` : ""}
          ${editOpen ? this._renderEquipmentEditForm(summary.vehicle, summary.key, item) : ""}
        </div>
        <div class="cmr-equipment-item-side">
          <b>${this._formatMoney(item.cost, 2)}</b>
          <button type="button" data-action="toggle-edit-equipment-item" data-item-id="${this._escape(itemId)}">${editOpen ? "Închide" : "Editează"}</button>
          <button type="button" class="danger" data-action="delete-equipment-item" data-item-id="${this._escape(itemId)}" data-vehicle="${this._escape(summary.key)}" data-equipment-label="${this._escape(title)}">Șterge</button>
        </div>
      </article>
    `;
  }

  _renderEquipmentForm(vehicle, vehicleKey) {
    const draft = this._equipmentDrafts[vehicleKey] || {};
    return `
      <form class="cmr-equipment-form" data-form="equipment-item" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-equipment-form-grid">
          <label><span>Tip echipament</span><select name="equipment_type">${this._equipmentTypeOptions(draft.equipment_type)}</select></label>
          <label><span>Denumire / model</span><input type="text" name="name" value="${this._escape(draft.name || "")}" placeholder="ex. Trusă auto omologată"></label>
          <label><span>Data cumpărării</span><input type="date" name="purchase_date" value="${this._escape(this._formatDateInputValue(draft.purchase_date || ""))}"></label>
          <label><span>Expiră la</span><input type="date" name="expiry_date" value="${this._escape(this._formatDateInputValue(draft.expiry_date || ""))}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(draft.cost || "0")}"></label>
          <label><span>Loc depozitare</span><input type="text" name="storage_location" value="${this._escape(draft.storage_location || "")}" placeholder="ex. portbagaj"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes || "")}</textarea></label>
        </div>
        <label class="cmr-equipment-check"><input type="checkbox" name="present" ${draft.present === false ? "" : "checked"}> Există în mașină</label>
        <div class="cmr-equipment-form-actions"><button type="submit" ${this._equipmentBusy === vehicleKey ? "disabled" : ""}>${this._equipmentBusy === vehicleKey ? "Se salvează..." : "Salvează echipamentul"}</button></div>
      </form>
    `;
  }

  _renderEquipmentEditForm(vehicle, vehicleKey, item) {
    const itemId = item.item_id || "";
    const draft = this._equipmentEditDrafts[itemId] || {};
    const value = (key, fallback = "") => draft[key] ?? item[key] ?? fallback;
    const present = Object.prototype.hasOwnProperty.call(draft, "present") ? draft.present : !!item.present;
    return `
      <form class="cmr-equipment-form cmr-equipment-edit-form" data-form="equipment-item-edit" data-item-id="${this._escape(itemId)}" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-equipment-form-grid">
          <label><span>Tip echipament</span><select name="equipment_type">${this._equipmentTypeOptions(value("equipment_type", "first_aid_kit"))}</select></label>
          <label><span>Denumire / model</span><input type="text" name="name" value="${this._escape(value("name"))}"></label>
          <label><span>Data cumpărării</span><input type="date" name="purchase_date" value="${this._escape(this._formatDateInputValue(value("purchase_date")))}"></label>
          <label><span>Expiră la</span><input type="date" name="expiry_date" value="${this._escape(this._formatDateInputValue(value("expiry_date")))}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(value("cost", "0"))}"></label>
          <label><span>Loc depozitare</span><input type="text" name="storage_location" value="${this._escape(value("storage_location"))}"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(value("notes"))}</textarea></label>
        </div>
        <label class="cmr-equipment-check"><input type="checkbox" name="present" ${present ? "checked" : ""}> Există în mașină</label>
        <div class="cmr-equipment-form-actions">
          <button type="submit" ${this._equipmentBusy === itemId ? "disabled" : ""}>${this._equipmentBusy === itemId ? "Se salvează..." : "Salvează modificările"}</button>
          <button type="button" class="secondary" data-action="cancel-edit-equipment-item" data-item-id="${this._escape(itemId)}">Renunță</button>
        </div>
      </form>
    `;
  }

  _mandatoryEquipmentTypes() {
    return [
      ["first_aid_kit", "Trusă medicală"],
      ["fire_extinguisher", "Stingător"],
      ["warning_triangles", "Triunghiuri reflectorizante"],
      ["reflective_vest", "Vestă reflectorizantă"],
    ];
  }

  _equipmentTypeList() {
    return [
      ["first_aid_kit", "Trusă medicală"],
      ["fire_extinguisher", "Stingător"],
      ["warning_triangles", "Triunghiuri reflectorizante"],
      ["reflective_vest", "Vestă reflectorizantă"],
      ["spare_wheel", "Roată de rezervă"],
      ["puncture_kit", "Kit pană"],
      ["compressor", "Compresor"],
      ["jack", "Cric"],
      ["wheel_wrench", "Cheie roți"],
      ["jump_cables", "Cabluri pornire"],
      ["snow_chains", "Lanțuri antiderapante"],
      ["other", "Alt echipament"],
    ];
  }

  _equipmentTypeLabel(type) {
    const found = this._equipmentTypeList().find(([value]) => value === type);
    return found ? found[1] : (type || "Echipament");
  }

  _equipmentTypeOptions(selected) {
    const selectedValue = selected || "first_aid_kit";
    return this._equipmentTypeList().map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _buildEquipmentPayload(form, itemId = "") {
    const data = new FormData(form);
    const payload = {
      vehicle_id: form.dataset.vehicleRef || form.dataset.vehicle,
      equipment_type: (data.get("equipment_type") || "first_aid_kit").toString(),
      name: (data.get("name") || "").toString().trim(),
      purchase_date: this._formDate(data, "purchase_date"),
      expiry_date: this._formDate(data, "expiry_date"),
      cost: Number(data.get("cost") || 0),
      present: data.get("present") === "on",
      ignored: false,
      storage_location: (data.get("storage_location") || "").toString().trim(),
      notes: (data.get("notes") || "").toString().trim(),
    };
    if (itemId) payload.item_id = itemId;
    return payload;
  }

  _validateEquipmentPayload(payload) {
    if (!payload) return "Echipamentul nu conține date valide.";
    if (!payload.equipment_type) return "Selectează tipul echipamentului.";
    if (!Number.isFinite(payload.cost) || payload.cost < 0) return "Costul nu poate fi negativ.";
    return "";
  }

  async _addEquipmentItem(form) {
    if (!this._hass || !form || this._equipmentBusy) return;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._buildEquipmentPayload(form);
    const error = this._validateEquipmentPayload(payload);
    if (error) {
      this._equipmentMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._equipmentBusy = vehicleKey;
    this._equipmentMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "add_equipment_item", payload);
      this._equipmentMessage[vehicleKey] = "Echipamentul a fost salvat. Integrarea se reîncarcă pentru actualizare.";
      this._equipmentDrafts[vehicleKey] = {};
      this._equipmentFormOpen.delete(vehicleKey);
    } catch (error) {
      this._equipmentMessage[vehicleKey] = error?.message || "Nu am putut salva echipamentul.";
    } finally {
      this._equipmentBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _updateEquipmentItem(form) {
    if (!this._hass || !form || this._equipmentBusy) return;
    const itemId = form.dataset.itemId;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._buildEquipmentPayload(form, itemId);
    const error = this._validateEquipmentPayload(payload);
    if (error) {
      this._equipmentMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._equipmentBusy = itemId;
    this._equipmentMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "update_equipment_item", payload);
      this._equipmentMessage[vehicleKey] = "Echipamentul a fost actualizat.";
      delete this._equipmentEditDrafts[itemId];
      this._equipmentEditOpen.delete(itemId);
    } catch (error) {
      this._equipmentMessage[vehicleKey] = error?.message || "Nu am putut actualiza echipamentul.";
    } finally {
      this._equipmentBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deleteEquipmentItem(itemId, vehicleKey, label = "") {
    if (!this._hass || !itemId || this._equipmentBusy) return;
    if (!window.confirm(`Ștergi definitiv acest echipament?${label ? `\n\nEchipament: ${label}` : ""}\n\nOperațiunea nu poate fi anulată din panel.`)) return;
    this._equipmentBusy = itemId;
    this._equipmentMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "delete_equipment_item", { item_id: itemId });
      this._equipmentMessage[vehicleKey] = "Echipamentul a fost șters.";
      delete this._equipmentEditDrafts[itemId];
      this._equipmentEditOpen.delete(itemId);
    } catch (error) {
      this._equipmentMessage[vehicleKey] = error?.message || "Nu am putut șterge echipamentul.";
    } finally {
      this._equipmentBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  _prepareMissingEquipment(vehicleKey, equipmentType) {
    if (!vehicleKey || !equipmentType) return;
    this._equipmentDrafts[vehicleKey] = {
      ...(this._equipmentDrafts[vehicleKey] || {}),
      equipment_type: equipmentType,
      present: true,
      ignored: false,
    };
    this._equipmentFormOpen.add(vehicleKey);
    this._render(true);
  }

  async _ignoreEquipmentType(vehicleKey, vehicleRef, equipmentType, label = "") {
    if (!this._hass || !vehicleKey || !equipmentType || this._equipmentBusy) return;
    if (!window.confirm(`Nu mai urmărești acest echipament pentru mașina selectată?${label ? `\n\nEchipament: ${label}` : ""}\n\nÎl vei putea reactiva din lista echipamentelor ignorate.`)) return;
    this._equipmentBusy = `${vehicleKey}:${equipmentType}:ignore`;
    this._equipmentMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "add_equipment_item", {
        vehicle_id: vehicleRef || vehicleKey,
        equipment_type: equipmentType,
        name: "Nu urmăresc",
        purchase_date: "",
        expiry_date: "",
        cost: 0,
        present: false,
        ignored: true,
        storage_location: "",
        notes: "Echipament ascuns din alerte din panel.",
      });
      this._equipmentMessage[vehicleKey] = "Echipamentul a fost ascuns din alerte.";
    } catch (error) {
      this._equipmentMessage[vehicleKey] = error?.message || "Nu am putut ascunde echipamentul.";
    } finally {
      this._equipmentBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _reactivateEquipmentType(itemId, vehicleKey, label = "") {
    if (!this._hass || !itemId || this._equipmentBusy) return;
    if (!window.confirm(`Reactivezi urmărirea acestui echipament?${label ? `\n\nEchipament: ${label}` : ""}`)) return;
    this._equipmentBusy = itemId;
    this._equipmentMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "delete_equipment_item", { item_id: itemId });
      this._equipmentMessage[vehicleKey] = "Echipamentul a fost reactivat. Dacă nu este introdus, va apărea ca neconfigurat.";
    } catch (error) {
      this._equipmentMessage[vehicleKey] = error?.message || "Nu am putut reactiva echipamentul.";
    } finally {
      this._equipmentBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _renderBatteryPage() {
    const vehicles = this._selectedVehicles();
    const summaries = vehicles.map((vehicle) => this._batterySummaryForVehicle(vehicle));
    const totals = this._batteryTotals(summaries);
    return `
      <main class="cmr-page cmr-battery-page">
        <div class="cmr-page-title">
          <span>Baterie</span>
          <h2>Baterie auto</h2>
          <p>Administrare nativă în panel pentru baterii: montaj, garanție, vechime, capacitate, CCA, dimensiuni și costuri.</p>
        </div>

        <section class="cmr-battery-hero">
          ${this._batteryHeroTile("Baterii", totals.items, "total baterii salvate", "mdi:car-battery")}
          ${this._batteryHeroTile("Montate", totals.installed, "marcate ca montate acum", "mdi:battery-check")}
          ${this._batteryHeroTile("Alerte", totals.alerts, "garanție / vechime / lipsă", "mdi:alert-circle-outline")}
          ${this._batteryHeroTile("Cost an curent", this._formatMoney(totals.yearCost, 2), "după data montării", "mdi:cash-multiple")}
          ${this._batteryHeroTile("Fără baterie", totals.missing, "mașini fără baterie salvată", "mdi:battery-alert")}
        </section>

        <div class="cmr-battery-vehicles">
          ${summaries.map((summary) => this._renderBatteryVehicleCard(summary)).join("") || this._empty("Nu există autovehicule pentru filtrul curent.")}
        </div>
      </main>
    `;
  }

  _batterySummaryForVehicle(vehicle) {
    const items = Array.isArray(vehicle.battery_items) ? vehicle.battery_items : [];
    const current = vehicle.current_battery || items.find((item) => item && item.installed) || null;
    const currentYear = new Date().getFullYear();
    const yearCost = items.reduce((sum, item) => {
      const parts = this._dateParts(item.install_date);
      return sum + (parts && parts.year === currentYear ? this._toNumber(item.cost) : 0);
    }, 0);
    const warningStatuses = new Set(["warranty_expired", "warranty_soon", "very_old", "old", "attention", "unknown", "not_installed"]);
    return {
      vehicle,
      key: vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label,
      label: vehicle.label,
      plate: vehicle.plate || vehicle.vin || vehicle.vehicle_id,
      items,
      current,
      yearCost,
      installedItems: items.filter((item) => item && item.installed),
      warningCount: items.filter((item) => item && warningStatuses.has(item.status)).length + (items.length ? 0 : 1),
    };
  }

  _batteryTotals(summaries) {
    return summaries.reduce((acc, summary) => {
      acc.items += summary.items.length;
      acc.installed += summary.installedItems.length;
      acc.yearCost += summary.yearCost;
      acc.alerts += summary.warningCount;
      if (!summary.items.length) acc.missing += 1;
      return acc;
    }, { items: 0, installed: 0, yearCost: 0, alerts: 0, missing: 0 });
  }

  _renderBatteryVehicleCard(summary) {
    const open = this._batteryFormOpen.has(summary.key);
    const message = this._batteryMessage[summary.key] || "";
    const current = summary.current;
    return `
      <article class="cmr-battery-vehicle-card">
        <header>
          <div><h3>${this._escape(summary.label)}</h3><span>${this._escape(summary.plate || "")}</span></div>
          <button type="button" data-action="toggle-battery-form" data-vehicle="${this._escape(summary.key)}">${open ? "Închide" : "Adaugă baterie"}</button>
        </header>

        <div class="cmr-battery-metrics">
          ${this._batteryMetric("Baterie curentă", current ? (current.brand_model || current.battery_type_label || "configurată") : "neconfigurată", current ? (current.status_label || (current.installed ? "montată" : "nemontată")) : "nu există baterie salvată")}
          ${this._batteryMetric("Vechime", current && current.age_years !== null && current.age_years !== undefined ? `${this._formatNumber(current.age_years, 1)} ani` : "—", current?.install_date ? this._formatDate(current.install_date) : "fără dată montare")}
          ${this._batteryMetric("Garanție", current?.warranty_until ? this._formatDate(current.warranty_until) : "—", current?.warranty_days_remaining !== null && current?.warranty_days_remaining !== undefined ? `${current.warranty_days_remaining} zile` : "fără garanție")}
          ${this._batteryMetric("Cost an curent", this._formatMoney(summary.yearCost, 2), "după data montării")}
        </div>

        ${open ? this._renderBatteryForm(summary.vehicle, summary.key) : ""}
        ${message ? `<div class="cmr-battery-message">${this._escape(message)}</div>` : ""}

        <section class="cmr-battery-list">
          <div class="cmr-battery-section-title"><strong>Baterii salvate</strong><span>${summary.items.length} baterii</span></div>
          ${summary.items.length ? summary.items.map((item) => this._renderBatteryItem(summary, item)).join("") : `<div class="cmr-admin-empty">Nu există baterii salvate pentru acest autovehicul.</div>`}
        </section>
      </article>
    `;
  }

  _batteryHeroTile(label, value, helper, icon) {
    return `
      <article class="cmr-battery-hero-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }

  _batteryMetric(label, value, helper) {
    return `<div><span>${this._escape(label)}</span><strong>${this._escape(value)}</strong><small>${this._escape(helper)}</small></div>`;
  }

  _renderBatteryForm(vehicle, vehicleKey) {
    const draft = this._batteryDrafts[vehicleKey] || {};
    return `
      <form class="cmr-battery-form" data-form="battery-item" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-battery-form-grid">
          <label><span>Marcă / model</span><input type="text" name="brand_model" value="${this._escape(draft.brand_model || "")}" placeholder="ex. Varta Silver Dynamic"></label>
          <label><span>Tip baterie</span><select name="battery_type">${this._batteryTypeOptions(draft.battery_type)}</select></label>
          <label><span>Capacitate Ah</span><input type="number" name="capacity_ah" min="0" step="1" value="${this._escape(draft.capacity_ah || "0")}"></label>
          <label><span>CCA / curent pornire</span><input type="number" name="cca" min="0" step="1" value="${this._escape(draft.cca || "0")}"></label>
          <label><span>Polaritate</span><input type="text" name="polarity" value="${this._escape(draft.polarity || "")}" placeholder="ex. dreapta +"></label>
          <label><span>Dimensiune</span><input type="text" name="size" value="${this._escape(draft.size || "")}" placeholder="ex. 278x175x190"></label>
          <label><span>Data montării</span><input type="date" name="install_date" value="${this._escape(this._formatDateInputValue(draft.install_date || ""))}"></label>
          <label><span>Km la montare</span><input type="number" name="install_km" min="0" step="1" value="${this._escape(draft.install_km || "0")}"></label>
          <label><span>Garanție până la</span><input type="date" name="warranty_until" value="${this._escape(this._formatDateInputValue(draft.warranty_until || ""))}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(draft.cost || "0")}"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes || "")}</textarea></label>
        </div>
        <label class="cmr-battery-check"><input type="checkbox" name="installed" ${draft.installed === false ? "" : "checked"}> Montată acum</label>
        <div class="cmr-battery-form-actions"><button type="submit" ${this._batteryBusy === vehicleKey ? "disabled" : ""}>${this._batteryBusy === vehicleKey ? "Se salvează..." : "Salvează bateria"}</button></div>
      </form>
    `;
  }

  _renderBatteryEditForm(vehicle, vehicleKey, item) {
    const batteryId = item.battery_id || "";
    const draft = this._batteryEditDrafts[batteryId] || {};
    const value = (key, fallback = "") => draft[key] ?? item[key] ?? fallback;
    const installed = Object.prototype.hasOwnProperty.call(draft, "installed") ? draft.installed : !!item.installed;
    return `
      <form class="cmr-battery-form cmr-battery-edit-form" data-form="battery-item-edit" data-battery-id="${this._escape(batteryId)}" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.plate || vehicle.label || "")}">
        <div class="cmr-battery-form-grid">
          <label><span>Marcă / model</span><input type="text" name="brand_model" value="${this._escape(value("brand_model"))}"></label>
          <label><span>Tip baterie</span><select name="battery_type">${this._batteryTypeOptions(value("battery_type", "lead_acid"))}</select></label>
          <label><span>Capacitate Ah</span><input type="number" name="capacity_ah" min="0" step="1" value="${this._escape(value("capacity_ah", "0"))}"></label>
          <label><span>CCA / curent pornire</span><input type="number" name="cca" min="0" step="1" value="${this._escape(value("cca", "0"))}"></label>
          <label><span>Polaritate</span><input type="text" name="polarity" value="${this._escape(value("polarity"))}"></label>
          <label><span>Dimensiune</span><input type="text" name="size" value="${this._escape(value("size"))}"></label>
          <label><span>Data montării</span><input type="date" name="install_date" value="${this._escape(this._formatDateInputValue(value("install_date")))}"></label>
          <label><span>Km la montare</span><input type="number" name="install_km" min="0" step="1" value="${this._escape(value("install_km", "0"))}"></label>
          <label><span>Garanție până la</span><input type="date" name="warranty_until" value="${this._escape(this._formatDateInputValue(value("warranty_until")))}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(value("cost", "0"))}"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(value("notes"))}</textarea></label>
        </div>
        <label class="cmr-battery-check"><input type="checkbox" name="installed" ${installed ? "checked" : ""}> Montată acum</label>
        <div class="cmr-battery-form-actions">
          <button type="submit" ${this._batteryBusy === batteryId ? "disabled" : ""}>${this._batteryBusy === batteryId ? "Se salvează..." : "Salvează modificările"}</button>
          <button type="button" class="secondary" data-action="cancel-edit-battery" data-battery-id="${this._escape(batteryId)}">Renunță</button>
        </div>
      </form>
    `;
  }

  _renderBatteryItem(summary, item) {
    const batteryId = item.battery_id || "";
    const editOpen = batteryId && this._batteryEditOpen.has(batteryId);
    const title = [item.brand_model || "Baterie", item.battery_type_label || this._batteryTypeLabel(item.battery_type)].filter(Boolean).join(" · ");
    const specs = [item.capacity_ah ? `${item.capacity_ah} Ah` : "", item.cca ? `${item.cca} CCA` : "", item.size || "", item.polarity || ""].filter(Boolean).join(" · ");
    const meta = [item.installed ? "montată acum" : "nemontată", item.install_date ? `montată ${this._formatDate(item.install_date)}` : "fără dată montare", item.warranty_until ? `garanție ${this._formatDate(item.warranty_until)}` : "fără garanție", item.status_label || ""].filter(Boolean).join(" · ");
    const alert = item.status === "warranty_expired" || item.status === "very_old" || item.status === "old" || item.status === "attention";
    return `
      <article class="cmr-battery-item ${item.installed ? "is-installed" : ""} ${alert ? "has-alert" : ""}">
        <div class="cmr-battery-item-main">
          <strong>${this._escape(title)} ${alert ? `<em>alertă</em>` : ""}</strong>
          <span>${this._escape(specs || meta)}</span>
          <span>${this._escape(meta)}</span>
          ${item.notes ? `<p>${this._escape(item.notes)}</p>` : ""}
          ${editOpen ? this._renderBatteryEditForm(summary.vehicle, summary.key, item) : ""}
        </div>
        <div class="cmr-battery-item-side">
          <b>${this._formatMoney(item.cost, 2)}</b>
          <button type="button" data-action="toggle-edit-battery" data-battery-id="${this._escape(batteryId)}">${editOpen ? "Închide" : "Editează"}</button>
          <button type="button" class="danger" data-action="delete-battery" data-battery-id="${this._escape(batteryId)}" data-vehicle="${this._escape(summary.key)}" data-battery-label="${this._escape(title)}">Șterge</button>
        </div>
      </article>
    `;
  }

  _batteryTypeList() {
    return [
      ["lead_acid", "Plumb-acid clasică"],
      ["agm", "AGM"],
      ["efb", "EFB"],
      ["gel", "Gel"],
      ["lithium", "Litiu"],
      ["other", "Alt tip"],
    ];
  }

  _batteryTypeLabel(type) {
    const found = this._batteryTypeList().find(([value]) => value === type);
    return found ? found[1] : (type || "Baterie");
  }

  _batteryTypeOptions(selected) {
    const selectedValue = selected || "lead_acid";
    return this._batteryTypeList().map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _buildBatteryPayload(form, batteryId = "") {
    const data = new FormData(form);
    const payload = {
      vehicle_id: form.dataset.vehicleRef || form.dataset.vehicle,
      installed: data.get("installed") === "on",
      brand_model: (data.get("brand_model") || "").toString().trim(),
      battery_type: (data.get("battery_type") || "lead_acid").toString(),
      capacity_ah: Number(data.get("capacity_ah") || 0),
      cca: Number(data.get("cca") || 0),
      polarity: (data.get("polarity") || "").toString().trim(),
      size: (data.get("size") || "").toString().trim(),
      install_date: this._formDate(data, "install_date"),
      install_km: Number(data.get("install_km") || 0),
      warranty_until: this._formDate(data, "warranty_until"),
      cost: Number(data.get("cost") || 0),
      notes: (data.get("notes") || "").toString().trim(),
    };
    if (batteryId) payload.battery_id = batteryId;
    return payload;
  }

  _validateBatteryPayload(payload) {
    if (!payload) return "Bateria nu conține date valide.";
    if (this._toNumber(payload.capacity_ah) < 0) return "Capacitatea nu poate fi negativă.";
    if (this._toNumber(payload.cca) < 0) return "Curentul de pornire nu poate fi negativ.";
    if (this._toNumber(payload.install_km) < 0) return "Kilometrajul nu poate fi negativ.";
    if (this._toNumber(payload.cost) < 0) return "Costul nu poate fi negativ.";
    return "";
  }

  async _addBattery(form) {
    if (!this._hass || !form || this._batteryBusy) return;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._buildBatteryPayload(form);
    const error = this._validateBatteryPayload(payload);
    if (error) {
      this._batteryMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._batteryBusy = vehicleKey;
    this._batteryMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "add_battery", payload);
      this._batteryMessage[vehicleKey] = "Bateria a fost salvată. Integrarea se reîncarcă pentru actualizare.";
      this._batteryDrafts[vehicleKey] = {};
      this._batteryFormOpen.delete(vehicleKey);
    } catch (error) {
      this._batteryMessage[vehicleKey] = error?.message || "Nu am putut salva bateria.";
    } finally {
      this._batteryBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _updateBattery(form) {
    if (!this._hass || !form || this._batteryBusy) return;
    const batteryId = form.dataset.batteryId;
    const vehicleKey = form.dataset.vehicle;
    const payload = this._buildBatteryPayload(form, batteryId);
    const error = this._validateBatteryPayload(payload);
    if (error) {
      this._batteryMessage[vehicleKey] = error;
      this._render(true);
      return;
    }
    this._batteryBusy = batteryId;
    this._batteryMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "update_battery", payload);
      this._batteryMessage[vehicleKey] = "Bateria a fost actualizată.";
      delete this._batteryEditDrafts[batteryId];
      this._batteryEditOpen.delete(batteryId);
    } catch (error) {
      this._batteryMessage[vehicleKey] = error?.message || "Nu am putut actualiza bateria.";
    } finally {
      this._batteryBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deleteBattery(batteryId, vehicleKey, label = "") {
    if (!this._hass || !batteryId || this._batteryBusy) return;
    if (!window.confirm(`Ștergi definitiv această baterie?${label ? `\n\nBaterie: ${label}` : ""}\n\nOperațiunea nu poate fi anulată din panel.`)) return;
    this._batteryBusy = batteryId;
    this._batteryMessage[vehicleKey] = "";
    this._render(true);
    try {
      await this._hass.callService("car_manager_romania", "delete_battery", { battery_id: batteryId });
      this._batteryMessage[vehicleKey] = "Bateria a fost ștearsă.";
      delete this._batteryEditDrafts[batteryId];
      this._batteryEditOpen.delete(batteryId);
    } catch (error) {
      this._batteryMessage[vehicleKey] = error?.message || "Nu am putut șterge bateria.";
    } finally {
      this._batteryBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _renderLicensePage() {
    const status = this._licenseEntityValue("status_licenta");
    const plan = this._licenseEntityValue("plan_licenta");
    const validUntil = this._licenseEntityValue("valabila_pana_la");
    const checkedAt = this._licenseEntityValue("ultima_verificare_licenta");
    const account = this._licenseEntityValue("cont_licenta");
    const maskedKey = this._licenseEntityValue("cod_licenta_mascat");
    const message = this._licenseEntityValue("mesaj_licenta");
    const textEntity = this._licenseEntity("text", "cod_licenta_noua");
    const buttonEntity = this._licenseEntity("button", "aplica_licenta");
    const currentInput = this._licenseDraft ?? this._licenseEntityValue("cod_licenta_noua", "text") ?? "";
    const statusClass = this._licenseStatusClass(status);
    const hasValidLicense = this._hasValidLicenseStatus(status);
    const isTrialLicense = this._isTrialLicenseStatus(status, plan);
    const licenseTitle = hasValidLicense && !isTrialLicense ? "active" : isTrialLicense ? "trial" : status || "neverificată";
    const donationTitle = hasValidLicense && !isTrialLicense
      ? "Susține în continuare dezvoltarea proiectului"
      : "Susține proiectul și obține licența completă";
    const donationIntro = hasValidLicense && !isTrialLicense
      ? "Ai deja o licență activă. Dacă integrarea îți este utilă, poți susține în continuare dezvoltarea, mentenanța și adaptarea proiectului atunci când Home Assistant sau portalurile externe se schimbă."
      : "Licența se obține printr-o donație minimă pe Buy Me a Coffee. Donația ajută la dezvoltare, mentenanță, testare și suport pentru proiect.";
    const donationNote = hasValidLicense && !isTrialLicense
      ? "Donațiile suplimentare nu sunt obligatorii, dar ajută la menținerea proiectului activ."
      : "După donație, trimite mesaj cu proiectul „Car Manager România” și adresa de e-mail pe care dorești să primești cheia.";

    return `
      <main class="cmr-page cmr-license-page">
        <div class="cmr-page-title">
          <span>Licență</span>
          <h2>Licență Car Manager România</h2>
          <p>Activare, verificare și susținere proiect, direct din panel.</p>
        </div>

        <section class="cmr-license-status-card ${statusClass}">
          <div class="cmr-license-status-icon"><ha-icon icon="mdi:shield-check"></ha-icon></div>
          <div>
            <span>Licență</span>
            <h3>${this._escape(licenseTitle)}</h3>
            <p>${this._escape(message || (hasValidLicense ? "Licență validă pentru această instalare." : "Licența nu este încă activă sau nu a fost verificată."))}</p>
          </div>
          <div class="cmr-license-status-pill">${this._escape(plan || "plan necunoscut")}</div>
        </section>

        <section class="cmr-license-grid">
          ${this._licenseInfoTile("Status", status || "Neverificată", "mdi:shield-check-outline")}
          ${this._licenseInfoTile("Plan", plan || "—", "mdi:badge-account-outline")}
          ${this._licenseInfoTile("Valabilă până la", validUntil ? this._formatDate(validUntil) : "—", "mdi:calendar-check-outline")}
          ${this._licenseInfoTile("Ultima verificare", checkedAt ? this._formatDate(checkedAt) : "—", "mdi:clock-check-outline")}
          ${this._licenseInfoTile("Cont", account || "—", "mdi:account-circle-outline")}
          ${this._licenseInfoTile("Cod", maskedKey || "—", "mdi:key-variant")}
        </section>

        <section class="cmr-license-section">
          <div class="cmr-section-head">
            <div>
              <span>Actualizare</span>
              <h3>Introdu licență nouă</h3>
            </div>
          </div>
          <form class="cmr-license-form" data-form="license">
            <input type="text" name="license_key" autocomplete="off" spellcheck="false" placeholder="Cod licență" value="${this._escape(currentInput)}" ${textEntity ? "" : "disabled"}>
            <button type="submit" ${textEntity && buttonEntity && this._licenseBusy !== "apply" ? "" : "disabled"}>${this._licenseBusy === "apply" ? "Se aplică..." : "Aplică licența"}</button>
          </form>
          <p class="cmr-license-help">Câmpul poate afișa ultimul cod introdus pentru validare. Licența activă curentă este afișată mascat în secțiunea de mai sus.</p>
          ${!textEntity || !buttonEntity ? `<div class="cmr-license-message warn">Entitățile de licențiere nu sunt disponibile încă. Dacă este prima instalare, verifică integrarea în Devices & services și fă restart Home Assistant.</div>` : ""}
          ${this._licenseMessage ? `<div class="cmr-license-message">${this._escape(this._licenseMessage)}</div>` : ""}
        </section>

        <section class="cmr-license-action-row">
          <div>
            <h3>Verificare licență</h3>
            <p>Verifică manual licența curentă salvată în integrare. Este util după modificări în portalul de licențiere sau dacă vrei să confirmi rapid statusul.</p>
          </div>
          <button type="button" data-action="license-refresh" ${this._licenseBusy === "refresh" ? "disabled" : ""}>
            <ha-icon icon="mdi:shield-sync-outline"></ha-icon>
            ${this._licenseBusy === "refresh" ? "Se verifică..." : "Verifică licența"}
          </button>
        </section>

        <section class="cmr-license-action-row">
          <div>
            <h3>După activarea licenței</h3>
            <p>Dacă perioada trial a expirat și unele funcții au rămas indisponibile, reîncarcă datele după ce licența apare ca activă.</p>
          </div>
          <button type="button" data-action="reload-license-data">
            <ha-icon icon="mdi:reload-alert"></ha-icon>
            Reîncarcă datele
          </button>
        </section>

        <section class="cmr-license-support">
          <div class="cmr-license-support-icon"><ha-icon icon="mdi:heart-outline"></ha-icon></div>
          <div>
            <h3>${this._escape(donationTitle)}</h3>
            <p>${this._escape(donationIntro)}</p>
            <p>${this._escape(donationNote)}</p>
            <a href="https://www.buymeacoffee.com/haforgelabs" target="_blank" rel="noopener noreferrer">
              <span>☕</span>
              ${hasValidLicense && !isTrialLicense ? "Susține proiectul prin Buy Me a Coffee" : "Obține licența prin Buy Me a Coffee"}
            </a>
            <small>Mulțumim pentru susținere și pentru folosirea integrării.</small>
          </div>
        </section>
      </main>
    `;
  }

  _licenseInfoTile(label, value, icon) {
    return `
      <article class="cmr-license-info-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value || "—")}</strong>
      </article>
    `;
  }

  _licenseEntity(domain, objectId) {
    const states = this._hass?.states || {};
    const prefixes = ["car_manager_romania", "car_manager"];
    const objectAliases = {
      cod_licenta_noua: ["cod_licenta_noua", "cod_licenta_nou"],
      cod_licenta_nou: ["cod_licenta_nou", "cod_licenta_noua"],
    };
    const wantedObjectIds = objectAliases[objectId] || [objectId];

    for (const prefix of prefixes) {
      for (const wantedObjectId of wantedObjectIds) {
        const exactEntityId = `${domain}.${prefix}_${wantedObjectId}`;
        if (states[exactEntityId]) return states[exactEntityId];
      }
    }

    const entries = Object.entries(states).filter(([entityId]) => {
      if (!entityId.startsWith(`${domain}.`)) return false;
      const objectPart = entityId.split(".")[1] || "";
      if (objectPart.startsWith("utilitati_romania_")) return false;
      return prefixes.some((prefix) => objectPart === prefix || objectPart.startsWith(`${prefix}_`));
    });

    const byObjectId = entries.find(([entityId]) => {
      const objectPart = entityId.split(".")[1] || "";
      return prefixes.some((prefix) => wantedObjectIds.some((wantedObjectId) => {
        const expectedObjectId = `${prefix}_${wantedObjectId}`;
        if (objectPart === expectedObjectId) return true;
        if (!objectPart.startsWith(`${expectedObjectId}_`)) return false;
        const suffix = objectPart.slice(expectedObjectId.length + 1);
        return /^\d+$/.test(suffix);
      }));
    });
    if (byObjectId) return byObjectId[1];

    const normalizedWanted = this._normalize(objectId);
    const aliases = {
      cod_licenta_noua: ["cod licenta nou", "cod licenta noua", "license key", "licenta nou"],
      cod_licenta_nou: ["cod licenta nou", "cod licenta noua", "license key", "licenta nou"],
      aplica_licenta: ["aplica licenta", "aplicare licenta", "apply license"],
      actualizeaza_status_licenta: ["actualizeaza status licenta", "actualizare status licenta", "refresh license", "revalidate license"],
      status_licenta: ["status licenta"],
      plan_licenta: ["plan licenta"],
      valabila_pana_la: ["valabila pana la", "valabil pana la"],
      ultima_verificare_licenta: ["ultima verificare licenta"],
      cont_licenta: ["cont licenta", "utilizator licenta"],
      cod_licenta_mascat: ["cod licenta mascat", "cheie licenta mascata"],
      mesaj_licenta: ["mesaj licenta"],
    };
    const allowedNames = [
      normalizedWanted,
      ...wantedObjectIds.map((value) => this._normalize(value)),
      ...(aliases[objectId] || []),
    ].map((value) => this._normalize(value));

    const byFriendlyName = entries.find(([, stateObj]) => {
      const friendlyName = this._normalize(stateObj?.attributes?.friendly_name || "");
      return allowedNames.some((name) => friendlyName === name || friendlyName.endsWith(` ${name}`));
    });
    if (byFriendlyName) return byFriendlyName[1];

    const bySafeObjectPart = entries.find(([entityId]) => {
      let objectPart = entityId.split(".")[1] || "";
      for (const prefix of prefixes) {
        if (objectPart.startsWith(`${prefix}_`)) {
          objectPart = objectPart.slice(prefix.length + 1);
          break;
        }
      }
      objectPart = this._normalize(objectPart);
      return allowedNames.some((name) => {
        const slug = name.replaceAll(" ", "_");
        return objectPart === slug || objectPart.includes(slug);
      });
    });
    if (bySafeObjectPart) return bySafeObjectPart[1];

    return null;
  }

  _licenseEntityValue(objectId, domain = "sensor") {
    const stateObj = this._licenseEntity(domain, objectId);
    const value = stateObj?.state;
    if (value === undefined || value === null || value === "" || value === "unknown" || value === "unavailable") return null;
    return value;
  }

  _licenseRefreshButtonEntity() {
    const direct = this._licenseEntity("button", "actualizeaza_status_licenta");
    if (direct?.entity_id) return direct;

    const states = this._hass?.states || {};
    const entries = Object.entries(states).filter(([entityId]) => {
      if (!entityId.startsWith("button.")) return false;
      const objectPart = entityId.split(".")[1] || "";
      return objectPart.startsWith("car_manager_romania_") || objectPart.startsWith("car_manager_");
    });

    const found = entries.find(([entityId, stateObj]) => {
      const objectPart = this._normalize(entityId.split(".")[1] || "");
      const friendlyName = this._normalize(stateObj?.attributes?.friendly_name || "");
      const haystack = `${objectPart} ${friendlyName}`;
      return (
        haystack.includes("actualizeaza") &&
        haystack.includes("status") &&
        haystack.includes("licen")
      ) || (
        haystack.includes("refresh") && haystack.includes("license")
      ) || (
        haystack.includes("revalidate") && haystack.includes("license")
      );
    });
    return found ? found[1] : null;
  }

  _hasValidLicenseStatus(status) {
    const normalized = this._normalize(status || "");
    return /activ|active|trial/.test(normalized) && !/inactiv|inactive|invalid|expir|revoc|produs|limita|eroare/.test(normalized);
  }

  _isTrialLicenseStatus(status, plan) {
    const normalizedStatus = this._normalize(status || "");
    const normalizedPlan = this._normalize(plan || "");
    return /trial|test/.test(normalizedStatus) || /trial|test/.test(normalizedPlan);
  }

  _licenseStatusClass(status) {
    const normalized = this._normalize(status || "");
    if (this._hasValidLicenseStatus(status)) return "is-good";
    if (/expir|invalid|revoc|produs|limita|inactiv|inactive/.test(normalized)) return "is-bad";
    if (/necunoscut|eroare|neverificat/.test(normalized)) return "is-warn";
    return "is-neutral";
  }

  async _applyLicense(value) {
    const textEntity = this._licenseEntity("text", "cod_licenta_noua");
    const buttonEntity = this._licenseEntity("button", "aplica_licenta");

    if (!textEntity || !buttonEntity) {
      this._licenseMessage = "Entitățile de licențiere nu sunt disponibile încă. Fă un restart Home Assistant după actualizare.";
      this._render(true);
      return;
    }

    try {
      this._licenseBusy = "apply";
      this._licenseMessage = "Se validează licența...";
      this._render(true);
      await this._hass.callService("text", "set_value", { value: value || "TRIAL" }, { entity_id: textEntity.entity_id });
      await this._hass.callService("button", "press", {}, { entity_id: buttonEntity.entity_id });
      this._licenseDraft = value || "TRIAL";
      this._licenseMessage = "Licența a fost trimisă pentru validare. Statusul se actualizează imediat ce Home Assistant reîmprospătează senzorii.";
      await this._refreshLicenseEntities(false);
    } catch (error) {
      this._licenseMessage = error?.message || "Nu am putut aplica licența.";
    } finally {
      this._licenseBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _refreshLicenseEntities(renderAfter = true) {
    const refreshButton = this._licenseRefreshButtonEntity();
    const entityIds = [
      this._licenseEntity("sensor", "status_licenta")?.entity_id,
      this._licenseEntity("sensor", "plan_licenta")?.entity_id,
      this._licenseEntity("sensor", "valabila_pana_la")?.entity_id,
      this._licenseEntity("sensor", "ultima_verificare_licenta")?.entity_id,
      this._licenseEntity("sensor", "cont_licenta")?.entity_id,
      this._licenseEntity("sensor", "cod_licenta_mascat")?.entity_id,
      this._licenseEntity("sensor", "mesaj_licenta")?.entity_id,
    ].filter(Boolean);

    try {
      this._licenseBusy = "refresh";
      this._licenseMessage = "Se verifică licența online...";
      this._render(true);

      if (this._hass.services?.car_manager_romania?.refresh_license_status) {
        await this._hass.callService("car_manager_romania", "refresh_license_status", {});
        this._licenseMessage = "Statusul licenței a fost verificat online.";
      } else if (refreshButton?.entity_id) {
        await this._hass.callService("button", "press", {}, { entity_id: refreshButton.entity_id });
        this._licenseMessage = "Statusul licenței a fost verificat online.";
      } else {
        throw new Error("Serviciul de verificare online a licenței nu este disponibil. Fă restart Home Assistant după actualizare.");
      }
    } catch (error) {
      this._licenseMessage = error?.message || "Nu am putut verifica licența.";
    }

    if (entityIds.length) {
      try {
        await this._hass.callService("homeassistant", "update_entity", { entity_id: entityIds });
      } catch (_error) {
        // Actualizarea entităților este doar o rezervă vizuală; dispatcher-ul actualizează oricum senzorii.
      }
    }

    this._licenseBusy = null;
    this._lastSignature = "";
    if (renderAfter) this._render(true);
  }

  async _loadRovinietaAccountStatus(force = false) {
    if (!this._hass || this._rovinietaAccountLoadBusy) return;
    if (this._rovinietaAccountLoaded && !force) return;

    this._rovinietaAccountLoadBusy = true;
    try {
      const response = await this._callCarManagerServiceWithResponse("get_rovinieta_account", {});
      if (response && typeof response === "object") {
        this._rovinietaSavedUsername = String(response.username || "").trim();
        this._rovinietaSavedProvider = ["cnair", "e_rovinieta"].includes(String(response.provider || "")) ? String(response.provider) : "cnair";
        this._rovinietaSavedInterval = Number(response.scan_interval || this._rovinietaSavedInterval || 21600) || 21600;
        this._rovinietaHasSavedPassword = Boolean(response.has_password);
        this._rovinietaAccountLoaded = true;
        this._removePreference("rovinieta_username");
        this._savePreference("rovinieta_provider", this._rovinietaSavedProvider);
        this._savePreference("rovinieta_scan_interval", String(this._rovinietaSavedInterval));
        this._lastSignature = "";
        this._render(true);
      }
    } catch (_error) {
      // Dacă serviciul nu este încă disponibil, rămânem pe valorile locale.
      // Nu afișăm eroare aici ca să nu deranjăm utilizatorul la simpla deschidere a paginii.
    } finally {
      this._rovinietaAccountLoadBusy = false;
    }
  }


  async _saveRovinietaAccount(form, clear = false) {
    if (!this._hass || this._rovinietaAccountBusy) return;

    const formData = form ? new FormData(form) : new FormData();
    const username = clear ? "" : String(formData.get("cmr_rovinieta_username") || formData.get("rovinieta_username") || "").trim();
    const password = clear ? "" : String(formData.get("cmr_rovinieta_password") || formData.get("rovinieta_password") || "");
    const providerValue = String(formData.get("cmr_rovinieta_provider") || formData.get("rovinieta_provider") || this._rovinietaSavedProvider || "cnair");
    const provider = ["cnair", "e_rovinieta"].includes(providerValue) ? providerValue : "cnair";
    const interval = clear ? 21600 : Math.max(900, Number(formData.get("cmr_rovinieta_scan_interval") || formData.get("rovinieta_scan_interval") || 21600));

    this._rovinietaAccountBusy = true;
    this._rovinietaAccountMessage = clear ? "Se dezactivează contul online..." : "Se salvează contul online...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "set_rovinieta_account", {
        rovinieta_username: username,
        rovinieta_password: password,
        rovinieta_provider: provider,
        rovinieta_scan_interval: interval,
      });
      if (clear) {
        this._rovinietaSavedUsername = "";
        this._rovinietaHasSavedPassword = false;
        this._rovinietaSavedProvider = provider;
        this._rovinietaAccountLoaded = true;
        this._removePreference("rovinieta_username");
        this._savePreference("rovinieta_provider", provider);
      } else {
        this._rovinietaSavedUsername = username;
        this._rovinietaSavedInterval = interval;
        this._rovinietaSavedProvider = provider;
        if (password) this._rovinietaHasSavedPassword = true;
        this._rovinietaAccountLoaded = true;
        this._removePreference("rovinieta_username");
        this._savePreference("rovinieta_provider", provider);
        this._savePreference("rovinieta_scan_interval", String(interval));
      }
      this._rovinietaAccountMessage = clear
        ? "Contul online de rovinietă a fost dezactivat. Rămâne disponibilă introducerea manuală."
        : "Contul online de rovinietă a fost salvat. Poți căuta autovehiculele fără restart sau reîncărcare de pagină.";
    } catch (error) {
      this._rovinietaAccountMessage = error?.message || "Nu am putut salva contul de rovinietă online.";
    } finally {
      this._rovinietaAccountBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }


  async _callCarManagerServiceWithResponse(service, payload = {}) {
    if (!this._hass) throw new Error("Home Assistant nu este disponibil.");

    // Pentru serviciile care întorc răspuns, apelul clasic `callService` nu este
    // suficient de stabil între versiunile de frontend Home Assistant. Folosim
    // direct WebSocket API cu `return_response`, iar apoi normalizăm forma
    // răspunsului ca să funcționeze indiferent dacă HA întoarce obiectul direct
    // sau îl împachetează în `response` / `service_response`.
    if (typeof this._hass.callWS === "function") {
      const raw = await this._hass.callWS({
        type: "call_service",
        domain: "car_manager_romania",
        service,
        service_data: payload || {},
        return_response: true,
      });

      const response = raw?.response ?? raw?.service_response ?? raw;
      if (response && typeof response === "object") {
        const serviceKey = `car_manager_romania.${service}`;
        if (response[serviceKey]) return response[serviceKey];
        if (response.car_manager_romania?.[service]) return response.car_manager_romania[service];
      }
      return response;
    }

    if (typeof this._hass.callService !== "function") {
      throw new Error("Serviciul Home Assistant nu este disponibil în acest context.");
    }

    return await this._hass.callService(
      "car_manager_romania",
      service,
      payload,
      undefined,
      true,
      true,
    );
  }

  async _refreshRovinietaNow() {
    if (!this._hass || this._rovinietaRefreshBusy) return;

    this._rovinietaRefreshBusy = true;
    const portalLabel = this._rovinietaSavedProvider === "e_rovinieta" ? "e-rovinieta.ro" : "CNAIR / erovinieta.ro";
    this._rovinietaRefreshMessage = `Se actualizează rovinietele din ${portalLabel}...`;
    this._render(true);

    try {
      const response = await this._callCarManagerServiceWithResponse("refresh_rovinieta_now", {});
      this._rovinietaRefreshMessage = response?.message || `Rovinietele au fost actualizate din ${portalLabel}.`;
      await this._reloadData?.();
    } catch (error) {
      this._rovinietaRefreshMessage = error?.message || "Nu am putut actualiza rovinietele din contul online.";
    } finally {
      this._rovinietaRefreshBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }


  async _refreshItpNow() {
    if (!this._hass || this._itpRefreshBusy) return;

    this._itpRefreshBusy = true;
    this._itpRefreshMessage = "Se verifică online valabilitatea ITP prin RAR AutoPass...";
    this._render(true);

    try {
      const response = await this._callCarManagerServiceWithResponse("refresh_itp_now", {});
      this._applyItpRefreshResponse(response);
      this._itpRefreshMessage = response?.message || "Verificarea ITP online s-a finalizat.";
      await this._refreshVehicleStatusEntities();
    } catch (error) {
      this._itpRefreshMessage = error?.message || "Nu am putut verifica ITP-ul online.";
    } finally {
      this._itpRefreshBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _applyItpRefreshResponse(response) {
    const results = Array.isArray(response?.results) ? response.results : [];
    if (!results.length) return;
    const vehicles = this._buildVehicles();
    for (const result of results) {
      if (!result || result.status !== "ok" || !result.expires_at) continue;
      const resultVehicleId = String(result.vehicle_id || "").trim();
      const vehicle = vehicles.find((item) => String(item.vehicle_id || "") === resultVehicleId);
      if (!vehicle) continue;
      const vehicleKey = vehicle.vehicle_id;
      const currentTerms = vehicle.attrs?.legal_terms && typeof vehicle.attrs.legal_terms === "object" ? vehicle.attrs.legal_terms : {};
      const currentItp = currentTerms.itp && typeof currentTerms.itp === "object" ? currentTerms.itp : {};
      const override = this._vehicleLocalOverrides[vehicleKey] || {};
      const overrideTerms = override.legal_terms && typeof override.legal_terms === "object" ? override.legal_terms : {};
      const overrideItp = overrideTerms.itp && typeof overrideTerms.itp === "object" ? overrideTerms.itp : {};
      this._vehicleLocalOverrides[vehicleKey] = {
        ...override,
        legal_terms: {
          ...currentTerms,
          ...overrideTerms,
          itp: {
            ...currentItp,
            ...overrideItp,
            end_date: result.expires_at,
            source: response?.source || "RAR AutoPass",
          },
        },
        itp_expiry: result.expires_at,
        itp_expiry_date: result.expires_at,
        itp_data_source: response?.source || "RAR AutoPass",
        itp_source: response?.source || "RAR AutoPass",
      };
    }
  }

  async _refreshVehicleStatusEntities() {
    const entityIds = this._buildVehicles().map((vehicle) => vehicle.entityId).filter(Boolean);
    if (!entityIds.length) return;
    try {
      await this._hass.callService("homeassistant", "update_entity", { entity_id: entityIds });
    } catch (_error) {
      // Actualizarea entităților este doar o accelerare vizuală; dispatcher-ul backend actualizează oricum datele.
    }
  }

  async _scanRovinietaImportVehicles() {
    if (!this._hass || this._rovinietaImportBusy) return;

    this._rovinietaImportBusy = true;
    const portalLabel = this._rovinietaSavedProvider === "e_rovinieta" ? "e-rovinieta.ro" : "CNAIR / erovinieta.ro";
    this._rovinietaImportMessage = `Se caută autovehicule în ${portalLabel}...`;
    this._render(true);

    try {
      const response = await this._callCarManagerServiceWithResponse("scan_rovinieta_import_vehicles", { refresh: true });
      const vehicles = Array.isArray(response?.vehicles) ? response.vehicles : [];
      this._rovinietaImportVehicles = vehicles;
      if (!vehicles.length) {
        this._rovinietaImportMessage = `Nu am găsit autovehicule disponibile în contul selectat: ${portalLabel}.`;
      } else {
        const importable = vehicles.filter((item) => item?.can_import).length;
        const existing = vehicles.filter((item) => item?.existing).length;
        this._rovinietaImportMessage = `${vehicles.length} autovehicule găsite · ${importable} pot fi importate · ${existing} există deja.`;
      }
    } catch (error) {
      this._rovinietaImportMessage = error?.message || "Nu am putut căuta autovehicule în contul de rovinietă.";
    } finally {
      this._rovinietaImportBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _importRovinietaVehicle(importKey) {
    if (!this._hass || this._rovinietaImportBusy || !importKey) return;

    this._rovinietaImportBusy = true;
    this._rovinietaImportMessage = "Se importă autovehiculul selectat...";
    this._render(true);

    try {
      const response = await this._callCarManagerServiceWithResponse("import_rovinieta_vehicle", { import_key: importKey });
      this._rovinietaImportMessage = response?.message || "Operațiunea de import s-a finalizat.";
      await this._scanRovinietaImportVehicles();
    } catch (error) {
      this._rovinietaImportMessage = error?.message || "Nu am putut importa autovehiculul selectat.";
    } finally {
      this._rovinietaImportBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }

  _renderRovinietaImportVehicles() {
    const vehicles = Array.isArray(this._rovinietaImportVehicles) ? this._rovinietaImportVehicles : [];
    if (!vehicles.length) return "";

    return `
      <div class="cmr-rovinieta-import-list">
        ${vehicles.map((vehicle) => {
          const status = vehicle.existing
            ? `Există deja${vehicle.existing_vehicle_name ? `: ${this._escape(vehicle.existing_vehicle_name)}` : ""}`
            : "Poate fi importat";
          return `
            <article class="cmr-rovinieta-import-item ${vehicle.existing ? "is-existing" : "is-new"}">
              <div>
                <strong>${this._escape(vehicle.license_plate || "Autovehicul fără număr")}</strong>
                <span>${this._escape(vehicle.source_label || vehicle.source || "sursă necunoscută")}</span>
              </div>
              <dl>
                <div><dt>Țară</dt><dd>${this._escape(vehicle.country || "-")}</dd></div>
                <div><dt>VIN</dt><dd>${this._escape(vehicle.vin || "-")}</dd></div>
                <div><dt>Serie talon</dt><dd>${this._escape(vehicle.registration_certificate || "-")}</dd></div>
                <div><dt>Categorie rovinietă</dt><dd>${this._escape(vehicle.rovinieta_category || "-")}</dd></div>
                <div><dt>Taxă pod Fetești</dt><dd>${this._escape(vehicle.fetesti_bridge_category || "-")}</dd></div>
                <div><dt>Rovinietă</dt><dd>${this._escape(vehicle.rovinieta_end_date ? `activă până la ${vehicle.rovinieta_end_date}` : vehicle.rovinieta_status || "-")}</dd></div>
              </dl>
              <div class="cmr-rovinieta-import-footer">
                <span>${this._escape(status)}</span>
                ${vehicle.can_import ? `<button type="button" data-action="rovinieta-import-vehicle" data-import-key="${this._escape(vehicle.import_key || "")}" ${this._rovinietaImportBusy ? "disabled" : ""}>Importă</button>` : `<button type="button" class="secondary" disabled>Definită deja</button>`}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }


  async _reloadLicenseData() {
    try {
      this._licenseBusy = "reload";
      this._licenseMessage = "Se solicită reîncărcarea datelor...";
      this._render(true);
      if (this._hass.services?.car_manager_romania?.reload_after_license_activation) {
        await this._hass.callService("car_manager_romania", "reload_after_license_activation", {});
        this._licenseMessage = "Datele au fost reîncărcate.";
      } else if (this._hass.services?.homeassistant?.reload_config_entry) {
        this._licenseMessage = "Serviciul dedicat nu este disponibil în această versiune. Repornește integrarea sau Home Assistant dacă unele entități nu s-au actualizat.";
      } else {
        this._licenseMessage = "Reîncărcarea automată nu este disponibilă. Repornește integrarea sau Home Assistant dacă unele entități nu s-au actualizat.";
      }
    } catch (error) {
      this._licenseMessage = error?.message || "Nu am putut reîncărca datele.";
    } finally {
      this._licenseBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _rovinietaSourceSummary(vehicles = this._buildVehicles()) {
    const labels = new Set();

    for (const vehicle of vehicles) {
      for (const term of this._vehicleLegalTerms(vehicle)) {
        if (term.key === "rovinieta" && term.source) labels.add(this._rovinietaSourceLabel(term.source));
      }
    }

    if (!labels.size) return "neconfigurat";
    return Array.from(labels).join(" / ");
  }

  _rovinietaSourceLabel(source) {
    const value = this._normalize(source);
    if (!value) return "necunoscută";
    if (value.includes("cnair") || value.includes("erovinieta.ro") && !value.includes("e-rovinieta")) return "CNAIR / erovinieta.ro";
    if (value.includes("e-rovinieta")) return "e-rovinieta.ro";
    if (value.includes("manual")) return "manual";
    return source;
  }

  _normalizeRovinietaSourceValue(source) {
    const value = this._normalize(source);
    if (value.includes("cnair") || value.includes("erovinieta.ro") && !value.includes("e-rovinieta")) return "erovinieta.ro";
    if (value.includes("e-rovinieta")) return "e-rovinieta.ro";
    if (value.includes("manual")) return "manual";
    return "manual";
  }

  _rovinietaSourceDescription(source) {
    const normalized = this._normalizeRovinietaSourceValue(source);
    if (normalized === "erovinieta.ro") return "Date preluate din portalul oficial CNAIR / erovinieta.ro.";
    if (normalized === "e-rovinieta.ro") return "Date preluate din contul e-rovinieta.ro.";
    return "Date introduse sau actualizate manual în Car Manager România.";
  }

  _renderRovinietaSourceLine(source) {
    return this._renderLegalSourceLine("rovinieta", source);
  }

  _renderSettingsPage() {
    if (!this._rovinietaAccountLoaded && !this._rovinietaAccountLoadBusy) {
      this._loadRovinietaAccountStatus(false);
    }
    const notificationValues = this._notificationOptionsForForm();
    const featureValues = this._featureOptionsForForm();
    const enabledFeatureCount = this._featureOptionDefinitions().filter(([key]) => featureValues[key]).length;
    const backupFilename = this._backupFilename || "car_manager_romania_backup.json";
    const vehicles = this._buildVehicles();
    const rovinietaSource = this._rovinietaSourceSummary(vehicles);
    const rovinietaUsername = this._escape(this._rovinietaSavedUsername || "");
    const rovinietaProvider = ["cnair", "e_rovinieta"].includes(this._rovinietaSavedProvider) ? this._rovinietaSavedProvider : "cnair";
    const rovinietaProviderLabel = rovinietaProvider === "e_rovinieta" ? "e-rovinieta.ro" : "CNAIR / erovinieta.ro";
    const rovinietaInterval = Number(this._rovinietaSavedInterval || 21600) || 21600;
    const rovinietaAccountConfigured = Boolean(this._rovinietaSavedUsername && this._rovinietaHasSavedPassword);
    const rovinietaAccountLabel = this._rovinietaSavedUsername
      ? `Conectat la ${this._escape(rovinietaProviderLabel)} ca ${this._escape(this._rovinietaSavedUsername)}`
      : "Niciun cont online salvat";
    const rovinietaAccountHelper = this._rovinietaSavedUsername
      ? (this._rovinietaHasSavedPassword ? "Parola este salvată securizat în opțiunile integrării și nu este afișată." : "Utilizator salvat, dar parola nu este confirmată ca salvată.")
      : "Salvează utilizatorul și parola pentru a putea căuta autovehicule în cont.";
    return `
      <main class="cmr-page cmr-settings-page">
        <div class="cmr-page-title">
          <span>Setări</span>
          <h2>Configurare și administrare</h2>
          <p>Setări generale pentru notificări, backup/restore, administrare rapidă și informații de mentenanță panel.</p>
        </div>

        <section class="cmr-settings-hero">
          ${this._settingsHeroTile("Notificări", notificationValues.notifications_enabled ? "active" : "oprite", "categorii salvate în integrare", "mdi:bell-cog-outline")}
          ${this._settingsHeroTile("Funcționalități", `${enabledFeatureCount}/${this._featureOptionDefinitions().length}`, "module afișate", "mdi:tune-variant")}
          ${this._settingsHeroTile("Backup", backupFilename, "fișier în /config", "mdi:backup-restore")}
          ${this._settingsHeroTile("Autovehicule", vehicles.length, "profiluri active în integrare", "mdi:car-multiple")}
          ${this._settingsHeroTile("Rovinietă", rovinietaProviderLabel, "portal cont online", "mdi:road-variant")}
          ${this._settingsHeroTile("Versiune", "1.2.2", "panel nou Car Manager", "mdi:package-variant-closed-check")}
        </section>

        <section class="cmr-settings-grid">
          <article class="cmr-settings-card cmr-settings-notifications">
            <div class="cmr-settings-card-head">
              <ha-icon icon="mdi:bell-cog-outline"></ha-icon>
              <div>
                <span>Notificări</span>
                <h3>Categorii active</h3>
                <p>Alege ce notificări vrei să primești. Setările se salvează în integrare, nu doar în browser.</p>
              </div>
            </div>
            <form data-form="notification-options" class="cmr-settings-form">
              <div class="cmr-settings-checks">
                ${this._notificationOptionDefinitions().map(([key, label, helper]) => `
                  <label>
                    <input type="checkbox" name="${this._escape(key)}" ${notificationValues[key] ? "checked" : ""} ${this._notificationBusy ? "disabled" : ""}>
                    <span><strong>${this._escape(label)}</strong><small>${this._escape(helper)}</small></span>
                  </label>
                `).join("")}
              </div>
              <div class="cmr-settings-actions">
                <button type="submit" ${this._notificationBusy ? "disabled" : ""}>${this._notificationBusy ? "Se salvează..." : "Salvează notificările"}</button>
                <button type="button" class="secondary" data-action="notifications-reset" ${this._notificationBusy ? "disabled" : ""}>Activează toate</button>
              </div>
            </form>
            ${this._notificationMessage ? `<div class="cmr-settings-message">${this._escape(this._notificationMessage)}</div>` : ""}
          </article>

          <article class="cmr-settings-card cmr-settings-features">
            <div class="cmr-settings-card-head">
              <ha-icon icon="mdi:tune-variant"></ha-icon>
              <div>
                <span>Afișare funcționalități</span>
                <h3>Module active</h3>
                <p>Alege ce zone folosești. Dezactivarea ascunde modulul și oprește notificările dedicate, fără să șteargă datele salvate.</p>
              </div>
            </div>
            <form data-form="feature-options" class="cmr-settings-form">
              <div class="cmr-settings-checks cmr-feature-checks">
                ${this._featureOptionDefinitions().map(([key, label, helper]) => `
                  <label>
                    <input type="checkbox" name="${this._escape(key)}" ${featureValues[key] ? "checked" : ""} ${this._featureBusy ? "disabled" : ""}>
                    <span><strong>${this._escape(label)}</strong><small>${this._escape(helper)}</small></span>
                  </label>
                `).join("")}
              </div>
              <div class="cmr-settings-actions">
                <button type="submit" ${this._featureBusy ? "disabled" : ""}>${this._featureBusy ? "Se salvează..." : "Salvează afișarea"}</button>
                <button type="button" class="secondary" data-action="features-reset" ${this._featureBusy ? "disabled" : ""}>Activează tot</button>
              </div>
            </form>
            <p class="cmr-settings-note">Funcționalitățile dezactivate nu mai apar în dashboard/card și nu mai generează notificări dedicate. Datele existente rămân salvate.</p>
            ${this._featureMessage ? `<div class="cmr-settings-message">${this._escape(this._featureMessage)}</div>` : ""}
          </article>


          <article class="cmr-settings-card cmr-settings-backup">
            <div class="cmr-settings-card-head">
              <ha-icon icon="mdi:backup-restore"></ha-icon>
              <div>
                <span>Backup / restore</span>
                <h3>Export și import date</h3>
                <p>Backup-ul se salvează în <strong>/config</strong>, ca să nu expunem VIN, numere de înmatriculare sau observații prin URL public.</p>
              </div>
            </div>
            <label class="cmr-settings-field">
              <span>Nume fișier backup</span>
              <input type="text" data-backup-filename value="${this._escape(backupFilename)}" placeholder="car_manager_romania_backup.json">
            </label>
            <div class="cmr-settings-actions wrap">
              <button type="button" data-action="backup-export" ${this._backupBusy ? "disabled" : ""}>${this._backupBusy === "export" ? "Export..." : "Exportă backup"}</button>
              <button type="button" class="secondary" data-action="backup-validate" ${this._backupBusy ? "disabled" : ""}>${this._backupBusy === "validate" ? "Validare..." : "Validează"}</button>
              <button type="button" class="secondary" data-action="backup-import-dry" ${this._backupBusy ? "disabled" : ""}>${this._backupBusy === "dry" ? "Simulare..." : "Simulează import"}</button>
              <button type="button" class="danger" data-action="backup-import-real" ${this._backupBusy ? "disabled" : ""}>${this._backupBusy === "import" ? "Import..." : "Importă merge"}</button>
            </div>
            <p class="cmr-settings-note">Importul disponibil este momentan doar <strong>merge</strong>: adaugă/actualizează datele din backup, fără să șteargă date existente.</p>
            ${this._backupMessage ? `<div class="cmr-settings-message">${this._escape(this._backupMessage)}</div>` : ""}
          </article>
        </section>

        <section class="cmr-settings-grid">
          <article class="cmr-settings-card cmr-settings-rovinieta">
            <div class="cmr-settings-card-head">
              <ha-icon icon="mdi:road-variant"></ha-icon>
              <div>
                <span>Rovinietă online</span>
                <h3>Cont e-rovinieta / CNAIR</h3>
                <p>Alege portalul pe care ai cont, apoi introdu utilizatorul și parola. Fallback-ul manual rămâne disponibil.</p>
              </div>
            </div>
            <div class="cmr-rovinieta-account-status ${rovinietaAccountConfigured ? "is-configured" : "is-empty"}">
              <ha-icon icon="${rovinietaAccountConfigured ? "mdi:account-check" : "mdi:account-alert-outline"}"></ha-icon>
              <div>
                <strong>${rovinietaAccountLabel}</strong>
                <small>${rovinietaAccountHelper}</small>
              </div>
            </div>
            <form data-form="rovinieta-account" class="cmr-settings-form" autocomplete="off">
              <label class="cmr-settings-field">
                <span>Portal cont rovinietă</span>
                <select name="cmr_rovinieta_provider" ${this._rovinietaAccountBusy ? "disabled" : ""}>
                  <option value="cnair" ${rovinietaProvider === "cnair" ? "selected" : ""}>CNAIR / erovinieta.ro</option>
                  <option value="e_rovinieta" ${rovinietaProvider === "e_rovinieta" ? "selected" : ""}>e-rovinieta.ro</option>
                </select>
              </label>
              <label class="cmr-settings-field">
                <span>Utilizator cont rovinietă online</span>
                <input type="text" name="cmr_rovinieta_username" autocomplete="off" autocapitalize="none" spellcheck="false" data-lpignore="true" data-1p-ignore="true" value="${rovinietaUsername}" placeholder="email sau utilizator" ${this._rovinietaAccountBusy ? "disabled" : ""}>
              </label>
              <label class="cmr-settings-field">
                <span>Parolă cont rovinietă online</span>
                <input type="password" name="cmr_rovinieta_password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" placeholder="lasă gol pentru a păstra parola salvată" ${this._rovinietaAccountBusy ? "disabled" : ""}>
              </label>
              <label class="cmr-settings-field">
                <span>Interval actualizare, în secunde</span>
                <input type="number" name="cmr_rovinieta_scan_interval" min="900" step="60" value="${rovinietaInterval}" ${this._rovinietaAccountBusy ? "disabled" : ""}>
              </label>
              <div class="cmr-settings-actions wrap">
                <button type="submit" ${this._rovinietaAccountBusy ? "disabled" : ""}>${this._rovinietaAccountBusy ? "Se salvează..." : "Salvează contul"}</button>
                <button type="button" class="secondary" data-action="rovinieta-clear" ${this._rovinietaAccountBusy ? "disabled" : ""}>Dezactivează cont online</button>
              </div>
            </form>
            <p class="cmr-settings-note">Parola nu este afișată în dashboard. Dacă o lași goală, se păstrează parola existentă; dacă dezactivezi contul online, se golește și parola salvată.</p>
            ${this._rovinietaAccountMessage ? `<div class="cmr-settings-message">${this._escape(this._rovinietaAccountMessage)}</div>` : ""}

            ${this._featureEnabled("feature_rovinieta_online") ? `<div class="cmr-rovinieta-refresh-block">
              <div class="cmr-rovinieta-import-head">
                <div>
                  <span>Actualizare roviniete</span>
                  <h4>Actualizează datele acum</h4>
                  <p>Forțează citirea rovinietelor din portalul selectat mai sus, fără să aștepți intervalul automat.</p>
                </div>
                <button type="button" data-action="rovinieta-refresh-now" ${this._rovinietaRefreshBusy ? "disabled" : ""}>${this._rovinietaRefreshBusy ? "Actualizez..." : "Actualizează acum"}</button>
              </div>
              ${this._rovinietaRefreshMessage ? `<div class="cmr-settings-message">${this._escape(this._rovinietaRefreshMessage)}</div>` : ""}
            </div>` : ""}

            ${this._featureEnabled("feature_itp_online") ? `<div class="cmr-rovinieta-refresh-block cmr-itp-refresh-block">
              <div class="cmr-rovinieta-import-head">
                <div>
                  <span>Verificare ITP online</span>
                  <h4>Actualizează ITP din RAR AutoPass</h4>
                  <p>Verifică online valabilitatea ITP pentru autovehiculele cu VIN completat și actualizează data de expirare găsită.</p>
                </div>
                <button type="button" data-action="itp-refresh-now" ${this._itpRefreshBusy ? "disabled" : ""}>${this._itpRefreshBusy ? "Verific..." : "Verifică ITP"}</button>
              </div>
              ${this._itpRefreshMessage ? `<div class="cmr-settings-message">${this._escape(this._itpRefreshMessage)}</div>` : ""}
            </div>` : ""}

            ${this._featureEnabled("feature_rovinieta_online") ? `<div class="cmr-rovinieta-import-block">
              <div class="cmr-rovinieta-import-head">
                <div>
                  <span>Import autovehicule</span>
                  <h4>Autovehicule din contul de rovinietă</h4>
                  <p>Caută mașinile disponibile în portalul selectat mai sus. Mașinile existente sunt afișate ca definite deja și nu sunt duplicate.</p>
                </div>
                <button type="button" data-action="rovinieta-scan-import" ${this._rovinietaImportBusy ? "disabled" : ""}>${this._rovinietaImportBusy ? "Caut..." : "Caută autovehicule"}</button>
              </div>
              ${this._rovinietaImportMessage ? `<div class="cmr-settings-message">${this._escape(this._rovinietaImportMessage)}</div>` : ""}
              ${this._renderRovinietaImportVehicles()}
            </div>` : ""}
          </article>

          <article class="cmr-settings-card">
            <div class="cmr-settings-card-head">
              <ha-icon icon="mdi:car-cog"></ha-icon>
              <div>
                <span>Administrare rapidă</span>
                <h3>Zone de lucru</h3>
                <p>Scurtături către modulele unde se modifică efectiv datele mașinilor.</p>
              </div>
            </div>
            <div class="cmr-settings-shortcuts">
              <button data-tab="vehicles"><ha-icon icon="mdi:car-multiple"></ha-icon> Mașini și intervenții</button>
              ${this._featureEnabled("feature_fuel") ? `<button data-tab="fuel"><ha-icon icon="mdi:gas-station"></ha-icon> Bonuri combustibil</button>` : ""}
              ${this._featureEnabled("feature_tires") ? `<button data-tab="tires"><ha-icon icon="mdi:tire"></ha-icon> Anvelope</button>` : ""}
              ${this._featureEnabled("feature_equipment") ? `<button data-tab="equipment"><ha-icon icon="mdi:shield-car"></ha-icon> Dotări</button>` : ""}
              ${this._featureEnabled("feature_battery") ? `<button data-tab="battery"><ha-icon icon="mdi:car-battery"></ha-icon> Baterie</button>` : ""}
              <button data-tab="license"><ha-icon icon="mdi:shield-key-outline"></ha-icon> Licență</button>
            </div>
          </article>

          <article class="cmr-settings-card">
            <div class="cmr-settings-card-head">
              <ha-icon icon="mdi:information-outline"></ha-icon>
              <div>
                <span>Actualizare panel</span>
                <h3>După instalarea unei versiuni noi</h3>
                <p>Pașii rapizi pentru evitarea cache-ului vechi în Home Assistant.</p>
              </div>
            </div>
            <div class="cmr-settings-steps">
              <div><strong>1</strong><span>Restart Home Assistant după copierea fișierelor.</span></div>
              <div><strong>2</strong><span>Actualizează resursa Lovelace la <code>?v=1.2.2</code>.</span></div>
              <div><strong>3</strong><span>Hard refresh în browser sau golire cache aplicație mobilă.</span></div>
            </div>
          </article>
        </section>
      </main>
    `;
  }

  _settingsHeroTile(label, value, helper, icon) {
    return `
      <article class="cmr-settings-hero-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }


  _featureOptionDefinitions() {
    return [
      ["feature_maintenance", "Mentenanță / revizii", "Ascunde reviziile și oprește notificările de mentenanță."],
      ["feature_rca", "RCA", "Ascunde RCA și oprește notificările pentru RCA."],
      ["feature_casco", "CASCO", "Ascunde CASCO și oprește notificările pentru CASCO."],
      ["feature_itp", "ITP", "Ascunde ITP și oprește notificările pentru ITP."],
      ["feature_rovinieta", "Rovinietă", "Ascunde rovinieta și oprește notificările pentru rovinietă."],
      ["feature_costs", "Costuri", "Ascunde zona de costuri și estimări."],
      ["feature_statistics", "Statistici", "Ascunde graficele și statisticile."],
      ["feature_fuel", "Combustibil", "Ascunde bonurile de combustibil și costurile asociate."],
      ["feature_tires", "Anvelope", "Ascunde gestiunea anvelopelor."],
      ["feature_equipment", "Dotări", "Ascunde trusă, stingător, vestă, triunghiuri și alte dotări."],
      ["feature_battery", "Baterie", "Ascunde gestiunea bateriei auto."],
      ["feature_consumables", "Consumabile", "Ascunde consumabilele din formularul de editare."],
      ["feature_rovinieta_online", "Rovinietă online", "Ascunde contul online, importul și actualizarea manuală a rovinietei."],
      ["feature_itp_online", "Verificare ITP online", "Ascunde verificarea ITP prin RAR AutoPass."],
    ];
  }

  _defaultFeatureOptions() {
    return Object.fromEntries(this._featureOptionDefinitions().map(([key]) => [key, true]));
  }

  _currentFeatureOptions() {
    const defaults = this._defaultFeatureOptions();
    for (const stateObj of Object.values(this._hass?.states || {})) {
      const options = stateObj?.attributes?.feature_options;
      if (!options || typeof options !== "object") continue;
      const normalized = { ...defaults };
      this._featureOptionDefinitions().forEach(([key]) => {
        if (Object.prototype.hasOwnProperty.call(options, key)) {
          normalized[key] = Boolean(options[key]);
        }
      });
      return normalized;
    }
    return defaults;
  }

  _featureOptionsForForm() {
    return { ...this._currentFeatureOptions(), ...(this._featureOptionsDraft || {}) };
  }

  _featureOptionsEntityIds() {
    return Object.entries(this._hass?.states || {})
      .filter(([, stateObj]) => {
        const attrs = stateObj?.attributes || {};
        return attrs.feature_options && typeof attrs.feature_options === "object";
      })
      .map(([entityId]) => entityId);
  }

  async _saveFeatureOptions(payload) {
    if (!this._hass?.services?.car_manager_romania?.set_feature_options) {
      this._featureMessage = "Serviciul pentru afișarea funcționalităților nu este disponibil. Fă restart Home Assistant după actualizare.";
      this._render(true);
      return;
    }

    this._featureBusy = true;
    this._featureMessage = "Se salvează afișarea funcționalităților...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "set_feature_options", payload);
      this._featureOptionsDraft = { ...payload };
      this._featureMessage = "Afișarea funcționalităților a fost salvată.";

      const entityIds = this._featureOptionsEntityIds();
      if (entityIds.length) {
        try {
          await this._hass.callService("homeassistant", "update_entity", { entity_id: entityIds });
        } catch (_error) {
          // Atributul se actualizează și prin mecanismul normal al Home Assistant; această actualizare este doar o rezervă vizuală.
        }
      }
    } catch (error) {
      this._featureMessage = error?.message || "Nu am putut salva afișarea funcționalităților.";
    } finally {
      this._featureBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }

  _notificationOptionDefinitions() {
    return [
      ["notifications_enabled", "Activează notificările", "Comutator general pentru notificările Car Manager."],
      ["notify_maintenance", "Notificări mentenanță", "Revizie, ulei cutie, distribuție, lichid frână și antigel."],
      ["notify_legal", "Notificări RCA / ITP / rovinietă / CASCO", "Termene legale și asigurări."],
      ["notify_equipment", "Notificări echipamente auto", "Trusă, stingător, vestă, triunghiuri și alte dotări."],
      ["notify_battery", "Notificări baterie auto", "Garanție, vechime și baterii neconfigurate."],
      ["notify_expenses", "Notificări cheltuieli estimate", "Costuri estimate care urmează în perioada configurată."],
    ];
  }

  _defaultNotificationOptions() {
    return Object.fromEntries(this._notificationOptionDefinitions().map(([key]) => [key, true]));
  }

  _currentNotificationOptions() {
    const defaults = this._defaultNotificationOptions();

    for (const stateObj of Object.values(this._hass?.states || {})) {
      const options = stateObj?.attributes?.notification_options;
      if (!options || typeof options !== "object") continue;

      const normalized = { ...defaults };
      this._notificationOptionDefinitions().forEach(([key]) => {
        if (Object.prototype.hasOwnProperty.call(options, key)) {
          normalized[key] = Boolean(options[key]);
        }
      });
      return normalized;
    }

    return defaults;
  }

  _notificationOptionsForForm() {
    return { ...this._currentNotificationOptions(), ...(this._notificationOptionsDraft || {}) };
  }

  _notificationOptionsEntityIds() {
    return Object.entries(this._hass?.states || {})
      .filter(([, stateObj]) => {
        const attrs = stateObj?.attributes || {};
        return attrs.notification_options && typeof attrs.notification_options === "object";
      })
      .map(([entityId]) => entityId);
  }

  async _saveNotificationOptions(payload) {
    if (!this._hass?.services?.car_manager_romania?.set_notification_options) {
      this._notificationMessage = "Serviciul pentru setarea notificărilor nu este disponibil. Fă restart Home Assistant după actualizare.";
      this._render(true);
      return;
    }

    this._notificationBusy = true;
    this._notificationMessage = "Se salvează setările...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "set_notification_options", payload);
      this._notificationOptionsDraft = { ...payload };
      this._notificationMessage = "Setările notificărilor au fost salvate.";

      const entityIds = this._notificationOptionsEntityIds();
      if (entityIds.length) {
        try {
          await this._hass.callService("homeassistant", "update_entity", { entity_id: entityIds });
        } catch (_error) {
          // Atributul se actualizează și prin mecanismul normal al Home Assistant; această actualizare este doar o rezervă vizuală.
        }
      }
    } catch (error) {
      this._notificationMessage = error?.message || "Nu am putut salva setările notificărilor.";
    } finally {
      this._notificationBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _runBackupAction(action) {
    if (!this._hass || this._backupBusy) return;

    const filename = (this._backupFilename || "car_manager_romania_backup.json").trim() || "car_manager_romania_backup.json";
    if (filename.includes("/") || filename.includes("\\")) {
      this._backupMessage = "Numele fișierului nu trebuie să conțină cale sau directoare.";
      this._render(true);
      return;
    }

    if (action === "import") {
      const confirmed = window.confirm("Importul merge va adăuga sau actualiza datele din backup. Nu șterge date existente, dar poate suprascrie valori pentru autovehicule/intervenții cu același ID. Continui?");
      if (!confirmed) return;
    }

    const serviceMap = {
      export: "export_data",
      validate: "validate_backup",
      dry: "import_data",
      import: "import_data",
    };
    const service = serviceMap[action];
    if (!service) return;

    const payload = { filename };
    if (action === "dry" || action === "import") {
      payload.mode = "merge";
      payload.dry_run = action === "dry";
    }

    this._backupBusy = action;
    this._backupMessage = "";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", service, payload);
      if (action === "export") {
        this._backupMessage = `Backup exportat în /config/${filename}. Descarcă-l local din File editor / Studio Code și păstrează-l în siguranță.`;
      } else if (action === "validate") {
        this._backupMessage = "Validarea a fost pornită. Rezultatul apare în notificările Home Assistant.";
      } else if (action === "dry") {
        this._backupMessage = "Simularea importului a fost pornită. Rezultatul apare în notificările Home Assistant.";
      } else {
        this._backupMessage = "Importul merge a fost pornit. Integrarea se va reîncărca dacă datele au fost aplicate.";
      }
    } catch (error) {
      this._backupMessage = error?.message || "Operațiunea de backup/restore a eșuat.";
    } finally {
      this._backupBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _renderCostsPage() {
    const vehicles = this._selectedVehicles();
    const summary = this._costsSummary(vehicles);
    const upcoming = this._upcomingCosts(vehicles, 90);
    const byType = this._costsByType(summary);
    return `
      <main class="cmr-page cmr-costs-page">
        <div class="cmr-page-title">
          <span>Costuri</span>
          <h2>Costuri complete</h2>
          <p>Sinteză nativă în panel pentru intervenții, combustibil, anvelope, dotări, baterii și cheltuieli estimate.</p>
        </div>

        <section class="cmr-costs-hero">
          ${this._costHeroTile("Total anul curent", this._formatMoney(summary.yearTotal, 2), "intervenții, termene și combustibil", "mdi:cash-multiple")}
          ${this._costHeroTile("Intervenții / service", this._formatMoney(summary.service, 2), "din istoricul intervențiilor", "mdi:wrench")}
          ${this._costHeroTile("Combustibil", this._formatMoney(summary.fuel, 2), "din bonurile salvate", "mdi:gas-station")}
          ${this._costHeroTile("Următoarele 30 zile", this._formatMoney(summary.next30, 2), `${summary.next30Count} cheltuieli estimate`, "mdi:calendar-clock")}
          ${this._costHeroTile("Următoarele 90 zile", this._formatMoney(summary.next90, 2), `${summary.next90Count} cheltuieli estimate`, "mdi:calendar-range")}
        </section>

        <section class="cmr-costs-section">
          <div class="cmr-section-head">
            <div><span>Defalcare</span><h3>Pe autovehicul</h3></div>
            <button data-tab="vehicles">Administrare mașini</button>
          </div>
          <div class="cmr-cost-vehicle-grid" style="${this._isCompactLayout() ? 'display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;max-width:100%;min-width:0;overflow:hidden;' : ''}">
            ${vehicles.map((vehicle) => this._renderCostVehicleCard(vehicle)).join("") || this._empty("Nu există costuri de afișat pentru filtrul curent.")}
          </div>
        </section>

        <section class="cmr-costs-section cmr-costs-two">
          <div>
            <div class="cmr-section-head compact">
              <div><span>Defalcare</span><h3>Pe tip, anul curent</h3></div>
            </div>
            <div class="cmr-cost-type-list">
              ${byType.current.map((item) => this._renderCostTypeBar(item, summary.yearTotal)).join("") || this._empty("Nu există costuri pe anul curent.")}
            </div>
          </div>
          <div>
            <div class="cmr-section-head compact">
              <div><span>Estimări</span><h3>Pe tip, următoarele 90 zile</h3></div>
            </div>
            <div class="cmr-cost-type-list">
              ${byType.upcoming.map((item) => this._renderCostTypeBar(item, summary.next90)).join("") || this._empty("Nu există estimări în următoarele 90 de zile.")}
            </div>
          </div>
        </section>

        <section class="cmr-costs-section">
          <div class="cmr-section-head">
            <div><span>Estimări</span><h3>Cheltuieli estimate care urmează</h3></div>
            <button data-tab="vehicles">Vezi termene</button>
          </div>
          ${upcoming.length ? `<div class="cmr-upcoming-costs">${upcoming.map((item) => this._renderUpcomingCost(item)).join("")}</div>` : `<div class="cmr-good-news"><ha-icon icon="mdi:check-circle-outline"></ha-icon><div><strong>Nu sunt cheltuieli estimate.</strong><span>Nu am găsit costuri estimate pentru următoarele 90 de zile în filtrul curent.</span></div></div>`}
        </section>
      </main>
    `;
  }

  _costsSummary(vehicles) {
    const year = new Date().getFullYear();
    const summary = {
      year,
      vehicles: vehicles.length,
      service: 0,
      fuel: 0,
      tires: 0,
      equipment: 0,
      battery: 0,
      legal: 0,
      next30: 0,
      next90: 0,
      next30Count: 0,
      next90Count: 0,
    };

    for (const vehicle of vehicles) {
      const costs = this._vehicleCostBuckets(vehicle);
      summary.service += costs.service;
      summary.fuel += costs.fuel;
      summary.tires += costs.tires;
      summary.equipment += costs.equipment;
      summary.battery += costs.battery;
      summary.legal += costs.legal;
      for (const item of this._vehicleUpcomingCosts(vehicle, 90)) {
        if (item.days <= 30) {
          summary.next30 += item.cost;
          summary.next30Count += 1;
        }
        summary.next90 += item.cost;
        summary.next90Count += 1;
      }
    }
    summary.yearTotal = summary.service + summary.fuel + summary.tires + summary.equipment + summary.battery + summary.legal;
    return summary;
  }

  _vehicleCostBuckets(vehicle) {
    const attrs = vehicle.attrs || {};
    return {
      service: this._vehicleYearServiceCost(vehicle),
      fuel: this._vehicleYearFuelCost(vehicle),
      tires: this._toNumber(attrs.tire_costs_current_year ?? attrs.tires_costs_current_year ?? attrs.anvelope_costs_current_year),
      equipment: this._toNumber(attrs.equipment_costs_current_year ?? attrs.dotari_costs_current_year),
      battery: this._toNumber(attrs.battery_costs_current_year ?? attrs.baterie_costs_current_year),
      legal: this._toNumber(attrs.legal_costs_current_year ?? attrs.rca_costs_current_year ?? 0),
    };
  }

  _vehicleTotalCost(vehicle) {
    const costs = this._vehicleCostBuckets(vehicle);
    return Object.values(costs).reduce((sum, value) => sum + this._toNumber(value), 0);
  }

  _costsByType(summary) {
    const current = [
      ["Intervenții / service", summary.service],
      ["Combustibil", summary.fuel],
      ["Anvelope", summary.tires],
      ["Dotări", summary.equipment],
      ["Baterie", summary.battery],
      ["Termene legale", summary.legal],
    ].filter(([, value]) => value > 0).map(([label, value]) => ({ label, value }));

    const upcoming = [
      ["Rovinietă", 0],
      ["RCA / CASCO", 0],
      ["ITP", 0],
      ["Revizie / service", 0],
    ];

    // Recalculăm pe baza elementelor upcoming reale, ca să nu depindem de câmpuri agregate.
    const upcomingMap = new Map(upcoming.map(([label, value]) => [label, value]));
    for (const vehicle of this._selectedVehicles()) {
      for (const item of this._vehicleUpcomingCosts(vehicle, 90)) {
        upcomingMap.set(item.group, (upcomingMap.get(item.group) || 0) + item.cost);
      }
    }

    return {
      current,
      upcoming: Array.from(upcomingMap.entries()).filter(([, value]) => value > 0).map(([label, value]) => ({ label, value })),
    };
  }

  _renderCostVehicleCard(vehicle) {
    const costs = this._vehicleCostBuckets(vehicle);
    const total = this._vehicleTotalCost(vehicle);
    const upcoming30 = this._vehicleUpcomingCosts(vehicle, 30).reduce((sum, item) => sum + item.cost, 0);
    const upcoming90 = this._vehicleUpcomingCosts(vehicle, 90).reduce((sum, item) => sum + item.cost, 0);
    if (this._isCompactLayout()) {
      return `
        <article class="cmr-cost-vehicle-card" style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;">
          <header style="display:grid;grid-template-columns:minmax(0,1fr);gap:8px;width:100%;max-width:100%;min-width:0;">
            <div style="min-width:0;max-width:100%;overflow:hidden;"><h4 style="white-space:normal;overflow-wrap:anywhere;max-width:100%;">${this._escape(vehicle.label)}</h4><span>${this._escape(vehicle.plate || vehicle.vin || vehicle.vehicle_id)}</span></div>
            <strong style="white-space:normal;overflow-wrap:anywhere;max-width:100%;">${this._formatMoney(total, 2)}</strong>
          </header>
          <div class="cmr-cost-mini-grid" style="display:grid;grid-template-columns:minmax(0,1fr);gap:10px;width:100%;max-width:100%;min-width:0;">
            ${this._costMini("Intervenții", costs.service)}
            ${this._costMini("Combustibil", costs.fuel)}
            ${this._costMini("Anvelope", costs.tires)}
            ${this._costMini("Dotări", costs.equipment)}
            ${this._costMini("Baterie", costs.battery)}
            ${this._costMini("30 zile", upcoming30)}
            ${this._costMini("90 zile", upcoming90)}
          </div>
        </article>
      `;
    }
    return `
      <article class="cmr-cost-vehicle-card">
        <header>
          <div><h4>${this._escape(vehicle.label)}</h4><span>${this._escape(vehicle.plate || vehicle.vin || vehicle.vehicle_id)}</span></div>
          <strong>${this._formatMoney(total, 2)}</strong>
        </header>
        <div class="cmr-cost-mini-grid">
          ${this._costMini("Intervenții", costs.service)}
          ${this._costMini("Combustibil", costs.fuel)}
          ${this._costMini("Anvelope", costs.tires)}
          ${this._costMini("Dotări", costs.equipment)}
          ${this._costMini("Baterie", costs.battery)}
          ${this._costMini("30 zile", upcoming30)}
          ${this._costMini("90 zile", upcoming90)}
        </div>
      </article>
    `;
  }

  _costMini(label, value) {
    const compactStyle = this._isCompactLayout() ? ' style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;"' : '';
    const strongStyle = this._isCompactLayout() ? ' style="white-space:normal;overflow-wrap:anywhere;max-width:100%;"' : '';
    return `<div${compactStyle}><span>${this._escape(label)}</span><strong${strongStyle}>${this._formatMoney(value, 2)}</strong></div>`;
  }

  _costHeroTile(label, value, helper, icon) {
    return `
      <article class="cmr-cost-hero-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }

  _renderCostTypeBar(item, total) {
    const percent = total > 0 ? Math.max(3, Math.min(100, (item.value / total) * 100)) : 0;
    return `
      <div class="cmr-cost-type-bar">
        <div><strong>${this._escape(item.label)}</strong><span>${this._formatMoney(item.value, 2)}</span></div>
        <i><b style="width:${percent}%"></b></i>
      </div>
    `;
  }

  _upcomingCosts(vehicles, days = 90) {
    return vehicles
      .flatMap((vehicle) => this._vehicleUpcomingCosts(vehicle, days))
      .sort((a, b) => a.days - b.days || b.cost - a.cost);
  }

  _vehicleUpcomingCosts(vehicle, maxDays = 90) {
    const items = [];

    for (const term of this._vehicleLegalTerms(vehicle)) {
      const cost = this._estimatedLegalCost(vehicle, term);
      if (!cost || term.days === null || term.days < 0 || term.days > maxDays) continue;
      items.push({
        label: term.label,
        group: term.key === "rovinieta" ? "Rovinietă" : term.key === "itp" ? "ITP" : "RCA / CASCO",
        vehicle,
        cost,
        days: term.days,
        date: term.expiryText,
        status: term.status || "",
      });
    }

    for (const term of this._vehicleMaintenanceTerms(vehicle)) {
      const cost = this._estimatedMaintenanceCost(vehicle, term);
      if (!cost) continue;
      const days = this._extractDaysFromText(term.valueText);
      if (days === null || days < 0 || days > maxDays) continue;
      items.push({
        label: term.label,
        group: "Revizie / service",
        vehicle,
        cost,
        days,
        date: "",
        status: term.helper || "",
      });
    }

    return items;
  }

  _estimatedLegalCost(vehicle, term) {
    const attrs = vehicle.attrs || {};
    const key = term.key;
    const candidates = [
      attrs[`${key}_estimated_cost`],
      attrs[`${key}_cost`],
      attrs[`${key}_price`],
      key === "rovinieta" ? attrs.rovinieta_estimated_cost_12m : undefined,
      key === "rovinieta" ? 142.16 : undefined,
      key === "itp" ? 0 : undefined,
      key === "rca" ? 0 : undefined,
      key === "casco" ? 0 : undefined,
    ];
    for (const candidate of candidates) {
      const value = this._toNumber(candidate);
      if (value > 0) return value;
    }
    return 0;
  }

  _estimatedMaintenanceCost(vehicle, term) {
    const attrs = vehicle.attrs || {};
    const candidates = [
      attrs.service_estimated_cost,
      attrs.maintenance_estimated_cost,
      attrs.revizie_estimated_cost,
      term.key === "revizie" ? attrs.revizie_generala_estimated_cost : undefined,
    ];
    for (const candidate of candidates) {
      const value = this._toNumber(candidate);
      if (value > 0) return value;
    }
    return 0;
  }

  _extractDaysFromText(text) {
    const match = String(text || "").match(/(-?\d+)\s*zile/i);
    return match ? Number(match[1]) : null;
  }

  _renderUpcomingCost(item) {
    return `
      <article class="cmr-upcoming-cost">
        <div>
          <strong>${this._escape(item.label)}</strong>
          <span>${this._escape(item.vehicle.label)} · în ${item.days} zile${item.date ? ` · ${this._escape(item.date)}` : ""}${item.status ? ` · ${this._escape(item.status)}` : ""}</span>
        </div>
        <strong>${this._formatMoney(item.cost, 2)}</strong>
      </article>
    `;
  }


  _renderStatisticsPage() {
    const vehicles = this._selectedVehicles();
    const summary = this._statisticsSummary(vehicles);
    return `
      <main class="cmr-page cmr-statistics-page">
        <div class="cmr-page-title">
          <span>Statistici</span>
          <h2>Grafice și indicatori</h2>
          <p>Statistici randate nativ în panel, calculate din datele salvate ale fiecărui autovehicul. Cardul Lovelace rămâne separat și nemodificat.</p>
        </div>
        <section class="cmr-statistics-hero">
          ${this._statSummaryTile("Autovehicule analizate", summary.vehicles, this._vehicleFilter === "all" ? "filtru: toate mașinile" : "filtru: mașina selectată", "mdi:car-multiple")}
          ${this._statSummaryTile("Km monitorizați", `${this._formatNumber(summary.currentKm)} km`, "kilometraj curent cumulat", "mdi:speedometer")}
          ${this._statSummaryTile("Consum mediu", summary.averageConsumption ? `${this._formatNumber(summary.averageConsumption, 2)} L/100 km` : "—", "medie pe autovehiculele cu date", "mdi:chart-line")}
          ${this._statSummaryTile("Combustibil an", this._formatMoney(summary.fuelCost), `total ${summary.year}`, "mdi:gas-station")}
        </section>
        <div class="cmr-stack cmr-statistics-stack">
          ${vehicles.map((vehicle) => this._renderVehicleStatistics(vehicle)).join("") || this._empty("Nu există date statistice pentru filtrul selectat.")}
        </div>
      </main>
    `;
  }

  _statisticsSummary(vehicles) {
    const year = new Date().getFullYear();
    const consumptions = vehicles.map((vehicle) => this._vehicleAverageConsumption(vehicle)).filter((value) => value > 0);
    return {
      year,
      vehicles: vehicles.length,
      currentKm: vehicles.reduce((sum, vehicle) => sum + this._vehicleCurrentKm(vehicle), 0),
      fuelCost: vehicles.reduce((sum, vehicle) => sum + this._vehicleYearFuelCost(vehicle), 0),
      serviceCost: vehicles.reduce((sum, vehicle) => sum + this._vehicleYearServiceCost(vehicle), 0),
      averageConsumption: consumptions.length ? consumptions.reduce((sum, value) => sum + value, 0) / consumptions.length : 0,
    };
  }

  _statSummaryTile(label, value, helper, icon) {
    return `
      <article class="cmr-stat-summary-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
        <small>${this._escape(helper)}</small>
      </article>
    `;
  }

  _renderVehicleStatistics(vehicle) {
    const mileage = this._normalizeMileagePoints(vehicle);
    const consumption = this._normalizeConsumptionPoints(vehicle);
    const monthly = this._normalizeMonthlyFuelCosts(vehicle);
    const avg = this._vehicleAverageConsumption(vehicle);
    const km = this._vehicleCurrentKm(vehicle);
    const kmPerDay = this._toNumber(vehicle.statistics?.mileage?.average_km_per_day);
    const kmPerMonth = this._toNumber(vehicle.statistics?.mileage?.average_km_per_month);
    const fuelYear = this._vehicleYearFuelCost(vehicle);
    const serviceYear = this._vehicleYearServiceCost(vehicle);
    const costPerKm = this._vehicleCostPerKm(vehicle);
    return `
      <section class="cmr-stat-card">
        <header class="cmr-stat-head">
          <div>
            <span>Autovehicul</span>
            <h3>${this._escape(vehicle.label)}</h3>
            <small>${this._escape(vehicle.plate || vehicle.vin || vehicle.vehicle_id)}</small>
          </div>
          <div class="cmr-stat-head-meta">
            <span>${mileage.length} puncte km</span>
            <span>${consumption.length} puncte consum</span>
            <span>${monthly.length} luni costuri</span>
          </div>
        </header>
        <div class="cmr-metrics-row">
          <div><span>Km actuali</span><strong>${this._formatNumber(km)} km</strong></div>
          <div><span>Km medii / zi</span><strong>${kmPerDay ? `${this._formatNumber(kmPerDay, 1)} km` : "—"}</strong></div>
          <div><span>Km medii / lună</span><strong>${kmPerMonth ? `${this._formatNumber(kmPerMonth, 0)} km` : "—"}</strong></div>
          <div><span>Consum mediu</span><strong>${avg ? `${this._formatNumber(avg, 2)} L/100 km` : "—"}</strong></div>
          <div><span>Combustibil an</span><strong>${this._formatMoney(fuelYear)}</strong></div>
          <div><span>Service an</span><strong>${this._formatMoney(serviceYear)}</strong></div>
          <div><span>Cost / km ultimul bon</span><strong>${costPerKm ? `${this._formatNumber(costPerKm, 3)} RON/km` : "—"}</strong></div>
        </div>
        <div class="cmr-stat-charts">
          ${this._renderLineChart("Evoluție kilometraj", mileage, { yKey: "value", unit: "km", valueFormatter: (v) => `${this._formatNumber(v)} km` })}
          ${this._renderLineChart("Evoluție consum", consumption, { yKey: "value", unit: "L/100 km", valueFormatter: (v) => `${this._formatNumber(v, 2)} L/100 km` })}
          ${this._renderBarChart("Cost combustibil lunar", monthly, { yKey: "value", unit: "RON", valueFormatter: (v) => this._formatMoney(v) })}
        </div>
        <div class="cmr-stat-footnote">
          <span>Cost / km ultimul bon: ${costPerKm ? `${this._formatNumber(costPerKm, 3)} RON/km` : "—"}</span>
          <span>Datele sunt calculate din kilometraj, bonuri și istoricul salvat local.</span>
        </div>
      </section>
    `;
  }

  _normalizeMileagePoints(vehicle) {
    const source = Array.isArray(vehicle.charts?.mileage) ? vehicle.charts.mileage : [];
    return source
      .map((item) => ({
        label: this._formatDate(item.date),
        sort: this._parseDate(item.date)?.getTime() || 0,
        value: this._toNumber(item.km ?? item.value),
        tooltip: `${this._formatDate(item.date)} · ${this._formatNumber(item.km ?? item.value)} km`,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.sort - b.sort);
  }

  _normalizeConsumptionPoints(vehicle) {
    const chartSource = Array.isArray(vehicle.charts?.consumption) ? vehicle.charts.consumption : [];
    const intervalSource = Array.isArray(vehicle.fuel_intervals) ? vehicle.fuel_intervals : [];
    const source = chartSource.length ? chartSource : intervalSource;
    return source
      .map((item) => {
        const value = this._toNumber(item.consumption ?? item.average_consumption ?? item.value);
        const date = item.date || item.end_date || item.to_date || item.period_end;
        const amount = item.total_cost ?? item.cost ?? item.amount;
        const quantity = item.quantity ?? item.liters;
        const distance = item.distance_km ?? item.km_delta ?? item.interval_km;
        const fromDate = item.start_date || item.from_date || item.period_start;
        const range = fromDate ? `${this._formatDate(fromDate)} — ${this._formatDate(date)}` : this._formatDate(date);
        const extras = [amount ? this._formatMoney(amount) : "", quantity ? `${this._formatNumber(quantity, 2)} L` : "", distance ? `${this._formatNumber(distance)} km` : ""].filter(Boolean).join(" · ");
        return {
          label: this._formatDate(date),
          sort: this._parseDate(date)?.getTime() || 0,
          value,
          tooltip: `${range} · ${this._formatNumber(value, 2)} L/100 km${extras ? ` · ${extras}` : ""}`,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => a.sort - b.sort);
  }

  _normalizeMonthlyFuelCosts(vehicle) {
    const source = Array.isArray(vehicle.charts?.fuel_monthly_costs) ? vehicle.charts.fuel_monthly_costs : [];
    if (source.length) {
      return source.map((item) => ({
        label: this._formatMonth(item.month || item.label),
        value: this._toNumber(item.total ?? item.value ?? item.cost),
        tooltip: `${this._formatMonth(item.month || item.label)} · ${this._formatMoney(item.total ?? item.value ?? item.cost)}`,
      })).filter((item) => item.value > 0);
    }
    const grouped = new Map();
    for (const receipt of vehicle.fuel_receipts || []) {
      const month = String(receipt.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      grouped.set(month, (grouped.get(month) || 0) + this._toNumber(receipt.total_cost ?? receipt.cost ?? receipt.amount));
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ label: this._formatMonth(month), value, tooltip: `${this._formatMonth(month)} · ${this._formatMoney(value)}` }));
  }

  _chartScale(points) {
    const values = points.map((item) => this._toNumber(item.value));
    const minRaw = Math.min(...values);
    const maxRaw = Math.max(...values);
    if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return { min: 0, max: 1, span: 1 };
    if (minRaw === maxRaw) {
      const padding = Math.max(Math.abs(maxRaw) * 0.1, 1);
      return { min: minRaw - padding, max: maxRaw + padding, span: padding * 2 };
    }
    const padding = Math.max((maxRaw - minRaw) * 0.12, 1);
    return { min: minRaw - padding, max: maxRaw + padding, span: (maxRaw - minRaw) + padding * 2 };
  }

  _renderLineChart(title, points, options) {
    if (!points.length) return this._emptyChart(title, "Nu există suficiente date pentru grafic.");
    const width = 1000;
    const height = 260;
    const left = 70;
    const right = 26;
    const top = 28;
    const bottom = 44;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const scale = this._chartScale(points);
    const coords = points.map((point, index) => {
      const x = left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
      const y = top + (1 - ((this._toNumber(point.value) - scale.min) / scale.span)) * innerHeight;
      return { ...point, x, y };
    });
    const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `${left},${height - bottom} ${line} ${left + innerWidth},${height - bottom}`;
    const yTicks = [scale.max, scale.min + scale.span / 2, scale.min];
    return `
      <div class="cmr-chart-card">
        <div class="cmr-chart-title"><strong>${this._escape(title)}</strong><span>${this._escape(points[0].label)} — ${this._escape(points[points.length - 1].label)}</span></div>
        <svg class="cmr-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          ${yTicks.map((tick) => {
            const y = top + (1 - ((tick - scale.min) / scale.span)) * innerHeight;
            return `<line x1="${left}" y1="${y}" x2="${left + innerWidth}" y2="${y}" class="grid"></line><text x="8" y="${y + 4}" class="tick">${this._escape(options.valueFormatter(tick))}</text>`;
          }).join("")}
          <polygon points="${area}" class="area"></polygon>
          <polyline points="${line}" class="line"></polyline>
          ${coords.map((point) => `<g class="chart-point" data-tip="${this._escape(point.tooltip)}"><circle class="hit" cx="${point.x}" cy="${point.y}" r="13"></circle><circle class="dot" cx="${point.x}" cy="${point.y}" r="3.6"></circle><title>${this._escape(point.tooltip)}</title></g>`).join("")}
          <text x="${left}" y="${height - 10}" class="x-label">${this._escape(points[0].label)}</text>
          <text x="${left + innerWidth}" y="${height - 10}" text-anchor="end" class="x-label">${this._escape(points[points.length - 1].label)}</text>
        </svg>
      </div>
    `;
  }

  _renderBarChart(title, points, options) {
    if (!points.length) return this._emptyChart(title, "Nu există costuri de combustibil pentru grafic.");
    const max = Math.max(...points.map((item) => this._toNumber(item.value)), 1);
    return `
      <div class="cmr-chart-card">
        <div class="cmr-chart-title"><strong>${this._escape(title)}</strong><span>${this._escape(options.valueFormatter(max))}</span></div>
        <div class="cmr-bars" style="--count:${points.length};">
          ${points.map((point) => {
            const height = Math.max(8, Math.round((this._toNumber(point.value) / max) * 100));
            return `<div class="cmr-bar-wrap"><div class="cmr-bar" style="height:${height}%" data-tip="${this._escape(point.tooltip)}" title="${this._escape(point.tooltip)}"></div><span>${this._escape(point.label)}</span></div>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  _emptyChart(title, message) {
    return `<div class="cmr-chart-card empty"><strong>${this._escape(title)}</strong><p>${this._escape(message)}</p></div>`;
  }

  _empty(message) {
    return `<div class="cmr-empty">${this._escape(message)}</div>`;
  }

  _renderVehiclesPage() {
    const vehicles = this._selectedVehicles();
    const allVehicles = this._buildVehicles();
    const inactiveVehicles = this._inactiveVehicles();
    const summary = this._vehiclesSummary(vehicles);

    return `
      <main class="cmr-page cmr-vehicles-page">
        <div class="cmr-page-title">
          <span>Mașini</span>
          <h2>Administrare autovehicule</h2>
          <p>Profiluri auto randate nativ în panel: identificare, kilometraj, revizie, termene legale și acces rapid la modulele aferente.</p>
        </div>

        <section class="cmr-vehicles-hero">
          ${this._statSummaryTile("Autovehicule afișate", summary.vehicles, this._vehicleFilter === "all" ? `${allVehicles.length} total în integrare` : "filtru pe mașina selectată", "mdi:car-multiple")}
          ${this._statSummaryTile("Kilometraj total", `${this._formatNumber(summary.currentKm)} km`, "sumă kilometraj curent", "mdi:speedometer")}
          ${this._statSummaryTile("Revizii critice", summary.maintenanceCritical, "depășite sau scadente", "mdi:wrench-clock")}
          ${this._statSummaryTile("Termene critice", summary.legalCritical, "RCA / ITP / rovinietă / CASCO", "mdi:shield-alert-outline")}
        </section>

        <section class="cmr-vehicles-toolbar">
          <div>
            <strong>${this._vehicleFilter === "all" ? "Toate autovehiculele" : "Autovehicul selectat"}</strong>
            <span>${vehicles.length} ${vehicles.length === 1 ? "mașină afișată" : "mașini afișate"}</span>
          </div>
          <div class="cmr-toolbar-actions">
            <button type="button" data-action="toggle-vehicle-add">${this._vehicleAddOpen ? "Închide adăugarea" : "Adaugă autovehicul"}</button>
            <button data-tab="overview">Înapoi la Acasă</button>
            <button data-tab="settings">Setări integrare</button>
          </div>
        </section>

        ${this._vehicleAddOpen ? this._renderVehicleAddForm() : ""}
        ${this._vehicleAddMessage ? `<div class="cmr-admin-message">${this._escape(this._vehicleAddMessage)}</div>` : ""}
        ${inactiveVehicles.length ? this._renderInactiveVehiclesSection(inactiveVehicles) : ""}

        <div class="cmr-vehicles-list">
          ${vehicles.map((vehicle) => this._renderVehicleAdminCard(vehicle)).join("") || this._empty("Nu există autovehicule pentru filtrul selectat.")}
        </div>
      </main>
    `;
  }

  _vehiclesSummary(vehicles) {
    return {
      vehicles: vehicles.length,
      currentKm: vehicles.reduce((sum, vehicle) => sum + this._vehicleCurrentKm(vehicle), 0),
      maintenanceCritical: vehicles.reduce((sum, vehicle) => sum + this._vehicleMaintenanceTerms(vehicle).filter((item) => item.level === "critical").length, 0),
      legalCritical: vehicles.reduce((sum, vehicle) => sum + this._vehicleLegalTerms(vehicle).filter((item) => item.level === "critical").length, 0),
    };
  }

  _renderInactiveVehiclesSection(vehicles) {
    return `
      <section class="cmr-inactive-vehicles">
        <div class="cmr-admin-section-title">
          <ha-icon icon="mdi:car-off"></ha-icon>
          <strong>Autovehicule dezactivate</strong>
        </div>
        <p>Aceste mașini sunt ascunse din dashboard și nu generează notificări. Le poți reactiva oricând.</p>
        <div class="cmr-inactive-vehicles-list">
          ${vehicles.map((vehicle) => `
            <article class="cmr-inactive-vehicle-card">
              <div>
                <strong>${this._escape(vehicle.label || vehicle.vehicle_id)}</strong>
                <span>${this._escape(vehicle.plate || "fără număr")}${vehicle.vin ? ` · VIN: ${this._escape(vehicle.vin)}` : ""}</span>
              </div>
              <button type="button" data-action="restore-vehicle" data-vehicle="${this._escape(vehicle.vehicle_id)}" data-vehicle-label="${this._escape(vehicle.label || vehicle.plate || vehicle.vehicle_id)}" ${this._vehicleDeleteBusy === vehicle.vehicle_id ? "disabled" : ""}>${this._vehicleDeleteBusy === vehicle.vehicle_id ? "Se reactivează..." : "Reactivează"}</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  _renderVehicleAdminCard(vehicle) {
    const km = this._vehicleCurrentKm(vehicle);
    const avg = this._vehicleAverageConsumption(vehicle);
    const fuel = this._vehicleYearFuelCost(vehicle);
    const service = this._vehicleYearServiceCost(vehicle);
    const alerts = this._vehicleAlerts(vehicle);
    const legalTerms = this._vehicleLegalTerms(vehicle);
    const maintenanceTerms = this._vehicleMaintenanceTerms(vehicle);
    const statusClass = alerts.some((item) => item.level === "critical") ? "is-critical" : alerts.length ? "is-warning" : "is-ok";
    const vin = vehicle.vin || vehicle.attrs?.vin || "";
    const plate = vehicle.plate || vehicle.attrs?.license_plate || "";
    const vehicleKey = vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label || "";
    const editOpen = this._vehicleEditOpen.has(vehicleKey);
    const editMessage = this._vehicleEditMessage[vehicleKey] || "";
    return `
      <article class="cmr-admin-vehicle-card ${statusClass}">
        <header class="cmr-admin-vehicle-head">
          <div>
            <span>Autovehicul</span>
            <h3>${this._escape(vehicle.label)}</h3>
            <small>${this._escape(plate || vehicle.vehicle_id)}${vin ? ` · VIN: ${this._escape(vin)}` : ""}</small>
          </div>
          <div class="cmr-admin-status">
            <strong>${statusClass === "is-critical" ? "Critic" : statusClass === "is-warning" ? "Atenție" : "OK"}</strong>
            <span>${alerts.length ? `${alerts.length} elemente de urmărit` : "fără alerte active"}</span>
            <button type="button" data-action="toggle-vehicle-edit" data-vehicle="${this._escape(vehicleKey)}">${editOpen ? "Închide editarea" : "Editează mașina"}</button>
            <button type="button" class="secondary" data-action="deactivate-vehicle" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-label="${this._escape(vehicle.label || plate || vehicleKey)}" ${this._vehicleDeleteBusy === vehicleKey ? "disabled" : ""}>${this._vehicleDeleteBusy === vehicleKey ? "Se dezactivează..." : "Dezactivează"}</button>
            <button type="button" class="danger" data-action="delete-vehicle-permanently" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-label="${this._escape(vehicle.label || plate || vehicleKey)}" ${this._vehicleDeleteBusy === vehicleKey ? "disabled" : ""}>${this._vehicleDeleteBusy === vehicleKey ? "Se șterge..." : "Șterge definitiv"}</button>
          </div>
        </header>

        ${editOpen ? this._renderVehicleEditForm(vehicle, vehicleKey) : ""}
        ${editMessage ? `<div class="cmr-admin-message">${this._escape(editMessage)}</div>` : ""}

        <div class="cmr-admin-profile-grid">
          ${this._adminInfoTile("Număr", plate || "—", "mdi:card-account-details-outline")}
          ${this._adminInfoTile("VIN", vin || "—", "mdi:barcode-scan")}
          ${this._adminInfoTile("Km actuali", `${this._formatNumber(km)} km`, "mdi:speedometer")}
          ${this._adminInfoTile("Consum mediu", avg ? `${this._formatNumber(avg, 2)} L/100 km` : "—", "mdi:chart-line")}
          ${this._adminInfoTile("Combustibil an", this._formatMoney(fuel), "mdi:gas-station")}
          ${this._adminInfoTile("Service an", this._formatMoney(service), "mdi:wrench")}
        </div>

        <div class="cmr-admin-sections">
          <section>
            <div class="cmr-admin-section-title"><ha-icon icon="mdi:wrench-clock"></ha-icon><strong>Revizie rapidă</strong></div>
            ${maintenanceTerms.length ? `<div class="cmr-admin-chip-grid one">${maintenanceTerms.map((term) => this._renderVehicleMaintenanceChip(term)).join("")}</div>` : `<div class="cmr-admin-empty">Revizia generală nu este configurată.</div>`}
          </section>

          <section>
            <div class="cmr-admin-section-title"><ha-icon icon="mdi:shield-check"></ha-icon><strong>Termene legale</strong></div>
            ${legalTerms.length ? `<div class="cmr-admin-chip-grid">${legalTerms.map((term) => this._renderVehicleLegalChip(term)).join("")}</div>` : `<div class="cmr-admin-empty">RCA, ITP și rovinieta nu sunt configurate.</div>`}
          </section>

          ${this._renderAdminMaintenanceTable(vehicle)}
          ${this._vehicleFeatureEnabled(vehicle, "feature_fuel") ? this._renderAdminFuelDetails(vehicle) : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_statistics") ? this._renderAdminUsageStats(vehicle) : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_consumables") ? this._renderAdminConsumables(vehicle) : ""}
          ${this._renderAdminServiceHistory(vehicle)}

          <section>
            <div class="cmr-admin-section-title"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><strong>Atenționări</strong></div>
            ${alerts.length ? `<div class="cmr-admin-alerts">${alerts.slice(0, 5).map((item) => `<span class="${item.level}">${this._escape(item.label)} · ${this._escape(item.summary)}</span>`).join("")}</div>` : `<div class="cmr-admin-ok"><ha-icon icon="mdi:check-circle-outline"></ha-icon> Nu sunt atenționări active.</div>`}
          </section>
        </div>

        <footer class="cmr-admin-actions">
          ${this._vehicleFeatureEnabled(vehicle, "feature_statistics") ? `<button data-tab="statistics" data-vehicle="${this._escape(vehicle.vehicle_id)}">Statistici</button>` : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_fuel") ? `<button data-tab="fuel" data-vehicle="${this._escape(vehicle.vehicle_id)}">Combustibil</button>` : ""}
          ${this._vehicleFeatureEnabled(vehicle, "feature_costs") ? `<button data-tab="costs" data-vehicle="${this._escape(vehicle.vehicle_id)}">Costuri</button>` : ""}
          <button data-tab="settings" data-vehicle="${this._escape(vehicle.vehicle_id)}">Setări</button>
        </footer>
      </article>
    `;
  }



  _renderVehicleAddForm() {
    const busy = this._vehicleAddBusy;
    const fuelProfileOptionsHtml = [
      ["gasoline", "Benzină"],
      ["diesel", "Motorină"],
      ["lpg", "GPL"],
      ["electric", "Electric"],
      ["hybrid_gasoline", "Hibrid benzină"],
      ["hybrid_diesel", "Hibrid motorină"],
      ["phev_gasoline", "Plug-in hybrid benzină"],
      ["phev_diesel", "Plug-in hybrid motorină"],
    ].map(([value, label]) => `<option value="${value}" ${value === "diesel" ? "selected" : ""}>${this._escape(label)}</option>`).join("");

    return `
      <form class="cmr-admin-service-form cmr-admin-edit-form cmr-admin-full-vehicle-form" data-form="vehicle-add">
        <div class="cmr-admin-help">
          Adaugă manual un autovehicul. După salvare, integrarea se reîncarcă pentru crearea dispozitivului și a entităților aferente.
        </div>
        ${this._renderVehicleEditSection("Adăugare autovehicul", `
          <label class="wide"><span>Nume autovehicul</span><input type="text" name="name" autocomplete="off" placeholder="ex. Opel Insignia"></label>
          <label><span>Număr înmatriculare</span><input type="text" name="license_plate" autocomplete="off" placeholder="ex. SB99NOI"></label>
          <label><span>VIN / serie șasiu</span><input type="text" name="vin" autocomplete="off" placeholder="17 caractere"></label>
          <label><span>Kilometraj actual</span><input type="number" name="km" min="0" step="1" value="0"></label>
          <label><span>Motorizare</span><select name="fuel_profile">${fuelProfileOptionsHtml}</select></label>
          <label><span>Țară înmatriculare</span><input type="text" name="registration_country" autocomplete="off" value="România" placeholder="România"></label>
          <label><span>Serie talon</span><input type="text" name="registration_certificate" autocomplete="off" placeholder="opțional"></label>
        `)}
        <div class="cmr-admin-form-actions">
          <button type="submit" ${busy ? "disabled" : ""}>${busy ? "Se adaugă..." : "Adaugă autovehicul"}</button>
          <button type="button" class="secondary" data-action="cancel-vehicle-add">Renunță</button>
        </div>
      </form>
    `;
  }


  _renderVehicleEditForm(vehicle, vehicleKey) {
    const draft = this._vehicleEditDrafts[vehicleKey] || {};
    const attrs = vehicle.attrs || {};
    const busy = this._vehicleEditBusy === vehicleKey;
    const name = draft.name ?? vehicle.label ?? vehicle.name ?? "";
    const plate = draft.license_plate ?? vehicle.plate ?? attrs.license_plate ?? attrs.numar_inmatriculare ?? "";
    const vin = draft.vin ?? vehicle.vin ?? attrs.vin ?? attrs.serie_sasiu ?? "";
    const km = draft.km ?? this._vehicleCurrentKm(vehicle) ?? attrs.current_km ?? attrs.km_actuali ?? 0;
    const country = draft.registration_country ?? attrs.registration_country ?? attrs.country ?? attrs.tara_inmatriculare ?? "România";
    const certificate = draft.registration_certificate ?? attrs.registration_certificate ?? attrs.serie_talon ?? attrs.certificate_number ?? "";
    const fuelProfile = draft.fuel_profile ?? attrs.fuel_profile ?? attrs.motorizare ?? "diesel";
    const normalizedFuelProfile = this._normalizeFuelProfile(fuelProfile);
    const fuelProfileOptionsHtml = [
      ["gasoline", "Benzină"],
      ["diesel", "Motorină"],
      ["lpg", "GPL"],
      ["electric", "Electric"],
      ["hybrid_gasoline", "Hibrid benzină"],
      ["hybrid_diesel", "Hibrid motorină"],
      ["phev_gasoline", "Plug-in hybrid benzină"],
      ["phev_diesel", "Plug-in hybrid motorină"],
    ].map(([value, label]) => `<option value="${value}" ${value === normalizedFuelProfile ? "selected" : ""}>${this._escape(label)}</option>`).join("");

    return `
      <form class="cmr-admin-service-form cmr-admin-edit-form cmr-admin-full-vehicle-form" data-form="vehicle-edit" data-vehicle="${this._escape(vehicleKey)}">
        <div class="cmr-admin-help">
          Editează datele autovehiculului direct din dashboard. ID-ul intern rămâne neschimbat, astfel încât istoricul, costurile și reviziile existente să nu fie pierdute.
        </div>

        ${this._renderVehicleEditSection("Date autovehicul", `
          <label class="wide"><span>Nume autovehicul</span><input type="text" name="name" autocomplete="off" value="${this._escape(name)}" placeholder="ex. Opel Insignia"></label>
          <label><span>Număr înmatriculare</span><input type="text" name="license_plate" autocomplete="off" value="${this._escape(plate)}" placeholder="ex. SB99NOI"></label>
          <label><span>VIN / serie șasiu</span><input type="text" name="vin" autocomplete="off" value="${this._escape(vin)}" placeholder="17 caractere"></label>
          <label><span>Kilometraj actual</span><input type="number" name="km" min="0" step="1" value="${this._escape(km)}"></label>
          <label><span>Motorizare</span><select name="fuel_profile">${fuelProfileOptionsHtml}</select></label>
          <label><span>Țară înmatriculare</span><input type="text" name="registration_country" autocomplete="off" value="${this._escape(country)}" placeholder="România"></label>
          <label><span>Serie talon</span><input type="text" name="registration_certificate" autocomplete="off" value="${this._escape(certificate)}" placeholder="opțional"></label>
        `)}

        ${this._renderVehicleFeatureEditSection(vehicle)}
        ${this._vehicleFeatureEnabled(vehicle, "feature_maintenance") ? this._renderMaintenanceEditSections(vehicle) : ""}
        ${this._renderLegalEditSections(vehicle)}
        ${this._vehicleFeatureEnabled(vehicle, "feature_consumables") ? this._renderConsumablesEditSection(vehicle) : ""}

        <div class="cmr-admin-form-actions">
          <button type="submit" ${busy ? "disabled" : ""}>${busy ? "Se salvează..." : "Salvează toate modificările"}</button>
          <button type="button" class="secondary" data-action="cancel-vehicle-edit" data-vehicle="${this._escape(vehicleKey)}">Renunță</button>
        </div>
      </form>
    `;
  }

  _renderVehicleEditSection(title, content) {
    return `
      <fieldset class="cmr-admin-edit-section">
        <legend>${this._escape(title)}</legend>
        <div class="cmr-admin-form-grid">${content}</div>
      </fieldset>
    `;
  }

  _renderVehicleFeatureEditSection(vehicle) {
    const options = this._vehicleFeatureOptions(vehicle);
    const globalOptions = this._featureOptionsForForm();
    const content = this._vehicleFeatureOptionDefinitions().map(([key, label, helper]) => {
      const globallyEnabled = globalOptions[key] !== false;
      const checked = options[key] !== false && globallyEnabled;
      const disabledNote = globallyEnabled ? "" : " Modulul este dezactivat global în Setări.";
      return `
        <label class="cmr-admin-feature-toggle">
          <input type="checkbox" name="vehicle_feature_options__${this._escape(key)}" ${checked ? "checked" : ""} ${globallyEnabled ? "" : "disabled"}>
          <span>
            <strong>${this._escape(label)}</strong>
            <small>${this._escape(helper || "Afișare și notificări pentru acest autovehicul.")}${this._escape(disabledNote)}</small>
          </span>
        </label>
      `;
    }).join("");
    return this._renderVehicleEditSection("Funcționalități active pentru acest autovehicul", content);
  }

  _renderMaintenanceEditSections(vehicle) {
    const groups = [
      { key: "service", title: "Revizie generală", terms: ["revizie"], withKm: true },
      { key: "gearbox_oil", title: "Ulei cutie viteze", terms: ["ulei", "cutie"], withKm: true },
      { key: "timing_belt", title: "Distribuție", terms: ["distribu"], withKm: true },
      { key: "brake_fluid", title: "Lichid frână", terms: ["lichid", "fr"], withKm: false },
      { key: "coolant", title: "Lichid antigel", terms: ["antigel"], withKm: false },
    ];

    return groups.map((group) => {
      const kmFields = group.withKm ? `
        <label><span>Ultimul schimb km</span><input type="number" name="maintenance__${group.key}__last_km" min="0" step="1" value="${this._escape(this._vehicleEditNumber(vehicle, group.terms.concat(["ultimul", "schimb", "km"])))}"></label>
        <label><span>Interval km</span><input type="number" name="maintenance__${group.key}__interval_km" min="0" step="1" value="${this._escape(this._vehicleEditNumber(vehicle, group.terms.concat(["interval", "km"])))}"></label>
      ` : "";
      return this._renderVehicleEditSection(group.title, `
        <label><span>Ultima dată</span><input type="date" name="maintenance__${group.key}__last_date" value="${this._escape(this._vehicleEditDate(vehicle, group.terms.concat(["ultima", "data"])))}"></label>
        ${kmFields}
        <label><span>Interval zile</span><input type="number" name="maintenance__${group.key}__interval_days" min="0" step="1" value="${this._escape(this._vehicleEditNumber(vehicle, group.terms.concat(["interval", "zile"])))}"></label>
        <label><span>Cost estimat</span><input type="number" name="maintenance__${group.key}__cost" min="0" step="0.01" value="${this._escape(this._vehicleEditNumber(vehicle, group.terms.concat(["cost", "estimat"])))}"></label>
      `);
    }).join("");
  }

  _renderLegalEditSections(vehicle) {
    const groups = [
      { key: "rca", title: "RCA", terms: ["rca"], fields: [["insurer", "Asigurător"], ["policy_number", "Număr poliță"], ["notes", "Observații"]] },
      { key: "casco", title: "CASCO", terms: ["casco"], fields: [["insurer", "Asigurător"], ["policy_number", "Număr poliță"], ["coverage", "Acoperire"], ["notes", "Observații"]] },
      { key: "itp", title: "ITP", terms: ["itp"], fields: [["station", "Stație"], ["report_number", "Număr raport"], ["notes", "Observații"]] },
      { key: "rovinieta", title: "Rovinietă", terms: ["roviniet"], fields: [] },
    ];

    return groups.filter((group) => this._vehicleFeatureEnabled(vehicle, this._featureByLegalType(group.key))).map((group) => {
      const textFields = group.fields.map(([field, label]) => `
        <label><span>${this._escape(label)}</span><input type="text" name="legal_terms__${group.key}__${field}" autocomplete="off" value="${this._escape(this._vehicleEditText(vehicle, group.terms.concat(this._legalTextTerms(field)), this._legalTextExcludeTerms(field)))}"></label>
      `).join("");
      const sourceField = ["itp", "rovinieta"].includes(group.key) ? this._renderLegalSourceSelect(group.key, vehicle) : "";
      return this._renderVehicleEditSection(group.title, `
        <label><span>Cost estimat</span><input type="number" name="legal_terms__${group.key}__cost" min="0" step="0.01" value="${this._escape(this._vehicleEditNumber(vehicle, group.terms.concat(["cost", "estimat"])))}"></label>
        <label><span>Începe la</span><input type="date" name="legal_terms__${group.key}__start_date" value="${this._escape(this._vehicleEditDate(vehicle, group.terms.concat(["incepe", "la"])))}"></label>
        <label><span>Expiră la</span><input type="date" name="legal_terms__${group.key}__end_date" value="${this._escape(this._vehicleEditDate(vehicle, group.terms.concat(["expira", "la"])))}"></label>
        ${sourceField}
        ${textFields}
      `);
    }).join("");
  }

  _renderLegalSourceSelect(key, vehicle) {
    const isItp = key === "itp";
    const selected = isItp
      ? this._normalizeItpSourceValue(this._itpSourceFromVehicle(vehicle))
      : this._normalizeRovinietaSourceValue(this._rovinietaSourceFromVehicle(vehicle));
    const options = isItp
      ? [["manual", "manual"], ["RAR AutoPass", "RAR AutoPass"]]
      : [["erovinieta.ro", "CNAIR / erovinieta.ro"], ["e-rovinieta.ro", "e-rovinieta.ro"], ["manual", "manual"]];
    const label = isItp ? "Sursă date ITP" : "Sursă date rovinietă";
    const hint = isItp
      ? "Arată de unde provine data afișată pentru ITP. Dacă modifici manual ITP-ul, poți seta sursa pe manual."
      : "Arată de unde provine data afișată pentru rovinietă. Dacă modifici manual rovinieta, poți seta sursa pe manual.";
    return `
      <label class="wide"><span>${this._escape(label)}</span><select name="legal_terms__${this._escape(key)}__source">
        ${options.map(([value, label]) => `<option value="${this._escape(value)}" ${value === selected ? "selected" : ""}>${this._escape(label)}</option>`).join("")}
      </select><small class="cmr-field-hint">${this._escape(hint)}</small></label>
    `;
  }

  _renderRovinietaSourceSelect(vehicle) {
    return this._renderLegalSourceSelect("rovinieta", vehicle);
  }

  _renderConsumablesEditSection(vehicle) {
    const fields = [
      ["engine_oil_capacity", "Cantitate ulei motor", ["cantitate", "ulei", "motor"], []],
      ["engine_oil", "Ulei motor", ["ulei", "motor"], ["cantitate", "cutie"]],
      ["oil_filter", "Filtru ulei", ["filtru", "ulei"], []],
      ["air_filter", "Filtru aer", ["filtru", "aer"], []],
      ["fuel_filter", "Filtru combustibil", ["filtru", "combustibil"], []],
      ["cabin_filter", "Filtru habitaclu / aer condiționat", ["filtru", "habitaclu"], []],
      ["gearbox_oil", "Ulei cutie viteze", ["ulei", "cutie"], ["ultima", "interval", "cost"]],
      ["brake_fluid", "Lichid frână", ["lichid", "frana"], ["ultima", "interval", "cost"]],
      ["coolant", "Lichid antigel", ["lichid", "antigel"], ["ultima", "interval", "cost"]],
      ["timing_kit", "Kit distribuție", ["kit", "distributie"], []],
    ];
    const content = fields.map(([key, label, terms, exclude]) => `
      <label><span>${this._escape(label)}</span><input type="text" name="consumables__${key}" autocomplete="off" value="${this._escape(this._vehicleEditText(vehicle, terms, exclude))}"></label>
    `).join("");
    return this._renderVehicleEditSection("Consumabile", content);
  }

  _vehicleEditValue(vehicle, terms, excludeTerms = []) {
    const value = this._findEntityValue(vehicle, terms, excludeTerms);
    if (value !== null && value !== undefined) return value;
    const attrs = vehicle.attrs || {};
    const normalizedTerms = terms.map((term) => this._normalize(term)).filter(Boolean);
    const normalizedExcludes = excludeTerms.map((term) => this._normalize(term)).filter(Boolean);
    for (const [key, raw] of Object.entries(attrs)) {
      const name = this._normalize(key);
      if (normalizedTerms.every((term) => name.includes(term)) && !normalizedExcludes.some((term) => name.includes(term))) {
        if (raw !== null && raw !== undefined && raw !== "unknown" && raw !== "unavailable") return raw;
      }
    }
    return "";
  }

  _vehicleEditText(vehicle, terms, excludeTerms = []) {
    const value = this._vehicleEditValue(vehicle, terms, excludeTerms);
    return value === null || value === undefined ? "" : String(value);
  }

  _vehicleEditDate(vehicle, terms, excludeTerms = []) {
    return this._formatDateInputValue(this._vehicleEditText(vehicle, terms, excludeTerms));
  }

  _vehicleEditNumber(vehicle, terms, excludeTerms = []) {
    const value = this._vehicleEditValue(vehicle, terms, excludeTerms);
    const number = this._toNumber(value);
    return Number.isFinite(number) ? number : 0;
  }

  _legalTextTerms(field) {
    const map = {
      insurer: ["asigurator"],
      policy_number: ["numar", "polita"],
      coverage: ["acoperire"],
      station: ["statie"],
      report_number: ["numar", "raport"],
      notes: ["observatii"],
    };
    return map[field] || [field];
  }

  _legalTextExcludeTerms(field) {
    if (field === "policy_number") return ["raport"];
    if (field === "report_number") return ["polita"];
    return [];
  }

  _renderAdminMaintenanceTable(vehicle) {
    const rows = this._adminMaintenanceRows(vehicle);
    if (!rows.length) return "";
    return `
      <section>
        <div class="cmr-admin-section-title"><ha-icon icon="mdi:car-wrench"></ha-icon><strong>Mentenanță</strong></div>
        <div class="cmr-admin-table">
          ${rows.map((row) => `
            <div class="cmr-admin-row ${row.level}">
              <strong>${this._escape(row.label)}</strong>
              <span>${this._escape(row.status || "—")}</span>
              <small>${this._escape(row.daysText)} ${row.kmText ? `· ${this._escape(row.kmText)}` : ""}</small>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  _adminMaintenanceRows(vehicle) {
    const groups = [
      { key: "revizie", label: "Revizie generală", terms: ["revizie"] },
      { key: "ulei_cutie", label: "Ulei cutie viteze", terms: ["ulei", "cutie"] },
      { key: "distributie", label: "Distribuție", terms: ["distribu"] },
      { key: "lichid_frana", label: "Lichid frână", terms: ["lichid", "fr"] },
      { key: "antigel", label: "Lichid antigel", terms: ["antigel"] },
    ];

    return groups.map((group) => {
      const status = this._findEntityValue(vehicle, group.terms.concat(["status"])) || "";
      const days = this._findEntityNumber(vehicle, group.terms.concat(["zile", "ramase"]))
        ?? this._findEntityNumber(vehicle, group.terms.concat(["zile"]));
      const km = this._findEntityNumber(vehicle, group.terms.concat(["km", "ramasi"]), ["actuali", "interval", "ultim"])
        ?? this._findEntityNumber(vehicle, group.terms.concat(["km"]), ["actuali", "interval", "ultim"]);

      if (!status && days === null && km === null) return null;

      const level = this._maintenanceLevel(status, days, km);
      return {
        label: group.label,
        status: status || (level === "critical" ? "depășit" : "ok"),
        daysText: days === null ? "—" : `${Math.abs(days)} zile${days < 0 ? " depășite" : ""}`,
        kmText: km === null ? "" : `${this._formatNumber(Math.abs(km))} km${km < 0 ? " depășiți" : ""}`,
        level,
      };
    }).filter(Boolean);
  }

  _maintenanceLevel(status, days, km) {
    const text = this._normalize(status);
    if (text.includes("depasit") || text.includes("critic") || (days !== null && days <= 0) || (km !== null && km <= 0)) return "critical";
    if (text.includes("atentie") || text.includes("warning") || (days !== null && days <= 30) || (km !== null && km <= 1000)) return "warning";
    return "ok";
  }

  _renderAdminFuelDetails(vehicle) {
    const fuel = vehicle.statistics?.fuel || {};
    const currentYear = this._vehicleYearFuelCost(vehicle);
    const currentMonth = this._toNumber(fuel.current_month_cost ?? vehicle.attrs?.fuel_current_month_cost ?? vehicle.attrs?.combustibil_luna_curenta)
      || this._findEntityNumber(vehicle, ["combustibil", "luna", "curenta"]) || 0;
    const avg = this._vehicleAverageConsumption(vehicle);
    const rows = [
      ["An curent", this._formatMoney(currentYear)],
      ["Luna curentă", this._formatMoney(currentMonth)],
      ["Consum mediu", avg ? `${this._formatNumber(avg, 2)} L/100 km` : "—"],
    ];
    return this._renderAdminRowsSection("Combustibil", "mdi:gas-station", rows);
  }

  _renderAdminUsageStats(vehicle) {
    const stats = vehicle.statistics || {};
    const fuel = stats.fuel || {};
    const mileage = stats.mileage || {};
    const rows = [
      ["Km medii / zi", this._toNumber(mileage.average_km_per_day) ? `${this._formatNumber(mileage.average_km_per_day, 1)} km` : "—"],
      ["Km medii / lună", this._toNumber(mileage.average_km_per_month) ? `${this._formatNumber(mileage.average_km_per_month, 0)} km` : "—"],
      ["Combustibil anul curent", this._formatMoney(this._vehicleYearFuelCost(vehicle))],
      ["Service anul curent", this._formatMoney(this._vehicleYearServiceCost(vehicle))],
      ["Consum mediu", this._vehicleAverageConsumption(vehicle) ? `${this._formatNumber(this._vehicleAverageConsumption(vehicle), 2)} L/100 km` : "—"],
      ["Ultimul consum calculat", this._toNumber(fuel.last_consumption_l_100km) ? `${this._formatNumber(fuel.last_consumption_l_100km, 2)} L/100 km` : "—"],
    ];
    return this._renderAdminRowsSection("Statistici utilizare", "mdi:chart-timeline-variant", rows);
  }

  _renderAdminConsumables(vehicle) {
    const rows = this._vehicleConsumableRows(vehicle);
    if (!rows.length) return "";
    return this._renderAdminRowsSection("Consumabile și specificații", "mdi:filter-cog-outline", rows);
  }

  _vehicleConsumableRows(vehicle) {
    const entities = Array.isArray(vehicle.entities) ? vehicle.entities : [];
    return entities
      .filter((entity) => entity.entityId?.startsWith("text."))
      .map((entity) => {
        const label = this._specLabel(this._friendly(entity.entityId, entity.stateObj));
        const value = entity.stateObj?.state;
        return [label, value && value !== "unknown" && value !== "unavailable" ? value : "—"];
      })
      .filter(([label, value]) => label && value && value !== "—")
      .filter(([label]) => this._isConsumableLabel(label))
      .slice(0, 20);
  }

  _isConsumableLabel(label) {
    const text = this._normalize(label);
    return [
      "ulei", "filtru", "kit distributie", "distributie", "lichid", "antigel", "frana",
      "cantitate", "atf", "dex", "dot 4", "motor"
    ].some((term) => text.includes(term));
  }

  _specLabel(label) {
    return this._shortLabel(label)
      .replace(/^[^-]+-\s*/i, "")
      .replace(/^specificații\s*/i, "")
      .replace(/^specificatii\s*/i, "")
      .replace(/^consumabile\s*/i, "")
      .trim();
  }

  _renderAdminServiceHistory(vehicle) {
    const records = Array.isArray(vehicle.service_history) ? vehicle.service_history : [];
    const vehicleKey = vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label || "";
    const open = this._serviceFormOpen.has(vehicleKey);
    const message = this._serviceRecordMessage[vehicleKey] || "";
    const rows = records.slice(0, 8).map((record) => this._renderAdminServiceRecord(record, vehicleKey)).join("");
    return `
      <section>
        <div class="cmr-admin-section-title">
          <ha-icon icon="mdi:history"></ha-icon><strong>Istoric intervenții</strong>
          <button type="button" data-action="toggle-service-form" data-vehicle="${this._escape(vehicleKey)}">${open ? "Închide" : "Adaugă"}</button>
        </div>
        ${open ? this._renderServiceRecordForm(vehicle, vehicleKey) : ""}
        ${message ? `<div class="cmr-admin-message">${this._escape(message)}</div>` : ""}
        ${rows ? `<div class="cmr-admin-history">${rows}</div>` : `<div class="cmr-admin-empty">Nu există intervenții salvate.</div>`}
      </section>
    `;
  }


  _renderAdminServiceRecord(record, vehicleKey) {
    const recordId = record.record_id || "";
    const title = record.title || record.record_type_label || this._recordTypeLabel(record.record_type);
    const meta = [
      this._formatDate(record.date),
      record.km ? `${this._formatNumber(record.km)} km` : "",
      record.service_name || "",
      record.cost ? this._formatMoney(record.cost) : "",
    ].filter(Boolean).join(" · ");
    const notes = record.notes || record.description || "";
    const restored = Boolean(record.restored);
    const editOpen = recordId && this._serviceRecordEditOpen.has(recordId);
    const canRestore = recordId && record.update_maintenance && !restored;
    const badge = restored ? "restaurată" : record.update_maintenance ? "aplicată" : "istoric";

    if (this._isCompactLayout()) {
      return `
        <article class="cmr-admin-history-record ${restored ? "is-restored" : ""}" style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;">
          <div class="cmr-admin-history-main" style="min-width:0;max-width:100%;overflow:hidden;">
            <strong style="display:block;white-space:normal;overflow-wrap:anywhere;max-width:100%;">${this._escape(title)} <em>${this._escape(badge)}</em></strong>
            <span style="display:block;white-space:normal;overflow-wrap:anywhere;max-width:100%;">${this._escape(meta || this._recordTypeLabel(record.record_type))}</span>
            ${notes ? `<p style="white-space:pre-line;overflow-wrap:anywhere;max-width:100%;">${this._escape(notes)}</p>` : ""}
            ${editOpen ? this._renderServiceRecordEditForm(record, vehicleKey) : ""}
          </div>
          <div class="cmr-admin-history-actions" style="display:grid;grid-template-columns:minmax(0,1fr);gap:8px;width:100%;max-width:100%;min-width:0;">
            ${canRestore ? `<button type="button" style="width:100%;" data-action="restore-service-record" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}">Restore</button>` : ""}
            ${recordId ? `<button type="button" style="width:100%;" data-action="toggle-edit-service-record" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}">${editOpen ? "Închide" : "Editează"}</button>` : ""}
            ${recordId ? `<button type="button" style="width:100%;" class="danger" data-action="delete-service-record" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}" data-record-title="${this._escape(title)}" data-updates-maintenance="${record.update_maintenance ? "1" : "0"}" data-restored="${restored ? "1" : "0"}">Șterge</button>` : ""}
          </div>
        </article>
      `;
    }
    return `
      <article class="cmr-admin-history-record ${restored ? "is-restored" : ""}">
        <div class="cmr-admin-history-main">
          <strong>${this._escape(title)} <em>${this._escape(badge)}</em></strong>
          <span>${this._escape(meta || this._recordTypeLabel(record.record_type))}</span>
          ${notes ? `<p>${this._escape(notes)}</p>` : ""}
          ${editOpen ? this._renderServiceRecordEditForm(record, vehicleKey) : ""}
        </div>
        <div class="cmr-admin-history-actions">
          ${canRestore ? `<button type="button" data-action="restore-service-record" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}">Restore</button>` : ""}
          ${recordId ? `<button type="button" data-action="toggle-edit-service-record" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}">${editOpen ? "Închide" : "Editează"}</button>` : ""}
          ${recordId ? `<button type="button" class="danger" data-action="delete-service-record" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}" data-record-title="${this._escape(title)}" data-updates-maintenance="${record.update_maintenance ? "1" : "0"}" data-restored="${restored ? "1" : "0"}">Șterge</button>` : ""}
        </div>
      </article>
    `;
  }

  _renderServiceRecordForm(vehicle, vehicleKey) {
    const draft = this._serviceRecordDrafts[vehicleKey] || {};
    const today = new Date().toISOString().slice(0, 10);
    const busy = this._serviceRecordBusy === vehicleKey;
    const km = draft.km ?? this._vehicleCurrentKm(vehicle) ?? 0;
    return `
      <form class="cmr-admin-service-form" data-form="service-record" data-vehicle="${this._escape(vehicleKey)}" data-vehicle-ref="${this._escape(vehicle.vehicle_id || vehicle.vin || vehicle.plate || vehicle.label)}">
        <div class="cmr-admin-form-grid">
          <label><span>Tip intervenție</span><select name="record_type">${this._recordTypeOptions(draft.record_type || "service")}</select></label>
          <label><span>Data</span><input type="date" name="date" value="${this._escape(this._formatDateInputValue(draft.date || today))}"></label>
          <label><span>Kilometraj</span><input type="number" name="km" min="0" step="1" value="${this._escape(km)}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(draft.cost || "0")}"></label>
          <label class="wide"><span>Titlu</span><input type="text" name="title" placeholder="ex. Schimb ulei și filtre" value="${this._escape(draft.title || "")}"></label>
          <label><span>Service / furnizor</span><input type="text" name="service_name" value="${this._escape(draft.service_name || "")}"></label>
          <label><span>Nr. document</span><input type="text" name="invoice_number" value="${this._escape(draft.invoice_number || "")}"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes || "")}</textarea></label>
        </div>
        <label class="cmr-admin-check"><input type="checkbox" name="update_maintenance" ${draft.update_maintenance === false ? "" : "checked"}> Actualizează automat mentenanța pentru tipurile mecanice</label>
        <div class="cmr-admin-form-actions">
          <button type="submit" ${busy ? "disabled" : ""}>${busy ? "Se salvează..." : "Salvează intervenția"}</button>
        </div>
      </form>
    `;
  }

  _renderServiceRecordEditForm(record, vehicleKey) {
    const recordId = record.record_id || "";
    const draft = this._serviceRecordEditDrafts[recordId] || {};
    const busy = this._serviceRecordBusy === recordId;
    return `
      <form class="cmr-admin-service-form cmr-admin-edit-form" data-form="service-record-edit" data-record-id="${this._escape(recordId)}" data-vehicle="${this._escape(vehicleKey)}">
        <div class="cmr-admin-help">Editarea modifică doar titlul, service-ul, costul, documentul și observațiile.</div>
        <div class="cmr-admin-form-grid">
          <label class="wide"><span>Titlu</span><input type="text" name="title" value="${this._escape(draft.title ?? record.title ?? "")}"></label>
          <label><span>Service / furnizor</span><input type="text" name="service_name" value="${this._escape(draft.service_name ?? record.service_name ?? "")}"></label>
          <label><span>Cost</span><input type="number" name="cost" min="0" step="0.01" value="${this._escape(draft.cost ?? record.cost ?? "0")}"></label>
          <label><span>Nr. document</span><input type="text" name="invoice_number" value="${this._escape(draft.invoice_number ?? record.invoice_number ?? "")}"></label>
          <label class="wide"><span>Observații</span><textarea name="notes" rows="2">${this._escape(draft.notes ?? record.notes ?? "")}</textarea></label>
        </div>
        <div class="cmr-admin-form-actions">
          <button type="submit" ${busy ? "disabled" : ""}>${busy ? "Se salvează..." : "Salvează modificările"}</button>
          <button type="button" class="secondary" data-action="cancel-edit-service-record" data-record-id="${this._escape(recordId)}">Renunță</button>
        </div>
      </form>
    `;
  }


  _renderAdminRowsSection(title, icon, rows) {
    const cleanRows = rows.filter(([label]) => label);
    if (!cleanRows.length) return "";
    return `
      <section>
        <div class="cmr-admin-section-title"><ha-icon icon="${icon}"></ha-icon><strong>${this._escape(title)}</strong></div>
        <div class="cmr-admin-table">
          ${cleanRows.map(([label, value]) => `
            <div class="cmr-admin-row">
              <strong>${this._escape(label)}</strong>
              <span>${this._escape(value)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  _adminInfoTile(label, value, icon) {
    return `
      <div class="cmr-admin-info-tile">
        <ha-icon icon="${icon}"></ha-icon>
        <span>${this._escape(label)}</span>
        <strong>${this._escape(value)}</strong>
      </div>
    `;
  }

  _maskVin(vin) {
    const text = String(vin || "").trim();
    if (text.length <= 6) return text;
    return `${text.slice(0, 4)}…${text.slice(-6)}`;
  }


  _recordTypeOptions(selected) {
    return [
      ["service", "Revizie / service"],
      ["oil_service", "Ulei motor + filtre"],
      ["gearbox_oil", "Ulei cutie viteze"],
      ["timing_belt", "Distribuție"],
      ["brake_fluid", "Lichid frână"],
      ["coolant", "Lichid antigel"],
      ["brakes", "Frâne"],
      ["tires", "Anvelope"],
      ["battery", "Baterie"],
      ["custom", "Altă intervenție"],
    ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _recordTypeLabel(type) {
    const labels = {
      service: "Revizie / service",
      oil_service: "Ulei motor + filtre",
      gearbox_oil: "Ulei cutie viteze",
      timing_belt: "Distribuție",
      brake_fluid: "Lichid frână",
      coolant: "Lichid antigel",
      brakes: "Frâne",
      tires: "Anvelope",
      battery: "Baterie",
      custom: "Intervenție",
    };
    return labels[type] || "Intervenție";
  }

  _formatDateInputValue(value) {
    const parsed = this._parseDate(value);
    if (!parsed) return String(value || "").slice(0, 10);
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  _formDate(data, key) {
    const value = (data.get(key) || "").toString().trim();
    return value || null;
  }


  async _addVehicle(form) {
    if (!this._hass || !form || this._vehicleAddBusy) return;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      license_plate: String(data.get("license_plate") || "").trim().toUpperCase(),
      vin: String(data.get("vin") || "").trim().toUpperCase(),
      km: Number(data.get("km") || 0),
      fuel_profile: String(data.get("fuel_profile") || "").trim(),
      registration_country: String(data.get("registration_country") || "").trim(),
      registration_certificate: String(data.get("registration_certificate") || "").trim().toUpperCase(),
    };

    if (!payload.name) {
      this._vehicleAddMessage = "Numele autovehiculului este obligatoriu.";
      this._render(true);
      return;
    }

    this._vehicleAddBusy = true;
    this._vehicleAddMessage = "Se adaugă autovehiculul...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "add_vehicle", payload);
      this._vehicleAddMessage = "Autovehiculul a fost adăugat. Integrarea se reîncarcă pentru crearea dispozitivului și entităților.";
      this._vehicleAddOpen = false;
    } catch (error) {
      this._vehicleAddMessage = error?.message || "Nu am putut adăuga autovehiculul.";
    } finally {
      this._vehicleAddBusy = false;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deactivateVehicle(vehicleId, label = "") {
    if (!this._hass || !vehicleId || this._vehicleDeleteBusy) return;
    const name = label ? `

Autovehicul: ${label}` : "";
    const confirmed = confirm(
      `Dezactivezi acest autovehicul?${name}

Mașina va fi ascunsă din dashboard, nu va mai crea entități active și nu va mai genera notificări dedicate. Datele rămân salvate în storage și pot fi reactivate tehnic ulterior.

Pentru eliminarea completă folosește separat „Șterge definitiv”.`
    );
    if (!confirmed) return;

    this._vehicleDeleteBusy = vehicleId;
    this._vehicleEditMessage[vehicleId] = "Se dezactivează autovehiculul...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "remove_vehicle", { vehicle_id: vehicleId });
      this._vehicleEditMessage[vehicleId] = "Autovehiculul a fost dezactivat. Integrarea se reîncarcă pentru sincronizare.";
      this._vehicleEditOpen.delete(vehicleId);
    } catch (error) {
      this._vehicleEditMessage[vehicleId] = error?.message || "Nu am putut dezactiva autovehiculul.";
    } finally {
      this._vehicleDeleteBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deleteVehiclePermanently(vehicleId, label = "") {
    if (!this._hass || !vehicleId || this._vehicleDeleteBusy) return;
    const name = label ? `

Autovehicul: ${label}` : "";
    const confirmed = confirm(
      `Ștergi DEFINITIV acest autovehicul?${name}

Se vor elimina datele salvate pentru această mașină: profil, revizii, termene, combustibil, anvelope, dotări, baterie și istoric local asociat. Entitățile și dispozitivul aferent vor fi curățate din Home Assistant unde este posibil.

Această acțiune nu poate fi anulată din dashboard. Recomandare: fă backup înainte.`
    );
    if (!confirmed) return;

    const secondConfirmed = confirm(
      `Confirmare finală${name}

Ești sigur că vrei ștergerea definitivă? Folosește această opțiune doar dacă ai vândut mașina sau nu mai ai nevoie de datele ei.`
    );
    if (!secondConfirmed) return;

    this._vehicleDeleteBusy = vehicleId;
    this._vehicleEditMessage[vehicleId] = "Se șterge definitiv autovehiculul...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "delete_vehicle", { vehicle_id: vehicleId });
      this._vehicleEditMessage[vehicleId] = "Autovehiculul a fost șters definitiv. Integrarea se reîncarcă pentru sincronizare.";
      this._vehicleEditOpen.delete(vehicleId);
    } catch (error) {
      this._vehicleEditMessage[vehicleId] = error?.message || "Nu am putut șterge definitiv autovehiculul.";
    } finally {
      this._vehicleDeleteBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  async _restoreVehicle(vehicleId, label = "") {
    if (!this._hass || !vehicleId || this._vehicleDeleteBusy) return;
    const name = label ? `

Autovehicul: ${label}` : "";
    const confirmed = confirm(
      `Reactivezi acest autovehicul?${name}

Mașina va apărea din nou în dashboard, iar entitățile și notificările ei vor fi recreate după reîncărcarea integrării.`
    );
    if (!confirmed) return;

    this._vehicleDeleteBusy = vehicleId;
    this._vehicleAddMessage = "Se reactivează autovehiculul...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "restore_vehicle", { vehicle_id: vehicleId });
      this._vehicleAddMessage = "Autovehiculul a fost reactivat. Integrarea se reîncarcă pentru recrearea dispozitivului și entităților.";
    } catch (error) {
      this._vehicleAddMessage = error?.message || "Nu am putut reactiva autovehiculul.";
    } finally {
      this._vehicleDeleteBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _updateVehicle(form) {
    if (!this._hass || !form) return;
    const vehicleKey = form.dataset.vehicle || "";
    const data = new FormData(form);
    const payload = {
      vehicle_id: vehicleKey,
      name: String(data.get("name") || "").trim(),
      license_plate: String(data.get("license_plate") || "").trim().toUpperCase(),
      vin: String(data.get("vin") || "").trim().toUpperCase(),
      km: Number(data.get("km") || 0),
      fuel_profile: String(data.get("fuel_profile") || "").trim(),
      registration_country: String(data.get("registration_country") || "").trim(),
      registration_certificate: String(data.get("registration_certificate") || "").trim().toUpperCase(),
      maintenance: {},
      legal_terms: {},
      consumables: {},
      vehicle_feature_options: {},
    };

    const currentVehicle = this._buildVehicles().find((item) => item.vehicle_id === vehicleKey) || null;
    const currentVehicleFeatures = this._vehicleFeatureOptions(currentVehicle);
    const disabledFeatures = [];
    this._vehicleFeatureOptionDefinitions().forEach(([key, label]) => {
      const value = data.get(`vehicle_feature_options__${key}`) === "on";
      payload.vehicle_feature_options[key] = value;
      if (currentVehicleFeatures[key] && !value) disabledFeatures.push(label);
    });

    for (const [key, value] of data.entries()) {
      const text = String(value ?? "").trim();
      if (key.startsWith("maintenance__")) {
        const [, type, field] = key.split("__");
        if (!type || !field) continue;
        payload.maintenance[type] = payload.maintenance[type] || {};
        payload.maintenance[type][field] = text;
      } else if (key.startsWith("legal_terms__")) {
        const [, type, field] = key.split("__");
        if (!type || !field) continue;
        payload.legal_terms[type] = payload.legal_terms[type] || {};
        payload.legal_terms[type][field] = text;
      } else if (key.startsWith("consumables__")) {
        const [, field] = key.split("__");
        if (!field) continue;
        payload.consumables[field] = text;
      } else if (key.startsWith("vehicle_feature_options__")) {
        continue;
      }
    }

    if (!payload.vehicle_id) {
      this._vehicleEditMessage[vehicleKey] = "Nu am putut identifica autovehiculul pentru editare.";
      this._render(true);
      return;
    }
    if (!payload.name) {
      this._vehicleEditMessage[vehicleKey] = "Numele autovehiculului este obligatoriu.";
      this._render(true);
      return;
    }

    if (disabledFeatures.length) {
      const message = `Dezactivarea pentru acest autovehicul va ascunde ${disabledFeatures.join(", ")} și va opri notificările dedicate pentru această mașină. Datele existente nu se șterg. Continui?`;
      if (!confirm(message)) return;
    }

    this._vehicleEditBusy = vehicleKey;
    this._vehicleEditMessage[vehicleKey] = "Se salvează modificările autovehiculului...";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "edit_vehicle", payload);
      // Actualizare optimistă în panel: utilizatorul vede imediat datele principale,
      // fără să aștepte refresh-ul complet al entităților Home Assistant.
      this._vehicleLocalOverrides[vehicleKey] = {
        ...(this._vehicleLocalOverrides[vehicleKey] || {}),
        name: payload.name,
        license_plate: payload.license_plate,
        vin: payload.vin,
        km: payload.km,
        current_km: payload.km,
        fuel_profile: payload.fuel_profile,
        registration_country: payload.registration_country,
        registration_certificate: payload.registration_certificate,
        maintenance: payload.maintenance,
        legal_terms: payload.legal_terms,
        consumables: payload.consumables,
        vehicle_feature_options: payload.vehicle_feature_options,
      };
      this._vehicleEditMessage[vehicleKey] = "Datele autovehiculului au fost actualizate.";
      this._vehicleEditOpen.delete(vehicleKey);
      delete this._vehicleEditDrafts[vehicleKey];
    } catch (error) {
      this._vehicleEditMessage[vehicleKey] = error?.message || "Nu am putut salva modificările autovehiculului.";
    } finally {
      this._vehicleEditBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  async _addServiceRecord(form) {
    if (!this._hass || !form || this._serviceRecordBusy) return;
    const vehicleKey = form.dataset.vehicle;
    const data = new FormData(form);
    const payload = {
      vehicle_id: form.dataset.vehicleRef || vehicleKey,
      record_type: (data.get("record_type") || "custom").toString(),
      date: this._formDate(data, "date"),
      km: Math.round(Number(data.get("km") || 0)),
      title: (data.get("title") || "").toString().trim(),
      service_name: (data.get("service_name") || "").toString().trim(),
      cost: Number(data.get("cost") || 0),
      invoice_number: (data.get("invoice_number") || "").toString().trim(),
      notes: (data.get("notes") || "").toString().trim(),
      update_maintenance: data.get("update_maintenance") === "on",
    };
    if (!payload.title) payload.title = this._recordTypeLabel(payload.record_type);
    if (!Number.isFinite(payload.km) || payload.km < 0) payload.km = 0;
    if (!Number.isFinite(payload.cost) || payload.cost < 0) payload.cost = 0;

    this._serviceRecordBusy = vehicleKey;
    this._serviceRecordMessage[vehicleKey] = "";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "add_service_record", payload);
      this._serviceRecordMessage[vehicleKey] = "Intervenția a fost salvată. Integrarea se reîncarcă pentru actualizare.";
      this._serviceRecordDrafts[vehicleKey] = {};
      this._serviceFormOpen.delete(vehicleKey);
    } catch (error) {
      this._serviceRecordMessage[vehicleKey] = error?.message || "Nu am putut salva intervenția.";
    } finally {
      this._serviceRecordBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _updateServiceRecord(form) {
    if (!this._hass || !form || this._serviceRecordBusy) return;
    const recordId = form.dataset.recordId;
    const vehicleKey = form.dataset.vehicle;
    if (!recordId) return;
    const data = new FormData(form);
    const payload = {
      record_id: recordId,
      title: (data.get("title") || "").toString().trim(),
      service_name: (data.get("service_name") || "").toString().trim(),
      cost: Number(data.get("cost") || 0),
      invoice_number: (data.get("invoice_number") || "").toString().trim(),
      notes: (data.get("notes") || "").toString().trim(),
    };
    if (!Number.isFinite(payload.cost) || payload.cost < 0) payload.cost = 0;

    this._serviceRecordBusy = recordId;
    if (vehicleKey) this._serviceRecordMessage[vehicleKey] = "";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "update_service_record", payload);
      delete this._serviceRecordEditDrafts[recordId];
      this._serviceRecordEditOpen.delete(recordId);
      if (vehicleKey) this._serviceRecordMessage[vehicleKey] = "Intervenția a fost actualizată. Integrarea se reîncarcă.";
    } catch (error) {
      if (vehicleKey) this._serviceRecordMessage[vehicleKey] = error?.message || "Nu am putut actualiza intervenția.";
    } finally {
      this._serviceRecordBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _restoreServiceRecord(recordId, vehicleKey) {
    if (!this._hass || !recordId || this._serviceRecordBusy) return;
    if (!window.confirm("Revii la valorile anterioare acestei intervenții? Intervenția rămâne în istoric, dar va fi marcată ca restaurată.")) return;

    this._serviceRecordBusy = vehicleKey || recordId;
    if (vehicleKey) this._serviceRecordMessage[vehicleKey] = "";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "restore_service_record", { record_id: recordId });
      if (vehicleKey) this._serviceRecordMessage[vehicleKey] = "Restore efectuat. Integrarea se reîncarcă.";
    } catch (error) {
      if (vehicleKey) this._serviceRecordMessage[vehicleKey] = error?.message || "Nu am putut face restore.";
    } finally {
      this._serviceRecordBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }

  async _deleteServiceRecord(recordId, vehicleKey, options = {}) {
    if (!this._hass || !recordId || this._serviceRecordBusy) return;
    const title = options.title ? `\n\nIntervenție: ${options.title}` : "";
    const warning = options.updatesMaintenance && !options.restored
      ? `Ștergi definitiv această intervenție din istoric?${title}\n\nAtenție: intervenția pare aplicată în mentenanță. Ștergerea elimină doar rândul din istoric, nu revine la valorile anterioare. Pentru revenire, folosește mai întâi Restore, apoi Șterge.`
      : `Ștergi definitiv această intervenție din istoric?${title}\n\nValorile de mentenanță ale autovehiculului nu se modifică.`;
    if (!window.confirm(warning)) return;

    this._serviceRecordBusy = vehicleKey || recordId;
    if (vehicleKey) this._serviceRecordMessage[vehicleKey] = "";
    this._render(true);

    try {
      await this._hass.callService("car_manager_romania", "delete_service_record", { record_id: recordId });
      if (vehicleKey) this._serviceRecordMessage[vehicleKey] = "Intervenția a fost ștearsă din istoric. Integrarea se reîncarcă.";
    } catch (error) {
      if (vehicleKey) this._serviceRecordMessage[vehicleKey] = error?.message || "Nu am putut șterge intervenția.";
    } finally {
      this._serviceRecordBusy = null;
      this._lastSignature = "";
      this._render(true);
    }
  }


  _renderModuleScaffold() {
    const current = this._tabs().find(([id]) => id === this._activeTab);
    const title = current?.[1] || "Modul";
    return `
      <main class="cmr-page">
        <div class="cmr-page-title"><span>${this._escape(title)}</span><h2>${this._escape(title)} - interfață panel în lucru</h2><p>Acest modul va fi refăcut nativ în panel, fără includerea cardului Lovelace. În această etapă am separat fundația și am refăcut Acasă, Statistici, Mașini, Costuri, Combustibil, Anvelope, Dotări, Baterie, Licență și Setări.</p></div>
        <div class="cmr-placeholder">
          <ha-icon icon="mdi:tools"></ha-icon>
          <strong>Urmează refacerea completă a acestui modul</strong>
          <p>Vom adăuga aici liste, formulare, modale de adăugare/editare/ștergere și acțiuni prin serviciile existente ale integrării.</p>
        </div>
      </main>
    `;
  }


  _scrollTabs(direction = 1) {
    const tabs = this.shadowRoot?.querySelector(".cmr-tabs");
    if (!tabs) return;
    const step = Math.max(120, Math.round(tabs.clientWidth * 0.72));
    tabs.scrollBy({ left: step * Number(direction || 1), behavior: "smooth" });
  }

  _scrollActiveTabIntoView() {
    const activeTab = this.shadowRoot?.querySelector(".cmr-tab.active");
    const tabs = this.shadowRoot?.querySelector(".cmr-tabs");
    if (!activeTab || !tabs) return;
    window.requestAnimationFrame(() => {
      const tabRect = activeTab.getBoundingClientRect();
      const tabsRect = tabs.getBoundingClientRect();
      const overflowLeft = tabRect.left < tabsRect.left + 6;
      const overflowRight = tabRect.right > tabsRect.right - 6;
      if (!overflowLeft && !overflowRight) return;
      const delta = (tabRect.left + tabRect.width / 2) - (tabsRect.left + tabsRect.width / 2);
      // Fără smooth aici: pe mobil evita jitter-ul stânga-dreapta după apăsarea taburilor.
      tabs.scrollBy({ left: delta, behavior: "auto" });
    });
  }

  _attachEvents() {
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const next = button.dataset.tab;
        if (!next) return;
        if (!this._tabIsVisible(next)) {
          this._activeTab = "settings";
          this._savePreference("active_tab", "settings");
          this._render(true);
          return;
        }
        if (button.dataset.vehicle) {
          this._vehicleFilter = button.dataset.vehicle;
          this._savePreference("vehicle_filter", this._vehicleFilter);
        }
        this._activeTab = next;
        this._savePreference("active_tab", next);
        this._lastSignature = "";
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='scroll-tabs']").forEach((button) => {
      button.addEventListener("click", () => this._scrollTabs(button.dataset.direction === "-1" ? -1 : 1));
    });

    this._scrollActiveTabIntoView();

    this.shadowRoot.querySelectorAll("[data-action='vehicle-filter']").forEach((select) => {
      select.addEventListener("change", () => {
        this._vehicleFilter = select.value || "all";
        this._savePreference("vehicle_filter", this._vehicleFilter);
        this._lastSignature = "";
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-vehicle-add']").forEach((button) => {
      button.addEventListener("click", () => {
        this._vehicleAddOpen = !this._vehicleAddOpen;
        this._vehicleAddMessage = "";
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-vehicle-add']").forEach((button) => {
      button.addEventListener("click", () => {
        this._vehicleAddOpen = false;
        this._vehicleAddMessage = "";
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='vehicle-add']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._addVehicle(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='deactivate-vehicle']").forEach((button) => {
      button.addEventListener("click", () => this._deactivateVehicle(button.dataset.vehicle, button.dataset.vehicleLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='delete-vehicle-permanently']").forEach((button) => {
      button.addEventListener("click", () => this._deleteVehiclePermanently(button.dataset.vehicle, button.dataset.vehicleLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='restore-vehicle']").forEach((button) => {
      button.addEventListener("click", () => this._restoreVehicle(button.dataset.vehicle, button.dataset.vehicleLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-vehicle-edit']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        if (this._vehicleEditOpen.has(vehicleKey)) this._vehicleEditOpen.delete(vehicleKey);
        else this._vehicleEditOpen.add(vehicleKey);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-vehicle-edit']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        this._vehicleEditOpen.delete(vehicleKey);
        delete this._vehicleEditDrafts[vehicleKey];
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='vehicle-edit']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._updateVehicle(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-service-form']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        if (this._serviceFormOpen.has(vehicleKey)) this._serviceFormOpen.delete(vehicleKey);
        else this._serviceFormOpen.add(vehicleKey);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-edit-service-record']").forEach((button) => {
      button.addEventListener("click", () => {
        const recordId = button.dataset.recordId;
        if (!recordId) return;
        if (this._serviceRecordEditOpen.has(recordId)) this._serviceRecordEditOpen.delete(recordId);
        else this._serviceRecordEditOpen.add(recordId);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-edit-service-record']").forEach((button) => {
      button.addEventListener("click", () => {
        const recordId = button.dataset.recordId;
        if (!recordId) return;
        this._serviceRecordEditOpen.delete(recordId);
        delete this._serviceRecordEditDrafts[recordId];
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='restore-service-record']").forEach((button) => {
      button.addEventListener("click", () => this._restoreServiceRecord(button.dataset.recordId, button.dataset.vehicle));
    });

    this.shadowRoot.querySelectorAll("[data-action='delete-service-record']").forEach((button) => {
      button.addEventListener("click", () => this._deleteServiceRecord(button.dataset.recordId, button.dataset.vehicle, {
        title: button.dataset.recordTitle || "",
        updatesMaintenance: button.dataset.updatesMaintenance === "1",
        restored: button.dataset.restored === "1",
      }));
    });

    this.shadowRoot.querySelectorAll("form[data-form='service-record']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._addServiceRecord(form);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='service-record-edit']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._updateServiceRecord(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='fuel-period']").forEach((select) => {
      select.addEventListener("change", () => {
        this._fuelPeriod = select.value || "year";
        this._savePreference("fuel_period", this._fuelPeriod);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-fuel-form']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        if (this._fuelFormOpen.has(vehicleKey)) this._fuelFormOpen.delete(vehicleKey);
        else this._fuelFormOpen.add(vehicleKey);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-edit-fuel-receipt']").forEach((button) => {
      button.addEventListener("click", () => {
        const receiptId = button.dataset.receiptId;
        if (!receiptId) return;
        if (this._fuelReceiptEditOpen.has(receiptId)) this._fuelReceiptEditOpen.delete(receiptId);
        else this._fuelReceiptEditOpen.add(receiptId);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-edit-fuel-receipt']").forEach((button) => {
      button.addEventListener("click", () => {
        const receiptId = button.dataset.receiptId;
        if (!receiptId) return;
        this._fuelReceiptEditOpen.delete(receiptId);
        delete this._fuelReceiptEditDrafts[receiptId];
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='delete-fuel-receipt']").forEach((button) => {
      button.addEventListener("click", () => this._deleteFuelReceipt(button.dataset.receiptId, button.dataset.vehicle, button.dataset.receiptLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='export-fuel-history']").forEach((button) => {
      button.addEventListener("click", () => this._exportFuelHistory());
    });

    this.shadowRoot.querySelectorAll("form[data-form='fuel-receipt']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._addFuelReceipt(form);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='fuel-receipt-edit']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._updateFuelReceipt(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-tire-form']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        if (this._tireFormOpen.has(vehicleKey)) this._tireFormOpen.delete(vehicleKey);
        else this._tireFormOpen.add(vehicleKey);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='tire-set']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._addTireSet(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-edit-tire-set']").forEach((button) => {
      button.addEventListener("click", () => {
        const setId = button.dataset.setId;
        if (!setId) return;
        if (this._tireSetEditOpen.has(setId)) this._tireSetEditOpen.delete(setId);
        else this._tireSetEditOpen.add(setId);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-edit-tire-set']").forEach((button) => {
      button.addEventListener("click", () => {
        const setId = button.dataset.setId;
        if (!setId) return;
        this._tireSetEditOpen.delete(setId);
        delete this._tireSetEditDrafts[setId];
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='tire-set-edit']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._updateTireSet(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='delete-tire-set']").forEach((button) => {
      button.addEventListener("click", () => this._deleteTireSet(button.dataset.setId, button.dataset.vehicle, button.dataset.tireLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-equipment-form']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        if (this._equipmentFormOpen.has(vehicleKey)) this._equipmentFormOpen.delete(vehicleKey);
        else this._equipmentFormOpen.add(vehicleKey);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='equipment-item']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._addEquipmentItem(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-edit-equipment-item']").forEach((button) => {
      button.addEventListener("click", () => {
        const itemId = button.dataset.itemId;
        if (!itemId) return;
        if (this._equipmentEditOpen.has(itemId)) this._equipmentEditOpen.delete(itemId);
        else this._equipmentEditOpen.add(itemId);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-edit-equipment-item']").forEach((button) => {
      button.addEventListener("click", () => {
        const itemId = button.dataset.itemId;
        if (!itemId) return;
        this._equipmentEditOpen.delete(itemId);
        delete this._equipmentEditDrafts[itemId];
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='equipment-item-edit']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._updateEquipmentItem(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='delete-equipment-item']").forEach((button) => {
      button.addEventListener("click", () => this._deleteEquipmentItem(button.dataset.itemId, button.dataset.vehicle, button.dataset.equipmentLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='prepare-missing-equipment']").forEach((button) => {
      button.addEventListener("click", () => this._prepareMissingEquipment(button.dataset.vehicle, button.dataset.equipmentType));
    });

    this.shadowRoot.querySelectorAll("[data-action='ignore-equipment-type']").forEach((button) => {
      button.addEventListener("click", () => this._ignoreEquipmentType(button.dataset.vehicle, button.dataset.vehicleRef, button.dataset.equipmentType, button.dataset.equipmentLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='reactivate-equipment-type']").forEach((button) => {
      button.addEventListener("click", () => this._reactivateEquipmentType(button.dataset.itemId, button.dataset.vehicle, button.dataset.equipmentLabel || ""));
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-battery-form']").forEach((button) => {
      button.addEventListener("click", () => {
        const vehicleKey = button.dataset.vehicle;
        if (!vehicleKey) return;
        if (this._batteryFormOpen.has(vehicleKey)) this._batteryFormOpen.delete(vehicleKey);
        else this._batteryFormOpen.add(vehicleKey);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='battery-item']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._addBattery(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='toggle-edit-battery']").forEach((button) => {
      button.addEventListener("click", () => {
        const batteryId = button.dataset.batteryId;
        if (!batteryId) return;
        if (this._batteryEditOpen.has(batteryId)) this._batteryEditOpen.delete(batteryId);
        else this._batteryEditOpen.add(batteryId);
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='cancel-edit-battery']").forEach((button) => {
      button.addEventListener("click", () => {
        const batteryId = button.dataset.batteryId;
        if (!batteryId) return;
        this._batteryEditOpen.delete(batteryId);
        delete this._batteryEditDrafts[batteryId];
        this._render(true);
      });
    });

    this.shadowRoot.querySelectorAll("form[data-form='battery-item-edit']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._updateBattery(form);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='delete-battery']").forEach((button) => {
      button.addEventListener("click", () => this._deleteBattery(button.dataset.batteryId, button.dataset.vehicle, button.dataset.batteryLabel || ""));
    });

    this.shadowRoot.querySelectorAll("form[data-form='license']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        this._applyLicense((data.get("license_key") || "").toString().trim());
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='license-refresh']").forEach((button) => {
      button.addEventListener("click", () => this._refreshLicenseEntities());
    });

    this.shadowRoot.querySelectorAll("[data-action='reload-license-data']").forEach((button) => {
      button.addEventListener("click", () => this._reloadLicenseData());
    });

    this.shadowRoot.querySelectorAll("form[data-form='rovinieta-account']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this._saveRovinietaAccount(form, false);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='rovinieta-clear']").forEach((button) => {
      button.addEventListener("click", () => {
        const form = button.closest("form");
        this._saveRovinietaAccount(form, true);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='rovinieta-refresh-now']").forEach((button) => {
      button.addEventListener("click", () => this._refreshRovinietaNow());
    });

    this.shadowRoot.querySelectorAll("[data-action='itp-refresh-now']").forEach((button) => {
      button.addEventListener("click", () => this._refreshItpNow());
    });

    this.shadowRoot.querySelectorAll("[data-action='rovinieta-scan-import']").forEach((button) => {
      button.addEventListener("click", () => this._scanRovinietaImportVehicles());
    });

    this.shadowRoot.querySelectorAll("[data-action='rovinieta-import-vehicle']").forEach((button) => {
      button.addEventListener("click", () => this._importRovinietaVehicle(button.dataset.importKey));
    });

    this.shadowRoot.querySelectorAll("form[data-form='notification-options']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const payload = {};
        this._notificationOptionDefinitions().forEach(([key]) => {
          payload[key] = data.get(key) === "on";
        });
        this._saveNotificationOptions(payload);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='notifications-reset']").forEach((button) => {
      button.addEventListener("click", () => this._saveNotificationOptions(this._defaultNotificationOptions()));
    });


    this.shadowRoot.querySelectorAll("form[data-form='feature-options']").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const current = this._featureOptionsForForm();
        const payload = {};
        const disabled = [];
        this._featureOptionDefinitions().forEach(([key, label]) => {
          payload[key] = data.get(key) === "on";
          if (current[key] && !payload[key]) disabled.push(label);
        });
        if (disabled.length) {
          const message = `Dezactivarea va ascunde ${disabled.join(", ")} din dashboard/card și va opri notificările dedicate. Datele existente nu se șterg. Continui?`;
          if (!confirm(message)) return;
        }
        this._saveFeatureOptions(payload);
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='features-reset']").forEach((button) => {
      button.addEventListener("click", () => this._saveFeatureOptions(this._defaultFeatureOptions()));
    });

    this.shadowRoot.querySelectorAll("[data-backup-filename]").forEach((input) => {
      input.addEventListener("input", (event) => {
        this._backupFilename = event.currentTarget.value || "car_manager_romania_backup.json";
      });
    });

    this.shadowRoot.querySelectorAll("[data-action='backup-export']").forEach((button) => {
      button.addEventListener("click", () => this._runBackupAction("export"));
    });
    this.shadowRoot.querySelectorAll("[data-action='backup-validate']").forEach((button) => {
      button.addEventListener("click", () => this._runBackupAction("validate"));
    });
    this.shadowRoot.querySelectorAll("[data-action='backup-import-dry']").forEach((button) => {
      button.addEventListener("click", () => this._runBackupAction("dry"));
    });
    this.shadowRoot.querySelectorAll("[data-action='backup-import-real']").forEach((button) => {
      button.addEventListener("click", () => this._runBackupAction("import"));
    });

    this.shadowRoot.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("pointerenter", (event) => this._showTooltip(event, el.dataset.tip));
      el.addEventListener("pointermove", (event) => this._moveTooltip(event));
      el.addEventListener("pointerleave", () => this._hideTooltip());
      el.addEventListener("focus", (event) => this._showTooltip(event, el.dataset.tip));
      el.addEventListener("blur", () => this._hideTooltip());
    });
  }

  _showTooltip(event, text) {
    if (!this._tooltip || !text) return;
    this._tooltip.textContent = text;
    this._tooltip.hidden = false;
    this._moveTooltip(event);
  }

  _moveTooltip(event) {
    if (!this._tooltip || this._tooltip.hidden) return;
    const targetRect = event.currentTarget?.getBoundingClientRect?.() || event.target?.getBoundingClientRect?.();
    const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (targetRect ? targetRect.left + targetRect.width / 2 : 0);
    const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (targetRect ? targetRect.top : 0);
    this._tooltip.style.left = `${x + 14}px`;
    this._tooltip.style.top = `${Math.max(8, y - 38)}px`;
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.hidden = true;
  }

  _styles() {
    return `
      :host{display:block;min-height:100vh;background:linear-gradient(180deg,#eaf8fb 0%,#f6fbfd 48%,#eef7fa 100%);color:#10233f;font-family:var(--ha-font-family-body,Inter,Roboto,Arial,sans-serif)}
      *{box-sizing:border-box}
      button,select,input{font:inherit}
      .cmr-panel{max-width:1760px;margin:0 auto;padding:30px 28px 86px}
      .cmr-hero{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:24px;margin-bottom:22px}
      .cmr-hero-main{position:relative;min-height:270px;border-radius:34px;padding:38px 34px;display:flex;gap:22px;align-items:flex-start;background:radial-gradient(circle at 85% 0%,rgba(255,255,255,.16) 0 120px,transparent 121px),radial-gradient(circle at 73% 100%,rgba(255,255,255,.15) 0 110px,transparent 111px),linear-gradient(135deg,#0b3b5f 0%,#0b6480 50%,#25bed0 100%);box-shadow:0 22px 55px rgba(8,52,79,.22);color:#fff;overflow:hidden}
      .cmr-logo{width:96px;height:96px;border-radius:28px;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}.cmr-logo img{width:72px;height:72px;object-fit:contain}.cmr-hero-copy{position:relative;z-index:3;max-width:840px;background:transparent;box-shadow:none;backdrop-filter:none}.cmr-hero-copy h1,.cmr-hero-copy p{text-shadow:0 3px 14px rgba(2,24,39,.42)}.cmr-hero h1{font-size:56px;line-height:.95;margin:8px 0 12px;font-weight:900;letter-spacing:-.05em}.cmr-hero p{font-size:16px;max-width:820px;margin:0;color:rgba(255,255,255,.86);font-weight:600}.cmr-haforge-badge{position:absolute;right:24px;bottom:22px;z-index:5;display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;background:rgba(5,28,47,.32);border:1px solid rgba(255,255,255,.22);border-radius:18px;padding:9px 13px;backdrop-filter:blur(8px);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.cmr-haforge-badge img{width:30px;height:30px;border-radius:8px;object-fit:cover}.cmr-haforge-text{display:flex;flex-direction:column;align-items:flex-start;line-height:1.05}.cmr-haforge-text span{display:block}.cmr-haforge-text small{display:block;margin-top:3px;font-size:9px;font-weight:900;letter-spacing:.10em;color:rgba(234,255,255,.78);text-transform:uppercase}.cmr-build-badge{display:none}.cmr-hero-car{position:absolute;left:96px;right:auto;top:34px;width:min(88%,1060px);height:390px;z-index:1;pointer-events:none;opacity:.98;filter:drop-shadow(0 28px 36px rgba(4,28,46,.30));overflow:visible}.cmr-hero-car::after{content:"";position:absolute;left:10%;right:24%;bottom:52px;height:38px;border-radius:999px;background:radial-gradient(ellipse at center,rgba(0,213,255,.24),transparent 72%);filter:blur(10px)}.cmr-hero-car img{position:absolute;left:0;top:0;width:100%;height:auto;object-fit:contain;object-position:left top}
      .cmr-hero-side{display:grid;grid-template-rows:1.25fr 1fr 1fr 1fr;gap:14px}.cmr-state,.cmr-side-card{background:rgba(255,255,255,.92);border:1px solid rgba(15,63,94,.08);border-radius:26px;padding:22px;box-shadow:0 18px 45px rgba(8,52,79,.10)}.cmr-state{border-top:5px solid #1fa6bf}.cmr-state.bad{border-top-color:#e64a2e}.cmr-state.warn{border-top-color:#f1a51d}.cmr-state.ok{border-top-color:#1fa971}.cmr-state span,.cmr-side-card span{display:block;color:#64768f;font-weight:800;font-size:13px}.cmr-state strong{display:block;font-size:38px;line-height:1;margin-top:16px}.cmr-side-card strong{display:block;font-size:28px;line-height:1;margin-bottom:5px}
      .cmr-tabs-shell{position:sticky;top:8px;z-index:5;display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:center;margin-bottom:18px}.cmr-tabs{min-width:0;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:6px;background:rgba(255,255,255,.92);backdrop-filter:blur(14px);border:1px solid rgba(15,63,94,.08);border-radius:26px;padding:10px;box-shadow:0 18px 45px rgba(8,52,79,.11);scroll-behavior:smooth}.cmr-tabs-arrow{display:none;border:0;border-radius:18px;background:rgba(255,255,255,.94);color:#0b5b82;width:44px;height:44px;align-items:center;justify-content:center;box-shadow:0 14px 28px rgba(8,52,79,.10);cursor:pointer}.cmr-tabs-arrow ha-icon{width:28px;height:28px}.cmr-tab{min-width:0;border:0;background:transparent;color:#4f5963;border-radius:18px;padding:11px 5px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:13px;font-weight:850;cursor:pointer;white-space:nowrap;scroll-snap-align:center}.cmr-tab ha-icon{width:20px;height:20px;flex:0 0 auto}.cmr-tab span{overflow:hidden;text-overflow:ellipsis}.cmr-tab.active{background:linear-gradient(135deg,#0b5b82,#19acc0);color:#fff;box-shadow:0 14px 28px rgba(9,98,134,.25)}
      .cmr-filterbar{display:flex;align-items:center;justify-content:space-between;gap:18px;background:rgba(255,255,255,.94);border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:16px 20px;margin-bottom:18px}.cmr-filterbar strong{display:block;font-size:17px}.cmr-filterbar span{display:block;color:#64768f;font-weight:700}.cmr-filterbar label{display:flex;align-items:center;gap:12px}.cmr-filterbar label span{font-size:13px;font-weight:900;color:#64768f}.cmr-filterbar select,.cmr-page select{height:44px;border:1px solid rgba(15,63,94,.13);background:#fff;border-radius:16px;padding:0 42px 0 16px;font-weight:850;color:#10233f;min-width:230px}
      .cmr-page{background:rgba(255,255,255,.92);border:1px solid rgba(15,63,94,.08);border-radius:28px;padding:24px;box-shadow:0 18px 45px rgba(8,52,79,.08)}.cmr-page-title{border-bottom:1px solid rgba(15,63,94,.12);padding-bottom:16px;margin-bottom:22px}.cmr-page-title span{text-transform:uppercase;letter-spacing:.16em;font-weight:900;color:#6b7f98;font-size:12px}.cmr-page-title h2{font-size:28px;margin:4px 0 8px;letter-spacing:-.03em}.cmr-page-title p{margin:0;color:#62748d;font-size:15px}
      .cmr-statistics-hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}.cmr-stat-summary-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-stat-summary-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-stat-summary-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-stat-summary-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-stat-summary-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:25px;letter-spacing:-.03em}.cmr-stat-summary-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-statistics-stack{gap:22px}
      .cmr-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:20px}.cmr-kpi{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:20px;box-shadow:0 12px 32px rgba(8,52,79,.06)}.cmr-kpi ha-icon{color:#06a6c7;width:24px;height:24px}.cmr-kpi span{display:block;margin-top:12px;color:#64768f;font-weight:850}.cmr-kpi strong{display:block;font-size:30px;margin-top:10px;letter-spacing:-.03em}.cmr-kpi small{display:block;color:#697a8f;font-weight:650;margin-top:4px}
      .cmr-vehicle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.cmr-vehicle-card,.cmr-stat-card{background:#fafeff;border:1px solid rgba(15,63,94,.09);border-radius:24px;padding:18px}.cmr-vehicle-card header,.cmr-stat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.cmr-vehicle-card h3,.cmr-stat-head h3{margin:0;font-size:21px}.cmr-stat-head span{display:block;color:#6b7f98;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.12em}.cmr-stat-head small{display:block;color:#66788f;font-weight:700;margin-top:2px}.cmr-vehicle-card header span{color:#66788f;font-weight:700}.cmr-stat-head-meta{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.cmr-stat-head-meta span{background:#eafaff;border:1px solid rgba(6,166,199,.15);border-radius:999px;padding:6px 9px;color:#0a5b76;font-size:11px;letter-spacing:0;text-transform:none}.cmr-vehicle-card button{border:0;background:#ddf7fc;color:#0a5b76;border-radius:14px;padding:9px 14px;font-weight:900;cursor:pointer}.cmr-mini-grid,.cmr-metrics-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-metrics-row{grid-template-columns:repeat(6,minmax(0,1fr));margin-bottom:18px}.cmr-mini-grid div,.cmr-metrics-row div{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px}.cmr-mini-grid span,.cmr-metrics-row span{display:block;color:#66788f;font-size:12px;font-weight:900}.cmr-mini-grid strong,.cmr-metrics-row strong{display:block;margin-top:6px;font-size:17px}
      .cmr-stack{display:grid;gap:20px}.cmr-pill{background:#e8fbf0;color:#13784c;border-radius:999px;padding:7px 12px;font-weight:900}.cmr-chart-card{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:20px;padding:16px;margin-top:14px;overflow:hidden}.cmr-chart-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.cmr-chart-title strong{font-size:16px}.cmr-chart-title span{font-size:12px;color:#64768f;font-weight:850}.cmr-chart{width:100%;height:280px;display:block}.cmr-chart .grid{stroke:rgba(93,124,146,.16);stroke-width:1;stroke-dasharray:7 9}.cmr-chart .tick,.cmr-chart .x-label{fill:#5f7188;font-size:12px;font-weight:800}.cmr-chart .area{fill:rgba(28,184,210,.16)}.cmr-chart .line{fill:none;stroke:#08a5c9;stroke-width:3;vector-effect:non-scaling-stroke}.cmr-chart .chart-point{cursor:pointer}.cmr-chart .hit{fill:transparent;stroke:transparent;pointer-events:all}.cmr-chart .dot{fill:#08a5c9;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke;pointer-events:none}.cmr-chart .chart-point:hover .dot{fill:#0b5b82}
      .cmr-bars{height:280px;display:grid;grid-template-columns:repeat(var(--count),minmax(44px,120px));align-items:end;justify-content:center;gap:22px;border-radius:16px;background:linear-gradient(180deg,rgba(12,166,199,.04),rgba(12,166,199,.01));padding:22px 18px 36px;position:relative}.cmr-bar-wrap{height:100%;display:flex;align-items:end;justify-content:end;flex-direction:column;gap:8px}.cmr-bar{width:54px;max-width:100%;border-radius:14px 14px 8px 8px;background:linear-gradient(180deg,#29bed1,#0a88a8);box-shadow:0 10px 24px rgba(8,152,184,.24);cursor:pointer}.cmr-bar-wrap span{font-size:12px;color:#64768f;font-weight:850}.cmr-stat-footnote{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;color:#66788f;font-size:12px;font-weight:800}.cmr-stat-footnote span{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:999px;padding:7px 10px}
      .cmr-empty,.cmr-settings-page{display:grid;gap:20px}.cmr-settings-hero{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.cmr-settings-hero-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-settings-hero-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-settings-hero-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-settings-hero-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-settings-hero-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:22px;letter-spacing:-.03em;overflow-wrap:anywhere}.cmr-settings-hero-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.cmr-settings-card{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:22px;box-shadow:0 14px 34px rgba(8,52,79,.05)}.cmr-settings-card-head{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;margin-bottom:16px}.cmr-settings-card-head>ha-icon{width:44px;height:44px;color:#06a6c7;background:#e9faff;border-radius:16px;padding:10px;box-sizing:border-box}.cmr-settings-card-head span{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:950;color:#64768f}.cmr-settings-card-head h3{margin:3px 0 4px;color:#001d3f;font-size:22px}.cmr-settings-card-head p{margin:0;color:#36506b;font-weight:750}.cmr-settings-checks{display:grid;gap:10px}.cmr-settings-checks label{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;background:#f7fcfe;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:12px}.cmr-settings-checks input{width:20px;height:20px;accent-color:#06a6c7}.cmr-settings-checks strong{display:block;color:#001d3f}.cmr-settings-checks small{display:block;color:#64768f;font-weight:750;margin-top:2px}.cmr-feature-checks{grid-template-columns:repeat(2,minmax(0,1fr))}.cmr-settings-features{grid-column:span 1}.cmr-settings-actions{display:flex;gap:10px;align-items:center;margin-top:14px}.cmr-settings-actions.wrap{flex-wrap:wrap}.cmr-settings-actions button,.cmr-settings-shortcuts button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:950;padding:10px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px}.cmr-settings-actions button.secondary{background:#eef6f9;color:#4c6278}.cmr-settings-actions button.danger{background:#ffe6ea;color:#8a2030}.cmr-settings-actions button:disabled{opacity:.6;cursor:not-allowed}.cmr-settings-field{display:grid;gap:7px;color:#566b84;font-weight:900}.cmr-settings-field input,.cmr-settings-field select{width:100%;box-sizing:border-box;border:1px solid rgba(15,63,94,.14);border-radius:14px;padding:12px 13px;background:#fff;color:#001d3f;font:inherit;font-weight:800}.cmr-settings-note{color:#51627a;font-weight:750;margin:12px 0 0}.cmr-rovinieta-account-status{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;background:#f7fcfe;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:12px 14px;margin:0 0 14px}.cmr-rovinieta-account-status.is-configured{background:#ecfff7;border-color:rgba(32,166,108,.22)}.cmr-rovinieta-account-status.is-empty{background:#fff9ec;border-color:rgba(241,165,29,.24)}.cmr-rovinieta-account-status ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-rovinieta-account-status.is-configured ha-icon{color:#20a66c}.cmr-rovinieta-account-status.is-empty ha-icon{color:#c47a00}.cmr-rovinieta-account-status strong{display:block;color:#001d3f;font-size:15px;overflow-wrap:anywhere}.cmr-rovinieta-account-status small{display:block;color:#51627a;font-weight:750;margin-top:3px}.cmr-settings-message{margin-top:12px;background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:14px;padding:12px 14px;color:#22566d;font-weight:850}.cmr-rovinieta-import-block{margin-top:18px;border-top:1px solid rgba(15,63,94,.08);padding-top:16px}.cmr-rovinieta-import-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}.cmr-rovinieta-import-head span{text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:950;color:#64768f}.cmr-rovinieta-import-head h4{margin:3px 0 4px;color:#001d3f;font-size:18px}.cmr-rovinieta-import-head p{margin:0;color:#51627a;font-weight:750}.cmr-rovinieta-import-head button,.cmr-rovinieta-import-footer button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:950;padding:10px 14px;cursor:pointer}.cmr-rovinieta-import-head button:disabled,.cmr-rovinieta-import-footer button:disabled{opacity:.6;cursor:not-allowed}.cmr-rovinieta-import-list{display:grid;gap:12px;margin-top:12px}.cmr-rovinieta-import-item{background:#f7fcfe;border:1px solid rgba(15,63,94,.08);border-radius:18px;padding:14px}.cmr-rovinieta-import-item.is-existing{background:#f9fbfc}.cmr-rovinieta-import-item>div:first-child{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.cmr-rovinieta-import-item strong{color:#001d3f;font-size:18px}.cmr-rovinieta-import-item span{color:#64768f;font-weight:850}.cmr-rovinieta-import-item dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0 0}.cmr-rovinieta-import-item dl div{background:#fff;border:1px solid rgba(15,63,94,.07);border-radius:12px;padding:9px}.cmr-rovinieta-import-item dt{color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.cmr-rovinieta-import-item dd{margin:3px 0 0;color:#001d3f;font-weight:900;overflow-wrap:anywhere}.cmr-rovinieta-import-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}.cmr-rovinieta-import-footer .secondary{background:#eef6f9;color:#4c6278}.cmr-settings-shortcuts{display:flex;flex-wrap:wrap;gap:10px}.cmr-settings-shortcuts ha-icon{width:18px;height:18px}.cmr-settings-steps{display:grid;gap:10px}.cmr-settings-steps div{display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;align-items:center;background:#f7fcfe;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:12px}.cmr-settings-steps strong{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#071a33;color:#fff}.cmr-settings-steps span{color:#253e5a;font-weight:800}.cmr-settings-steps code{background:#eef8fb;border-radius:8px;padding:2px 6px}.cmr-license-page{display:grid;gap:20px}.cmr-license-status-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center;background:#eefaff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:22px;border-top:4px solid #64768f}.cmr-license-status-card.is-good{border-top-color:#20a66c}.cmr-license-status-card.is-bad{border-top-color:#e64a2e}.cmr-license-status-card.is-warn{border-top-color:#f1a51d}.cmr-license-status-icon{width:72px;height:72px;border-radius:22px;background:#071a33;color:#fff;display:grid;place-items:center;box-shadow:0 14px 32px rgba(7,26,51,.24)}.cmr-license-status-icon ha-icon{width:34px;height:34px}.cmr-license-status-card span{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:950;color:#64768f}.cmr-license-status-card h3{margin:4px 0 0;font-size:30px;letter-spacing:-.04em;color:#001d3f}.cmr-license-status-card p{margin:5px 0 0;color:#36506b;font-weight:750}.cmr-license-status-pill{border-radius:999px;background:#fff;color:#001d3f;font-weight:950;padding:10px 14px;border:1px solid rgba(15,63,94,.08);white-space:nowrap}.cmr-license-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.cmr-license-info-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:20px;padding:16px;box-shadow:0 12px 32px rgba(8,52,79,.05)}.cmr-license-info-tile ha-icon{width:26px;height:26px;color:#06a6c7}.cmr-license-info-tile span{display:block;margin-top:8px;color:#64768f;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.cmr-license-info-tile strong{display:block;margin-top:6px;color:#001d3f;font-size:18px;overflow-wrap:anywhere}.cmr-license-section{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:22px;box-shadow:0 14px 34px rgba(8,52,79,.05)}.cmr-license-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}.cmr-license-form input{width:100%;box-sizing:border-box;border:1px solid rgba(15,63,94,.14);border-radius:14px;padding:13px 14px;background:#fff;color:#001d3f;font:inherit;font-weight:800}.cmr-license-form button,.cmr-license-action-row button{border:0;border-radius:999px;background:#071a33;color:#fff;font-weight:950;padding:13px 18px;cursor:pointer;box-shadow:0 14px 28px rgba(7,26,51,.18);display:inline-flex;align-items:center;gap:8px}.cmr-license-form button:disabled,.cmr-license-action-row button:disabled{opacity:.6;cursor:not-allowed}.cmr-license-action-row button ha-icon{width:20px;height:20px}.cmr-license-help{margin:12px 0 0;color:#51627a;font-weight:750}.cmr-license-message{margin-top:12px;background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:14px;padding:12px 14px;color:#22566d;font-weight:850}.cmr-license-message.warn{background:#fff7df;border-color:rgba(241,165,29,.25);color:#845d00}.cmr-license-action-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;background:#f7fbfd;border:1px solid rgba(15,63,94,.06);border-radius:22px;padding:18px}.cmr-license-action-row h3{margin:0 0 5px;font-size:20px;color:#001d3f}.cmr-license-action-row p{margin:0;color:#36506b;font-weight:750}.cmr-license-support{display:grid;grid-template-columns:58px minmax(0,1fr);gap:18px;background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:22px;box-shadow:0 16px 36px rgba(8,52,79,.06)}.cmr-license-support-icon{width:54px;height:54px;border-radius:50%;background:#fff;display:grid;place-items:center;color:#071a33;box-shadow:0 14px 28px rgba(7,26,51,.10)}.cmr-license-support-icon ha-icon{width:28px;height:28px}.cmr-license-support h3{margin:0 0 8px;font-size:22px;color:#001d3f}.cmr-license-support p{margin:8px 0;color:#253e5a;font-weight:750}.cmr-license-support a{display:inline-flex;align-items:center;gap:8px;margin-top:10px;background:#ffdd00;color:#001d3f;border-radius:999px;padding:12px 18px;text-decoration:none;font-weight:950;box-shadow:0 14px 28px rgba(255,221,0,.22)}.cmr-license-support small{display:block;margin-top:10px;color:#51627a;font-weight:750}.cmr-battery-page{display:grid;gap:20px}.cmr-battery-hero{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.cmr-battery-hero-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-battery-hero-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-battery-hero-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-battery-hero-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-battery-hero-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:24px;letter-spacing:-.03em}.cmr-battery-hero-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-battery-vehicles{display:grid;gap:18px}.cmr-battery-vehicle-card{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(8,52,79,.06)}.cmr-battery-vehicle-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.cmr-battery-vehicle-card h3{margin:0;font-size:24px}.cmr-battery-vehicle-card header span{display:block;color:#64768f;font-weight:800}.cmr-battery-vehicle-card header button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:10px 14px;cursor:pointer}.cmr-battery-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-battery-metrics div{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px}.cmr-battery-metrics span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.cmr-battery-metrics strong{display:block;margin-top:5px;color:#001d3f;font-size:17px}.cmr-battery-metrics small{display:block;margin-top:4px;color:#64768f;font-weight:750}.cmr-battery-form{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:18px;padding:14px;margin:14px 0}.cmr-battery-form-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.cmr-battery-form-grid label{display:grid;gap:6px}.cmr-battery-form-grid label.wide{grid-column:span 5}.cmr-battery-form-grid span,.cmr-battery-check{color:#566b84;font-size:12px;font-weight:900}.cmr-battery-form-grid input,.cmr-battery-form-grid select,.cmr-battery-form-grid textarea{width:100%;border:1px solid rgba(15,63,94,.14);border-radius:12px;padding:10px 11px;background:#fff;color:#001d3f;font:inherit;font-weight:750}.cmr-battery-check{display:flex;align-items:center;gap:8px;margin:10px 0}.cmr-battery-form-actions{display:flex;gap:10px;flex-wrap:wrap}.cmr-battery-form-actions button,.cmr-battery-item-side button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:8px 12px;cursor:pointer}.cmr-battery-form-actions button.secondary{background:#eef6f9;color:#4c6278}.cmr-battery-message{background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:12px;padding:10px 12px;color:#22566d;font-weight:800;margin:10px 0}.cmr-battery-list{margin-top:16px}.cmr-battery-section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.cmr-battery-section-title strong{font-size:17px}.cmr-battery-section-title span{color:#64768f;font-weight:800}.cmr-battery-item{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin-bottom:10px}.cmr-battery-item.is-installed{border-left:4px solid #1fa971}.cmr-battery-item.has-alert{border-left-color:#e64a2e}.cmr-battery-item-main strong{display:block;color:#001d3f}.cmr-battery-item-main em{font-style:normal;background:#ffece6;border-radius:999px;padding:3px 7px;font-size:11px;color:#ba321e}.cmr-battery-item-main span{display:block;color:#64768f;font-weight:800;margin-top:4px}.cmr-battery-item-main p{margin:8px 0 0;color:#3d4f66}.cmr-battery-item-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end}.cmr-battery-item-side b{font-size:18px;color:#001d3f}.cmr-battery-item-side button.danger{background:#ffe6ea;color:#8a2030}.cmr-equipment-page{display:grid;gap:20px}.cmr-equipment-hero{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.cmr-equipment-hero-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-equipment-hero-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-equipment-hero-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-equipment-hero-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-equipment-hero-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:24px;letter-spacing:-.03em}.cmr-equipment-hero-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-equipment-vehicles{display:grid;gap:18px}.cmr-equipment-vehicle-card{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(8,52,79,.06)}.cmr-equipment-vehicle-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.cmr-equipment-vehicle-card h3{margin:0;font-size:24px}.cmr-equipment-vehicle-card header span{display:block;color:#64768f;font-weight:800}.cmr-equipment-vehicle-card header button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:10px 14px;cursor:pointer}.cmr-equipment-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-equipment-metrics div{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px}.cmr-equipment-metrics span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.cmr-equipment-metrics strong{display:block;margin-top:5px;color:#001d3f;font-size:17px}.cmr-equipment-metrics small{display:block;margin-top:4px;color:#64768f;font-weight:750}.cmr-equipment-form{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:18px;padding:14px;margin:14px 0}.cmr-equipment-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cmr-equipment-form-grid label{display:grid;gap:6px}.cmr-equipment-form-grid label.wide{grid-column:span 3}.cmr-equipment-form-grid span,.cmr-equipment-check{color:#566b84;font-size:12px;font-weight:900}.cmr-equipment-form-grid input,.cmr-equipment-form-grid select,.cmr-equipment-form-grid textarea{width:100%;border:1px solid rgba(15,63,94,.14);border-radius:12px;padding:10px 11px;background:#fff;color:#001d3f;font:inherit;font-weight:750}.cmr-equipment-check{display:flex;align-items:center;gap:8px;margin:10px 0}.cmr-equipment-form-actions{display:flex;gap:10px;flex-wrap:wrap}.cmr-equipment-form-actions button,.cmr-equipment-item-side button,.cmr-equipment-required-card button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:8px 12px;cursor:pointer}.cmr-equipment-form-actions button.secondary{background:#eef6f9;color:#4c6278}.cmr-equipment-message{background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:12px;padding:10px 12px;color:#22566d;font-weight:800;margin:10px 0}.cmr-equipment-block{margin-top:16px}.cmr-equipment-section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.cmr-equipment-section-title strong{font-size:17px}.cmr-equipment-section-title span{color:#64768f;font-weight:800}.cmr-equipment-required-grid,.cmr-equipment-list{display:grid;gap:10px}.cmr-equipment-required-card{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px}.cmr-equipment-required-card div{display:flex;justify-content:space-between;gap:10px}.cmr-equipment-required-card strong{color:#001d3f}.cmr-equipment-required-card span{font-weight:900;color:#a66d00}.cmr-equipment-required-card p{color:#64768f;font-weight:750;margin:8px 0}.cmr-equipment-required-card footer{display:flex;flex-wrap:wrap;gap:8px}.cmr-equipment-required-card button.danger,.cmr-equipment-item-side button.danger{background:#ffe6ea;color:#8a2030}.cmr-equipment-required-card.is-ignored{opacity:.78}.cmr-equipment-item{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px}.cmr-equipment-item.critical{border-left:4px solid #e64a2e}.cmr-equipment-item.warning{border-left:4px solid #f1a51d}.cmr-equipment-item.ok{border-left:4px solid #1fa971}.cmr-equipment-item-main strong{display:block;color:#001d3f}.cmr-equipment-item-main em{font-style:normal;background:#ffece6;border-radius:999px;padding:3px 7px;font-size:11px;color:#ba321e}.cmr-equipment-item-main span{display:block;color:#64768f;font-weight:800;margin-top:4px}.cmr-equipment-item-main p{margin:8px 0 0;color:#3d4f66}.cmr-equipment-item-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end}.cmr-equipment-item-side b{font-size:18px;color:#001d3f}.cmr-tires-page{display:grid;gap:20px}.cmr-tires-hero{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.cmr-tire-hero-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-tire-hero-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-tire-hero-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-tire-hero-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-tire-hero-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:24px;letter-spacing:-.03em}.cmr-tire-hero-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-tire-vehicles{display:grid;gap:18px}.cmr-tire-vehicle-card{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(8,52,79,.06)}.cmr-tire-vehicle-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.cmr-tire-vehicle-card h3{margin:0;font-size:24px}.cmr-tire-vehicle-card header span{display:block;color:#64768f;font-weight:800}.cmr-tire-vehicle-card header button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:10px 14px;cursor:pointer}.cmr-tire-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-tire-metrics div{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px}.cmr-tire-metrics span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.cmr-tire-metrics strong{display:block;margin-top:5px;color:#001d3f;font-size:17px}.cmr-tire-metrics small{display:block;margin-top:4px;color:#64768f;font-weight:750}.cmr-tire-form{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:18px;padding:14px;margin:14px 0}.cmr-tire-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-tire-form-grid label{display:grid;gap:6px}.cmr-tire-form-grid label.wide{grid-column:span 4}.cmr-tire-form-grid span,.cmr-tire-check{color:#566b84;font-size:12px;font-weight:900}.cmr-tire-form-grid input,.cmr-tire-form-grid select,.cmr-tire-form-grid textarea{width:100%;border:1px solid rgba(15,63,94,.14);border-radius:12px;padding:10px 11px;background:#fff;color:#001d3f;font:inherit;font-weight:750}.cmr-tire-check{display:flex;align-items:center;gap:8px;margin:10px 0}.cmr-tire-form-actions{display:flex;gap:10px;flex-wrap:wrap}.cmr-tire-form-actions button,.cmr-tire-set-side button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:8px 12px;cursor:pointer}.cmr-tire-form-actions button.secondary{background:#eef6f9;color:#4c6278}.cmr-tire-message{background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:12px;padding:10px 12px;color:#22566d;font-weight:800;margin:10px 0}.cmr-tire-list{margin-top:16px}.cmr-tire-section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.cmr-tire-section-title strong{font-size:17px}.cmr-tire-section-title span{color:#64768f;font-weight:800}.cmr-tire-set{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin-bottom:10px}.cmr-tire-set.is-mounted{border-left:4px solid #1fa971}.cmr-tire-set-main strong{display:block;color:#001d3f}.cmr-tire-set-main em{font-style:normal;background:#e8fbf0;border-radius:999px;padding:3px 7px;font-size:11px;color:#13784c}.cmr-tire-set-main span{display:block;color:#64768f;font-weight:800;margin-top:4px}.cmr-tire-set-details{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.cmr-tire-set-details small{background:#eef8fb;border-radius:999px;padding:5px 8px;color:#51627a;font-weight:800}.cmr-tire-set-main p{margin:8px 0 0;color:#3d4f66}.cmr-tire-set-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end}.cmr-tire-set-side b{font-size:18px;color:#001d3f}.cmr-tire-set-side button.danger{background:#ffe6ea;color:#8a2030}.cmr-fuel-page{display:grid;gap:20px}.cmr-fuel-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:22px;padding:16px 18px}.cmr-fuel-toolbar strong{display:block;font-size:18px}.cmr-fuel-toolbar span{display:block;color:#64768f;font-weight:750}.cmr-fuel-controls{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.cmr-fuel-controls label{display:grid;gap:6px;color:#64768f;font-weight:900;font-size:12px}.cmr-fuel-controls select{min-width:190px;border:1px solid rgba(15,63,94,.12);border-radius:14px;background:#fff;padding:10px 12px;font-weight:900}.cmr-fuel-controls button,.cmr-fuel-vehicle-card header button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:10px 14px;cursor:pointer}.cmr-fuel-hero{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.cmr-fuel-hero-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-fuel-hero-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-fuel-hero-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-fuel-hero-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-fuel-hero-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:24px;letter-spacing:-.03em}.cmr-fuel-hero-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-fuel-vehicles{display:grid;gap:18px}.cmr-fuel-vehicle-card{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(8,52,79,.06)}.cmr-fuel-vehicle-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.cmr-fuel-vehicle-card h3{margin:0;font-size:24px}.cmr-fuel-vehicle-card header span{display:block;color:#64768f;font-weight:800}.cmr-fuel-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.cmr-fuel-metrics div{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px}.cmr-fuel-metrics span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.cmr-fuel-metrics strong{display:block;margin-top:5px;color:#001d3f;font-size:17px}.cmr-fuel-metrics small{display:block;margin-top:4px;color:#64768f;font-weight:750}.cmr-fuel-form{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:18px;padding:14px;margin:14px 0}.cmr-fuel-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cmr-fuel-form-grid label{display:grid;gap:6px}.cmr-fuel-form-grid label.wide{grid-column:span 3}.cmr-fuel-form-grid span,.cmr-fuel-check{color:#566b84;font-size:12px;font-weight:900}.cmr-fuel-form-grid input,.cmr-fuel-form-grid select,.cmr-fuel-form-grid textarea{width:100%;border:1px solid rgba(15,63,94,.14);border-radius:12px;padding:10px 11px;background:#fff;color:#001d3f;font:inherit;font-weight:750}.cmr-fuel-check{display:flex;align-items:center;gap:8px;margin:10px 0}.cmr-fuel-form-actions{display:flex;gap:10px;flex-wrap:wrap}.cmr-fuel-form-actions button,.cmr-fuel-receipt-actions button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:8px 12px;cursor:pointer}.cmr-fuel-form-actions button.secondary{background:#eef6f9;color:#4c6278}.cmr-fuel-message{background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:12px;padding:10px 12px;color:#22566d;font-weight:800;margin:10px 0}.cmr-fuel-history{margin-top:16px}.cmr-fuel-section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.cmr-fuel-section-title strong{font-size:17px}.cmr-fuel-section-title span{color:#64768f;font-weight:800}.cmr-fuel-receipt{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin-bottom:10px}.cmr-fuel-receipt-main strong{display:block;color:#001d3f}.cmr-fuel-receipt-main span{display:block;color:#64768f;font-weight:800;margin-top:4px}.cmr-fuel-receipt-main b{display:block;color:#001d3f;font-size:18px;margin-top:7px}.cmr-fuel-receipt-main p{margin:8px 0 0;color:#3d4f66}.cmr-fuel-receipt-actions{display:flex;flex-direction:column;gap:8px;align-items:flex-end}.cmr-fuel-receipt-actions button.danger{background:#ffe6ea;color:#8a2030}.cmr-costs-page{display:grid;gap:20px}.cmr-costs-hero{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.cmr-cost-hero-tile{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:22px;padding:18px;box-shadow:0 12px 32px rgba(8,52,79,.06);position:relative;overflow:hidden}.cmr-cost-hero-tile:after{content:"";position:absolute;right:-28px;top:-30px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-cost-hero-tile ha-icon{width:28px;height:28px;color:#06a6c7}.cmr-cost-hero-tile span{display:block;margin-top:10px;color:#64768f;font-size:12px;font-weight:900}.cmr-cost-hero-tile strong{display:block;margin-top:8px;color:#001d3f;font-size:24px;letter-spacing:-.03em}.cmr-cost-hero-tile small{display:block;margin-top:3px;color:#66788f;font-weight:700}.cmr-costs-section{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px}.cmr-cost-vehicle-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:14px;align-items:start}.cmr-cost-vehicle-card{background:#fff;border:1px solid rgba(15,63,94,.09);border-radius:20px;padding:16px;box-shadow:0 12px 30px rgba(8,52,79,.05)}.cmr-cost-vehicle-card header{display:grid;grid-template-columns:minmax(0,1fr);align-items:flex-start;gap:8px;margin-bottom:12px;min-width:0}.cmr-cost-vehicle-card h4{margin:0;font-size:20px}.cmr-cost-vehicle-card header span{display:block;color:#64768f;font-weight:800;margin-top:2px}.cmr-cost-vehicle-card header strong{font-size:20px;color:#001d3f;max-width:100%;white-space:normal;overflow-wrap:anywhere}.cmr-cost-mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cmr-cost-mini-grid div{background:#f7fcfe;border:1px solid rgba(15,63,94,.08);border-radius:14px;padding:11px}.cmr-cost-mini-grid span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.cmr-cost-mini-grid strong{display:block;margin-top:5px;color:#001d3f;font-size:15px}.cmr-costs-two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.cmr-section-head.compact{margin-bottom:10px}.cmr-cost-type-list{display:grid;gap:10px}.cmr-cost-type-bar{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:12px}.cmr-cost-type-bar div{display:flex;justify-content:space-between;gap:12px;align-items:center}.cmr-cost-type-bar strong{color:#001d3f}.cmr-cost-type-bar span{color:#001d3f;font-weight:950}.cmr-cost-type-bar i{display:block;height:10px;border-radius:999px;background:#e8f7fb;overflow:hidden;margin-top:10px}.cmr-cost-type-bar b{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#5ed3e5,#0499bd)}.cmr-upcoming-costs{display:grid;gap:10px}.cmr-upcoming-cost{display:flex;justify-content:space-between;gap:14px;align-items:center;background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:13px 15px}.cmr-upcoming-cost span{display:block;color:#64768f;font-weight:800;margin-top:3px}.cmr-upcoming-cost>strong{font-size:18px;color:#001d3f;white-space:nowrap}.cmr-vehicles-page{display:grid;gap:20px}.cmr-vehicles-hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.cmr-vehicles-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:22px;padding:16px 18px}.cmr-vehicles-toolbar strong{display:block;font-size:18px}.cmr-vehicles-toolbar span{display:block;color:#64768f;font-weight:750;margin-top:2px}.cmr-toolbar-actions{display:flex;gap:10px;flex-wrap:wrap}.cmr-toolbar-actions button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:10px 14px;cursor:pointer}.cmr-vehicles-list{display:grid;gap:18px}.cmr-admin-vehicle-card{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(8,52,79,.06)}.cmr-admin-vehicle-card.is-critical{border-top:4px solid #e64a2e}.cmr-admin-vehicle-card.is-warning{border-top:4px solid #f1a51d}.cmr-admin-vehicle-card.is-ok{border-top:4px solid #20a66c}.cmr-admin-vehicle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.cmr-admin-vehicle-head span{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:950;color:#657991}.cmr-admin-vehicle-head h3{margin:3px 0 2px;font-size:26px;letter-spacing:-.03em}.cmr-admin-vehicle-head small{color:#5e7088;font-weight:800}.cmr-admin-status{text-align:right}.cmr-admin-status strong{display:inline-flex;border-radius:999px;padding:7px 11px;background:#e8fbf0;color:#13784c}.cmr-admin-vehicle-card.is-critical .cmr-admin-status strong{background:#ffece6;color:#ba321e}.cmr-admin-vehicle-card.is-warning .cmr-admin-status strong{background:#fff5d8;color:#9a6200}.cmr-admin-status span{display:block;margin-top:5px;text-transform:none;letter-spacing:0;color:#64768f}.cmr-admin-profile-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}.cmr-admin-info-tile{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:12px;min-width:0}.cmr-admin-info-tile ha-icon{width:22px;height:22px;color:#06a6c7}.cmr-admin-info-tile span{display:block;margin-top:7px;color:#64768f;font-size:12px;font-weight:900}.cmr-admin-info-tile strong{display:block;margin-top:4px;font-size:16px;color:#001d3f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cmr-admin-table{display:grid;gap:0;background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;overflow:hidden}.cmr-admin-row{display:grid;grid-template-columns:minmax(140px,1.1fr) minmax(120px,.9fr) minmax(120px,.8fr);gap:12px;align-items:center;padding:11px 13px;border-bottom:1px solid rgba(15,63,94,.08)}.cmr-admin-row:last-child{border-bottom:0}.cmr-admin-row strong{color:#001d3f}.cmr-admin-row span{font-weight:900;color:#001d3f}.cmr-admin-row small{color:#64768f;font-weight:800}.cmr-admin-row.ok span{color:#128451}.cmr-admin-row.warning span{color:#a66d00}.cmr-admin-row.critical span{color:#d33a21}.cmr-admin-section-title button{margin-left:auto;border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:8px 12px;cursor:pointer}.cmr-admin-history{display:grid;gap:10px}.cmr-admin-history-record{background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:16px;padding:12px;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0;overflow:hidden}.cmr-admin-history-record.is-restored{opacity:.78}.cmr-admin-history-record em{font-style:normal;background:#eef8fb;border-radius:999px;padding:3px 7px;font-size:11px;color:#51627a}.cmr-admin-history-actions{display:flex;flex-direction:row;gap:8px;align-items:flex-start;justify-content:flex-start;flex-wrap:wrap;min-width:0;max-width:100%}.cmr-admin-history-actions button,.cmr-admin-form-actions button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:8px 12px;cursor:pointer}.cmr-admin-history-actions button.danger{background:#ffe6ea;color:#8a2030}.cmr-admin-form-actions button.secondary{background:#eef6f9;color:#4c6278}.cmr-admin-service-form{background:#f7fcfe;border:1px solid rgba(15,63,94,.09);border-radius:16px;padding:14px;margin:10px 0}.cmr-admin-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-admin-form-grid label{display:grid;gap:6px}.cmr-admin-form-grid label.wide{grid-column:span 2}.cmr-admin-form-grid span,.cmr-admin-check{color:#566b84;font-size:12px;font-weight:900}.cmr-admin-form-grid input,.cmr-admin-form-grid select,.cmr-admin-form-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(15,63,94,.14);border-radius:12px;padding:10px 11px;background:#fff;color:#001d3f;font:inherit;font-weight:750}.cmr-admin-check{display:flex;align-items:center;gap:8px;margin:10px 0}.cmr-admin-form-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}.cmr-admin-help,.cmr-admin-message{background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:12px;padding:10px 12px;color:#22566d;font-weight:800;margin-bottom:10px}.cmr-admin-history-main{min-width:0;max-width:100%;overflow:hidden}.cmr-admin-history-record strong{display:block;color:#001d3f;max-width:100%;white-space:normal;overflow-wrap:anywhere}.cmr-admin-history-record span{display:block;color:#64768f;font-weight:800;margin-top:4px;max-width:100%;white-space:normal;overflow-wrap:anywhere}.cmr-admin-history-record p{margin:8px 0 0;color:#3d4f66;white-space:pre-line;max-width:100%;overflow-wrap:anywhere}.cmr-admin-sections{display:grid;gap:12px}.cmr-admin-sections section{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:18px;padding:14px}.cmr-admin-section-title{display:flex;align-items:center;gap:8px;margin-bottom:10px;color:#001d3f}.cmr-admin-section-title ha-icon{width:20px;height:20px;color:#06a6c7}.cmr-admin-chip-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cmr-admin-chip-grid.one{grid-template-columns:1fr}.cmr-admin-empty{border:1px dashed rgba(15,63,94,.18);border-radius:16px;padding:12px 14px;color:#64768f;background:#fff}.cmr-admin-alerts{display:flex;flex-wrap:wrap;gap:8px}.cmr-admin-alerts span{border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;background:#fff5d8;color:#9a6200}.cmr-admin-alerts span.critical{background:#ffece6;color:#ba321e}.cmr-admin-ok{display:flex;align-items:center;gap:8px;color:#168455;font-weight:850}.cmr-admin-ok ha-icon{width:18px;height:18px}.cmr-admin-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.cmr-admin-actions button{border:0;border-radius:999px;background:#dff8ff;color:#00405d;font-weight:900;padding:10px 14px;cursor:pointer}.cmr-placeholder{background:#f7fcfe;border:1px dashed rgba(15,63,94,.18);border-radius:22px;padding:28px;text-align:center;color:#60748d}.cmr-placeholder ha-icon{width:42px;height:42px;color:#0aa5c6}.cmr-placeholder strong{display:block;font-size:20px;color:#10233f;margin-top:12px}.cmr-chart-card.empty{text-align:center;color:#64768f}
      .cmr-overview-page{display:grid;gap:20px}.cmr-overview-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;border-radius:26px;padding:22px 24px;border:1px solid rgba(15,63,94,.09);background:linear-gradient(135deg,#f8fdff,#e8f9fd);box-shadow:0 14px 34px rgba(8,52,79,.06)}.cmr-overview-hero span,.cmr-section-head span{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:950;color:#657991}.cmr-overview-hero strong{display:block;font-size:34px;letter-spacing:-.03em;margin:4px 0}.cmr-overview-hero p{margin:0;color:#60748d;font-weight:750}.cmr-overview-hero.is-ok{border-top:4px solid #20a66c}.cmr-overview-hero.is-warning{border-top:4px solid #f1a51d}.cmr-overview-hero.is-critical{border-top:4px solid #e64a2e}.cmr-overview-hero-actions{display:flex;gap:10px;flex-wrap:wrap}.cmr-overview-hero-actions button,.cmr-section-head button,.cmr-alert-item button,.cmr-vehicle-card footer button{border:0;border-radius:15px;background:#ddf7fc;color:#0a5b76;padding:10px 14px;font-weight:950;cursor:pointer}.cmr-overview-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}.cmr-kpi{position:relative;overflow:hidden}.cmr-kpi:after{content:"";position:absolute;right:-24px;top:-28px;width:86px;height:86px;border-radius:50%;background:rgba(8,166,199,.08)}.cmr-kpi-icon{width:36px;height:36px;border-radius:14px;display:grid;place-items:center;background:#e6f8fc;color:#06a6c7}.cmr-kpi.tone-red .cmr-kpi-icon{background:#ffece6;color:#d84a2d}.cmr-kpi.tone-amber .cmr-kpi-icon{background:#fff5d8;color:#c77a00}.cmr-kpi.tone-green .cmr-kpi-icon{background:#e8fbf0;color:#168455}.cmr-kpi.tone-purple .cmr-kpi-icon{background:#f0ecff;color:#6650c7}.cmr-kpi.tone-cyan .cmr-kpi-icon{background:#e4faff;color:#008eac}.cmr-legal-section{margin-bottom:20px}.cmr-legal-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.cmr-legal-card{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;align-items:center;background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:18px;padding:13px 14px;box-shadow:0 10px 26px rgba(8,52,79,.05)}.cmr-legal-card.ok{border-top:3px solid #1fa971}.cmr-legal-card.warning{border-top:3px solid #f1a51d}.cmr-legal-card.critical{border-top:3px solid #e64a2e}.cmr-legal-icon{width:42px;height:42px;border-radius:15px;display:grid;place-items:center;background:#e6f8fc;color:#06a6c7}.cmr-legal-card.warning .cmr-legal-icon{background:#fff5d8;color:#c77a00}.cmr-legal-card.critical .cmr-legal-icon{background:#ffece6;color:#d84a2d}.cmr-legal-body{min-width:0}.cmr-legal-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.cmr-legal-card span{display:block;color:#64768f;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.cmr-legal-card em{font-style:normal;color:#001d3f;background:#eafaff;border:1px solid rgba(6,166,199,.18);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:950;white-space:nowrap;max-width:48%;overflow:hidden;text-overflow:ellipsis}.cmr-legal-card strong{display:block;font-size:18px;line-height:1.15;margin:5px 0 3px;color:#001d3f}.cmr-legal-card small{display:block;color:#51627a;font-size:12px;line-height:1.25}.cmr-overview-section{background:#fafeff;border:1px solid rgba(15,63,94,.08);border-radius:24px;padding:18px}.cmr-section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.cmr-section-head h3{margin:3px 0 0;font-size:22px;letter-spacing:-.025em}.cmr-overview-vehicles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.cmr-vehicle-card{background:#fff}.cmr-vehicle-card.is-critical{border-top:4px solid #e64a2e}.cmr-vehicle-card.is-warning{border-top:4px solid #f1a51d}.cmr-vehicle-card.is-ok{border-top:4px solid #20a66c}.cmr-status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:7px 11px;background:#e8fbf0;color:#13784c;font-weight:950;white-space:nowrap}.cmr-vehicle-card.is-critical .cmr-status-badge{background:#ffece6;color:#ba321e}.cmr-vehicle-card.is-warning .cmr-status-badge{background:#fff5d8;color:#9a6200}.cmr-vehicle-maintenance{display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:10px;margin:14px 0 12px}.cmr-vehicle-maintenance-chip{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;background:#fff;border:1px solid rgba(15,63,94,.08);border-left:4px solid #1fa971;border-radius:16px;padding:10px}.cmr-vehicle-maintenance-chip.warning{border-left-color:#f1a51d}.cmr-vehicle-maintenance-chip.critical{border-left-color:#e64a2e}.cmr-vehicle-maintenance-chip ha-icon{width:34px;height:34px;padding:7px;box-sizing:border-box;border-radius:12px;background:#e6f8fc;color:#06a6c7}.cmr-vehicle-maintenance-chip.warning ha-icon{background:#fff5d8;color:#c77a00}.cmr-vehicle-maintenance-chip.critical ha-icon{background:#ffece6;color:#d84a2d}.cmr-vehicle-maintenance-chip span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.cmr-vehicle-maintenance-chip strong{display:block;color:#001d3f;font-size:15px;line-height:1.1;margin:3px 0}.cmr-vehicle-maintenance-chip small{display:block;color:#51627a;font-size:11px;line-height:1.2}.cmr-vehicle-legal{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 12px}.cmr-vehicle-legal-chip{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;background:#fff;border:1px solid rgba(15,63,94,.08);border-left:4px solid #1fa971;border-radius:16px;padding:10px}.cmr-vehicle-legal-chip.warning{border-left-color:#f1a51d}.cmr-vehicle-legal-chip.critical{border-left-color:#e64a2e}.cmr-vehicle-legal-chip ha-icon{width:34px;height:34px;padding:7px;box-sizing:border-box;border-radius:12px;background:#e6f8fc;color:#06a6c7}.cmr-vehicle-legal-chip.warning ha-icon{background:#fff5d8;color:#c77a00}.cmr-vehicle-legal-chip.critical ha-icon{background:#ffece6;color:#d84a2d}.cmr-vehicle-legal-chip span{display:block;color:#64768f;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.cmr-vehicle-legal-chip strong{display:block;color:#001d3f;font-size:15px;line-height:1.1;margin:3px 0}.cmr-vehicle-legal-chip small{display:block;color:#51627a;font-size:11px;line-height:1.2}.cmr-vehicle-legal-empty{margin:14px 0 12px;padding:12px 14px;border:1px dashed rgba(15,63,94,.18);border-radius:16px;color:#64768f;background:#f8fdff}.cmr-vehicle-alerts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.cmr-vehicle-alerts span{border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;background:#fff5d8;color:#9a6200}.cmr-vehicle-alerts span.critical{background:#ffece6;color:#ba321e}.cmr-vehicle-ok{display:flex;align-items:center;gap:8px;margin-top:14px;color:#168455;font-weight:850}.cmr-vehicle-ok ha-icon{width:18px;height:18px}.cmr-vehicle-card footer{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.cmr-alert-list{display:grid;gap:10px}.cmr-alert-item{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:18px;padding:13px}.cmr-alert-item ha-icon{width:24px;height:24px;color:#c77a00}.cmr-alert-item.critical ha-icon{color:#d84a2d}.cmr-alert-item div{flex:1;min-width:0}.cmr-alert-item strong{display:block}.cmr-alert-item span{display:block;color:#66788f;font-weight:750;margin-top:2px}.cmr-good-news{display:flex;align-items:center;gap:12px;background:#f4fff8;border:1px solid rgba(32,166,108,.18);border-radius:20px;padding:18px;color:#168455}.cmr-good-news ha-icon{width:32px;height:32px}.cmr-good-news strong{display:block;color:#0c4f34}.cmr-good-news span{display:block;margin-top:3px;color:#47705d;font-weight:700}
      .cmr-tooltip{position:fixed;z-index:50;pointer-events:none;background:#10233f;color:#fff;border-radius:12px;padding:9px 12px;font-size:12px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:280px}
      .cmr-admin-feature-toggle{grid-column:span 2;display:grid!important;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start;background:#fff;border:1px solid rgba(15,63,94,.08);border-radius:14px;padding:10px}.cmr-admin-feature-toggle input{width:18px;height:18px;accent-color:#06a6c7}.cmr-admin-feature-toggle strong{display:block;color:#001d3f}.cmr-admin-feature-toggle small{display:block;color:#64768f;font-weight:750;margin-top:3px;line-height:1.3}.cmr-legal-source-line,.cmr-rovinieta-source-line{display:block;margin-top:3px;color:#64768f;font-size:12px;font-weight:750;line-height:1.25;cursor:help;white-space:normal}.cmr-admin-edit-form .cmr-field-hint{display:block;margin-top:6px;color:#64768f;font-size:12px;font-weight:750;line-height:1.3}@media (prefers-color-scheme:dark){.cmr-admin-feature-toggle{grid-column:span 2;display:grid!important;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start;background:rgba(255,255,255,.035);border:1px solid rgba(120,180,215,.22);border-radius:14px;padding:10px}.cmr-admin-feature-toggle input{width:18px;height:18px;accent-color:#21c7df}.cmr-admin-feature-toggle strong{display:block;color:#f5fbff}.cmr-admin-feature-toggle small{display:block;color:#c9d6e5;font-weight:750;margin-top:3px;line-height:1.3}.cmr-rovinieta-import-item{background:rgba(255,255,255,.035);border-color:rgba(120,180,215,.22)}.cmr-rovinieta-import-item.is-existing{background:rgba(255,255,255,.025)}.cmr-rovinieta-import-item strong{color:#f5fbff}.cmr-rovinieta-import-item span{color:#c9d6e5}.cmr-rovinieta-import-item dl div{background:rgba(5,19,39,.72);border-color:rgba(120,180,215,.22)}.cmr-rovinieta-import-item dt{color:#9fb4cc}.cmr-rovinieta-import-item dd{color:#f5fbff}.cmr-rovinieta-import-footer .secondary{background:rgba(160,190,210,.18);color:#dcecff}.cmr-legal-source-line,.cmr-rovinieta-source-line{color:#c9d6e5}.cmr-admin-edit-form .cmr-field-hint{color:#c9d6e5}}@media (max-width:1200px){.cmr-feature-checks{grid-template-columns:1fr}.cmr-hero{grid-template-columns:1fr}.cmr-hero-side{grid-template-columns:repeat(4,1fr);grid-template-rows:auto}.cmr-hero h1{font-size:42px}.cmr-tab span{display:none}.cmr-tabs{grid-template-columns:repeat(10,1fr)}.cmr-metrics-row{grid-template-columns:repeat(3,1fr)}.cmr-legal-grid{grid-template-columns:repeat(2,1fr)}.cmr-vehicle-legal{grid-template-columns:repeat(2,minmax(0,1fr))}.cmr-vehicles-hero,.cmr-costs-hero,.cmr-fuel-hero,.cmr-fuel-metrics,.cmr-tires-hero,.cmr-tire-metrics,.cmr-equipment-hero,.cmr-equipment-metrics,.cmr-battery-hero,.cmr-battery-metrics,.cmr-battery-form-grid,.cmr-license-grid,.cmr-settings-hero,.cmr-settings-grid,.cmr-cost-vehicle-grid,.cmr-costs-two{grid-template-columns:repeat(2,1fr)}.cmr-admin-profile-grid{grid-template-columns:repeat(3,1fr)}.cmr-admin-chip-grid{grid-template-columns:repeat(2,1fr)}.cmr-statistics-hero{grid-template-columns:repeat(2,minmax(0,1fr))}.cmr-overview-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.cmr-overview-vehicles{grid-template-columns:1fr}}
      @media (max-width:760px){.cmr-panel{padding:14px 10px 80px}.cmr-hero-main{padding:22px;min-height:240px}.cmr-logo{width:72px;height:72px}.cmr-logo img{width:56px;height:56px}.cmr-hero h1{font-size:32px}.cmr-hero-main{gap:14px}.cmr-hero-car{left:62px;right:auto;bottom:-30px;width:105%;height:190px;opacity:.38}.cmr-haforge-badge{right:10px;bottom:10px;padding:6px 8px;gap:7px;border-radius:14px}.cmr-haforge-text span{display:block;font-size:10px;letter-spacing:.08em;white-space:nowrap}.cmr-haforge-text small{font-size:8px;letter-spacing:.08em}.cmr-hero-side{grid-template-columns:1fr 1fr}.cmr-tabs{overflow-x:auto;display:flex}.cmr-tab{min-width:54px}.cmr-filterbar{display:block}.cmr-filterbar label{margin-top:12px;align-items:stretch;display:block}.cmr-filterbar select{width:100%;margin-top:6px}.cmr-kpis,.cmr-vehicle-grid,.cmr-mini-grid,.cmr-metrics-row,.cmr-overview-kpis,.cmr-overview-vehicles{grid-template-columns:1fr}.cmr-overview-hero,.cmr-section-head,.cmr-alert-item{align-items:stretch;flex-direction:column}.cmr-overview-hero-actions,.cmr-vehicle-card footer{display:grid;grid-template-columns:1fr 1fr}.cmr-page{padding:16px}.cmr-chart{height:230px}.cmr-bars{height:230px;justify-content:start;overflow-x:auto}}
      @media (prefers-color-scheme: dark){
        :host{
          background:
            radial-gradient(circle at 18% 8%,rgba(37,190,208,.16),transparent 34%),
            radial-gradient(circle at 86% 0%,rgba(31,166,191,.12),transparent 30%),
            linear-gradient(180deg,#07111f 0%,#0b1727 48%,#08111d 100%);
          color:#e8f4fb;
        }
        .cmr-panel{color:#e8f4fb}
        .cmr-hero-main{box-shadow:0 24px 58px rgba(0,0,0,.42)}
        .cmr-state,.cmr-side-card,.cmr-tabs,.cmr-filterbar,.cmr-page,
        .cmr-overview-hero,.cmr-vehicle-card,.cmr-alerts-panel,.cmr-legal-card,
        .cmr-stat-vehicle-card,.cmr-chart,.cmr-bars,.cmr-costs-section,.cmr-cost-vehicle-card,
        .cmr-fuel-toolbar,.cmr-fuel-vehicle-card,.cmr-tire-vehicle-card,.cmr-equipment-vehicle-card,
        .cmr-battery-vehicle-card,.cmr-license-section,.cmr-license-support,.cmr-settings-card{
          background:rgba(12,27,44,.92);
          border-color:rgba(149,205,224,.16);
          box-shadow:0 18px 45px rgba(0,0,0,.28);
        }
        .cmr-state,.cmr-side-card,.cmr-tabs,.cmr-filterbar{background:rgba(12,27,44,.88)}
        .cmr-page-title{border-bottom-color:rgba(149,205,224,.16)}
        .cmr-page-title h2,.cmr-section-head h3,.cmr-vehicle-card h3,
        .cmr-stat-vehicle-card h3,.cmr-fuel-vehicle-card h3,.cmr-tire-vehicle-card h3,
        .cmr-equipment-vehicle-card h3,.cmr-battery-vehicle-card h3,
        .cmr-license-status-card h3,.cmr-license-action-row h3,.cmr-license-support h3,
        .cmr-settings-card-head h3,.cmr-cost-vehicle-card h4,.cmr-alerts-panel h3,
        .cmr-overview-hero h3,.cmr-admin-section-title strong{
          color:#f3fbff;
        }
        .cmr-page-title p,.cmr-filterbar span,.cmr-state span,.cmr-side-card span,
        .cmr-page-title span,.cmr-section-head span,.cmr-vehicle-card header span,
        .cmr-fuel-vehicle-card header span,.cmr-tire-vehicle-card header span,
        .cmr-equipment-vehicle-card header span,.cmr-battery-vehicle-card header span,
        .cmr-license-status-card p,.cmr-license-help,.cmr-settings-card-head p,
        .cmr-settings-note,.cmr-license-action-row p,.cmr-license-support p,
        .cmr-alert-item span,.cmr-good-news span{
          color:#a9bfd2;
        }
        .cmr-kpi,.cmr-mini,.cmr-metric,.cmr-vehicle-legal-card,.cmr-stat-summary-card,
        .cmr-cost-hero-tile,.cmr-cost-mini-grid div,.cmr-cost-type-bar,.cmr-upcoming-cost,
        .cmr-fuel-hero-tile,.cmr-fuel-metrics div,.cmr-fuel-form,.cmr-fuel-receipt,
        .cmr-tire-hero-tile,.cmr-tire-metrics div,.cmr-tire-form,.cmr-tire-set,
        .cmr-equipment-hero-tile,.cmr-equipment-metrics div,.cmr-equipment-form,
        .cmr-equipment-required-card,.cmr-equipment-item,.cmr-battery-hero-tile,
        .cmr-battery-metrics div,.cmr-battery-form,.cmr-battery-item,
        .cmr-license-info-tile,.cmr-license-action-row,.cmr-settings-hero-tile,
        .cmr-settings-checks label,.cmr-settings-steps div,.cmr-admin-info-tile,
        .cmr-admin-chip,.cmr-admin-row,.cmr-admin-history-record,.cmr-admin-service-form{
          background:rgba(18,38,58,.94);
          border-color:rgba(149,205,224,.14);
          color:#e8f4fb;
          box-shadow:0 12px 30px rgba(0,0,0,.22);
        }
        .cmr-kpi strong,.cmr-mini strong,.cmr-metric strong,.cmr-vehicle-legal-card strong,
        .cmr-stat-summary-card strong,.cmr-cost-hero-tile strong,.cmr-cost-mini-grid strong,
        .cmr-cost-type-bar strong,.cmr-cost-type-bar span,.cmr-upcoming-cost>strong,
        .cmr-fuel-hero-tile strong,.cmr-fuel-metrics strong,.cmr-fuel-receipt-main strong,
        .cmr-fuel-receipt-main b,.cmr-tire-hero-tile strong,.cmr-tire-metrics strong,
        .cmr-tire-set-main strong,.cmr-tire-set-side b,.cmr-equipment-hero-tile strong,
        .cmr-equipment-metrics strong,.cmr-equipment-required-card strong,
        .cmr-equipment-item-main strong,.cmr-equipment-item-side b,.cmr-battery-hero-tile strong,
        .cmr-battery-metrics strong,.cmr-battery-item-main strong,.cmr-battery-item-side b,
        .cmr-license-info-tile strong,.cmr-settings-hero-tile strong,.cmr-settings-checks strong,
        .cmr-settings-steps span,.cmr-admin-info-tile strong,.cmr-admin-chip strong,
        .cmr-admin-row strong,.cmr-admin-history-main strong{
          color:#f5fbff;
        }
        .cmr-kpi span,.cmr-mini span,.cmr-metric span,.cmr-vehicle-legal-card span,
        .cmr-stat-summary-card span,.cmr-cost-hero-tile span,.cmr-cost-hero-tile small,
        .cmr-cost-mini-grid span,.cmr-fuel-hero-tile span,.cmr-fuel-hero-tile small,
        .cmr-fuel-metrics span,.cmr-fuel-metrics small,.cmr-fuel-receipt-main span,
        .cmr-tire-hero-tile span,.cmr-tire-hero-tile small,.cmr-tire-metrics span,
        .cmr-tire-metrics small,.cmr-tire-set-main span,.cmr-equipment-hero-tile span,
        .cmr-equipment-hero-tile small,.cmr-equipment-metrics span,.cmr-equipment-metrics small,
        .cmr-equipment-required-card p,.cmr-equipment-item-main span,.cmr-battery-hero-tile span,
        .cmr-battery-hero-tile small,.cmr-battery-metrics span,.cmr-battery-metrics small,
        .cmr-battery-item-main span,.cmr-license-info-tile span,.cmr-settings-hero-tile span,
        .cmr-settings-hero-tile small,.cmr-settings-checks small,.cmr-admin-info-tile span,
        .cmr-admin-chip span,.cmr-admin-row span{
          color:#a9bfd2;
        }
        .cmr-filterbar select,.cmr-page select,.cmr-license-form input,
        .cmr-settings-field input,.cmr-settings-field select,.cmr-fuel-form-grid input,.cmr-fuel-form-grid select,.cmr-fuel-form-grid textarea,
        .cmr-tire-form-grid input,.cmr-tire-form-grid select,.cmr-tire-form-grid textarea,
        .cmr-equipment-form-grid input,.cmr-equipment-form-grid select,.cmr-equipment-form-grid textarea,
        .cmr-battery-form-grid input,.cmr-battery-form-grid select,.cmr-battery-form-grid textarea,
        .cmr-admin-form-grid input,.cmr-admin-form-grid select,.cmr-admin-form-grid textarea{
          background:#0b1727;
          color:#f3fbff;
          border-color:rgba(149,205,224,.22);
        }
        .cmr-filterbar select:focus,.cmr-page select:focus,.cmr-license-form input:focus,
        .cmr-settings-field input:focus,.cmr-settings-field select:focus,.cmr-fuel-form-grid input:focus,.cmr-fuel-form-grid select:focus,.cmr-fuel-form-grid textarea:focus,
        .cmr-tire-form-grid input:focus,.cmr-tire-form-grid select:focus,.cmr-tire-form-grid textarea:focus,
        .cmr-equipment-form-grid input:focus,.cmr-equipment-form-grid select:focus,.cmr-equipment-form-grid textarea:focus,
        .cmr-battery-form-grid input:focus,.cmr-battery-form-grid select:focus,.cmr-battery-form-grid textarea:focus,
        .cmr-admin-form-grid input:focus,.cmr-admin-form-grid select:focus,.cmr-admin-form-grid textarea:focus{
          outline:2px solid rgba(37,190,208,.45);
          outline-offset:1px;
        }
        .cmr-tab{color:#b8c8d8}
        .cmr-tab.active{color:#fff;box-shadow:0 14px 28px rgba(0,188,212,.23)}
        .cmr-chart-grid line,.cmr-bars-grid line{stroke:rgba(149,205,224,.13)}
        .cmr-chart-axis,.cmr-bars-axis{stroke:rgba(149,205,224,.30)}
        .cmr-chart-label,.cmr-bars-label{fill:#b8c8d8}
        .cmr-chart-line{stroke:#32d2e8}
        .cmr-chart-point{fill:#32d2e8}
        .cmr-chart-area{fill:rgba(50,210,232,.18)}
        .cmr-bar{fill:url(#cmrBarGradient)}
        .cmr-cost-type-bar i{background:#10283a}
        .cmr-cost-type-bar b{background:linear-gradient(90deg,#32d2e8,#0ea5c6)}
        .cmr-good-news{background:rgba(31,169,113,.12);border-color:rgba(31,169,113,.28);color:#7be0ad}
        .cmr-good-news strong{color:#b8ffd6}
        .cmr-license-status-card{background:rgba(15,38,57,.96);border-color:rgba(149,205,224,.16)}
        .cmr-license-status-pill{background:#12263a;border-color:rgba(149,205,224,.16);color:#e8f4fb}
        .cmr-license-support-icon,.cmr-settings-card-head>ha-icon{background:#12263a}
        .cmr-license-message,.cmr-settings-message,.cmr-fuel-message,.cmr-tire-message,
        .cmr-equipment-message,.cmr-battery-message,.cmr-admin-message,.cmr-admin-help{
          background:rgba(37,190,208,.10);
          border-color:rgba(37,190,208,.24);
          color:#beeef7;
        }
        .cmr-license-message.warn{background:rgba(241,165,29,.12);border-color:rgba(241,165,29,.28);color:#ffd88a}
        .cmr-settings-steps strong{background:#25bed0;color:#062033}
        .cmr-tooltip{background:#e8f4fb;color:#07111f}
      }

      @media (prefers-color-scheme: dark){
        :host{
          background:
            radial-gradient(circle at 18% 2%,rgba(62,149,222,.14),transparent 28%),
            radial-gradient(circle at 88% 4%,rgba(41,185,205,.10),transparent 30%),
            linear-gradient(180deg,#0e1726 0%,#121d2e 48%,#0d1725 100%);
          color:#edf6ff;
        }
        .cmr-panel{color:#edf6ff}
        .cmr-hero-main{
          background:
            radial-gradient(circle at 84% 0%,rgba(255,255,255,.13) 0 120px,transparent 121px),
            radial-gradient(circle at 72% 100%,rgba(255,255,255,.11) 0 110px,transparent 111px),
            linear-gradient(135deg,#13243b 0%,#154b69 56%,#1daebf 100%);
          box-shadow:0 24px 62px rgba(0,0,0,.34);
        }
        .cmr-state,.cmr-side-card,.cmr-tabs,.cmr-filterbar,.cmr-page,
        .cmr-overview-hero,.cmr-vehicle-card,.cmr-alerts-panel,.cmr-legal-card,
        .cmr-stat-vehicle-card,.cmr-chart,.cmr-bars,.cmr-costs-section,.cmr-cost-vehicle-card,
        .cmr-fuel-toolbar,.cmr-fuel-vehicle-card,.cmr-tire-vehicle-card,.cmr-equipment-vehicle-card,
        .cmr-battery-vehicle-card,.cmr-license-section,.cmr-license-support,.cmr-settings-card{
          background:#172437;
          border-color:#2a3c53;
          box-shadow:0 16px 38px rgba(0,0,0,.22);
        }
        .cmr-tabs,.cmr-filterbar,.cmr-state,.cmr-side-card{
          background:#19263a;
          border-color:#30435b;
        }
        .cmr-page{background:#172437}
        .cmr-vehicle-card{
          background:#1b2a3e;
          border-color:#34475e;
        }
        .cmr-vehicle-card.critical,
        .cmr-overview-hero.critical{
          border-top-color:#ff6b4a;
        }
        .cmr-page-title{border-bottom-color:#32455d}
        .cmr-page-title h2,.cmr-section-head h3,.cmr-vehicle-card h3,
        .cmr-stat-vehicle-card h3,.cmr-fuel-vehicle-card h3,.cmr-tire-vehicle-card h3,
        .cmr-equipment-vehicle-card h3,.cmr-battery-vehicle-card h3,
        .cmr-license-status-card h3,.cmr-license-action-row h3,.cmr-license-support h3,
        .cmr-settings-card-head h3,.cmr-cost-vehicle-card h4,.cmr-alerts-panel h3,
        .cmr-overview-hero h3,.cmr-admin-section-title strong{
          color:#f6fbff;
        }
        .cmr-page-title p,.cmr-filterbar span,.cmr-state span,.cmr-side-card span,
        .cmr-page-title span,.cmr-section-head span,.cmr-vehicle-card header span,
        .cmr-fuel-vehicle-card header span,.cmr-tire-vehicle-card header span,
        .cmr-equipment-vehicle-card header span,.cmr-battery-vehicle-card header span,
        .cmr-license-status-card p,.cmr-license-help,.cmr-settings-card-head p,
        .cmr-settings-note,.cmr-license-action-row p,.cmr-license-support p,
        .cmr-alert-item span,.cmr-good-news span{
          color:#b9c9d9;
        }
        .cmr-page-title span,.cmr-section-head span{
          color:#8fb2d2;
        }

        .cmr-kpi,.cmr-mini,.cmr-metric,.cmr-vehicle-legal-card,.cmr-stat-summary-card,
        .cmr-cost-hero-tile,.cmr-cost-mini-grid div,.cmr-cost-type-bar,.cmr-upcoming-cost,
        .cmr-fuel-hero-tile,.cmr-fuel-metrics div,.cmr-fuel-form,.cmr-fuel-receipt,
        .cmr-tire-hero-tile,.cmr-tire-metrics div,.cmr-tire-form,.cmr-tire-set,
        .cmr-equipment-hero-tile,.cmr-equipment-metrics div,.cmr-equipment-form,
        .cmr-equipment-required-card,.cmr-equipment-item,.cmr-battery-hero-tile,
        .cmr-battery-metrics div,.cmr-battery-form,.cmr-battery-item,
        .cmr-license-info-tile,.cmr-license-action-row,.cmr-settings-hero-tile,
        .cmr-settings-checks label,.cmr-settings-steps div,.cmr-admin-info-tile,
        .cmr-admin-chip,.cmr-admin-row,.cmr-admin-history-record,.cmr-admin-service-form{
          background:#203047;
          border-color:#3a4d64;
          color:#edf6ff;
          box-shadow:0 10px 24px rgba(0,0,0,.16);
        }
        .cmr-kpi:after,.cmr-cost-hero-tile:after,.cmr-fuel-hero-tile:after,
        .cmr-tire-hero-tile:after,.cmr-equipment-hero-tile:after,
        .cmr-battery-hero-tile:after,.cmr-settings-hero-tile:after{
          background:rgba(62,190,210,.10);
        }

        .cmr-vehicle-card .cmr-mini,
        .cmr-vehicle-card .cmr-vehicle-legal-card,
        .cmr-vehicle-card .cmr-service-card{
          background:#f4f8fb;
          border-color:#d7e3ec;
          color:#08223d;
          box-shadow:none;
        }
        .cmr-vehicle-card .cmr-mini strong,
        .cmr-vehicle-card .cmr-vehicle-legal-card strong,
        .cmr-vehicle-card .cmr-service-card strong{
          color:#06213c;
        }
        .cmr-vehicle-card .cmr-mini span,
        .cmr-vehicle-card .cmr-vehicle-legal-card span,
        .cmr-vehicle-card .cmr-service-card span,
        .cmr-vehicle-card .cmr-service-card small{
          color:#54708c;
        }

        .cmr-kpi strong,.cmr-mini strong,.cmr-metric strong,.cmr-vehicle-legal-card strong,
        .cmr-stat-summary-card strong,.cmr-cost-hero-tile strong,.cmr-cost-mini-grid strong,
        .cmr-cost-type-bar strong,.cmr-cost-type-bar span,.cmr-upcoming-cost>strong,
        .cmr-fuel-hero-tile strong,.cmr-fuel-metrics strong,.cmr-fuel-receipt-main strong,
        .cmr-fuel-receipt-main b,.cmr-tire-hero-tile strong,.cmr-tire-metrics strong,
        .cmr-tire-set-main strong,.cmr-tire-set-side b,.cmr-equipment-hero-tile strong,
        .cmr-equipment-metrics strong,.cmr-equipment-required-card strong,
        .cmr-equipment-item-main strong,.cmr-equipment-item-side b,.cmr-battery-hero-tile strong,
        .cmr-battery-metrics strong,.cmr-battery-item-main strong,.cmr-battery-item-side b,
        .cmr-license-info-tile strong,.cmr-settings-hero-tile strong,.cmr-settings-checks strong,
        .cmr-settings-steps span,.cmr-admin-info-tile strong,.cmr-admin-chip strong,
        .cmr-admin-row strong,.cmr-admin-history-main strong{
          color:#f8fbff;
        }
        .cmr-kpi span,.cmr-mini span,.cmr-metric span,.cmr-vehicle-legal-card span,
        .cmr-stat-summary-card span,.cmr-cost-hero-tile span,.cmr-cost-hero-tile small,
        .cmr-cost-mini-grid span,.cmr-fuel-hero-tile span,.cmr-fuel-hero-tile small,
        .cmr-fuel-metrics span,.cmr-fuel-metrics small,.cmr-fuel-receipt-main span,
        .cmr-tire-hero-tile span,.cmr-tire-hero-tile small,.cmr-tire-metrics span,
        .cmr-tire-metrics small,.cmr-tire-set-main span,.cmr-equipment-hero-tile span,
        .cmr-equipment-hero-tile small,.cmr-equipment-metrics span,.cmr-equipment-metrics small,
        .cmr-equipment-required-card p,.cmr-equipment-item-main span,.cmr-battery-hero-tile span,
        .cmr-battery-hero-tile small,.cmr-battery-metrics span,.cmr-battery-metrics small,
        .cmr-battery-item-main span,.cmr-license-info-tile span,.cmr-settings-hero-tile span,
        .cmr-settings-hero-tile small,.cmr-settings-checks small,.cmr-admin-info-tile span,
        .cmr-admin-chip span,.cmr-admin-row span{
          color:#b9c9d9;
        }

        .cmr-alert-item{
          background:#203047;
          border-color:#3a4d64;
        }
        .cmr-alert-item strong{
          color:#f3f9ff;
        }
        .cmr-alert-item.critical ha-icon{color:#ff6b4a}
        .cmr-alert-item.warning ha-icon{color:#ffbd59}
        .cmr-issue-pill,.cmr-badge-critical{
          background:#ffe8df;
          color:#b23019;
        }

        .cmr-filterbar select,.cmr-page select,.cmr-license-form input,
        .cmr-settings-field input,.cmr-settings-field select,.cmr-fuel-form-grid input,.cmr-fuel-form-grid select,.cmr-fuel-form-grid textarea,
        .cmr-tire-form-grid input,.cmr-tire-form-grid select,.cmr-tire-form-grid textarea,
        .cmr-equipment-form-grid input,.cmr-equipment-form-grid select,.cmr-equipment-form-grid textarea,
        .cmr-battery-form-grid input,.cmr-battery-form-grid select,.cmr-battery-form-grid textarea,
        .cmr-admin-form-grid input,.cmr-admin-form-grid select,.cmr-admin-form-grid textarea{
          background:#121e2f;
          color:#f7fbff;
          border-color:#40546d;
        }
        .cmr-filterbar select option,.cmr-page select option{
          background:#121e2f;
          color:#f7fbff;
        }
        .cmr-tab{color:#c0cfdd}
        .cmr-tab.active{
          background:linear-gradient(135deg,#2486cf,#24b8c8);
          color:#fff;
          box-shadow:0 14px 30px rgba(36,134,207,.24);
        }
        .cmr-tab:not(.active):hover{background:#22324a;color:#fff}

        .cmr-chart-grid line,.cmr-bars-grid line{stroke:rgba(185,201,217,.16)}
        .cmr-chart-axis,.cmr-bars-axis{stroke:rgba(185,201,217,.36)}
        .cmr-chart-label,.cmr-bars-label{fill:#c2d0df}
        .cmr-chart-line{stroke:#40cfe4}
        .cmr-chart-point{fill:#40cfe4}
        .cmr-chart-area{fill:rgba(64,207,228,.16)}
        .cmr-bar{filter:drop-shadow(0 10px 20px rgba(0,0,0,.22))}
        .cmr-cost-type-bar i{background:#15273a}
        .cmr-cost-type-bar b{background:linear-gradient(90deg,#58d6e5,#2299d2)}
        .cmr-good-news{
          background:rgba(45,185,124,.13);
          border-color:rgba(45,185,124,.30);
          color:#93e8bd;
        }
        .cmr-good-news strong{color:#c4ffd9}

        .cmr-license-status-card{
          background:#172437;
          border-color:#32455d;
        }
        .cmr-license-status-pill{
          background:#203047;
          border-color:#3a4d64;
          color:#f8fbff;
        }
        .cmr-license-support-icon,.cmr-settings-card-head>ha-icon{
          background:#203047;
        }
        .cmr-license-message,.cmr-settings-message,.cmr-fuel-message,.cmr-tire-message,
        .cmr-equipment-message,.cmr-battery-message,.cmr-admin-message,.cmr-admin-help{
          background:rgba(64,207,228,.12);
          border-color:rgba(64,207,228,.28);
          color:#ccf5fb;
        }
        .cmr-license-message.warn{
          background:rgba(255,189,89,.14);
          border-color:rgba(255,189,89,.28);
          color:#ffe0a3;
        }
        .cmr-settings-steps strong{
          background:#40cfe4;
          color:#082033;
        }
        .cmr-tooltip{
          background:#eef7ff;
          color:#0d1725;
          box-shadow:0 12px 28px rgba(0,0,0,.32);
        }
      }

      @media (prefers-color-scheme: dark){
        .cmr-overview-hero,.cmr-alerts-panel,.cmr-legal-card,
        .cmr-vehicle-card .cmr-mini,
        .cmr-vehicle-card .cmr-vehicle-legal-card,
        .cmr-vehicle-card .cmr-service-card,
        .cmr-alert-item,
        .cmr-kpi,.cmr-mini,.cmr-metric,.cmr-vehicle-legal-card,.cmr-stat-summary-card,
        .cmr-cost-hero-tile,.cmr-cost-mini-grid div,.cmr-cost-type-bar,.cmr-upcoming-cost,
        .cmr-fuel-hero-tile,.cmr-fuel-metrics div,.cmr-fuel-form,.cmr-fuel-receipt,
        .cmr-tire-hero-tile,.cmr-tire-metrics div,.cmr-tire-form,.cmr-tire-set,
        .cmr-equipment-hero-tile,.cmr-equipment-metrics div,.cmr-equipment-form,
        .cmr-equipment-required-card,.cmr-equipment-item,.cmr-battery-hero-tile,
        .cmr-battery-metrics div,.cmr-battery-form,.cmr-battery-item,
        .cmr-license-info-tile,.cmr-license-action-row,.cmr-settings-hero-tile,
        .cmr-settings-checks label,.cmr-settings-steps div,.cmr-admin-info-tile,
        .cmr-admin-chip,.cmr-admin-row,.cmr-admin-history-record,.cmr-admin-service-form{
          background:#203047;
          border-color:#3a4d64;
          color:#edf6ff;
        }

        .cmr-overview-hero{
          background:linear-gradient(135deg,#172b41 0%,#17324a 100%);
          border-color:#34506a;
        }
        .cmr-alerts-panel,.cmr-legal-card{
          background:#172437;
          border-color:#2f435a;
        }
        .cmr-vehicle-card{
          background:#1b2a3e;
          border-color:#34475e;
        }
        .cmr-vehicle-card .cmr-mini,
        .cmr-vehicle-card .cmr-vehicle-legal-card,
        .cmr-vehicle-card .cmr-service-card{
          background:#23354c;
          border-color:#40546d;
          color:#edf6ff;
        }
        .cmr-vehicle-card .cmr-mini strong,
        .cmr-vehicle-card .cmr-vehicle-legal-card strong,
        .cmr-vehicle-card .cmr-service-card strong{
          color:#f8fbff;
        }
        .cmr-vehicle-card .cmr-mini span,
        .cmr-vehicle-card .cmr-vehicle-legal-card span,
        .cmr-vehicle-card .cmr-service-card span,
        .cmr-vehicle-card .cmr-service-card small{
          color:#b9c9d9;
        }
        .cmr-vehicle-legal-card.ok,
        .cmr-vehicle-card .cmr-vehicle-legal-card.ok,
        .cmr-vehicle-card .cmr-service-card.ok{
          border-left-color:#35c98a;
        }
        .cmr-vehicle-legal-card.warning,
        .cmr-vehicle-card .cmr-vehicle-legal-card.warning,
        .cmr-vehicle-card .cmr-service-card.warning{
          border-left-color:#ffbd59;
        }
        .cmr-vehicle-legal-card.critical,
        .cmr-vehicle-card .cmr-vehicle-legal-card.critical,
        .cmr-vehicle-card .cmr-service-card.critical{
          border-left-color:#ff6b4a;
        }

        .cmr-alert-item{
          background:#23354c;
          border-color:#40546d;
        }
        .cmr-alert-item strong,
        .cmr-alerts-panel h3,
        .cmr-overview-hero h3,
        .cmr-legal-card h3{
          color:#f8fbff;
        }
        .cmr-alert-item span,
        .cmr-alerts-panel span,
        .cmr-overview-hero p,
        .cmr-legal-card span{
          color:#b9c9d9;
        }

        .cmr-issue-pill{
          background:#3a211d;
          color:#ffb2a1;
          border:1px solid rgba(255,107,74,.28);
        }
        .cmr-badge-critical{
          background:#3a211d;
          color:#ffb2a1;
          border:1px solid rgba(255,107,74,.28);
        }
        .cmr-action-btn,
        .cmr-vehicle-card button,
        .cmr-alerts-panel button,
        .cmr-legal-card button{
          background:#dff8ff;
          color:#00405d;
        }
      }

      @media (prefers-color-scheme: dark){
        .cmr-page,
        .cmr-overview-page,
        .cmr-overview-section,
        .cmr-overview-block,
        .cmr-overview-card,
        .cmr-overview-vehicles,
        .cmr-overview-alerts,
        .cmr-vehicles-section,
        .cmr-alerts-panel,
        .cmr-legal-card{
          background:#172437 !important;
          border-color:#2f435a !important;
          color:#edf6ff !important;
        }

        .cmr-overview-page .cmr-overview-section,
        .cmr-overview-page .cmr-alerts-panel,
        .cmr-overview-page .cmr-legal-card{
          box-shadow:0 16px 38px rgba(0,0,0,.22) !important;
        }

        .cmr-overview-page h2,
        .cmr-overview-page h3,
        .cmr-overview-page h4,
        .cmr-alerts-panel h3,
        .cmr-legal-card h3,
        .cmr-overview-section h3,
        .cmr-overview-section h4{
          color:#f8fbff !important;
        }

        .cmr-overview-page p,
        .cmr-overview-page small,
        .cmr-overview-page span,
        .cmr-alerts-panel span,
        .cmr-legal-card span{
          color:#b9c9d9;
        }

        .cmr-overview-page .cmr-section-head span,
        .cmr-overview-page .cmr-page-title span{
          color:#8fb2d2 !important;
        }

        .cmr-overview-page .cmr-vehicle-card{
          background:#1b2a3e !important;
          border-color:#34475e !important;
        }

        .cmr-overview-page .cmr-mini,
        .cmr-overview-page .cmr-service-card,
        .cmr-overview-page .cmr-vehicle-legal-card{
          background:#23354c !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-overview-page .cmr-mini strong,
        .cmr-overview-page .cmr-service-card strong,
        .cmr-overview-page .cmr-vehicle-legal-card strong{
          color:#f8fbff !important;
        }

        .cmr-overview-page .cmr-mini span,
        .cmr-overview-page .cmr-service-card span,
        .cmr-overview-page .cmr-service-card small,
        .cmr-overview-page .cmr-vehicle-legal-card span,
        .cmr-overview-page .cmr-vehicle-legal-card small{
          color:#b9c9d9 !important;
        }

        .cmr-overview-page .cmr-alert-item{
          background:#23354c !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
        }

        .cmr-overview-page .cmr-alert-item strong{
          color:#f8fbff !important;
        }

        .cmr-overview-page .cmr-alert-item span{
          color:#b9c9d9 !important;
        }

        .cmr-overview-page .cmr-good-news{
          background:rgba(45,185,124,.13) !important;
          border-color:rgba(45,185,124,.30) !important;
          color:#93e8bd !important;
        }

        .cmr-overview-page .cmr-issue-pill,
        .cmr-overview-page .cmr-badge-critical{
          background:#3a211d !important;
          color:#ffb2a1 !important;
          border:1px solid rgba(255,107,74,.28) !important;
        }

        .cmr-overview-page .cmr-empty,
        .cmr-overview-page .cmr-admin-empty{
          background:#203047 !important;
          border-color:#3a4d64 !important;
          color:#b9c9d9 !important;
        }
      }

      @media (prefers-color-scheme: dark){
        .cmr-overview-page .cmr-vehicle-card [class*="metric"],
        .cmr-overview-page .cmr-vehicle-card [class*="legal"],
        .cmr-overview-page .cmr-vehicle-card [class*="service"],
        .cmr-overview-page .cmr-vehicle-card [class*="term"],
        .cmr-overview-page .cmr-vehicle-card [class*="maintenance"],
        .cmr-overview-page .cmr-vehicle-card [class*="mini"],
        .cmr-overview-page .cmr-vehicle-card article,
        .cmr-overview-page .cmr-vehicle-card li,
        .cmr-overview-page .cmr-vehicle-card .cmr-card,
        .cmr-overview-page .cmr-vehicle-card .cmr-tile,
        .cmr-overview-page .cmr-vehicle-card .cmr-item{
          background:#23354c !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-overview-page .cmr-vehicle-card [class*="metric"] strong,
        .cmr-overview-page .cmr-vehicle-card [class*="legal"] strong,
        .cmr-overview-page .cmr-vehicle-card [class*="service"] strong,
        .cmr-overview-page .cmr-vehicle-card [class*="term"] strong,
        .cmr-overview-page .cmr-vehicle-card [class*="maintenance"] strong,
        .cmr-overview-page .cmr-vehicle-card [class*="mini"] strong,
        .cmr-overview-page .cmr-vehicle-card article strong,
        .cmr-overview-page .cmr-vehicle-card li strong,
        .cmr-overview-page .cmr-vehicle-card .cmr-card strong,
        .cmr-overview-page .cmr-vehicle-card .cmr-tile strong,
        .cmr-overview-page .cmr-vehicle-card .cmr-item strong,
        .cmr-overview-page .cmr-vehicle-card [class*="metric"] b,
        .cmr-overview-page .cmr-vehicle-card [class*="legal"] b,
        .cmr-overview-page .cmr-vehicle-card [class*="service"] b,
        .cmr-overview-page .cmr-vehicle-card [class*="term"] b,
        .cmr-overview-page .cmr-vehicle-card [class*="maintenance"] b,
        .cmr-overview-page .cmr-vehicle-card [class*="mini"] b{
          color:#f8fbff !important;
        }

        .cmr-overview-page .cmr-vehicle-card [class*="metric"] span,
        .cmr-overview-page .cmr-vehicle-card [class*="legal"] span,
        .cmr-overview-page .cmr-vehicle-card [class*="service"] span,
        .cmr-overview-page .cmr-vehicle-card [class*="term"] span,
        .cmr-overview-page .cmr-vehicle-card [class*="maintenance"] span,
        .cmr-overview-page .cmr-vehicle-card [class*="mini"] span,
        .cmr-overview-page .cmr-vehicle-card [class*="metric"] small,
        .cmr-overview-page .cmr-vehicle-card [class*="legal"] small,
        .cmr-overview-page .cmr-vehicle-card [class*="service"] small,
        .cmr-overview-page .cmr-vehicle-card [class*="term"] small,
        .cmr-overview-page .cmr-vehicle-card [class*="maintenance"] small,
        .cmr-overview-page .cmr-vehicle-card [class*="mini"] small{
          color:#b9c9d9 !important;
        }

        .cmr-overview-page .cmr-vehicle-card ha-icon{
          color:#27bfd4 !important;
        }

        .cmr-overview-page .cmr-vehicle-card .ok,
        .cmr-overview-page .cmr-vehicle-card [class*="ok"]{
          border-left-color:#35c98a !important;
        }
        .cmr-overview-page .cmr-vehicle-card .warning,
        .cmr-overview-page .cmr-vehicle-card [class*="warning"]{
          border-left-color:#ffbd59 !important;
        }
        .cmr-overview-page .cmr-vehicle-card .critical,
        .cmr-overview-page .cmr-vehicle-card [class*="critical"]{
          border-left-color:#ff6b4a !important;
        }

        .cmr-overview-page .cmr-vehicle-card .cmr-icon,
        .cmr-overview-page .cmr-vehicle-card [class*="icon"]{
          background:rgba(39,191,212,.14) !important;
        }

        .cmr-overview-page .cmr-vehicle-card > div:not([class]),
        .cmr-overview-page .cmr-vehicle-card section:not(.cmr-vehicle-actions){
          background:transparent !important;
        }
      }

      @media (prefers-color-scheme: dark){
        .cmr-overview-page .cmr-mini-grid > div,
        .cmr-overview-page .cmr-vehicle-maintenance > *,
        .cmr-overview-page .cmr-vehicle-legal > *,
        .cmr-overview-page .cmr-vehicle-legal-empty,
        .cmr-overview-page .cmr-vehicle-ok{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-overview-page .cmr-mini-grid > div span,
        .cmr-overview-page .cmr-vehicle-maintenance > * span,
        .cmr-overview-page .cmr-vehicle-legal > * span,
        .cmr-overview-page .cmr-vehicle-legal-empty,
        .cmr-overview-page .cmr-vehicle-ok{
          color:#b9c9d9 !important;
        }

        .cmr-overview-page .cmr-mini-grid > div strong,
        .cmr-overview-page .cmr-vehicle-maintenance > * strong,
        .cmr-overview-page .cmr-vehicle-legal > * strong,
        .cmr-overview-page .cmr-vehicle-maintenance > * b,
        .cmr-overview-page .cmr-vehicle-legal > * b{
          color:#f8fbff !important;
        }

        .cmr-overview-page .cmr-vehicle-maintenance > *.ok,
        .cmr-overview-page .cmr-vehicle-legal > *.ok{
          border-left-color:#35c98a !important;
        }
        .cmr-overview-page .cmr-vehicle-maintenance > *.warning,
        .cmr-overview-page .cmr-vehicle-legal > *.warning{
          border-left-color:#ffbd59 !important;
        }
        .cmr-overview-page .cmr-vehicle-maintenance > *.critical,
        .cmr-overview-page .cmr-vehicle-legal > *.critical{
          border-left-color:#ff6b4a !important;
        }

        .cmr-overview-page .cmr-mini-grid > div::before,
        .cmr-overview-page .cmr-mini-grid > div::after,
        .cmr-overview-page .cmr-vehicle-maintenance > *::before,
        .cmr-overview-page .cmr-vehicle-maintenance > *::after,
        .cmr-overview-page .cmr-vehicle-legal > *::before,
        .cmr-overview-page .cmr-vehicle-legal > *::after{
          background:transparent !important;
          background-image:none !important;
        }

        .cmr-overview-page .cmr-vehicle-card ha-icon,
        .cmr-overview-page .cmr-vehicle-legal-icon ha-icon,
        .cmr-overview-page .cmr-maintenance-icon ha-icon{
          color:#27bfd4 !important;
        }
      }

      @media (prefers-color-scheme: dark){
        .cmr-overview-page .cmr-mini-grid,
        .cmr-overview-page .cmr-vehicle-maintenance,
        .cmr-overview-page .cmr-vehicle-legal{
          background:transparent !important;
          background-image:none !important;
          border-color:transparent !important;
          box-shadow:none !important;
        }

        .cmr-overview-page .cmr-mini-grid::before,
        .cmr-overview-page .cmr-mini-grid::after,
        .cmr-overview-page .cmr-vehicle-maintenance::before,
        .cmr-overview-page .cmr-vehicle-maintenance::after,
        .cmr-overview-page .cmr-vehicle-legal::before,
        .cmr-overview-page .cmr-vehicle-legal::after{
          display:none !important;
          background:transparent !important;
          background-image:none !important;
        }

        .cmr-overview-page .cmr-vehicle-card{
          overflow:hidden;
        }
      }

      @media (prefers-color-scheme: dark){
        /* Containere structurale: nu trebuie să creeze plăci în spatele cardurilor. */
        .cmr-page [class*="grid"],
        .cmr-page [class*="list"],
        .cmr-page [class*="section"],
        .cmr-page [class*="maintenance"],
        .cmr-page [class*="legal"],
        .cmr-page [class*="metrics"],
        .cmr-page [class*="summary"]{
          background-color:transparent;
        }

        /* Carduri / rânduri / empty state pe dark, pentru toate taburile panelului. */
        .cmr-page article,
        .cmr-page li,
        .cmr-page .cmr-mini,
        .cmr-page .cmr-metric,
        .cmr-page .cmr-card,
        .cmr-page .cmr-tile,
        .cmr-page .cmr-item,
        .cmr-page .cmr-row,
        .cmr-page .cmr-empty,
        .cmr-page .cmr-admin-empty,
        .cmr-page .cmr-vehicle-ok,
        .cmr-page .cmr-vehicle-legal-empty,
        .cmr-page .cmr-alert-item,
        .cmr-page .cmr-upcoming-cost,
        .cmr-page .cmr-cost-type-bar,
        .cmr-page .cmr-fuel-receipt,
        .cmr-page .cmr-tire-set,
        .cmr-page .cmr-equipment-required-card,
        .cmr-page .cmr-equipment-item,
        .cmr-page .cmr-battery-item,
        .cmr-page .cmr-settings-checks label,
        .cmr-page .cmr-settings-steps div,
        .cmr-page .cmr-admin-history-record,
        .cmr-page .cmr-admin-row,
        .cmr-page .cmr-admin-chip,
        .cmr-page .cmr-admin-info-tile,
        .cmr-page .cmr-stat-summary-card,
        .cmr-page .cmr-cost-mini-grid > div,
        .cmr-page .cmr-fuel-metrics > div,
        .cmr-page .cmr-tire-metrics > div,
        .cmr-page .cmr-equipment-metrics > div,
        .cmr-page .cmr-battery-metrics > div,
        .cmr-page .cmr-mini-grid > div,
        .cmr-page .cmr-vehicle-maintenance > *,
        .cmr-page .cmr-vehicle-legal > *{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        /* Tile-urile mari de sumar rămân dark coerent. */
        .cmr-page .cmr-kpi,
        .cmr-page .cmr-cost-hero-tile,
        .cmr-page .cmr-fuel-hero-tile,
        .cmr-page .cmr-tire-hero-tile,
        .cmr-page .cmr-equipment-hero-tile,
        .cmr-page .cmr-battery-hero-tile,
        .cmr-page .cmr-settings-hero-tile,
        .cmr-page .cmr-license-info-tile,
        .cmr-page .cmr-vehicles-hero-tile{
          background:#203047 !important;
          border-color:#3a4d64 !important;
          color:#edf6ff !important;
        }

        /* Fundaluri de formulare. */
        .cmr-page form,
        .cmr-page .cmr-fuel-form,
        .cmr-page .cmr-tire-form,
        .cmr-page .cmr-equipment-form,
        .cmr-page .cmr-battery-form,
        .cmr-page .cmr-admin-service-form{
          background:#1d2d43 !important;
          border-color:#3a4d64 !important;
          color:#edf6ff !important;
        }
/* Elemente cu alb din reguli vechi, inclusiv empty rows din Anvelope/Baterie și badge-ul din Setări. */
        .cmr-page .cmr-admin-empty,
        .cmr-page .cmr-empty,
        .cmr-page .cmr-license-status-pill,
        .cmr-page code{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
        }

        /* Text principal și secundar pe toate cardurile interne. */
        .cmr-page article strong,
        .cmr-page article b,
        .cmr-page li strong,
        .cmr-page li b,
        .cmr-page .cmr-mini strong,
        .cmr-page .cmr-metric strong,
        .cmr-page .cmr-tile strong,
        .cmr-page .cmr-item strong,
        .cmr-page .cmr-row strong{
          color:#f8fbff !important;
        }

        .cmr-page article span,
        .cmr-page article small,
        .cmr-page article p,
        .cmr-page li span,
        .cmr-page li small,
        .cmr-page li p,
        .cmr-page .cmr-mini span,
        .cmr-page .cmr-metric span,
        .cmr-page .cmr-tile span,
        .cmr-page .cmr-item span,
        .cmr-page .cmr-row span{
          color:#b9c9d9 !important;
        }

        /* Headerele secțiunilor din carduri nu trebuie să fie pe alb. */
        .cmr-page header,
        .cmr-page .cmr-section-head,
        .cmr-page .cmr-settings-card-head,
        .cmr-page .cmr-equipment-section-title,
        .cmr-page .cmr-battery-section-title,
        .cmr-page .cmr-tire-section-title,
        .cmr-page .cmr-fuel-section-title{
          background:transparent !important;
          background-image:none !important;
        }

        /* Liniile vizuale și separatoarele. */
        .cmr-page hr,
        .cmr-page .cmr-divider{
          border-color:#3a4d64 !important;
          background:#3a4d64 !important;
        }

        /* Form controls. */
        .cmr-page input,
        .cmr-page select,
        .cmr-page textarea{
          background:#121e2f !important;
          color:#f7fbff !important;
          border-color:#40546d !important;
        }

        .cmr-page input::placeholder,
        .cmr-page textarea::placeholder{
          color:#8da4ba !important;
        }

        /* Butoane și badge-uri cu rol de acțiune rămân accent light-blue. */
        .cmr-page button:not(.danger),
        .cmr-page .cmr-action-btn{
          background:#dff8ff;
          color:#00405d;
        }

        .cmr-page button.danger,
        .cmr-page .danger{
          background:#3a211d !important;
          color:#ffb2a1 !important;
          border-color:rgba(255,107,74,.28) !important;
        }

        .cmr-page .cmr-issue-pill,
        .cmr-page .cmr-badge-critical,
        .cmr-page em{
          background:#3a211d !important;
          color:#ffb2a1 !important;
          border:1px solid rgba(255,107,74,.28) !important;
        }

        /* Icon bubble-urile nu mai trebuie să apară ca alb puternic. */
        .cmr-page .cmr-icon,
        .cmr-page [class*="icon"]{
          background:rgba(39,191,212,.14) !important;
          color:#27bfd4 !important;
        }

        .cmr-page ha-icon{
          color:#27bfd4;
        }

        /* Pseudo-elemente care produceau cercuri/overlay-uri foarte deschise. */
        .cmr-page article::before,
        .cmr-page article::after,
        .cmr-page .cmr-kpi::after,
        .cmr-page .cmr-cost-hero-tile::after,
        .cmr-page .cmr-fuel-hero-tile::after,
        .cmr-page .cmr-tire-hero-tile::after,
        .cmr-page .cmr-equipment-hero-tile::after,
        .cmr-page .cmr-battery-hero-tile::after,
        .cmr-page .cmr-settings-hero-tile::after{
          background:rgba(39,191,212,.08) !important;
        }

        /* Zonele fără date din anvelope/baterie/statistici trebuie să fie dark, nu alb. */
        .cmr-page [class*="empty"],
        .cmr-page [class*="missing"],
        .cmr-page [class*="no-data"]{
          background:#23354c !important;
          border-color:#40546d !important;
          color:#b9c9d9 !important;
        }
      }

      @media (prefers-color-scheme: dark){
        /* Fundaluri principale pe paginile unde au rămas suprafețe light. */
        .cmr-overview-page,
        .cmr-vehicles-page,
        .cmr-statistics-page,
        .cmr-overview-section,
        .cmr-vehicles-toolbar,
        .cmr-admin-vehicle-card,
        .cmr-admin-sections section,
        .cmr-stat-card,
        .cmr-chart-card,
        .cmr-statistics-stack > *,
        .cmr-stack > *{
          background:#172437 !important;
          background-image:none !important;
          border-color:#2f435a !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        /* Cardurile de sumar din Mașini / Statistici nu mai sunt albe. */
        .cmr-stat-summary-tile,
        .cmr-kpi,
        .cmr-vehicles-hero > *,
        .cmr-statistics-hero > *{
          background:#203047 !important;
          background-image:none !important;
          border-color:#3a4d64 !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-stat-summary-tile:after,
        .cmr-kpi:after,
        .cmr-vehicles-hero > *:after,
        .cmr-statistics-hero > *:after{
          background:rgba(39,191,212,.08) !important;
        }

        /* Home: scoatem placa/gradientul din spatele mini-cardurilor și facem cardurile uniforme. */
        .cmr-overview-page .cmr-mini-grid,
        .cmr-overview-page .cmr-vehicle-maintenance,
        .cmr-overview-page .cmr-vehicle-legal,
        .cmr-overview-page .cmr-vehicle-alerts{
          background:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
        }

        .cmr-overview-page .cmr-mini-grid > div,
        .cmr-overview-page .cmr-vehicle-maintenance-chip,
        .cmr-overview-page .cmr-vehicle-legal-chip,
        .cmr-overview-page .cmr-vehicle-legal-empty,
        .cmr-overview-page .cmr-vehicle-ok{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        /* Mașini: secțiuni, tabele și chipuri pe dark, nu alb. */
        .cmr-vehicles-page .cmr-admin-profile-grid,
        .cmr-vehicles-page .cmr-admin-chip-grid,
        .cmr-vehicles-page .cmr-admin-chip-grid.one,
        .cmr-vehicles-page .cmr-admin-table,
        .cmr-vehicles-page .cmr-admin-alerts,
        .cmr-vehicles-page .cmr-admin-actions{
          background:transparent !important;
          background-image:none !important;
          border-color:transparent !important;
          box-shadow:none !important;
        }

        .cmr-admin-info-tile,
        .cmr-admin-chip,
        .cmr-admin-row,
        .cmr-admin-empty,
        .cmr-admin-ok,
        .cmr-admin-history-record,
        .cmr-admin-table,
        .cmr-admin-table tr,
        .cmr-admin-table td,
        .cmr-admin-table th,
        .cmr-vehicles-page .cmr-vehicle-maintenance-chip,
        .cmr-vehicles-page .cmr-vehicle-legal-chip,
        .cmr-vehicles-page .cmr-admin-alerts span{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-admin-table{
          border-radius:16px !important;
          overflow:hidden;
        }

        .cmr-admin-table tr + tr td,
        .cmr-admin-table tr + tr th{
          border-top:1px solid #40546d !important;
        }

        /* Statistici: cardurile mașinilor și graficele nu mai au carcasă albă. */
        .cmr-stat-card,
        .cmr-statistics-page .cmr-stat-card,
        .cmr-statistics-page .cmr-chart-card{
          background:#172437 !important;
          background-image:none !important;
          border-color:#2f435a !important;
          color:#edf6ff !important;
        }

        .cmr-statistics-page .cmr-mini-grid,
        .cmr-statistics-page .cmr-metrics-row{
          background:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
        }

        .cmr-statistics-page .cmr-mini-grid > div,
        .cmr-statistics-page .cmr-metrics-row > div{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-statistics-page .cmr-chart-card .cmr-chart,
        .cmr-statistics-page .cmr-chart,
        .cmr-statistics-page .cmr-bars{
          background:#132338 !important;
          background-image:none !important;
          border-radius:16px;
        }

        .cmr-statistics-page .cmr-chart-card{
          padding:16px !important;
        }

        /* Chipurile de depășiri: contrast mai bun, comun peste tot unde apar. */
        .cmr-vehicle-alerts span,
        .cmr-admin-alerts span,
        .cmr-page .cmr-issue-pill,
        .cmr-page .cmr-badge-critical{
          background:#4a261f !important;
          color:#ffd1c6 !important;
          border:1px solid rgba(255,107,74,.38) !important;
          text-shadow:none !important;
        }

        .cmr-vehicle-alerts span.warning,
        .cmr-admin-alerts span.warning{
          background:#4a3518 !important;
          color:#ffe0a3 !important;
          border-color:rgba(255,189,89,.38) !important;
        }

        .cmr-vehicle-alerts span.critical,
        .cmr-admin-alerts span.critical{
          background:#4a261f !important;
          color:#ffd1c6 !important;
          border-color:rgba(255,107,74,.38) !important;
        }

        /* Texte lizibile pe cardurile dark. */
        .cmr-mini-grid > div span,
        .cmr-metrics-row > div span,
        .cmr-vehicle-maintenance-chip span,
        .cmr-vehicle-legal-chip span,
        .cmr-admin-info-tile span,
        .cmr-admin-row span,
        .cmr-admin-chip span,
        .cmr-stat-summary-tile span,
        .cmr-kpi span{
          color:#b9c9d9 !important;
        }

        .cmr-mini-grid > div strong,
        .cmr-metrics-row > div strong,
        .cmr-vehicle-maintenance-chip strong,
        .cmr-vehicle-legal-chip strong,
        .cmr-admin-info-tile strong,
        .cmr-admin-row strong,
        .cmr-admin-chip strong,
        .cmr-stat-summary-tile strong,
        .cmr-kpi strong{
          color:#f8fbff !important;
        }

        .cmr-vehicle-maintenance-chip small,
        .cmr-vehicle-legal-chip small,
        .cmr-admin-info-tile small,
        .cmr-admin-row small,
        .cmr-admin-chip small{
          color:#b9c9d9 !important;
        }

        /* Icon bubble-urile rămân accent, dar nu albe. */
        .cmr-vehicle-maintenance-chip ha-icon,
        .cmr-vehicle-legal-chip ha-icon,
        .cmr-admin-section-title ha-icon,
        .cmr-admin-info-tile ha-icon{
          background:rgba(39,191,212,.14) !important;
          color:#27bfd4 !important;
        }

        .cmr-vehicle-maintenance-chip.warning ha-icon,
        .cmr-vehicle-legal-chip.warning ha-icon{
          background:rgba(255,189,89,.14) !important;
          color:#ffbd59 !important;
        }

        .cmr-vehicle-maintenance-chip.critical ha-icon,
        .cmr-vehicle-legal-chip.critical ha-icon{
          background:rgba(255,107,74,.14) !important;
          color:#ff8b76 !important;
        }

        /* Borduri de status pe dark. */
        .cmr-vehicle-maintenance-chip.ok,
        .cmr-vehicle-legal-chip.ok{
          border-left-color:#35c98a !important;
        }
        .cmr-vehicle-maintenance-chip.warning,
        .cmr-vehicle-legal-chip.warning{
          border-left-color:#ffbd59 !important;
        }
        .cmr-vehicle-maintenance-chip.critical,
        .cmr-vehicle-legal-chip.critical{
          border-left-color:#ff6b4a !important;
        }

        /* Orice container cu alb explicit din aceste pagini este forțat la dark. */
        .cmr-overview-page [style*="background:#fff"],
        .cmr-overview-page [style*="background: #fff"],
        .cmr-vehicles-page [style*="background:#fff"],
        .cmr-vehicles-page [style*="background: #fff"],
        .cmr-statistics-page [style*="background:#fff"],
        .cmr-statistics-page [style*="background: #fff"]{
          background:#23354c !important;
          color:#edf6ff !important;
        }
      }

      @media (prefers-color-scheme: dark){
        /* 1. Acasă: containerele-grilă nu trebuie să aibă fundal propriu în spatele cardurilor. */
        .cmr-overview-page .cmr-mini-grid,
        .cmr-overview-page .cmr-vehicle-maintenance,
        .cmr-overview-page .cmr-vehicle-legal,
        .cmr-overview-page .cmr-vehicle-alerts,
        .cmr-vehicle-card .cmr-mini-grid,
        .cmr-vehicle-card .cmr-vehicle-maintenance,
        .cmr-vehicle-card .cmr-vehicle-legal,
        .cmr-vehicle-card .cmr-vehicle-alerts{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding-left:0 !important;
          padding-right:0 !important;
        }

        .cmr-overview-page .cmr-mini-grid > div,
        .cmr-overview-page .cmr-vehicle-maintenance-chip,
        .cmr-overview-page .cmr-vehicle-legal-chip,
        .cmr-vehicle-card .cmr-mini-grid > div,
        .cmr-vehicle-card .cmr-vehicle-maintenance-chip,
        .cmr-vehicle-card .cmr-vehicle-legal-chip{
          background:#23354c !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
        }

        /* 2. Badge status Mașini: să nu mai arate ca un buton alb rupt de temă. */
        .cmr-admin-status strong,
        .cmr-admin-vehicle-card .cmr-admin-status strong,
        .cmr-admin-vehicle-card.is-critical .cmr-admin-status strong{
          background:#4a261f !important;
          color:#ffd1c6 !important;
          border:1px solid rgba(255,107,74,.38) !important;
          box-shadow:none !important;
        }

        .cmr-admin-vehicle-card.is-warning .cmr-admin-status strong{
          background:#4a3518 !important;
          color:#ffe0a3 !important;
          border:1px solid rgba(255,189,89,.38) !important;
        }

        .cmr-admin-vehicle-card.is-ok .cmr-admin-status strong{
          background:#183c34 !important;
          color:#a8f2cf !important;
          border:1px solid rgba(53,201,138,.35) !important;
        }

        .cmr-status-badge{
          background:#23354c !important;
          color:#edf6ff !important;
          border:1px solid #40546d !important;
        }

        .cmr-vehicle-card.is-critical .cmr-status-badge{
          background:#4a261f !important;
          color:#ffd1c6 !important;
          border-color:rgba(255,107,74,.38) !important;
        }

        .cmr-vehicle-card.is-warning .cmr-status-badge{
          background:#4a3518 !important;
          color:#ffe0a3 !important;
          border-color:rgba(255,189,89,.38) !important;
        }

        .cmr-vehicle-card.is-ok .cmr-status-badge{
          background:#183c34 !important;
          color:#a8f2cf !important;
          border-color:rgba(53,201,138,.35) !important;
        }

        /* 3. Statistici: pilulele informative de sub grafice trebuie integrate în dark mode. */
        .cmr-statistics-page .cmr-pill,
        .cmr-statistics-page .cmr-chart-card .cmr-pill,
        .cmr-statistics-page footer .cmr-pill,
        .cmr-statistics-page .cmr-chart-note,
        .cmr-statistics-page .cmr-chart-foot,
        .cmr-statistics-page .cmr-chart-footer,
        .cmr-statistics-page .cmr-chart-meta,
        .cmr-statistics-page .cmr-chart-card footer span,
        .cmr-statistics-page .cmr-chart-card footer small,
        .cmr-statistics-page .cmr-chart-card > span,
        .cmr-statistics-page .cmr-chart-card > small{
          background:#23354c !important;
          color:#cfe0ef !important;
          border:1px solid #40546d !important;
          box-shadow:none !important;
        }

        /* 4. Combustibil: butoane Editare / Șterge cu aceeași dimensiune. */
        .cmr-fuel-page .cmr-fuel-receipt button,
        .cmr-fuel-page .cmr-receipt-actions button,
        .cmr-fuel-page [data-action="edit-fuel-receipt"],
        .cmr-fuel-page [data-action="delete-fuel-receipt"]{
          min-width:86px !important;
          height:34px !important;
          justify-content:center !important;
          padding:0 14px !important;
          box-sizing:border-box !important;
        }

        .cmr-fuel-page button.danger,
        .cmr-fuel-page .danger,
        .cmr-fuel-page [data-action="delete-fuel-receipt"]{
          min-width:86px !important;
        }

        /* 5. Licență: formularul nu trebuie să creeze placa închisă din spatele textboxului. */
        .cmr-license-form{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          padding:0 !important;
        }

        .cmr-license-form input{
          background:#121e2f !important;
          border-color:#40546d !important;
          color:#f7fbff !important;
        }

        /* 6. Setări: lista de checkbox-uri nu trebuie să aibă fundal propriu în spate. */
        .cmr-settings-checks{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          padding:0 !important;
        }

        .cmr-settings-checks label{
          background:#23354c !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
        }

        .cmr-settings-checks label strong{
          color:#f8fbff !important;
        }

        .cmr-settings-checks label small{
          color:#b9c9d9 !important;
        }
      }

      @media (prefers-color-scheme: dark){
        /* 1. Home: scoate complet fundalul containerului .cmr-mini-grid. */
        .cmr-mini-grid,
        .cmr-mini-grid.one,
        .cmr-mini-grid.two,
        .cmr-mini-grid.three,
        .cmr-mini-grid.four,
        .cmr-mini-grid.five,
        .cmr-mini-grid.six{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding:0 !important;
        }
        .cmr-mini-grid::before,
        .cmr-mini-grid::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          box-shadow:none !important;
          border:0 !important;
        }
        .cmr-mini-grid > *,
        .cmr-mini,
        .cmr-metric{
          background:#23354c !important;
          background-color:#23354c !important;
          background-image:none !important;
          border:1px solid #40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        /* Containere similare din Home/Mașini fără backplate. */
        .cmr-vehicle-maintenance,
        .cmr-vehicle-legal,
        .cmr-vehicle-alerts,
        .cmr-admin-profile-grid,
        .cmr-admin-chip-grid,
        .cmr-admin-alerts{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding-left:0 !important;
          padding-right:0 !important;
        }
        .cmr-vehicle-maintenance::before,
        .cmr-vehicle-maintenance::after,
        .cmr-vehicle-legal::before,
        .cmr-vehicle-legal::after,
        .cmr-vehicle-alerts::before,
        .cmr-vehicle-alerts::after,
        .cmr-admin-profile-grid::before,
        .cmr-admin-profile-grid::after,
        .cmr-admin-chip-grid::before,
        .cmr-admin-chip-grid::after,
        .cmr-admin-alerts::before,
        .cmr-admin-alerts::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          box-shadow:none !important;
        }
        .cmr-vehicle-maintenance-chip,
        .cmr-vehicle-legal-chip,
        .cmr-admin-info-tile,
        .cmr-admin-chip,
        .cmr-admin-row,
        .cmr-admin-history-record,
        .cmr-admin-service-form,
        .cmr-admin-empty{
          background:#23354c !important;
          background-color:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        /* 2. Mașini: badge Critic / Atenție / OK. */
        .cmr-admin-status,
        .cmr-admin-status *{
          background:transparent !important;
          background-image:none !important;
          box-shadow:none !important;
        }
        .cmr-admin-status strong,
        .cmr-admin-status b,
        .cmr-status-badge,
        .cmr-badge-critical{
          display:inline-flex !important;
          align-items:center !important;
          justify-content:center !important;
          min-height:26px !important;
          padding:5px 12px !important;
          border-radius:999px !important;
          background:#4a261f !important;
          background-image:none !important;
          color:#ffd1c6 !important;
          border:1px solid rgba(255,107,74,.45) !important;
          box-shadow:none !important;
          font-weight:900 !important;
        }

        /* 3. Statistici: pilule/nota sub grafice. */
        .cmr-statistics-page .cmr-pill,
        .cmr-statistics-page .cmr-chart-note,
        .cmr-statistics-page .cmr-chart-foot,
        .cmr-statistics-page .cmr-chart-footer,
        .cmr-statistics-page .cmr-chart-meta,
        .cmr-statistics-page .cmr-chart-card footer,
        .cmr-statistics-page .cmr-chart-card footer *,
        .cmr-statistics-page .cmr-chart-card > .cmr-pill,
        .cmr-statistics-page .cmr-chart-card > small,
        .cmr-statistics-page .cmr-chart-card > span{
          background:#1f3148 !important;
          background-image:none !important;
          color:#cfe0ef !important;
          border-color:#40546d !important;
          box-shadow:none !important;
        }
        .cmr-stat-card,
        .cmr-statistics-page .cmr-stat-card{
          background:#172437 !important;
          background-image:none !important;
          border-color:#2f435a !important;
          color:#edf6ff !important;
        }

        /* 4. Combustibil: Editare / Șterge egale. */
        .cmr-fuel-receipt button,
        .cmr-fuel-page button,
        .cmr-receipt-actions button,
        button[data-action="edit-fuel-receipt"],
        button[data-action="delete-fuel-receipt"],
        button[data-action="fuel-edit"],
        button[data-action="fuel-delete"]{
          min-width:92px !important;
          width:92px !important;
          height:34px !important;
          padding:0 12px !important;
          display:inline-flex !important;
          align-items:center !important;
          justify-content:center !important;
          box-sizing:border-box !important;
          line-height:1 !important;
        }

        /* 5. Licență: cmr-license-form fără fundal. */
        .cmr-license-form,
        form.cmr-license-form,
        .cmr-license-section .cmr-license-form{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding:0 !important;
        }
        .cmr-license-form::before,
        .cmr-license-form::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          box-shadow:none !important;
        }
        .cmr-license-form input{
          background:#121e2f !important;
          background-color:#121e2f !important;
          color:#f7fbff !important;
          border-color:#40546d !important;
          box-shadow:none !important;
        }

        /* 6. Setări: cmr-settings-checks fără fundal. */
        .cmr-settings-checks,
        .cmr-settings-card .cmr-settings-checks{
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding:0 !important;
        }
        .cmr-settings-checks::before,
        .cmr-settings-checks::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          box-shadow:none !important;
        }
        .cmr-settings-checks label{
          background:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }
        .cmr-settings-checks label strong{
          color:#f8fbff !important;
        }
        .cmr-settings-checks label small{
          color:#b9c9d9 !important;
        }

        /* Badge-urile de depășiri, comune. */
        .cmr-vehicle-alerts span,
        .cmr-admin-alerts span,
        .cmr-issue-pill{
          background:#4a261f !important;
          background-image:none !important;
          color:#ffd1c6 !important;
          border:1px solid rgba(255,107,74,.45) !important;
          text-shadow:none !important;
          box-shadow:none !important;
        }

        .cmr-mini-grid > * strong,
        .cmr-mini strong,
        .cmr-metric strong,
        .cmr-vehicle-maintenance-chip strong,
        .cmr-vehicle-legal-chip strong,
        .cmr-admin-info-tile strong,
        .cmr-admin-chip strong,
        .cmr-admin-row strong{
          color:#f8fbff !important;
        }
        .cmr-mini-grid > * span,
        .cmr-mini span,
        .cmr-metric span,
        .cmr-mini-grid > * small,
        .cmr-mini small,
        .cmr-metric small,
        .cmr-vehicle-maintenance-chip small,
        .cmr-vehicle-legal-chip small,
        .cmr-admin-info-tile small,
        .cmr-admin-chip small,
        .cmr-admin-row small{
          color:#b9c9d9 !important;
        }
      }

      @media (prefers-color-scheme: dark){
        /* Eliminare sursă reală a fundalurilor rămase: variabila HA/Material surface pe containerele interne. */
        .cmr-mini-grid,
        .cmr-vehicle-maintenance,
        .cmr-vehicle-legal,
        .cmr-vehicle-alerts,
        .cmr-license-form,
        .cmr-settings-form,
        .cmr-settings-checks,
        .cmr-admin-profile-grid,
        .cmr-admin-chip-grid,
        .cmr-admin-alerts,
        .cmr-statistics-page .cmr-mini-grid,
        .cmr-statistics-page .cmr-metrics-row{
          --mdc-theme-surface:transparent !important;
          --ha-card-background:transparent !important;
          --card-background-color:transparent !important;
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border-color:transparent !important;
          box-shadow:none !important;
          outline:0 !important;
        }

        .cmr-license-form,
        .cmr-settings-form,
        .cmr-settings-checks{
          padding:0 !important;
          margin-left:0 !important;
          margin-right:0 !important;
        }

        .cmr-mini-grid > *,
        .cmr-vehicle-maintenance-chip,
        .cmr-vehicle-legal-chip,
        .cmr-settings-checks label{
          --mdc-theme-surface:#23354c !important;
          --ha-card-background:#23354c !important;
          --card-background-color:#23354c !important;
          background:#23354c !important;
          background-color:#23354c !important;
          background-image:none !important;
          border-color:#40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        .cmr-license-form input{
          --mdc-theme-surface:#121e2f !important;
          --ha-card-background:#121e2f !important;
          --card-background-color:#121e2f !important;
          background:#121e2f !important;
          background-color:#121e2f !important;
          color:#f7fbff !important;
          border-color:#40546d !important;
        }

        .cmr-settings-form::before,
        .cmr-settings-form::after,
        .cmr-license-form::before,
        .cmr-license-form::after,
        .cmr-settings-checks::before,
        .cmr-settings-checks::after,
        .cmr-mini-grid::before,
        .cmr-mini-grid::after,
        .cmr-vehicle-maintenance::before,
        .cmr-vehicle-maintenance::after,
        .cmr-vehicle-legal::before,
        .cmr-vehicle-legal::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          background-image:none !important;
          box-shadow:none !important;
          border:0 !important;
        }
      }

      @media (prefers-color-scheme: dark){
        /* FIX real pentru backplate-ul din Home: selector mai specific decât [class*="mini"]. */
        .cmr-overview-page .cmr-vehicle-card > .cmr-mini-grid,
        .cmr-overview-page .cmr-vehicle-card .cmr-mini-grid,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card > div.cmr-mini-grid{
          --mdc-theme-surface:transparent !important;
          --ha-card-background:transparent !important;
          --card-background-color:transparent !important;
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding:0 !important;
        }

        .cmr-overview-page .cmr-vehicle-card > .cmr-mini-grid::before,
        .cmr-overview-page .cmr-vehicle-card > .cmr-mini-grid::after,
        .cmr-overview-page .cmr-vehicle-card .cmr-mini-grid::before,
        .cmr-overview-page .cmr-vehicle-card .cmr-mini-grid::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
        }

        /* Containerele de revizie / termene / alerte au aceeași problemă de specificitate. */
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-maintenance,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-legal,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-alerts,
        .cmr-overview-page .cmr-vehicle-card .cmr-vehicle-maintenance,
        .cmr-overview-page .cmr-vehicle-card .cmr-vehicle-legal,
        .cmr-overview-page .cmr-vehicle-card .cmr-vehicle-alerts,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card > div.cmr-vehicle-maintenance,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card > div.cmr-vehicle-legal,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card > div.cmr-vehicle-alerts{
          --mdc-theme-surface:transparent !important;
          --ha-card-background:transparent !important;
          --card-background-color:transparent !important;
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding-left:0 !important;
          padding-right:0 !important;
        }

        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-maintenance::before,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-maintenance::after,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-legal::before,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-legal::after,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-alerts::before,
        .cmr-overview-page .cmr-vehicle-card > .cmr-vehicle-alerts::after{
          display:none !important;
          content:none !important;
          background:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
        }

        /* Copiii rămân carduri dark. */
        .cmr-overview-page .cmr-vehicle-card > .cmr-mini-grid > *,
        .cmr-overview-page .cmr-vehicle-card .cmr-mini-grid > *,
        .cmr-overview-page .cmr-vehicle-card .cmr-vehicle-maintenance-chip,
        .cmr-overview-page .cmr-vehicle-card .cmr-vehicle-legal-chip{
          --mdc-theme-surface:#23354c !important;
          --ha-card-background:#23354c !important;
          --card-background-color:#23354c !important;
          background:#23354c !important;
          background-color:#23354c !important;
          background-image:none !important;
          border:1px solid #40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }

        /* Același principiu pentru formele indicate: trebuie specificitate mai mare decât .cmr-page article/form rules. */
        .cmr-license-page .cmr-license-section form.cmr-license-form,
        .cmr-license-page form.cmr-license-form,
        main.cmr-license-page .cmr-license-form{
          --mdc-theme-surface:transparent !important;
          --ha-card-background:transparent !important;
          --card-background-color:transparent !important;
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding:0 !important;
        }

        .cmr-settings-page .cmr-settings-card .cmr-settings-form,
        .cmr-settings-page .cmr-settings-card .cmr-settings-checks,
        main.cmr-settings-page .cmr-settings-checks{
          --mdc-theme-surface:transparent !important;
          --ha-card-background:transparent !important;
          --card-background-color:transparent !important;
          background:transparent !important;
          background-color:transparent !important;
          background-image:none !important;
          border:0 !important;
          box-shadow:none !important;
          outline:0 !important;
          padding:0 !important;
        }

        .cmr-settings-page .cmr-settings-card .cmr-settings-checks > label{
          --mdc-theme-surface:#23354c !important;
          --ha-card-background:#23354c !important;
          --card-background-color:#23354c !important;
          background:#23354c !important;
          background-color:#23354c !important;
          background-image:none !important;
          border:1px solid #40546d !important;
          color:#edf6ff !important;
          box-shadow:none !important;
        }
      }

      @media (prefers-color-scheme: dark){
        /* Readucem evidențierea critică pe cardul fiecărui autovehicul în dark mode. */
        .cmr-overview-page .cmr-vehicle-card.is-critical,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card.is-critical,
        .cmr-vehicles-page .cmr-admin-vehicle-card.is-critical,
        main.cmr-vehicles-page .cmr-admin-vehicle-card.is-critical{
          border-top:4px solid #ff4a2f !important;
          border-color:#40546d !important;
          border-top-color:#ff4a2f !important;
          box-shadow:0 0 0 1px rgba(255,74,47,.16), 0 18px 42px rgba(0,0,0,.20) !important;
        }

        .cmr-overview-page .cmr-vehicle-card.is-warning,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card.is-warning,
        .cmr-vehicles-page .cmr-admin-vehicle-card.is-warning,
        main.cmr-vehicles-page .cmr-admin-vehicle-card.is-warning{
          border-top:4px solid #ffbd59 !important;
          border-color:#40546d !important;
          border-top-color:#ffbd59 !important;
        }

        .cmr-overview-page .cmr-vehicle-card.is-ok,
        main.cmr-overview-page .cmr-overview-vehicles .cmr-vehicle-card.is-ok,
        .cmr-vehicles-page .cmr-admin-vehicle-card.is-ok,
        main.cmr-vehicles-page .cmr-admin-vehicle-card.is-ok{
          border-top:4px solid #35c98a !important;
          border-color:#40546d !important;
          border-top-color:#35c98a !important;
        }
      }


      @media (max-width:760px){
        /* Fix mobil: prevenim lățimile mai mari decât viewport-ul în paginile dashboard-ului. */
        :host,
        .cmr-panel,
        .cmr-panel *{
          box-sizing:border-box;
        }

        .cmr-panel{
          width:100%;
          max-width:100vw;
          overflow-x:hidden;
          padding-left:10px;
          padding-right:10px;
        }

        .cmr-page,
        .cmr-overview-page,
        .cmr-vehicles-page,
        .cmr-costs-page,
        .cmr-settings-page,
        .cmr-statistics-page,
        .cmr-fuel-page,
        .cmr-tires-page,
        .cmr-equipment-page,
        .cmr-battery-page,
        .cmr-license-page{
          width:100%;
          min-width:0;
          max-width:100%;
          overflow-x:hidden;
        }

        .cmr-hero,
        .cmr-hero-main,
        .cmr-hero-side,
        .cmr-overview-section,
        .cmr-vehicles-toolbar,
        .cmr-admin-vehicle-card,
        .cmr-admin-sections section,
        .cmr-stat-card,
        .cmr-chart-card,
        .cmr-settings-card,
        .cmr-license-section,
        .cmr-license-support,
        .cmr-cost-vehicle-card,
        .cmr-fuel-vehicle-card,
        .cmr-tire-vehicle-card,
        .cmr-equipment-vehicle-card,
        .cmr-battery-vehicle-card{
          width:100%;
          min-width:0;
          max-width:100%;
          overflow:hidden;
        }

        .cmr-vehicles-hero,
        .cmr-costs-hero,
        .cmr-cost-mini-grid,
        .cmr-cost-type-grid,
        .cmr-cost-vehicle-grid,
        .cmr-costs-two,
        .cmr-fuel-hero,
        .cmr-fuel-metrics,
        .cmr-fuel-form-grid,
        .cmr-tires-hero,
        .cmr-tire-metrics,
        .cmr-tire-form-grid,
        .cmr-equipment-hero,
        .cmr-equipment-metrics,
        .cmr-equipment-required-grid,
        .cmr-equipment-form-grid,
        .cmr-battery-hero,
        .cmr-battery-metrics,
        .cmr-battery-form-grid,
        .cmr-license-grid,
        .cmr-settings-grid,
        .cmr-admin-profile-grid,
        .cmr-admin-chip-grid,
        .cmr-statistics-hero,
        .cmr-metrics-row,
        .cmr-mini-grid{
          grid-template-columns:minmax(0,1fr) !important;
          width:100%;
          min-width:0;
          max-width:100%;
        }

        .cmr-settings-hero,
        .cmr-hero-side{
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
          width:100%;
          min-width:0;
          max-width:100%;
        }

        .cmr-tabs{
          width:100%;
          max-width:100%;
          overflow-x:auto;
          overflow-y:hidden;
          -webkit-overflow-scrolling:touch;
        }

        .cmr-section-head h2,
        .cmr-settings-card-head h3,
        .cmr-admin-vehicle-head h3{
          font-size:clamp(22px,7vw,30px);
          line-height:1.05;
          overflow-wrap:anywhere;
        }

        .cmr-section-head p,
        .cmr-settings-card-head p,
        .cmr-admin-vehicle-head small{
          overflow-wrap:anywhere;
        }

        .cmr-settings-hero-tile strong,
        .cmr-vehicles-hero-tile strong,
        .cmr-cost-hero-tile strong,
        .cmr-cost-mini-grid strong,
        .cmr-admin-info-tile strong{
          font-size:clamp(20px,7vw,28px);
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:normal;
        }

        .cmr-admin-row,
        .cmr-admin-history-record,
        .cmr-license-status-card,
        .cmr-license-action-row,
        .cmr-license-form{
          grid-template-columns:minmax(0,1fr) !important;
          align-items:stretch;
        }

        .cmr-admin-status,
        .cmr-admin-history-actions{
          text-align:left;
          align-items:flex-start;
        }

        .cmr-settings-actions,
        .cmr-admin-actions,
        .cmr-admin-form-actions,
        .cmr-vehicle-card footer{
          display:grid;
          grid-template-columns:minmax(0,1fr);
          width:100%;
        }

        .cmr-settings-actions button,
        .cmr-admin-actions button,
        .cmr-admin-form-actions button,
        .cmr-vehicle-card footer button,
        .cmr-license-form button{
          width:100%;
          justify-content:center;
        }
      }

      @media (max-width:900px){
        /* Fix mobil suplimentar: unele telefoane raportează lățimi CSS peste 760px, deși afișarea este tot de tip mobil. */
        .cmr-panel,
        .cmr-page,
        .cmr-overview-page,
        .cmr-vehicles-page,
        .cmr-costs-page{
          max-width:100vw !important;
          overflow-x:hidden !important;
        }

        .cmr-cost-vehicle-grid,
        .cmr-overview-vehicles,
        .cmr-costs-two,
        .cmr-vehicles-list{
          display:grid !important;
          grid-template-columns:minmax(0,1fr) !important;
          width:100% !important;
          max-width:100% !important;
          min-width:0 !important;
        }

        .cmr-cost-vehicle-card,
        .cmr-admin-vehicle-card,
        .cmr-admin-sections section,
        .cmr-admin-history,
        .cmr-admin-history-record,
        .cmr-admin-history-main,
        .cmr-admin-table,
        .cmr-admin-row{
          width:100% !important;
          max-width:100% !important;
          min-width:0 !important;
          overflow:hidden !important;
        }

        .cmr-cost-vehicle-card header{
          display:grid !important;
          grid-template-columns:minmax(0,1fr) !important;
          gap:8px !important;
        }

        .cmr-cost-vehicle-card header strong,
        .cmr-cost-vehicle-card h4,
        .cmr-cost-mini-grid strong,
        .cmr-admin-history-main strong,
        .cmr-admin-history-main span,
        .cmr-admin-history-main p{
          max-width:100% !important;
          white-space:normal !important;
          overflow-wrap:anywhere !important;
          word-break:normal !important;
          overflow:hidden !important;
          text-overflow:clip !important;
        }

        .cmr-cost-mini-grid,
        .cmr-admin-row,
        .cmr-admin-history-record{
          grid-template-columns:minmax(0,1fr) !important;
        }

        .cmr-admin-history-actions{
          width:100% !important;
          display:grid !important;
          grid-template-columns:minmax(0,1fr) !important;
          align-items:stretch !important;
        }

        .cmr-admin-history-actions button{
          width:100% !important;
          justify-content:center !important;
        }
      }

      /*
       * Fix real pentru mobil: folosim clasa calculată din JavaScript, nu doar @media query.
       * În Home Assistant Companion/WebView, media query-ul poate rămâne pe layout lat,
       * deși spațiul vizibil este de telefon. Aceste reguli forțează layout-ul compact.
       */
      .cmr-panel.is-compact,
      .cmr-panel.is-compact *{
        box-sizing:border-box !important;
      }

      .cmr-panel.is-compact{
        width:100% !important;
        max-width:100vw !important;
        overflow-x:hidden !important;
        padding:14px 10px 80px !important;
      }

      .cmr-panel.is-compact .cmr-page,
      .cmr-panel.is-compact main[class*="cmr-"]{
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        overflow-x:hidden !important;
        padding:16px !important;
      }

      .cmr-panel.is-compact .cmr-cost-vehicle-grid,
      .cmr-panel.is-compact .cmr-costs-two,
      .cmr-panel.is-compact .cmr-cost-mini-grid,
      .cmr-panel.is-compact .cmr-costs-hero,
      .cmr-panel.is-compact .cmr-vehicles-hero,
      .cmr-panel.is-compact .cmr-admin-profile-grid,
      .cmr-panel.is-compact .cmr-admin-chip-grid,
      .cmr-panel.is-compact .cmr-admin-form-grid,
      .cmr-panel.is-compact .cmr-fuel-hero,
      .cmr-panel.is-compact .cmr-fuel-metrics,
      .cmr-panel.is-compact .cmr-tires-hero,
      .cmr-panel.is-compact .cmr-tire-metrics,
      .cmr-panel.is-compact .cmr-equipment-hero,
      .cmr-panel.is-compact .cmr-equipment-metrics,
      .cmr-panel.is-compact .cmr-battery-hero,
      .cmr-panel.is-compact .cmr-battery-metrics,
      .cmr-panel.is-compact .cmr-license-grid,
      .cmr-panel.is-compact .cmr-settings-grid,
      .cmr-panel.is-compact .cmr-overview-vehicles{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
      }

      .cmr-panel.is-compact .cmr-hero-side,
      .cmr-panel.is-compact .cmr-settings-hero,
      .cmr-panel.is-compact .cmr-overview-kpis{
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
      }

      .cmr-panel.is-compact .cmr-costs-section,
      .cmr-panel.is-compact .cmr-cost-vehicle-card,
      .cmr-panel.is-compact .cmr-admin-vehicle-card,
      .cmr-panel.is-compact .cmr-admin-sections section,
      .cmr-panel.is-compact .cmr-admin-history,
      .cmr-panel.is-compact .cmr-admin-table,
      .cmr-panel.is-compact .cmr-vehicles-toolbar,
      .cmr-panel.is-compact .cmr-settings-card,
      .cmr-panel.is-compact .cmr-license-section,
      .cmr-panel.is-compact .cmr-license-action-row,
      .cmr-panel.is-compact .cmr-license-support{
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        overflow:hidden !important;
      }

      .cmr-panel.is-compact .cmr-section-head,
      .cmr-panel.is-compact .cmr-cost-vehicle-card header,
      .cmr-panel.is-compact .cmr-admin-vehicle-head,
      .cmr-panel.is-compact .cmr-vehicles-toolbar{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        align-items:stretch !important;
        gap:10px !important;
      }

      .cmr-panel.is-compact .cmr-admin-row,
      .cmr-panel.is-compact .cmr-admin-history-record,
      .cmr-panel.is-compact .cmr-license-form,
      .cmr-panel.is-compact .cmr-license-status-card{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        overflow:hidden !important;
      }

      .cmr-panel.is-compact .cmr-admin-history-main,
      .cmr-panel.is-compact .cmr-admin-history-main strong,
      .cmr-panel.is-compact .cmr-admin-history-main span,
      .cmr-panel.is-compact .cmr-admin-history-main p,
      .cmr-panel.is-compact .cmr-cost-vehicle-card h4,
      .cmr-panel.is-compact .cmr-cost-vehicle-card header strong,
      .cmr-panel.is-compact .cmr-cost-mini-grid strong,
      .cmr-panel.is-compact .cmr-section-head h2,
      .cmr-panel.is-compact .cmr-section-head h3,
      .cmr-panel.is-compact .cmr-page-title h2,
      .cmr-panel.is-compact .cmr-page-title p{
        max-width:100% !important;
        min-width:0 !important;
        white-space:normal !important;
        overflow-wrap:anywhere !important;
        word-break:normal !important;
        overflow:hidden !important;
        text-overflow:clip !important;
      }

      .cmr-panel.is-compact .cmr-admin-history-actions,
      .cmr-panel.is-compact .cmr-admin-actions,
      .cmr-panel.is-compact .cmr-admin-form-actions,
      .cmr-panel.is-compact .cmr-toolbar-actions,
      .cmr-panel.is-compact .cmr-settings-actions{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        width:100% !important;
        max-width:100% !important;
        align-items:stretch !important;
      }

      .cmr-panel.is-compact .cmr-admin-history-actions button,
      .cmr-panel.is-compact .cmr-admin-actions button,
      .cmr-panel.is-compact .cmr-admin-form-actions button,
      .cmr-panel.is-compact .cmr-toolbar-actions button,
      .cmr-panel.is-compact .cmr-settings-actions button,
      .cmr-panel.is-compact .cmr-section-head button,
      .cmr-panel.is-compact .cmr-license-form button{
        width:100% !important;
        max-width:100% !important;
        justify-content:center !important;
      }

      .cmr-panel.is-compact .cmr-admin-status{
        text-align:left !important;
      }


      /* Header și meniu pe mobil: mașina rămâne vizibilă, iar meniul arată clar că se poate derula. */
      .cmr-panel.is-compact .cmr-hero-main{
        min-height:300px !important;
        padding:22px 18px 132px !important;
      }

      .cmr-panel.is-compact .cmr-logo{
        width:68px !important;
        height:68px !important;
        border-radius:20px !important;
      }

      .cmr-panel.is-compact .cmr-logo img{
        width:52px !important;
        height:52px !important;
      }

      .cmr-panel.is-compact .cmr-hero-copy{
        max-width:100% !important;
      }

      .cmr-panel.is-compact .cmr-hero h1{
        font-size:clamp(30px,9vw,38px) !important;
        line-height:.98 !important;
      }

      .cmr-panel.is-compact .cmr-hero p{
        font-size:14px !important;
        line-height:1.35 !important;
        max-width:100% !important;
      }

      .cmr-panel.is-compact .cmr-hero-car{
        left:50% !important;
        right:auto !important;
        top:auto !important;
        bottom:42px !important;
        width:92% !important;
        height:150px !important;
        transform:translateX(-50%) !important;
        opacity:.78 !important;
        z-index:2 !important;
        overflow:visible !important;
      }

      .cmr-panel.is-compact .cmr-hero-car img{
        position:absolute !important;
        left:0 !important;
        right:0 !important;
        top:auto !important;
        bottom:0 !important;
        width:100% !important;
        height:100% !important;
        object-fit:contain !important;
        object-position:center bottom !important;
      }

      .cmr-panel.is-compact .cmr-hero-car::after{
        left:12% !important;
        right:12% !important;
        bottom:8px !important;
        height:28px !important;
      }

      .cmr-panel.is-compact .cmr-haforge-badge{
        right:12px !important;
        top:12px !important;
        bottom:auto !important;
        z-index:6 !important;
        align-items:center !important;
      }

      .cmr-panel.is-compact .cmr-tabs-shell{
        grid-template-columns:44px minmax(0,1fr) 44px !important;
        gap:8px !important;
        align-items:center !important;
      }

      .cmr-panel.is-compact .cmr-tabs-arrow{
        display:flex !important;
        flex:0 0 auto !important;
      }

      .cmr-panel.is-compact .cmr-tabs{
        display:flex !important;
        overflow-x:auto !important;
        overflow-y:hidden !important;
        -webkit-overflow-scrolling:touch !important;
        scroll-snap-type:x proximity !important;
        scrollbar-width:none !important;
        max-width:100% !important;
        margin:0 !important;
      }

      .cmr-panel.is-compact .cmr-tabs::-webkit-scrollbar{
        display:none !important;
      }

      .cmr-panel.is-compact .cmr-tab{
        flex:0 0 58px !important;
        min-width:58px !important;
        max-width:58px !important;
        padding:12px 0 !important;
      }

      .cmr-panel.is-compact .cmr-tab.active{
        flex-basis:58px !important;
        min-width:58px !important;
        max-width:58px !important;
      }

      .cmr-panel.is-compact .cmr-tab span{
        display:none !important;
      }

      .cmr-panel.is-compact .cmr-tab ha-icon{
        width:26px !important;
        height:26px !important;
      }


      /* Layout mobil separat: clase aplicate direct de renderer, cu specificitate mare. */
      .cmr-panel.is-compact .cmr-cost-vehicle-grid{display:grid !important;grid-template-columns:minmax(0,1fr) !important;gap:14px !important;}
      .cmr-panel.is-compact .cmr-cost-vehicle-card{display:block !important;width:100% !important;max-width:100% !important;min-width:0 !important;overflow:hidden !important;}
      .cmr-panel.is-compact .cmr-cost-mini-grid{display:grid !important;grid-template-columns:minmax(0,1fr) !important;gap:10px !important;}
      .cmr-panel.is-compact .cmr-admin-history-record{display:grid !important;grid-template-columns:minmax(0,1fr) !important;}
      .cmr-panel.is-compact .cmr-tabs-shell{display:grid !important;grid-template-columns:44px minmax(0,1fr) 44px !important;}
      .cmr-panel.is-compact .cmr-tabs-arrow{display:flex !important;}


      /* Fix beta b13: formularele de adăugare/editare pe mobil nu mai păstrează coloane înghesuite. */
      .cmr-panel.is-compact .cmr-fuel-form-grid,
      .cmr-panel.is-compact .cmr-tire-form-grid,
      .cmr-panel.is-compact .cmr-equipment-form-grid,
      .cmr-panel.is-compact .cmr-battery-form-grid,
      .cmr-panel.is-compact .cmr-admin-form-grid{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        gap:12px !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
      }

      .cmr-panel.is-compact .cmr-fuel-form-grid label,
      .cmr-panel.is-compact .cmr-tire-form-grid label,
      .cmr-panel.is-compact .cmr-equipment-form-grid label,
      .cmr-panel.is-compact .cmr-battery-form-grid label,
      .cmr-panel.is-compact .cmr-admin-form-grid label,
      .cmr-panel.is-compact .cmr-fuel-form-grid label.wide,
      .cmr-panel.is-compact .cmr-tire-form-grid label.wide,
      .cmr-panel.is-compact .cmr-equipment-form-grid label.wide,
      .cmr-panel.is-compact .cmr-battery-form-grid label.wide,
      .cmr-panel.is-compact .cmr-admin-form-grid label.wide{
        display:grid !important;
        grid-column:auto !important;
        gap:7px !important;
        width:100% !important;
        min-width:0 !important;
        max-width:100% !important;
      }

      .cmr-panel.is-compact .cmr-fuel-form-grid span,
      .cmr-panel.is-compact .cmr-tire-form-grid span,
      .cmr-panel.is-compact .cmr-equipment-form-grid span,
      .cmr-panel.is-compact .cmr-battery-form-grid span,
      .cmr-panel.is-compact .cmr-admin-form-grid span{
        position:static !important;
        display:block !important;
        width:100% !important;
        max-width:100% !important;
        white-space:normal !important;
        overflow-wrap:anywhere !important;
        line-height:1.25 !important;
        margin:0 !important;
      }

      .cmr-panel.is-compact .cmr-fuel-form-grid input,
      .cmr-panel.is-compact .cmr-fuel-form-grid select,
      .cmr-panel.is-compact .cmr-fuel-form-grid textarea,
      .cmr-panel.is-compact .cmr-tire-form-grid input,
      .cmr-panel.is-compact .cmr-tire-form-grid select,
      .cmr-panel.is-compact .cmr-tire-form-grid textarea,
      .cmr-panel.is-compact .cmr-equipment-form-grid input,
      .cmr-panel.is-compact .cmr-equipment-form-grid select,
      .cmr-panel.is-compact .cmr-equipment-form-grid textarea,
      .cmr-panel.is-compact .cmr-battery-form-grid input,
      .cmr-panel.is-compact .cmr-battery-form-grid select,
      .cmr-panel.is-compact .cmr-battery-form-grid textarea,
      .cmr-panel.is-compact .cmr-admin-form-grid input,
      .cmr-panel.is-compact .cmr-admin-form-grid select,
      .cmr-panel.is-compact .cmr-admin-form-grid textarea{
        width:100% !important;
        min-width:0 !important;
        max-width:100% !important;
        box-sizing:border-box !important;
      }

      .cmr-admin-status button{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        margin-top:8px;
        border:1px solid rgba(6,166,199,.24);
        border-radius:999px;
        background:#dff8ff;
        color:#00405d;
        font-weight:950;
        padding:8px 12px;
        cursor:pointer;
      }


      .cmr-admin-full-vehicle-form{display:grid;gap:14px;}
      .cmr-admin-edit-section{border:1px solid rgba(15,63,94,.10);border-radius:16px;padding:14px;margin:0;background:rgba(255,255,255,.55);min-width:0;}
      .cmr-admin-edit-section legend{padding:0 8px;color:#001d3f;font-weight:950;font-size:14px;}
      .cmr-admin-edit-section .cmr-admin-form-grid{margin-top:4px;}
      @media (prefers-color-scheme: dark){
        .cmr-admin-edit-section{background:rgba(255,255,255,.035) !important;border-color:rgba(126,235,255,.16) !important;}
        .cmr-admin-edit-section legend{color:#eafcff !important;}
      }

      @media (prefers-color-scheme: dark){
        .cmr-rovinieta-account-status.is-configured{
          background:rgba(5,82,60,.78) !important;
          border-color:rgba(82,235,170,.72) !important;
          box-shadow:0 0 0 1px rgba(82,235,170,.14) inset !important;
        }
        .cmr-rovinieta-account-status.is-configured strong{
          color:#ffffff !important;
          text-shadow:0 1px 0 rgba(0,0,0,.35) !important;
        }
        .cmr-rovinieta-account-status.is-configured small{
          color:#e3fff1 !important;
        }
        .cmr-rovinieta-account-status.is-configured ha-icon{
          color:#6ff0b5 !important;
        }
        .cmr-admin-status button{
          background:#e1faff !important;
          color:#002f42 !important;
          border-color:rgba(126,235,255,.75) !important;
          text-shadow:none !important;
        }
      }


    `;
  }
}

if (!customElements.get("car-manager-romania-panel")) {
  customElements.define("car-manager-romania-panel", CarManagerRomaniaPanel);
}

const APP_VERSION = "1.0.1";
const AUTOSAVE_KEY = "finanzas_personales_dark_autosave";
const AUTOSAVE_STAMP_KEY = "finanzas_personales_dark_autosave_stamp";
const AUTOSAVE_DELAY = 500;

const DEFAULT_CATEGORIES = [
  "Sueldo", "Propinas", "Comida", "Renta", "Luz", "Agua", "Internet",
  "Transporte", "Salud", "Mascotas", "Deudas", "Ahorro", "Estudios",
  "Entretenimiento", "Otros"
];

const METHOD_LABELS = { cash: "Efectivo", debit: "Débito", transfer: "Transferencia" };
const TYPE_LABELS = { income: "Ingreso", expense: "Gasto" };

let fileHandle = null;
let activeFileName = "Sin archivo";
let state = createEmptyState();
let autosaveTimer = null;
let autosaveEnabled = true;

const $ = (id) => document.getElementById(id);
const qsa = (selector) => [...document.querySelectorAll(selector)];

function createEmptyState() {
  return {
    meta: {
      app: "finanzas-personales-dark",
      version: APP_VERSION,
      currency: "MXN",
      owner: "personal",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    settings: { salaryFrequency: "weekly", defaultPeriod: "month", reminderDaysAhead: 5 },
    categories: [...DEFAULT_CATEGORIES],
    movements: [],
    budgets: [],
    debts: [],
    goals: [],
    recurring: []
  };
}

function createSampleState() {
  const today = toISODate(new Date());
  const startMonth = startOfMonth(new Date());
  const sample = createEmptyState();

  sample.movements = [
    movement("income", today, 1951.60, "transfer", "Sueldo", "Sueldo semanal"),
    movement("income", today, 120, "cash", "Propinas", "Propinas del día"),
    movement("expense", today, 300, "debit", "Comida", "Comida diaria"),
    movement("expense", today, 100, "cash", "Transporte", "Gasolina")
  ];

  sample.budgets = [
    budget("Comida", 6000, "month"),
    budget("Transporte", 1400, "month"),
    budget("Entretenimiento", 800, "month")
  ];

  sample.debts = [debt("Ejemplo deuda", 3000, 800, 300, addDays(today, 7), 0)];
  sample.goals = [goal("Fondo de emergencia", 15000, 2500, addDays(today, 180))];
  sample.recurring = [
    recurring("income", "Sueldo semanal", 1951.60, "transfer", "Sueldo", "weekly", startMonth),
    recurring("expense", "Internet", 750, "transfer", "Internet", "monthly", startMonth, 10)
  ];

  return sample;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function movement(type, date, amount, method, category, description = "", note = "") {
  return { id: uid(), type, date, amount: Number(amount), method, category, description, note, createdAt: new Date().toISOString() };
}

function budget(category, limit, period) {
  return { id: uid(), category, limit: Number(limit), period, createdAt: new Date().toISOString() };
}

function debt(name, total, paid = 0, minPayment = 0, dueDate = "", interest = 0) {
  return { id: uid(), name, total: Number(total), paid: Number(paid), minPayment: Number(minPayment), dueDate, annualInterest: Number(interest), createdAt: new Date().toISOString() };
}

function goal(name, target, saved = 0, targetDate = "", note = "") {
  return { 
    id: uid(), 
    name, 
    target: Number(target), 
    note,
    saved: Number(saved), 
    targetDate, 
    createdAt: new Date().toISOString() };
}

function normalizeGoal(item) {
  const normalized = { ...item };
  const savedLooksLikeNote = typeof normalized.saved === "string" && normalized.saved.trim() && Number.isNaN(Number(normalized.saved));
  const targetDateLooksLikeSaved = typeof normalized.targetDate === "number" || (typeof normalized.targetDate === "string" && normalized.targetDate !== "" && !Number.isNaN(Number(normalized.targetDate)));
  const noteLooksLikeDate = typeof normalized.note === "string" && /^\d{4}-\d{2}-\d{2}$/.test(normalized.note);

  if (savedLooksLikeNote && targetDateLooksLikeSaved) {
    const misplacedNote = normalized.saved;
    normalized.saved = Number(normalized.targetDate || 0);
    normalized.targetDate = noteLooksLikeDate ? normalized.note : "";
    normalized.note = misplacedNote;
  }

  return {
    id: normalized.id || uid(),
    name: normalized.name || "",
    target: Number(normalized.target || 0),
    saved: Number(normalized.saved || 0),
    targetDate: typeof normalized.targetDate === "string" ? normalized.targetDate : "",
    note: normalized.note || "",
    createdAt: normalized.createdAt || new Date().toISOString()
  };
}

function recurring(type, name, amount, method, category, frequency, startDate, dayOfMonth = null) {
  return { id: uid(), type, name, amount: Number(amount), method, category, frequency, startDate, dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null, active: true, createdAt: new Date().toISOString() };
}

function money(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "2-digit" });
}

function toISODate(date) { return date.toISOString().slice(0, 10); }

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

function endOfWeek(date) { return addDays(startOfWeek(date), 6); }
function startOfMonth(date) { return toISODate(new Date(date.getFullYear(), date.getMonth(), 1)); }
function endOfMonth(date) { return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0)); }

function startOfBimester(date) {
  const month = date.getMonth();
  const startMonth = month % 2 === 0 ? month : month - 1;
  return toISODate(new Date(date.getFullYear(), startMonth, 1));
}

function endOfBimester(date) {
  const month = date.getMonth();
  const endMonth = month % 2 === 0 ? month + 1 : month;
  return toISODate(new Date(date.getFullYear(), endMonth + 1, 0));
}

function daysBetween(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function getPeriodRange() {
  const mode = $("periodMode").value;
  const now = new Date();

  if (mode === "today") {
    const today = toISODate(now);
    return { start: today, end: today, label: "Hoy" };
  }
  if (mode === "week") return { start: startOfWeek(now), end: endOfWeek(now), label: "Semana actual" };
  if (mode === "month") return { start: startOfMonth(now), end: endOfMonth(now), label: "Mes actual" };
  if (mode === "bimester") return { start: startOfBimester(now), end: endOfBimester(now), label: "Bimestre actual" };

  const start = $("periodStart").value || startOfMonth(now);
  const end = $("periodEnd").value || endOfMonth(now);
  return { start, end, label: "Personalizado" };
}

function inRange(date, start, end) { return date >= start && date <= end; }

function currentMovements() {
  const { start, end } = getPeriodRange();
  return state.movements.filter(m => inRange(m.date, start, end));
}

function sumByType(movements, type) {
  return movements.filter(m => m.type === type).reduce((acc, m) => acc + Number(m.amount || 0), 0);
}

function sanitizeState(input) {
  const empty = createEmptyState();
  return {
    meta: { ...empty.meta, ...(input.meta || {}), updatedAt: new Date().toISOString() },
    settings: { ...empty.settings, ...(input.settings || {}) },
    categories: Array.isArray(input.categories) ? input.categories : [...DEFAULT_CATEGORIES],
    movements: Array.isArray(input.movements) ? input.movements : [],
    budgets: Array.isArray(input.budgets) ? input.budgets : [],
    debts: Array.isArray(input.debts) ? input.debts : [],
    goals: Array.isArray(input.goals) ? input.goals.map(normalizeGoal) : [],
    recurring: Array.isArray(input.recurring) ? input.recurring : []
  };
}

function setState(nextState, options = {}) {
  state = sanitizeState(nextState);
  renderAll();

  if (!options.skipAutosave) {
    scheduleAutoSave();
  }
}

function markUpdated() {
  state.meta.updatedAt = new Date().toISOString();
  updateJsonPreview();
  scheduleAutoSave();
}

function scheduleAutoSave() {
  if (!autosaveEnabled) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autoSaveNow();
  }, AUTOSAVE_DELAY);
}

async function autoSaveNow() {
  if (!autosaveEnabled) return;

  try {
    const data = JSON.stringify(state, null, 2);
    localStorage.setItem(AUTOSAVE_KEY, data);
    localStorage.setItem(AUTOSAVE_STAMP_KEY, new Date().toISOString());
    await tryAutoWriteJsonFile(data);
  } catch (error) {
    console.warn("No se pudo autoguardar:", error);
  }
}

async function tryAutoWriteJsonFile(data) {
  if (!fileHandle || !("createWritable" in fileHandle)) return;

  try {
    if ("queryPermission" in fileHandle) {
      const permission = await fileHandle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") return;
    }

    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (error) {
    console.warn("No se pudo autoguardar en el JSON:", error);
  }
}

function restoreAutoSavedState() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (!hasUsefulData(parsed)) return false;

    autosaveEnabled = false;
    state = sanitizeState(parsed);
    autosaveEnabled = true;

    const stamp = localStorage.getItem(AUTOSAVE_STAMP_KEY);
    activeFileName = stamp
      ? `Autoguardado local · ${new Date(stamp).toLocaleString("es-MX")}`
      : "Autoguardado local";

    return true;
  } catch (error) {
    console.warn("No se pudo recuperar el autoguardado:", error);
    return false;
  }
}

function hasUsefulData(data) {
  return Boolean(
    data &&
    (
      (Array.isArray(data.movements) && data.movements.length) ||
      (Array.isArray(data.budgets) && data.budgets.length) ||
      (Array.isArray(data.debts) && data.debts.length) ||
      (Array.isArray(data.goals) && data.goals.length) ||
      (Array.isArray(data.recurring) && data.recurring.length)
    )
  );
}

function clearAutoSave() {
  localStorage.removeItem(AUTOSAVE_KEY);
  localStorage.removeItem(AUTOSAVE_STAMP_KEY);
}

async function openJsonFile() {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        multiple: false
      });
      fileHandle = handle;
      activeFileName = handle.name;
      const file = await handle.getFile();
      const text = await file.text();
      setState(JSON.parse(text));
      await autoSaveNow();
      toast("Archivo abierto");
      return;
    } catch (error) {
      if (error.name !== "AbortError") toast("No se pudo abrir el archivo");
      return;
    }
  }
  $("jsonFileInput").click();
}

async function saveJsonFile() {
  const data = JSON.stringify(state, null, 2);

  if (fileHandle && "createWritable" in fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      await autoSaveNow();
      await autoSaveNow();
      toast("JSON guardado");
      updateFileStatus();
      return;
    } catch {
      toast("No se pudo escribir sobre el archivo");
    }
  }

  if ("showSaveFilePicker" in window) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: "finanzas-personales.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
      });
      activeFileName = fileHandle.name;
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      toast("JSON guardado");
      updateFileStatus();
      return;
    } catch (error) {
      if (error.name !== "AbortError") toast("No se pudo guardar el archivo");
      return;
    }
  }

  downloadJson();
}

function downloadJson() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "finanzas-personales.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  autoSaveNow();
  toast("Copia descargada");
}

function updateFileStatus() { $("activeFileName").textContent = activeFileName; }

function populateCategorySelects() {
  const categoryOptions = state.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  ["movementCategory", "budgetCategory", "recurringCategory"].forEach(id => {
    const select = $(id);
    const current = select.value;
    select.innerHTML = categoryOptions;
    if (state.categories.includes(current)) select.value = current;
  });

  const filter = $("filterCategory");
  const currentFilter = filter.value;
  filter.innerHTML = `<option value="all">Todas</option>${categoryOptions}`;
  if (currentFilter === "all" || state.categories.includes(currentFilter)) filter.value = currentFilter;
}

function renderDashboard() {
  const movements = currentMovements();
  const income = sumByType(movements, "income");
  const expense = sumByType(movements, "expense");
  const balance = income - expense;
  const { start, end } = getPeriodRange();
  const daysTotal = daysBetween(start, end);
  const today = toISODate(new Date());
  const daysRemaining = today > end ? 0 : daysBetween(today < start ? start : today, end);
  const dailyAvailable = daysRemaining > 0 ? balance / daysRemaining : balance;

  $("incomeTotal").textContent = money(income);
  $("expenseTotal").textContent = money(expense);
  $("balanceTotal").textContent = money(balance);
  $("dailyAvailable").textContent = money(dailyAvailable);

  renderMethodSummary(movements);
  renderCategorySummary(movements);
  renderBudgetProgress(movements, daysTotal);
  renderLatestMovements();
}

function renderMethodSummary(movements) {
  $("methodSummary").innerHTML = ["cash", "debit", "transfer"].map(method => {
    const methodMoves = movements.filter(m => m.method === method);
    const income = sumByType(methodMoves, "income");
    const expense = sumByType(methodMoves, "expense");
    return `
      <tr>
        <td>${METHOD_LABELS[method]}</td>
        <td class="amount-income">${money(income)}</td>
        <td class="amount-expense">${money(expense)}</td>
        <td>${money(income - expense)}</td>
      </tr>
    `;
  }).join("");
}

function renderCategorySummary(movements) {
  const expenses = movements.filter(m => m.type === "expense");
  const totals = groupSum(expenses, "category");

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, amount]) => `
    <div class="category-row">
      <div>
        <strong>${escapeHtml(category)}</strong>
        <span>Gasto del periodo</span>
      </div>
      <strong class="amount-expense">${money(amount)}</strong>
    </div>
  `).join("");

  $("categorySummary").innerHTML = rows || `<p class="text">Sin gastos en este periodo.</p>`;
}

function renderBudgetProgress(movements, daysTotal) {
  const expenses = movements.filter(m => m.type === "expense");
  const rows = state.budgets.map(item => {
    const spent = expenses.filter(m => m.category === item.category).reduce((acc, m) => acc + Number(m.amount || 0), 0);
    const limit = normalizeLimit(item.limit, item.period, daysTotal);
    const percent = limit > 0 ? (spent / limit) * 100 : 0;
    const capped = Math.min(100, percent);
    const danger = percent >= 100 ? "danger" : "";

    return `
      <div class="list-item">
        <strong>${escapeHtml(item.category)} · ${money(spent)} / ${money(limit)}</strong>
        <span>${percent.toFixed(1)}% usado · ${periodLabel(item.period)}</span>
        <div class="progress-bar"><div class="progress-fill ${danger}" style="width:${capped}%"></div></div>
      </div>
    `;
  }).join("");

  $("budgetProgress").innerHTML = rows || `<p class="text">Sin presupuestos registrados.</p>`;
}

function normalizeLimit(limit, period, targetDays) {
  const daysMap = { week: 7, month: 30.4375, bimester: 60.875, custom: targetDays || 30.4375 };
  const baseDays = daysMap[period] || 30.4375;
  return Number(limit || 0) * ((targetDays || baseDays) / baseDays);
}

function periodLabel(period) {
  return { week: "Semanal", month: "Mensual", bimester: "Bimestral", custom: "Variable" }[period] || period;
}

function renderLatestMovements() {
  const rows = [...state.movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(m => `
    <div class="movement-item">
      <strong>${escapeHtml(m.description || m.category)}</strong>
      <span>${formatDate(m.date)} · ${TYPE_LABELS[m.type]} · ${METHOD_LABELS[m.method]} · ${escapeHtml(m.category)}</span>
      <strong class="${m.type === "income" ? "amount-income" : "amount-expense"}">${money(m.amount)}</strong>
    </div>
  `).join("");

  $("latestMovements").innerHTML = rows || `<p class="text">Sin movimientos.</p>`;
}

function renderMovementsTable() {
  const search = $("movementSearch").value.toLowerCase().trim();
  const type = $("filterType").value;
  const method = $("filterMethod").value;
  const category = $("filterCategory").value;

  const rows = [...state.movements]
    .filter(m => type === "all" || m.type === type)
    .filter(m => method === "all" || m.method === method)
    .filter(m => category === "all" || m.category === category)
    .filter(m => !search || `${m.description} ${m.note} ${m.category} ${m.date}`.toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(m => `
      <tr>
        <td>${formatDate(m.date)}</td>
        <td>${TYPE_LABELS[m.type]}</td>
        <td>${escapeHtml(m.category)}</td>
        <td>${escapeHtml(m.description || "—")}</td>
        <td>${METHOD_LABELS[m.method]}</td>
        <td class="${m.type === "income" ? "amount-income" : "amount-expense"}">${money(m.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit-movement="${m.id}">Editar</button>
            <button class="icon-btn" data-delete-movement="${m.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join("");

  $("movementsTable").innerHTML = rows || `<tr><td colspan="7">Sin movimientos.</td></tr>`;
}

function renderBudgetsList() {
  $("budgetsList").innerHTML = state.budgets.map(b => `
    <div class="list-item">
      <strong>${escapeHtml(b.category)} · ${money(b.limit)}</strong>
      <span>${periodLabel(b.period)}</span>
      <div class="row-actions">
        <button class="icon-btn" data-edit-budget="${b.id}">Editar</button>
        <button class="icon-btn" data-delete-budget="${b.id}">Eliminar</button>
      </div>
    </div>
  `).join("") || `<p class="text">Sin presupuestos.</p>`;
}

function renderDebtsList() {
  $("debtsList").innerHTML = state.debts.map(d => {
    const remaining = Math.max(0, Number(d.total) - Number(d.paid || 0));
    const percent = d.total > 0 ? Math.min(100, (d.paid / d.total) * 100) : 0;
    return `
      <div class="list-item">
        <strong>${escapeHtml(d.name)} · saldo ${money(remaining)}</strong>
        <span>Total ${money(d.total)} · pagado ${money(d.paid)} · mínimo ${money(d.minPayment)} · vence ${formatDate(d.dueDate)}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="row-actions">
          <button class="icon-btn" data-pay-debt="${d.id}">Abonar</button>
          <button class="icon-btn" data-edit-debt="${d.id}">Editar</button>
          <button class="icon-btn" data-delete-debt="${d.id}">Eliminar</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="text">Sin deudas.</p>`;
}

function renderGoalsList() {
  $("goalsList").innerHTML = state.goals.map(g => {
    const remaining = Math.max(0, Number(g.target) - Number(g.saved || 0));
    const percent = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    return `
      <div class="list-item">
        <strong>${escapeHtml(g.name)} · falta ${money(remaining)}</strong>
        <span>Objetivo ${money(g.target)} · ahorrado ${money(g.saved)} · fecha ${formatDate(g.targetDate)}</span>
        <span class="note">${g.note ? escapeHtml(g.note) : "Sin nota"}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="row-actions">
          <button class="icon-btn" data-add-goal="${g.id}">Aportar</button>
          <button class="icon-btn" data-edit-goal="${g.id}">Editar</button>
          <button class="icon-btn" data-delete-goal="${g.id}">Eliminar</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="text">Sin metas.</p>`;
}

function renderRecurringList() {
  $("recurringList").innerHTML = state.recurring.map(r => `
    <div class="list-item">
      <strong>${escapeHtml(r.name)} · ${money(r.amount)}</strong>
      <span>${TYPE_LABELS[r.type]} · ${frequencyLabel(r.frequency)} · ${METHOD_LABELS[r.method]} · ${escapeHtml(r.category)} · desde ${formatDate(r.startDate)}</span>
      <div class="row-actions">
        <button class="icon-btn" data-edit-recurring="${r.id}">Editar</button>
        <button class="icon-btn" data-delete-recurring="${r.id}">Eliminar</button>
      </div>
    </div>
  `).join("") || `<p class="text">Sin recurrentes.</p>`;
}

function frequencyLabel(freq) {
  return { daily: "Diario", weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual", bimonthly: "Bimestral" }[freq] || freq;
}

function renderCategoriesList() {
  $("categoriesList").innerHTML = state.categories.map(c => `
    <span class="chip">${escapeHtml(c)}<button data-delete-category="${escapeHtml(c)}" title="Eliminar">×</button></span>
  `).join("");
}

function updateJsonPreview() { $("jsonPreview").textContent = JSON.stringify(state, null, 2); }

function renderReminders() {
  const box = $("reminderBox");
  const today = toISODate(new Date());
  const limit = addDays(today, state.settings.reminderDaysAhead || 5);
  const reminders = [];

  state.debts.forEach(d => {
    const remaining = Number(d.total || 0) - Number(d.paid || 0);
    if (remaining > 0 && d.dueDate && d.dueDate >= today && d.dueDate <= limit) {
      reminders.push({ level: d.dueDate === today ? "danger" : "warn", title: "Deuda próxima", body: `${d.name}: vence ${formatDate(d.dueDate)}. Saldo ${money(remaining)}.` });
    }
  });

  state.recurring.forEach(r => {
    const next = nextRecurringDate(r, today);
    if (next && next >= today && next <= limit) {
      reminders.push({ level: r.type === "expense" ? "warn" : "", title: r.type === "expense" ? "Pago próximo" : "Ingreso próximo", body: `${r.name}: ${formatDate(next)} · ${money(r.amount)}.` });
    }
  });

  box.innerHTML = reminders.slice(0, 4).map(r => `
    <div class="reminder ${r.level}">
      <h4>${escapeHtml(r.title)}</h4>
      <p>${escapeHtml(r.body)}</p>
    </div>
  `).join("");
}

function nextRecurringDate(item, fromIso) {
  let date = item.startDate;
  if (!date) return "";

  if (item.frequency === "daily") return fromIso >= date ? fromIso : date;

  let current = new Date(`${date}T00:00:00`);
  const from = new Date(`${fromIso}T00:00:00`);

  if (item.frequency === "monthly" || item.frequency === "bimonthly") {
    const step = item.frequency === "monthly" ? 1 : 2;
    const day = Math.min(Number(item.dayOfMonth || current.getDate()), 28);
    while (current < from) {
      current.setMonth(current.getMonth() + step);
      current.setDate(day);
    }
    return toISODate(current);
  }

  const stepDays = item.frequency === "weekly" ? 7 : 14;
  while (current < from) current.setDate(current.getDate() + stepDays);
  return toISODate(current);
}

function renderAll() {
  updateFileStatus();
  populateCategorySelects();
  renderDashboard();
  renderMovementsTable();
  renderBudgetsList();
  renderDebtsList();
  renderGoalsList();
  renderRecurringList();
  renderCategoriesList();
  updateJsonPreview();
  renderReminders();
}

function groupSum(items, key) {
  return items.reduce((acc, item) => {
    const group = item[key] || "Otros";
    acc[group] = (acc[group] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  $("toastBox").appendChild(node);
  setTimeout(() => node.remove(), 2300);
}

function clearMovementForm() {
  $("movementId").value = "";
  $("movementType").value = "income";
  $("movementDate").value = toISODate(new Date());
  $("movementAmount").value = "";
  $("movementMethod").value = "cash";
  $("movementCategory").value = state.categories[0] || "Otros";
  $("movementDescription").value = "";
  $("movementNote").value = "";
}

function clearBudgetForm() {
  $("budgetId").value = "";
  $("budgetCategory").value = state.categories[0] || "Otros";
  $("budgetLimit").value = "";
  $("budgetPeriod").value = "month";
}

function clearDebtForm() {
  $("debtId").value = "";
  $("debtName").value = "";
  $("debtTotal").value = "";
  $("debtPaid").value = "0";
  $("debtMinPayment").value = "0";
  $("debtDueDate").value = "";
  $("debtInterest").value = "0";
}

function clearGoalForm() {
  $("goalId").value = "";
  $("goalName").value = "";
  $("goalTarget").value = "";
  $("goalNote").value = "";
  $("goalSaved").value = "0";
  $("goalDate").value = "";
}

function clearRecurringForm() {
  $("recurringId").value = "";
  $("recurringType").value = "income";
  $("recurringName").value = "";
  $("recurringAmount").value = "";
  $("recurringMethod").value = "transfer";
  $("recurringCategory").value = state.categories[0] || "Otros";
  $("recurringFrequency").value = "weekly";
  $("recurringStart").value = toISODate(new Date());
  $("recurringDay").value = "";
}

function bindNavigation() {
  qsa(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".nav-btn").forEach(b => b.classList.remove("active"));
      qsa(".view").forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.view).classList.add("active");
      $("viewTitle").textContent = btn.textContent;
      renderAll();
    });
  });
}

function bindForms() {
  $("movementForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("movementId").value;
    const payload = movement($("movementType").value, $("movementDate").value, Number($("movementAmount").value), $("movementMethod").value, $("movementCategory").value, $("movementDescription").value.trim(), $("movementNote").value.trim());

    if (id) {
      const index = state.movements.findIndex(m => m.id === id);
      if (index >= 0) state.movements[index] = { ...state.movements[index], ...payload, id };
    } else state.movements.push(payload);

    markUpdated();
    clearMovementForm();
    renderAll();
    toast("Movimiento guardado");
  });

  $("budgetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("budgetId").value;
    const payload = budget($("budgetCategory").value, Number($("budgetLimit").value), $("budgetPeriod").value);

    if (id) {
      const index = state.budgets.findIndex(b => b.id === id);
      if (index >= 0) state.budgets[index] = { ...state.budgets[index], ...payload, id };
    } else state.budgets.push(payload);

    markUpdated();
    clearBudgetForm();
    renderAll();
    toast("Presupuesto guardado");
  });

  $("debtForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("debtId").value;
    const payload = debt($("debtName").value.trim(), Number($("debtTotal").value), Number($("debtPaid").value), Number($("debtMinPayment").value), $("debtDueDate").value, Number($("debtInterest").value));

    if (id) {
      const index = state.debts.findIndex(d => d.id === id);
      if (index >= 0) state.debts[index] = { ...state.debts[index], ...payload, id };
    } else state.debts.push(payload);

    markUpdated();
    clearDebtForm();
    renderAll();
    toast("Deuda guardada");
  });

  $("goalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("goalId").value;
    const payload = 
      goal($("goalName").value.trim(), 
      Number($("goalTarget").value), 
      Number($("goalSaved").value), 
      $("goalDate").value,
      $("goalNote").value.trim());

    if (id) {
      const index = state.goals.findIndex(g => g.id === id);
      if (index >= 0) state.goals[index] = { ...state.goals[index], ...payload, id };
    } else state.goals.push(payload);

    markUpdated();
    clearGoalForm();
    renderAll();
    toast("Meta guardada");
  });

  $("recurringForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("recurringId").value;
    const payload = recurring($("recurringType").value, $("recurringName").value.trim(), Number($("recurringAmount").value), $("recurringMethod").value, $("recurringCategory").value, $("recurringFrequency").value, $("recurringStart").value, $("recurringDay").value || null);

    if (id) {
      const index = state.recurring.findIndex(r => r.id === id);
      if (index >= 0) state.recurring[index] = { ...state.recurring[index], ...payload, id };
    } else state.recurring.push(payload);

    markUpdated();
    clearRecurringForm();
    renderAll();
    toast("Recurrente guardado");
  });

  $("categoryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = $("newCategory").value.trim();
    if (!value || state.categories.includes(value)) return;
    state.categories.push(value);
    $("newCategory").value = "";
    markUpdated();
    renderAll();
    toast("Categoría agregada");
  });
}

function bindButtons() {
  $("openJsonBtn").addEventListener("click", openJsonFile);
  $("saveJsonBtn").addEventListener("click", saveJsonFile);
  $("downloadJsonBtn").addEventListener("click", downloadJson);

  $("jsonFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    fileHandle = null;
    activeFileName = file.name;
    setState(JSON.parse(text));
    autoSaveNow();
    toast("Archivo abierto");
  });

  $("newDataBtn").addEventListener("click", () => {
    if (!confirm("Esto reemplazará los datos cargados en pantalla. Guarda antes si necesitas conservarlos.")) return;
    fileHandle = null;
    activeFileName = "Sin archivo";
    clearAutoSave();
    setState(createEmptyState(), { skipAutosave: true });
    renderAll();
    toast("Datos vacíos cargados");
  });

  $("sampleDataBtn").addEventListener("click", () => {
    fileHandle = null;
    activeFileName = "Ejemplo sin guardar";
    setState(createSampleState());
    toast("Ejemplo cargado");
  });

  $("applyRecurringBtn").addEventListener("click", applyRecurringForPeriod);
  $("clearMovementForm").addEventListener("click", clearMovementForm);
  $("clearBudgetForm").addEventListener("click", clearBudgetForm);
  $("clearDebtForm").addEventListener("click", clearDebtForm);
  $("clearGoalForm").addEventListener("click", clearGoalForm);
  $("clearRecurringForm").addEventListener("click", clearRecurringForm);

  ["periodMode", "periodStart", "periodEnd", "movementSearch", "filterType", "filterMethod", "filterCategory"].forEach(id => {
    $(id).addEventListener("input", () => {
      qsa(".custom-period").forEach(el => el.classList.toggle("hidden", $("periodMode").value !== "custom"));
      renderAll();
    });
    $(id).addEventListener("change", () => {
      qsa(".custom-period").forEach(el => el.classList.toggle("hidden", $("periodMode").value !== "custom"));
      renderAll();
    });
  });

  document.body.addEventListener("click", handleDelegatedClicks);
}

function handleDelegatedClicks(e) {
  const t = e.target;

  if (t.dataset.editMovement) fillMovementForm(t.dataset.editMovement);
  if (t.dataset.deleteMovement) removeById("movements", t.dataset.deleteMovement);
  if (t.dataset.editBudget) fillBudgetForm(t.dataset.editBudget);
  if (t.dataset.deleteBudget) removeById("budgets", t.dataset.deleteBudget);
  if (t.dataset.editDebt) fillDebtForm(t.dataset.editDebt);
  if (t.dataset.deleteDebt) removeById("debts", t.dataset.deleteDebt);
  if (t.dataset.payDebt) promptDebtPayment(t.dataset.payDebt);
  if (t.dataset.editGoal) fillGoalForm(t.dataset.editGoal);
  if (t.dataset.deleteGoal) removeById("goals", t.dataset.deleteGoal);
  if (t.dataset.addGoal) promptGoalContribution(t.dataset.addGoal);
  if (t.dataset.editRecurring) fillRecurringForm(t.dataset.editRecurring);
  if (t.dataset.deleteRecurring) removeById("recurring", t.dataset.deleteRecurring);
  if (t.dataset.deleteCategory) removeCategory(t.dataset.deleteCategory);
}

function removeById(collection, id) {
  if (!confirm("Eliminar registro.")) return;
  state[collection] = state[collection].filter(item => item.id !== id);
  markUpdated();
  renderAll();
  toast("Registro eliminado");
}

function fillMovementForm(id) {
  const m = state.movements.find(item => item.id === id);
  if (!m) return;
  $("movementId").value = m.id;
  $("movementType").value = m.type;
  $("movementDate").value = m.date;
  $("movementAmount").value = m.amount;
  $("movementMethod").value = m.method;
  $("movementCategory").value = m.category;
  $("movementDescription").value = m.description || "";
  $("movementNote").value = m.note || "";
  switchView("movements");
}

function fillBudgetForm(id) {
  const b = state.budgets.find(item => item.id === id);
  if (!b) return;
  $("budgetId").value = b.id;
  $("budgetCategory").value = b.category;
  $("budgetLimit").value = b.limit;
  $("budgetPeriod").value = b.period;
  switchView("budgets");
}

function fillDebtForm(id) {
  const d = state.debts.find(item => item.id === id);
  if (!d) return;
  $("debtId").value = d.id;
  $("debtName").value = d.name;
  $("debtTotal").value = d.total;
  $("debtPaid").value = d.paid;
  $("debtMinPayment").value = d.minPayment;
  $("debtDueDate").value = d.dueDate;
  $("debtInterest").value = d.annualInterest;
  switchView("debts");
}

function fillGoalForm(id) {
  const g = state.goals.find(item => item.id === id);
  if (!g) return;
  $("goalId").value = g.id;
  $("goalName").value = g.name;
  $("goalTarget").value = g.target;
  $("goalNote").value = g.note || "";
  $("goalSaved").value = g.saved;
  $("goalDate").value = g.targetDate;
  switchView("goals");
}

function fillRecurringForm(id) {
  const r = state.recurring.find(item => item.id === id);
  if (!r) return;
  $("recurringId").value = r.id;
  $("recurringType").value = r.type;
  $("recurringName").value = r.name;
  $("recurringAmount").value = r.amount;
  $("recurringMethod").value = r.method;
  $("recurringCategory").value = r.category;
  $("recurringFrequency").value = r.frequency;
  $("recurringStart").value = r.startDate;
  $("recurringDay").value = r.dayOfMonth || "";
  switchView("recurring");
}

function promptDebtPayment(id) {
  const d = state.debts.find(item => item.id === id);
  if (!d) return;
  const value = Number(prompt("Monto del abono:", "0"));
  if (!value || value <= 0) return;
  d.paid = Math.min(Number(d.total), Number(d.paid || 0) + value);
  state.movements.push(movement("expense", toISODate(new Date()), value, "transfer", "Deudas", `Abono a ${d.name}`));
  markUpdated();
  renderAll();
  toast("Abono registrado");
}

function promptGoalContribution(id) {
  const g = state.goals.find(item => item.id === id);
  if (!g) return;
  const value = Number(prompt("Monto de la aportación:", "0"));
  if (!value || value <= 0) return;
  g.saved = Math.min(Number(g.target), Number(g.saved || 0) + value);
  state.movements.push(movement("expense", toISODate(new Date()), value, "transfer", "Ahorro", `Aportación a ${g.name}`));
  markUpdated();
  renderAll();
  toast("Aportación registrada");
}

function removeCategory(category) {
  const used = [...state.movements.map(m => m.category), ...state.budgets.map(b => b.category), ...state.recurring.map(r => r.category)].includes(category);
  if (used) {
    alert("No puedes eliminar una categoría que ya tiene movimientos, presupuestos o recurrentes.");
    return;
  }
  state.categories = state.categories.filter(c => c !== category);
  markUpdated();
  renderAll();
}

function switchView(viewId) {
  qsa(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  qsa(".view").forEach(v => v.classList.toggle("active", v.id === viewId));
  const active = qsa(".nav-btn").find(b => b.dataset.view === viewId);
  $("viewTitle").textContent = active ? active.textContent : "Dashboard";
}

function applyRecurringForPeriod() {
  const { start, end } = getPeriodRange();
  const newMovements = [];

  state.recurring.filter(r => r.active).forEach(r => {
    recurringDatesBetween(r, start, end).forEach(date => {
      const key = `${r.id}:${date}`;
      const exists = state.movements.some(m => m.recurringKey === key);
      if (!exists) {
        const m = movement(r.type, date, r.amount, r.method, r.category, r.name);
        m.recurringKey = key;
        newMovements.push(m);
      }
    });
  });

  state.movements.push(...newMovements);
  markUpdated();
  renderAll();
  toast(`${newMovements.length} recurrente(s) aplicado(s)`);
}

function recurringDatesBetween(item, start, end) {
  const dates = [];
  let current = new Date(`${item.startDate}T00:00:00`);
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (current > endDate) return dates;

  if (item.frequency === "monthly" || item.frequency === "bimonthly") {
    const step = item.frequency === "monthly" ? 1 : 2;
    const day = Math.min(Number(item.dayOfMonth || current.getDate()), 28);
    while (current <= endDate) {
      if (current >= startDate) dates.push(toISODate(current));
      current.setMonth(current.getMonth() + step);
      current.setDate(day);
    }
    return dates;
  }

  const stepDays = { daily: 1, weekly: 7, biweekly: 14 }[item.frequency] || 7;
  while (current <= endDate) {
    if (current >= startDate) dates.push(toISODate(current));
    current.setDate(current.getDate() + stepDays);
  }
  return dates;
}

function initDefaults() {
  const today = toISODate(new Date());
  $("movementDate").value = today;
  $("recurringStart").value = today;
  $("periodStart").value = startOfMonth(new Date());
  $("periodEnd").value = endOfMonth(new Date());
  clearMovementForm();
  clearBudgetForm();
  clearDebtForm();
  clearGoalForm();
  clearRecurringForm();
}

function init() {
  bindNavigation();
  bindForms();
  bindButtons();
  initDefaults();
  restoreAutoSavedState();
  renderAll();
}

init();

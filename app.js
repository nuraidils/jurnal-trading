const API_URL = "/api/state";
let currentUser = null;

// ---------- Auth: API calls ----------
async function apiRegister(username, email, password) {
    const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
}
async function apiLogin(email, password) {
    const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
}
async function apiLogout() {
    try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
}
async function apiMe() {
    try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        return await res.json();
    } catch {
        return { authenticated: false };
    }
}

// ---------- Auth: tampilan ----------
function showApp() {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("app").style.display = "flex";
}
function switchAuthView(view) {
    document.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("active", b.dataset.authview === view));
    document.getElementById("authViewLogin").classList.toggle("active", view === "login");
    document.getElementById("authViewRegister").classList.toggle("active", view === "register");
    document.getElementById("loginError").textContent = "";
    document.getElementById("registerError").textContent = "";
}
function showAuthScreen(view = "login") {
    document.getElementById("app").style.display = "none";
    document.getElementById("authScreen").style.display = "flex";
    switchAuthView(view);
}
const PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "GBPJPY", "AUDUSD", "USDCHF", "Lainnya"];
const STRATEGIES = ["Manual", "EA Fibonacci H4", "EA Scalping", "EA SOBAT XAU"];
function getKnownStrategies() {
    const used = state.trades.map((t) => t.strategy).filter(Boolean);
    return [...new Set([...STRATEGIES, ...used])];
}
let state = { trades: [], withdrawals: [], currency: "IDR", plan: null };
let currentView = "dashboard";
let historyFilter = { pair: "Semua", dir: "Semua", strategy: "Semua" };
let closingTradeId = null;
let perfPeriod = "week";
let isSaving = false;

function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- Modal custom (pengganti confirm() bawaan browser) ----------
function openModal(html) {
    const overlay = document.getElementById("modalOverlay");
    overlay.innerHTML = html;
    overlay.classList.add("show");
    return overlay;
}
function closeModal() {
    const overlay = document.getElementById("modalOverlay");
    overlay.classList.remove("show");
    setTimeout(() => {
        if (!overlay.classList.contains("show")) overlay.innerHTML = "";
    }, 200);
}
function confirmModal(message, { title = "Konfirmasi", confirmText = "Ya, lanjutkan", cancelText = "Batal", danger = false } = {}) {
    return new Promise((resolve) => {
        const overlay = openModal(`
            <div class="modal-box">
                <h3>${escapeAttr(title)}</h3>
                <p class="modal-msg">${escapeAttr(message)}</p>
                <div class="modal-actions">
                    <button class="modal-btn ghost" data-act="cancel">${escapeAttr(cancelText)}</button>
                    <button class="modal-btn ${danger ? "danger" : "primary"}" data-act="confirm">${escapeAttr(confirmText)}</button>
                </div>
            </div>
        `);
        const finish = (result) => {
            closeModal();
            overlay.removeEventListener("click", onBackdrop);
            resolve(result);
        };
        const onBackdrop = (e) => {
            if (e.target === overlay) finish(false);
        };
        overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => finish(false));
        overlay.querySelector('[data-act="confirm"]').addEventListener("click", () => finish(true));
        overlay.addEventListener("click", onBackdrop);
    });
}
function chooseModal(title, message, options) {
    // options: [{ id, label, variant }] — variant: "primary" | "danger" | "" (default) | "ghost"
    return new Promise((resolve) => {
        const buttonsHtml = options.map((o) => `<button class="modal-btn ${o.variant || ""}" data-choice="${escapeAttr(o.id)}">${escapeAttr(o.label)}</button>`).join("");
        const overlay = openModal(`
            <div class="modal-box">
                <h3>${escapeAttr(title)}</h3>
                <p class="modal-msg">${escapeAttr(message)}</p>
                <div class="modal-actions modal-actions-col">${buttonsHtml}</div>
            </div>
        `);
        const finish = (result) => {
            closeModal();
            overlay.removeEventListener("click", onBackdrop);
            resolve(result);
        };
        const onBackdrop = (e) => {
            if (e.target === overlay) finish(null);
        };
        overlay.querySelectorAll("[data-choice]").forEach((btn) => {
            btn.addEventListener("click", () => finish(btn.dataset.choice));
        });
        overlay.addEventListener("click", onBackdrop);
    });
}

// ---------- Tooltip grafik ----------
function escapeAttr(s) {
    return String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
let activeChartRect = null;
function positionChartTooltip(x, y) {
    const tt = document.getElementById("chartTooltip");
    const pad = 14;
    let left = x + pad;
    let top = y - 14;
    const ttW = tt.offsetWidth || 190;
    const ttH = tt.offsetHeight || 40;
    if (left + ttW > window.innerWidth - 8) left = x - ttW - pad;
    if (left < 8) left = 8;
    if (top + ttH > window.innerHeight - 8) top = window.innerHeight - ttH - 8;
    if (top < 8) top = 8;
    tt.style.transform = `translate(${left}px, ${top}px)`;
}
function showChartTooltip(rect, x, y) {
    const tt = document.getElementById("chartTooltip");
    const label = rect.getAttribute("data-tt-label") || "";
    const value = rect.getAttribute("data-tt-value") || "";
    const color = rect.getAttribute("data-tt-color") || "var(--text)";
    tt.innerHTML = `<div class="tt-label">${label}</div><div class="tt-value" style="color:${color}">${value}</div>`;
    tt.classList.add("show");
    positionChartTooltip(x, y);
    if (activeChartRect && activeChartRect !== rect) activeChartRect.classList.remove("tt-active");
    rect.classList.add("tt-active");
    activeChartRect = rect;
}
function hideChartTooltip() {
    document.getElementById("chartTooltip").classList.remove("show");
    if (activeChartRect) {
        activeChartRect.classList.remove("tt-active");
        activeChartRect = null;
    }
}
function bindChartTooltips(root) {
    root.querySelectorAll(".chart rect[data-tt-label]").forEach((rect) => {
        rect.addEventListener("mouseenter", (e) => showChartTooltip(rect, e.clientX, e.clientY));
        rect.addEventListener("mousemove", (e) => positionChartTooltip(e.clientX, e.clientY));
        rect.addEventListener("mouseleave", hideChartTooltip);
        rect.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                const t = e.touches[0];
                if (activeChartRect === rect) {
                    hideChartTooltip();
                } else {
                    showChartTooltip(rect, t.clientX, t.clientY);
                }
            },
            { passive: false }
        );
    });
}
document.addEventListener(
    "touchstart",
    (e) => {
        if (!e.target.closest(".chart rect[data-tt-label]")) hideChartTooltip();
    },
    { passive: true }
);

document.querySelectorAll(".auth-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAuthView(btn.dataset.authview));
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login_email").value.trim();
    const password = document.getElementById("login_password").value;
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    const { ok, data } = await apiLogin(email, password);
    if (!ok) {
        errEl.textContent = data.error || "Gagal masuk.";
        return;
    }
    currentUser = data.user;
    await startApp();
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("reg_username").value.trim();
    const email = document.getElementById("reg_email").value.trim();
    const password = document.getElementById("reg_password").value;
    const confirmPassword = document.getElementById("reg_confirm").value;
    const errEl = document.getElementById("registerError");
    errEl.textContent = "";
    if (password !== confirmPassword) {
        errEl.textContent = "Konfirmasi password tidak cocok.";
        return;
    }
    const { ok, data } = await apiRegister(username, email, password);
    if (!ok) {
        errEl.textContent = data.error || "Gagal daftar.";
        return;
    }
    currentUser = data.user;
    await startApp();
});

async function loadData() {
    try {
        const res = await fetch(API_URL, { method: "GET", credentials: "include" });
        if (res.status === 401) {
            showAuthScreen("login");
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state = data;
        if (!Array.isArray(state.trades)) state.trades = [];
        if (!Array.isArray(state.withdrawals)) state.withdrawals = [];
        if (!state.currency) state.currency = "IDR";
        state.plan = PlanCalc.normalizePlan(state.plan);
    } catch (e) {
        toast("Gagal memuat data dari server. Pastikan koneksi database aktif.");
    }
}

function showSaving() {
    const ind = document.getElementById("savingIndicator");
    if (ind) ind.classList.add("show");
}
function hideSaving() {
    const ind = document.getElementById("savingIndicator");
    if (ind) ind.classList.remove("show");
}
async function saveData() {
    showSaving();
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state),
        });
        if (res.status === 401) {
            showAuthScreen("login");
            return false;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Gagal menyimpan");
        return true;
    } catch (e) {
        toast("Gagal menyimpan ke server. Pastikan koneksi database aktif.");
        return false;
    } finally {
        hideSaving();
    }
}

function fmt(n) {
    if (n === null || n === undefined || n === "" || isNaN(n)) return "—";
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
function currencyPrefix() {
    return state.currency === "USD" ? "$" : state.currency === "USC" ? "¢" : "Rp";
}
function fmtMoney(n) {
    if (n === null || n === undefined || n === "" || isNaN(n)) return "—";
    return `${currencyPrefix()} ${fmt(n)}`;
}
function openTrades() {
    return state.trades.filter((t) => t.status === "open");
}
function closedTrades() {
    return state.trades.filter((t) => t.status === "closed");
}

function lastEquitySnapshot() {
    const closed = closedTrades();
    if (closed.length) {
        const last = closed[closed.length - 1];
        return { value: last.totalEquity !== null && last.totalEquity !== undefined && last.totalEquity !== "" ? Number(last.totalEquity) : null, time: last.closeTimestamp || last.timestamp };
    }
    const open = openTrades();
    if (open.length) {
        const last = open[open.length - 1];
        return { value: last.equityAwal !== null && last.equityAwal !== "" ? Number(last.equityAwal) : null, time: last.timestamp };
    }
    return { value: null, time: null };
}
function withdrawalsSince(timeIso) {
    return (state.withdrawals || []).filter((w) => !timeIso || new Date(w.timestamp) > new Date(timeIso)).reduce((s, w) => s + Number(w.amount || 0), 0);
}
function totalWithdrawals() {
    return (state.withdrawals || []).reduce((s, w) => s + Number(w.amount || 0), 0);
}

function currentEquity() {
    const snap = lastEquitySnapshot();
    if (snap.value === null) return null;
    return snap.value - withdrawalsSince(snap.time);
}
// Hasil hitung Trading Plan dari data jurnal saat ini (null kalau belum ada plan).
// Semua nilai dalam mata uang plan; lihat plan-calc.js untuk detailnya.
function computePlan(nowMs) {
    if (!state.plan) return null;
    return PlanCalc.compute(state.plan, { trades: state.trades, withdrawals: state.withdrawals, currency: state.currency, equity: currentEquity() }, nowMs);
}
function getCycles() {
    const cycles = [];
    let current = { trades: [], equityAwal: null };
    state.trades.forEach((t) => {
        if (current.equityAwal === null) current.equityAwal = t.equityAwal;
        current.trades.push(t);
        if (t.status === "closed" && t.actual === "MC") {
            cycles.push(current);
            current = { trades: [], equityAwal: null };
        }
    });
    if (current.trades.length) cycles.push(current);
    return cycles;
}

function firstEquity() {
    const cycles = getCycles();
    if (cycles.length) {
        const last = cycles[cycles.length - 1];
        if (last.equityAwal !== null) return Number(last.equityAwal);
    }
    if (state.trades.length) return Number(state.trades[0].equityAwal);
    return null;
}

function renderHeader() {
    const eq = currentEquity();
    const start = firstEquity();
    document.getElementById("equityVal").textContent = eq !== null ? fmtMoney(eq) : "—";
    document.getElementById("currencySelect").value = state.currency;
    document.getElementById("startEqLabel").textContent = start !== null ? `Equity awal: ${fmtMoney(start)}${getCycles().length > 1 ? ` · Akun ke-${getCycles().length}` : ""}` : "Belum ada posisi tercatat";
    const deltaEl = document.getElementById("equityDelta");
    if (start !== null && eq !== null) {
        const diff = eq - start;
        const pct = start !== 0 ? (diff / start) * 100 : 0;
        deltaEl.textContent = `${diff >= 0 ? "+" : ""}${fmtMoney(diff)} (${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
        deltaEl.className = `delta num ${diff > 0 ? "pos" : diff < 0 ? "neg" : "flat"}`;
    } else {
        deltaEl.textContent = "—";
        deltaEl.className = "delta flat";
    }
    const oc = openTrades().length;
    document.getElementById("openCountLabel").textContent = oc ? `${oc} posisi terbuka menunggu hasil` : "";
    const badge = document.getElementById("openBadge");
    if (oc) {
        badge.style.display = "block";
        badge.textContent = oc;
    } else {
        badge.style.display = "none";
    }
}

// ---------- Dashboard ----------
function computeStats() {
    const trades = closedTrades();
    const total = trades.length;
    const wins = trades.filter((t) => Number(t.pl) > 0).length;
    const winRate = total ? (wins / total) * 100 : 0;
    const totalPL = trades.reduce((s, t) => s + (Number(t.pl) || 0), 0);
    const mcCount = trades.filter((t) => t.actual === "MC").length;
    return { total, wins, winRate, totalPL, mcCount };
}

function renderPLBarChart() {
    const trades = closedTrades();
    if (trades.length === 0) return '<div class="empty small">Grafik P&amp;L muncul setelah ada posisi yang selesai.</div>';
    const w = 400,
        h = 150,
        pad = 8;
    const vals = trades.map((t) => Number(t.pl) || 0);
    const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 1);
    const zeroY = h / 2;
    const barW = Math.min(28, (w - pad * 2) / vals.length - 4);
    const gap = (w - pad * 2 - barW * vals.length) / Math.max(1, vals.length - 1);
    const bars = vals
        .map((v, i) => {
            const t = trades[i];
            const x = pad + i * (barW + gap);
            const barH = (Math.abs(v) / maxAbs) * (h / 2 - 10);
            const y = v >= 0 ? zeroY - barH : zeroY;
            const color = v >= 0 ? "var(--profit)" : "var(--loss)";
            const dateStr = new Date(t.closeTimestamp || t.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
            const ttLabel = escapeAttr(`${t.pair} · ${t.direction} · ${dateStr}`);
            const ttValue = escapeAttr(`${v >= 0 ? "+" : ""}${fmtMoney(v)}`);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}" fill="${color}" rx="2" data-tt-label="${ttLabel}" data-tt-value="${ttValue}" data-tt-color="${color}"/>`;
        })
        .join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${zeroY}" x2="${w}" y2="${zeroY}" stroke="var(--border)" stroke-width="1"/>${bars}</svg>`;
}

function isoWeekKey(d) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - day);
    return dt.toISOString().slice(0, 10);
}
function weekLabel(key) {
    const d = new Date(key);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
}
function yearKey(d) {
    return String(d.getFullYear());
}

function groupPerformance(period) {
    const trades = closedTrades();
    const map = {};
    trades.forEach((t) => {
        const d = new Date(t.closeTimestamp || t.timestamp);
        let key, label;
        if (period === "week") {
            key = isoWeekKey(d);
            label = weekLabel(key);
        } else if (period === "month") {
            key = monthKey(d);
            label = monthLabel(key);
        } else {
            key = yearKey(d);
            label = key;
        }
        if (!map[key]) map[key] = { label, pl: 0, count: 0 };
        map[key].pl += Number(t.pl) || 0;
        map[key].count++;
    });
    let entries = Object.entries(map)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([k, v]) => v);
    const cap = period === "week" ? 8 : period === "month" ? 12 : 6;
    if (entries.length > cap) entries = entries.slice(entries.length - cap);
    return entries;
}

function renderPeriodChart(entries) {
    if (entries.length === 0) return '<div class="empty small">Belum ada data untuk periode ini.</div>';
    const w = 400,
        h = 170,
        pad = 10,
        labelH = 20;
    const chartH = h - labelH;
    const maxAbs = Math.max(...entries.map((e) => Math.abs(e.pl)), 1);
    const zeroY = pad + (chartH - pad * 2) / 2;
    const n = entries.length;
    const barW = Math.min(34, (w - pad * 2) / n - 6);
    const gap = (w - pad * 2 - barW * n) / Math.max(1, n - 1);
    let bars = "",
        labels = "";
    entries.forEach((e, i) => {
        const x = pad + i * (barW + gap);
        const barH = (Math.abs(e.pl) / maxAbs) * (chartH / 2 - 14);
        const y = e.pl >= 0 ? zeroY - barH : zeroY;
        const color = e.pl >= 0 ? "var(--profit)" : e.pl < 0 ? "var(--loss)" : "var(--text-dim)";
        const ttLabel = escapeAttr(`${e.label} · ${e.count}x posisi`);
        const ttValue = escapeAttr(`${e.pl >= 0 ? "+" : ""}${fmtMoney(e.pl)}`);
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}" fill="${color}" rx="2" data-tt-label="${ttLabel}" data-tt-value="${ttValue}" data-tt-color="${color}"/>`;
        labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle" class="bar-label">${e.label}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${zeroY}" x2="${w}" y2="${zeroY}" stroke="var(--border)" stroke-width="1"/>${bars}${labels}</svg>`;
}

function renderPerformanceSection() {
    const entries = groupPerformance(perfPeriod);
    const totalPL = entries.reduce((s, e) => s + e.pl, 0);
    const labelMap = { week: "8 minggu terakhir", month: "12 bulan terakhir", year: "per tahun" };
    return `<div class="card">
        <h2>Performa berkala</h2>
        <div class="period-tabs">
            <button class="chip${perfPeriod === "week" ? " active" : ""}" data-period="week">Mingguan</button>
            <button class="chip${perfPeriod === "month" ? " active" : ""}" data-period="month">Bulanan</button>
            <button class="chip${perfPeriod === "year" ? " active" : ""}" data-period="year">Tahunan</button>
        </div>
        <div class="summary-box"><span class="k">Total P/L (${labelMap[perfPeriod]}): </span>
        <span class="num" style="color:${totalPL >= 0 ? "var(--profit)" : "var(--loss)"}">${totalPL >= 0 ? "+" : ""}${fmtMoney(totalPL)}</span></div>
        ${renderPeriodChart(entries)}
    </div>`;
}

function renderStrategyBreakdown() {
    const trades = closedTrades();
    if (trades.length === 0) return '<div class="empty small">Breakdown per strategi muncul setelah ada posisi selesai.</div>';
    const map = {};
    trades.forEach((t) => {
        const key = t.strategy || "Tanpa label";
        if (!map[key]) map[key] = { count: 0, wins: 0, pl: 0 };
        map[key].count++;
        if (Number(t.pl) > 0) map[key].wins++;
        map[key].pl += Number(t.pl) || 0;
    });
    return Object.entries(map)
        .map(([name, d]) => {
            const wr = d.count ? (d.wins / d.count) * 100 : 0;
            return `<div class="trade-detail" style="border-top:1px solid var(--border);padding:8px 0;">
                <div style="color:var(--text);">${name} <span style="color:var(--text-dim);">(${d.count}x, WR ${wr.toFixed(0)}%)</span></div>
                <div class="num" style="text-align:right;color:${d.pl >= 0 ? "var(--profit)" : "var(--loss)"}">${d.pl >= 0 ? "+" : ""}${fmtMoney(d.pl)}</div>
            </div>`;
        })
        .join("");
}

function renderAccountCycles() {
    const cycles = getCycles();
    if (cycles.length <= 1) return "";
    const rows = cycles
        .map((c, i) => {
            const closedInCycle = c.trades.filter((t) => t.status === "closed");
            const pl = closedInCycle.reduce((s, t) => s + (Number(t.pl) || 0), 0);
            const endedByMC = closedInCycle.length && closedInCycle[closedInCycle.length - 1].actual === "MC";
            const lastEq = closedInCycle.length ? closedInCycle[closedInCycle.length - 1].totalEquity : null;
            const isLast = i === cycles.length - 1;
            const tag = endedByMC ? ", kena MC" : isLast ? ", aktif" : "";
            return `<div class="trade-detail" style="border-top:1px solid var(--border);padding:8px 0;">
                <div>Akun ke-${i + 1} <span style="color:var(--text-dim);">(${c.trades.length}x${tag})</span></div>
                <div class="num" style="text-align:right;color:${pl >= 0 ? "var(--profit)" : "var(--loss)"}">${pl >= 0 ? "+" : ""}${fmtMoney(pl)}</div>
                <div class="k" style="grid-column:1/-1;font-size:12px;">${fmtMoney(c.equityAwal)} → ${lastEq ? fmtMoney(lastEq) : "berjalan"}</div>
            </div>`;
        })
        .join("");
    return `<div class="card"><h2>Riwayat akun (per siklus MC)</h2>${rows}</div>`;
}

// ---------- Withdraw ----------
function renderWithdrawChart() {
    const wds = (state.withdrawals || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (wds.length === 0) return '<div class="empty small">Grafik withdraw muncul setelah ada WD tercatat.</div>';
    const w = 400,
        h = 150,
        pad = 8;
    const vals = wds.map((x) => Number(x.amount) || 0);
    const maxV = Math.max(...vals, 1);
    const barW = Math.min(28, (w - pad * 2) / vals.length - 4);
    const gap = (w - pad * 2 - barW * vals.length) / Math.max(1, vals.length - 1);
    const bars = vals
        .map((v, i) => {
            const wd = wds[i];
            const x = pad + i * (barW + gap);
            const barH = (v / maxV) * (h - pad * 2);
            const y = h - pad - barH;
            const dateStr = new Date(wd.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
            const ttLabel = escapeAttr(`${dateStr}${wd.note ? ` · ${wd.note}` : ""}`);
            const ttValue = escapeAttr(`-${fmtMoney(v)}`);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}" fill="var(--pending)" rx="2" data-tt-label="${ttLabel}" data-tt-value="${ttValue}" data-tt-color="var(--pending)"/>`;
        })
        .join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${h - pad}" x2="${w}" y2="${h - pad}" stroke="var(--border)" stroke-width="1"/>${bars}</svg>`;
}

function renderWithdrawSection() {
    const wds = (state.withdrawals || []).slice().reverse();
    const total = totalWithdrawals();
    const list =
        wds.length === 0
            ? '<div class="empty small">Belum ada withdraw tercatat.</div>'
            : wds
                    .map((w) => {
                        const d = new Date(w.timestamp);
                        const dateStr = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                        return `<div class="trade-detail" style="border-top:1px solid var(--border);padding:8px 0;">
                            <div>${dateStr}${w.note ? ` · ${w.note}` : ""}</div>
                            <div class="num" style="text-align:right;color:var(--pending);">-${fmtMoney(w.amount)}</div>
                            <div style="grid-column:1/-1;text-align:right;"><button class="del-btn" data-delwd="${w.id}">Hapus</button></div>
                        </div>`;
                    })
                    .join("");
    return `<div class="card">
        <h2>Withdraw</h2>
        <form id="withdrawForm">
            <div class="row2">
                <div class="field"><label>Jumlah WD</label><input type="number" step="any" id="wd_amount" inputmode="decimal"></div>
                <div class="field"><label>Catatan (opsional)</label><input type="text" id="wd_note" placeholder="misal: tarik profit"></div>
            </div>
            <button type="submit" class="submit-btn" style="background:var(--pending);color:#0D0F14;">Catat withdraw</button>
        </form>
        <div class="summary-box" style="margin-top:14px;"><span class="k">Total sudah di-WD: </span><span class="num">${fmtMoney(total)}</span></div>
        ${renderWithdrawChart()}
        ${list}
    </div>`;
}

async function onSubmitWithdraw(e) {
    e.preventDefault();
    const amount = document.getElementById("wd_amount").value;
    if (!amount || Number(amount) <= 0) {
        toast("Isi jumlah WD yang valid.");
        return;
    }
    state.withdrawals = state.withdrawals || [];
    state.withdrawals.push({
        id: `wd_${Date.now()}`,
        timestamp: new Date().toISOString(),
        amount,
        note: document.getElementById("wd_note").value.trim(),
    });
    const ok = await saveData();
    if (ok) {
        toast("Withdraw tercatat, equity diperbarui.");
        renderHeader();
        renderDashboard();
    }
}

function renderDashboard() {
    const el = document.getElementById("view-dashboard");
    const s = computeStats();
    const greeting = `<div class="dash-greeting">Halo, ${escapeAttr(currentUser?.username || "")} 👋</div>`;
    if (state.trades.length === 0) {
        el.innerHTML = `${greeting}<div class="card"><div class="empty"><div class="big">Belum ada data</div><div class="small">Mulai dengan buka posisi pertamamu di tab "Buka posisi".</div></div></div>`;
        return;
    }
    el.innerHTML = `${greeting}<div class="stat-grid">
        <div class="stat-card"><div class="label">Win rate</div><div class="value num">${s.winRate.toFixed(1)}%</div></div>
        <div class="stat-card"><div class="label">Posisi selesai</div><div class="value num">${s.total}</div></div>
        <div class="stat-card"><div class="label">Total P/L</div><div class="value num" style="color:${s.totalPL >= 0 ? "var(--profit)" : "var(--loss)"}">${s.totalPL >= 0 ? "+" : ""}${fmtMoney(s.totalPL)}</div></div>
        <div class="stat-card"><div class="label">Jumlah MC</div><div class="value num" style="color:${s.mcCount > 0 ? "var(--mc)" : "var(--text)"}">${s.mcCount}</div></div>
    </div>
    <div class="card"><h2>Grafik P&amp;L per posisi</h2>${renderPLBarChart()}</div>
    <div class="card"><h2>Performa per strategi</h2>${renderStrategyBreakdown()}</div>
    ${renderAccountCycles()}
    ${renderWithdrawSection()}
    ${renderPerformanceSection()}`;

    bindChartTooltips(el);

    el.querySelectorAll("[data-period]").forEach((btn) => {
        btn.addEventListener("click", () => {
            perfPeriod = btn.dataset.period;
            renderDashboard();
        });
    });
    const wdForm = document.getElementById("withdrawForm");
    if (wdForm) wdForm.addEventListener("submit", onSubmitWithdraw, { once: true });
    el.querySelectorAll("[data-delwd]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!(await confirmModal("Hapus catatan withdraw ini?", { title: "Hapus withdraw", danger: true, confirmText: "Ya, hapus" }))) return;
            state.withdrawals = state.withdrawals.filter((w) => w.id !== btn.dataset.delwd);
            const ok = await saveData();
            if (ok) {
                toast("Withdraw dihapus.");
                renderHeader();
                renderDashboard();
            }
        });
    });
}

// ---------- Step 1: buka posisi ----------
function renderEntryForm() {
    const el = document.getElementById("view-entry");
    el.innerHTML = `<form id="entryForm" class="card">
        <h2>Step 1 — Buka posisi</h2>
        <div class="field"><label>Pair</label><select id="f_pair">${PAIRS.map((p) => `<option value="${p}">${p}</option>`).join("")}</select></div>
        <div class="field"><label>Strategi / EA</label>
            <input type="text" id="f_strategy" list="strategyList" placeholder="Ketik strategi/EA, misal: EA Fibonacci H4">
            <datalist id="strategyList">${getKnownStrategies()
                .map((s) => `<option value="${s}">`)
                .join("")}</datalist>
        </div>
        <div class="row2">
            <div class="field"><label>Equity / balance awal</label><input type="number" step="any" id="f_equityAwal" inputmode="decimal" value="${currentEquity() !== null ? currentEquity() : ""}"><span class="field-hint">Otomatis dari equity saat ini, bisa diedit</span></div>
            <div class="field"><label>Jam entry</label><input type="time" id="f_entryTime"></div>
        </div>
        <div class="field"><label>Arah</label><div class="toggle-group">
            <button type="button" class="toggle-btn on-buy active" data-field="direction" data-val="Buy">Buy</button>
            <button type="button" class="toggle-btn on-sell" data-field="direction" data-val="Sell">Sell</button>
        </div></div>
        <div class="field"><label>Tipe entry</label><div class="toggle-group">
            <button type="button" class="toggle-btn active" data-field="entryType" data-val="Limit">Limit entry</button>
            <button type="button" class="toggle-btn" data-field="entryType" data-val="Instant">Instant/market</button>
        </div></div>
        <div class="row2">
            <div class="field"><label>Price entry</label><input type="number" step="any" id="f_priceEntry" inputmode="decimal"></div>
            <div class="field"><label>Lot</label><input type="number" step="any" id="f_lot" inputmode="decimal"></div>
        </div>
        <div class="row2">
            <div class="field"><label>SL price</label><input type="number" step="any" id="f_sl" inputmode="decimal"></div>
            <div class="field"><label>TP price</label><input type="number" step="any" id="f_tp" inputmode="decimal"></div>
        </div>
        <div class="field"><label>Alasan entry</label><textarea id="f_reason" placeholder="Setup, konfirmasi, atau alasan ambil posisi ini"></textarea></div>
        <div class="field"><label>Jumlah layer</label><input type="number" min="0" step="1" id="f_layerCount" inputmode="numeric" placeholder="0"></div>
        <div id="layerList"></div>
        <button type="submit" class="submit-btn">Simpan &amp; buka posisi</button>
    </form>`;

    el.querySelectorAll(".toggle-btn[data-field]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const field = btn.dataset.field;
            el.querySelectorAll(`.toggle-btn[data-field="${field}"]`).forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    const now = new Date();
    document.getElementById("f_entryTime").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    document.getElementById("f_layerCount").addEventListener("input", (e) => {
        const n = Math.max(0, parseInt(e.target.value) || 0);
        const wrap = document.getElementById("layerList");
        wrap.innerHTML = "";
        const mainPrice = document.getElementById("f_priceEntry").value;
        const mainLot = document.getElementById("f_lot").value;
        for (let i = 1; i <= n; i++) {
            const row = document.createElement("div");
            row.innerHTML = `<div class="layer-row-label">Layer ${i}</div>
                <div class="layer-row">
                    <input type="number" step="any" placeholder="Price layer ${i}" class="layer-price" inputmode="decimal" value="${escapeAttr(mainPrice)}" data-auto="1">
                    <input type="number" step="any" placeholder="Lot layer ${i}" class="layer-lot" inputmode="decimal" value="${escapeAttr(mainLot)}" data-auto="1">
                </div>`;
            wrap.appendChild(row);
        }
    });

    // Layer yang belum pernah diedit manual ikut ter-update saat Price entry / Lot utama diubah.
    // Sekali user mengetik langsung di field layer tertentu, field itu berhenti mengikuti (auto=0).
    document.getElementById("layerList").addEventListener("input", (e) => {
        if (e.target.classList.contains("layer-price") || e.target.classList.contains("layer-lot")) {
            e.target.dataset.auto = "0";
        }
    });
    document.getElementById("f_priceEntry").addEventListener("input", (e) => {
        document.querySelectorAll(".layer-price").forEach((inp) => {
            if (inp.dataset.auto === "1") inp.value = e.target.value;
        });
    });
    document.getElementById("f_lot").addEventListener("input", (e) => {
        document.querySelectorAll(".layer-lot").forEach((inp) => {
            if (inp.dataset.auto === "1") inp.value = e.target.value;
        });
    });

    document.getElementById("entryForm").addEventListener("submit", onSubmitEntry, { once: true });
}

async function onSubmitEntry(e) {
    e.preventDefault();
    if (isSaving) return;
    const el = document.getElementById("view-entry");
    const getVal = (id) => document.getElementById(id).value;
    const getActive = (field) => el.querySelector(`.toggle-btn[data-field="${field}"].active`).dataset.val;

    const priceEntry = getVal("f_priceEntry");
    const lot = getVal("f_lot");
    if (!priceEntry || !lot) {
        toast("Isi minimal price entry dan lot.");
        return;
    }
    isSaving = true;
    const submitBtn = el.querySelector(".submit-btn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Menyimpan…";
    }

    const layers = [];
    el.querySelectorAll(".layer-row").forEach((row) => {
        const p = row.querySelector(".layer-price").value;
        const l = row.querySelector(".layer-lot").value;
        if (p || l) layers.push({ price: p || null, lot: l || null });
    });

    const trade = {
        id: `trade_${Date.now()}`,
        status: "open",
        timestamp: new Date().toISOString(),
        pair: getVal("f_pair"),
        strategy: getVal("f_strategy").trim(),
        entryTime: getVal("f_entryTime"),
        equityAwal: getVal("f_equityAwal") || null,
        direction: getActive("direction"),
        entryType: getActive("entryType"),
        priceEntry,
        sl: getVal("f_sl"),
        tp: getVal("f_tp"),
        reason: getVal("f_reason"),
        lot,
        layers,
        actual: null,
        priceActual: null,
        pl: null,
        totalEquity: null,
        closeTimestamp: null,
    };

    state.trades.push(trade);
    const ok = await saveData();
    isSaving = false;
    if (ok) {
        toast("Posisi tersimpan sebagai terbuka.");
        renderEntryForm();
        renderHeader();
        switchView("open");
    } else if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Simpan & buka posisi";
    }
}

// ---------- Posisi terbuka ----------
function renderOpenList() {
    const el = document.getElementById("view-open");
    const list = openTrades().slice().reverse();
    if (list.length === 0) {
        el.innerHTML = '<div class="card"><div class="empty"><div class="big">Tidak ada posisi terbuka</div><div class="small">Posisi yang belum dilengkapi hasilnya akan muncul di sini.</div></div></div>';
        return;
    }
    el.innerHTML = list
        .map((t) => {
            const date = new Date(t.timestamp);
            const dateStr = date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
            const layerHtml = t.layers && t.layers.length ? `<div class="layer-list">Layer: ${t.layers.length}</div>` : "";
            return `<div class="trade-card">
                <div class="trade-top">
                    <span class="trade-pair">${t.pair}<span class="badge ${t.direction.toLowerCase()}">${t.direction}</span><span class="badge open">Terbuka</span></span>
                </div>
                <div class="trade-meta">${dateStr}${t.entryTime ? ` · Jam ${t.entryTime}` : ""} · ${t.entryType} · ${t.strategy || "—"}</div>
                <div class="trade-detail num">
                    <div><span class="k">Entry: </span>${fmt(t.priceEntry)}</div>
                    <div><span class="k">Lot: </span>${fmt(t.lot)}</div>
                    <div><span class="k">SL: </span>${fmt(t.sl)}</div>
                    <div><span class="k">TP: </span>${fmt(t.tp)}</div>
                </div>
                ${layerHtml}
                ${t.reason ? `<div class="trade-reason">"${t.reason}"</div>` : ""}
                <div class="trade-actions">
                    <button class="del-btn" data-del="${t.id}">Hapus</button>
                    <button class="complete-btn" data-complete="${t.id}">Lengkapi hasil →</button>
                </div>
            </div>`;
        })
        .join("");

    el.querySelectorAll("[data-complete]").forEach((btn) => {
        btn.addEventListener("click", () => {
            closingTradeId = btn.dataset.complete;
            switchView("close");
        });
    });
    el.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!(await confirmModal("Hapus posisi terbuka ini?", { title: "Hapus posisi", danger: true, confirmText: "Ya, hapus" }))) return;
            state.trades = state.trades.filter((t) => t.id !== btn.dataset.del);
            const ok = await saveData();
            if (ok) {
                toast("Posisi dihapus.");
                renderHeader();
                renderOpenList();
                renderDashboard();
            }
        });
    });
}

// ---------- Step 2: lengkapi hasil ----------
function renderCloseForm() {
    const el = document.getElementById("view-close");
    const t = state.trades.find((tr) => tr.id === closingTradeId);
    if (!t) {
        el.innerHTML = '<div class="card"><div class="empty small">Posisi tidak ditemukan.</div></div>';
        return;
    }
    el.innerHTML = `<button class="back-link" id="backToOpen">← Kembali ke posisi terbuka</button>
    <div class="card">
        <h2>Ringkasan posisi</h2>
        <div class="trade-detail num">
            <div><span class="k">Pair: </span>${t.pair} (${t.direction})</div>
            <div><span class="k">Tipe: </span>${t.entryType}</div>
            <div><span class="k">Entry: </span>${fmt(t.priceEntry)}</div>
            <div><span class="k">Lot: </span>${fmt(t.lot)}</div>
            <div><span class="k">SL: </span>${fmt(t.sl)}</div>
            <div><span class="k">TP: </span>${fmt(t.tp)}</div>
        </div>
    </div>
    <form id="closeForm" class="card">
        <h2>Step 2 — Lengkapi hasil</h2>
        <div class="field"><label>Hasil aktual</label><select id="c_actual">
            <option value="TP">TP tercapai</option>
            <option value="SL">SL tercapai</option>
            <option value="BE">Breakeven (BE)</option>
            <option value="Manual">Ditutup manual</option>
            <option value="MC">MC (Margin Call)</option>
        </select></div>
        <div class="field"><label>Jam actual</label><input type="time" id="c_actualTime"></div>
        <div class="row2">
            <div class="field"><label>Price actual</label><input type="number" step="any" id="c_priceActual" inputmode="decimal"></div>
            <div class="field"><label>P/L</label><input type="number" step="any" id="c_pl" inputmode="decimal"></div>
        </div>
        <div class="field"><label>Total equity setelah posisi ini</label><input type="number" step="any" id="c_totalEquity" inputmode="decimal" value="${currentEquity() !== null ? currentEquity() : ""}" data-auto="1"><span class="field-hint">Otomatis: equity saat ini + P/L, bisa diedit</span></div>
        <button type="submit" class="submit-btn">Simpan hasil ke riwayat</button>
    </form>`;

    document.getElementById("backToOpen").addEventListener("click", () => switchView("open"));
    document.getElementById("closeForm").addEventListener("submit", onSubmitClose, { once: true });
    const now = new Date();
    document.getElementById("c_actualTime").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Total equity mengikuti equity saat ini + P/L, selama belum diedit manual oleh user.
    document.getElementById("c_totalEquity").addEventListener("input", (e) => {
        e.target.dataset.auto = "0";
    });
    document.getElementById("c_pl").addEventListener("input", (e) => {
        const totalEqInput = document.getElementById("c_totalEquity");
        if (totalEqInput.dataset.auto === "1") {
            const base = currentEquity();
            const pl = Number(e.target.value) || 0;
            totalEqInput.value = base !== null ? Math.round((base + pl) * 100) / 100 : "";
        }
    });
}

async function onSubmitClose(e) {
    e.preventDefault();
    if (isSaving) return;
    const t = state.trades.find((tr) => tr.id === closingTradeId);
    if (!t) return;
    const pl = document.getElementById("c_pl").value;
    const totalEquity = document.getElementById("c_totalEquity").value;
    if (pl === "" || totalEquity === "") {
        toast("Isi minimal P/L dan total equity.");
        return;
    }
    isSaving = true;
    const submitBtn = document.getElementById("view-close").querySelector(".submit-btn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Menyimpan…";
    }

    t.actual = document.getElementById("c_actual").value;
    t.actualTime = document.getElementById("c_actualTime").value;
    t.priceActual = document.getElementById("c_priceActual").value;
    t.pl = pl;
    t.totalEquity = totalEquity;
    t.closeTimestamp = new Date().toISOString();
    t.status = "closed";

    const ok = await saveData();
    isSaving = false;
    if (ok) {
        toast("Posisi selesai, masuk ke riwayat.");
        closingTradeId = null;
        renderHeader();
        renderDashboard();
        switchView("history");
    } else if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Simpan hasil ke riwayat";
    }
}

// ---------- Riwayat ----------
function renderHistory() {
    const el = document.getElementById("view-history");
    const closed = closedTrades();
    const pairsUsed = ["Semua", ...new Set(closed.map((t) => t.pair))];
    const dirs = ["Semua", "Buy", "Sell"];
    const stratsUsed = ["Semua", ...new Set(closed.map((t) => t.strategy).filter(Boolean))];

    let list = closed.slice().reverse();
    if (historyFilter.pair !== "Semua") list = list.filter((t) => t.pair === historyFilter.pair);
    if (historyFilter.dir !== "Semua") list = list.filter((t) => t.direction === historyFilter.dir);
    if (historyFilter.strategy !== "Semua") list = list.filter((t) => t.strategy === historyFilter.strategy);

    const filterHtml = `<div class="filters">${pairsUsed.map((p) => `<button class="chip${historyFilter.pair === p ? " active" : ""}" data-type="pair" data-val="${p}">${p}</button>`).join("")}</div>
    <div class="filters">${dirs.map((d) => `<button class="chip${historyFilter.dir === d ? " active" : ""}" data-type="dir" data-val="${d}">${d}</button>`).join("")}</div>
    <div class="filters">${stratsUsed.map((s) => `<button class="chip${historyFilter.strategy === s ? " active" : ""}" data-type="strategy" data-val="${s}">${s}</button>`).join("")}</div>`;

    if (closed.length === 0) {
        el.innerHTML = '<div class="card"><div class="empty"><div class="big">Belum ada riwayat</div><div class="small">Posisi yang sudah dilengkapi hasilnya (step 2) akan muncul di sini.</div></div></div>';
        return;
    }

    if (list.length === 0) {
        el.innerHTML = `${filterHtml}<div class="card"><div class="empty small">Tidak ada entry yang cocok dengan filter ini.</div></div>`;
    } else {
        el.innerHTML = `${filterHtml}${list
            .map((t) => {
                    const pl = Number(t.pl) || 0;
                    const date = new Date(t.closeTimestamp || t.timestamp);
                    const dateStr = date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                    const layerHtml = t.layers && t.layers.length ? `<div class="layer-list">Layer: ${t.layers.length}</div>` : "";
                    const mcBadge = t.actual === "MC" ? '<span class="badge mc">MC</span>' : "";
                    return `<div class="trade-card" data-id="${t.id}">
                        <div class="trade-top">
                            <span class="trade-pair">${t.pair}<span class="badge ${t.direction.toLowerCase()}">${t.direction}</span>${mcBadge}</span>
                            <span class="trade-pl num" style="color:${pl >= 0 ? "var(--profit)" : "var(--loss)"}">${pl >= 0 ? "+" : ""}${fmtMoney(pl)}</span>
                        </div>
                        <div class="trade-meta">${dateStr}${t.actualTime ? ` · Jam ${t.actualTime}` : ""} · ${t.entryType} · ${t.actual} · ${t.strategy || "—"}</div>
                        <div class="trade-detail num">
                            <div><span class="k">Entry: </span>${fmt(t.priceEntry)}</div>
                            <div><span class="k">Aktual: </span>${fmt(t.priceActual)}</div>
                            <div><span class="k">SL: </span>${fmt(t.sl)}</div>
                            <div><span class="k">TP: </span>${fmt(t.tp)}</div>
                            <div><span class="k">Lot: </span>${fmt(t.lot)}</div>
                            <div><span class="k">Equity: </span>${fmtMoney(t.totalEquity)}</div>
                        </div>
                        ${layerHtml}
                        ${t.reason ? `<div class="trade-reason">"${t.reason}"</div>` : ""}
                        <div class="trade-actions"><span></span><button class="del-btn" data-del="${t.id}">Hapus entry</button></div>
                    </div>`;
                })
                .join("")}`;
    }

    el.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            const type = chip.dataset.type,
                val = chip.dataset.val;
            if (type === "pair") historyFilter.pair = val;
            else if (type === "dir") historyFilter.dir = val;
            else historyFilter.strategy = val;
            renderHistory();
        });
    });
    el.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!(await confirmModal("Hapus entry ini dari riwayat?", { title: "Hapus entry", danger: true, confirmText: "Ya, hapus" }))) return;
            state.trades = state.trades.filter((t) => t.id !== btn.dataset.del);
            const ok = await saveData();
            if (ok) {
                toast("Entry dihapus.");
                renderHeader();
                renderDashboard();
                renderHistory();
            }
        });
    });
}

// ---------- Pengaturan ----------
function renderSettings() {
    const el = document.getElementById("view-settings");
    el.innerHTML = `<div class="card">
        <h2>Akun</h2>
        <div class="settings-username">Masuk sebagai <strong>${escapeAttr(currentUser?.username || "")}</strong></div>
        <button class="ghost-btn" id="logoutBtn" style="color: var(--loss); border-color: var(--loss)">Keluar</button>
    </div>
    <div class="card">
        <h2>Data & Backup</h2>
        <button class="ghost-btn" id="exportBtn">Export backup</button>
        <button class="ghost-btn" id="importBtn">Import backup</button>
        <input type="file" id="importFile" accept="application/json" style="display: none" />
        <button class="ghost-btn" id="resetDataBtn" style="color: var(--loss); border-color: var(--loss)">Hapus semua data</button>
    </div>`;

    document.getElementById("logoutBtn").addEventListener("click", async () => {
        if (!(await confirmModal("Yakin ingin keluar dari akun ini?", { title: "Keluar", confirmText: "Ya, keluar" }))) return;
        await apiLogout();
        currentUser = null;
        state = { trades: [], withdrawals: [], currency: "IDR", plan: null };
        showAuthScreen("login");
    });

    document.getElementById("exportBtn").addEventListener("click", () => {
        if (state.trades.length === 0 && !state.plan) {
            toast("Belum ada data untuk di-export.");
            return;
        }
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `jurnal-trading-backup-${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Backup diunduh.");
    });

    document.getElementById("importBtn").addEventListener("click", () => {
        document.getElementById("importFile").click();
    });

    document.getElementById("importFile").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed || !Array.isArray(parsed.trades)) throw new Error("format tidak sesuai");
                if (!Array.isArray(parsed.withdrawals)) parsed.withdrawals = [];
                if (!parsed.currency) parsed.currency = state.currency || "IDR";
                parsed.plan = PlanCalc.normalizePlan(parsed.plan);
                const mode = await chooseModal("Pulihkan dari file backup", "Pilih cara memulihkan data dari file backup ini:", [
                    { id: "overwrite", label: "Timpa semua data yang ada", variant: "primary" },
                    { id: "merge", label: "Gabungkan dengan data yang ada", variant: "" },
                    { id: "cancel", label: "Batal", variant: "ghost" },
                ]);
                if (mode === "cancel" || mode === null) {
                    e.target.value = "";
                    return;
                }
                if (mode === "overwrite") {
                    state = parsed;
                } else {
                    const existingIds = new Set(state.trades.map((t) => t.id));
                    const merged = parsed.trades.filter((t) => !existingIds.has(t.id));
                    state.trades = state.trades.concat(merged);
                    const existingWdIds = new Set((state.withdrawals || []).map((w) => w.id));
                    const mergedWd = parsed.withdrawals.filter((w) => !existingWdIds.has(w.id));
                    state.withdrawals = (state.withdrawals || []).concat(mergedWd);
                    if (!state.plan && parsed.plan) state.plan = parsed.plan;
                }
                const ok = await saveData();
                if (ok) {
                    toast("Backup berhasil dipulihkan.");
                    renderHeader();
                    switchView("dashboard");
                }
            } catch (err) {
                toast("File backup tidak valid.");
            }
            e.target.value = "";
        };
        reader.readAsText(file);
    });

    document.getElementById("resetDataBtn").addEventListener("click", async () => {
        if (!(await confirmModal("Hapus SEMUA data jurnal (posisi terbuka, riwayat & trading plan)? Tindakan ini tidak bisa dibatalkan.", { title: "Hapus semua data", danger: true, confirmText: "Ya, hapus semua" }))) return;
        state = { trades: [], withdrawals: [], currency: state.currency, plan: null };
        const ok = await saveData();
        if (ok) {
            toast("Semua data dihapus.");
            renderHeader();
            switchView("dashboard");
        }
    });
}

// ---------- Nav ----------
function switchView(view) {
    currentView = view;
    document.querySelectorAll("section.view").forEach((s) => s.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    document.querySelectorAll("nav.bottom button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "dashboard") renderDashboard();
    if (view === "entry") renderEntryForm();
    if (view === "open") renderOpenList();
    if (view === "close") renderCloseForm();
    if (view === "history") renderHistory();
    if (view === "settings") renderSettings();
}

document.querySelectorAll("nav.bottom button").forEach((b) => {
    b.addEventListener("click", () => switchView(b.dataset.view));
});

document.getElementById("currencySelect").addEventListener("change", async (e) => {
    state.currency = e.target.value;
    await saveData();
    renderHeader();
    switchView(currentView);
});

async function startApp() {
    showApp();
    document.getElementById("view-dashboard").innerHTML = `<div class="stat-grid">
        <div class="stat-card skeleton"><div class="skel-line skel-w60"></div><div class="skel-line skel-w40 skel-lg"></div></div>
        <div class="stat-card skeleton"><div class="skel-line skel-w60"></div><div class="skel-line skel-w40 skel-lg"></div></div>
        <div class="stat-card skeleton"><div class="skel-line skel-w60"></div><div class="skel-line skel-w40 skel-lg"></div></div>
        <div class="stat-card skeleton"><div class="skel-line skel-w60"></div><div class="skel-line skel-w40 skel-lg"></div></div>
    </div>
    <div class="card skeleton"><div class="skel-line skel-w40"></div><div class="skel-block"></div></div>`;
    await loadData();
    renderHeader();
    renderDashboard();
}

async function init() {
    const me = await apiMe();
    if (me.authenticated) {
        currentUser = me.user;
        await startApp();
    } else {
        showAuthScreen("login");
    }
}
init();
/*
 * plan-calc.js — logika Trading Plan (fungsi murni, tanpa DOM).
 *
 * Dipakai oleh app.js lewat window.PlanCalc. Semua perhitungan waktu memakai WIB (UTC+7),
 * minggu dihitung Senin–Minggu. Fungsi di sini tidak membaca/menulis state global,
 * semua data masuk lewat argumen supaya mudah diuji (lihat tests/plan-calc.test.js).
 *
 * Bentuk data plan (state.plan):
 *   { name, cur: "IDR"|"USD"|"USC", start, target, startDate, endDate,
 *     daily, weekly, monthly, trades, rate, disp }
 * Semua nominal (start, target, daily, weekly, monthly) memakai mata uang `cur`.
 * `disp` hanya pilihan tampilan (toggle IDR/USD/USC), tidak mengubah angka tersimpan.
 */
(function (root) {
    "use strict";

    const CURRENCIES = ["IDR", "USD", "USC"];
    const DEFAULT_RATE = 16000; // 1 USD = 16.000 IDR (bisa diubah user di form)
    const MAX_TRADES_PER_DAY = 100;
    const MAX_TRADE_BOXES = 20; // kotak "Trade 1..N" yang digambar; sisanya jadi label "+N lagi"
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, tanpa DST
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const AVG_MONTH_DAYS = 30.4375;

    function finiteOr(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    // ---------- Parsing angka dari input form ----------
    // Aturan (mengikuti format Indonesia):
    //  - Kalau ada titik DAN koma: pemisah yang muncul paling akhir = desimal, yang lain = ribuan.
    //  - Hanya koma: koma = desimal ("1,5" = 1.5). Koma berulang = ribuan ("1,000,000").
    //  - Hanya titik: titik berulang = ribuan ("1.500.000").
    //    Titik tunggal: untuk IDR dengan pola 3 digit di belakang ("1.500") dianggap ribuan,
    //    selain itu dianggap desimal ("0.75", atau "1.500" pada USD/USC = 1,5).
    // Input yang tidak bisa dibaca menghasilkan 0.
    function parseAmount(input, cur) {
        let s = String(input === null || input === undefined ? "" : input).trim().replace(/\s/g, "");
        if (!s) return 0;
        const dots = (s.match(/\./g) || []).length;
        const commas = (s.match(/,/g) || []).length;
        if (dots && commas) {
            if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
            else s = s.replace(/,/g, "");
        } else if (commas) {
            s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
        } else if (dots) {
            if (dots > 1) s = s.replace(/\./g, "");
            else if (cur === "IDR" && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(".", "");
        }
        if (!/^-?\d*\.?\d*$/.test(s)) return 0;
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    // ---------- Konversi mata uang ----------
    // 100 USC = 1 USD. IDR memakai kurs manual: 1 USD = rate IDR.
    function convert(value, from, to, rate) {
        if (from === to) return value;
        const r = rate > 0 ? rate : DEFAULT_RATE;
        const usd = from === "USD" ? value : from === "USC" ? value / 100 : value / r;
        return to === "USD" ? usd : to === "USC" ? usd * 100 : usd * r;
    }

    // ---------- Tanggal & periode (WIB) ----------
    function pad2(n) {
        return String(n).padStart(2, "0");
    }
    function wibDateKey(ms) {
        const d = new Date(ms + WIB_OFFSET_MS);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    function isDateStr(s) {
        if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split("-").map(Number);
        const t = new Date(Date.UTC(y, m - 1, d));
        return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    }
    // Awal hari (00:00 WIB) dari string "YYYY-MM-DD", dalam milidetik UTC.
    function wibMidnightMs(dateStr) {
        const [y, m, d] = dateStr.split("-").map(Number);
        return Date.UTC(y, m - 1, d) - WIB_OFFSET_MS;
    }
    // Awal hari ini, awal minggu ini (Senin), dan awal bulan ini — semua 00:00 WIB.
    function periodStarts(nowMs) {
        const w = new Date(nowMs + WIB_OFFSET_MS);
        const y = w.getUTCFullYear();
        const m = w.getUTCMonth();
        const d = w.getUTCDate();
        const dow = (w.getUTCDay() + 6) % 7; // Senin = 0
        return {
            day: Date.UTC(y, m, d) - WIB_OFFSET_MS,
            week: Date.UTC(y, m, d - dow) - WIB_OFFSET_MS,
            month: Date.UTC(y, m, 1) - WIB_OFFSET_MS,
        };
    }

    // ---------- Validasi & normalisasi plan ----------
    // Dipakai di dua tempat: form (untuk pesan error) dan saat memuat/mengimpor data
    // (untuk membersihkan data yang rusak). Balikannya { plan, error }.
    // Catatan: tanggal target yang tidak valid atau sebelum tanggal mulai dikosongkan diam-diam;
    // form sebaiknya mengecek sendiri kalau ingin menampilkan pesan.
    function validatePlan(raw, nowMs) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { plan: null, error: "Data plan tidak valid." };
        if (!CURRENCIES.includes(raw.cur)) return { plan: null, error: "Mata uang plan tidak valid." };
        const start = finiteOr(raw.start, 0);
        const target = finiteOr(raw.target, 0);
        if (!(start > 0)) return { plan: null, error: "Equity awal harus lebih dari 0." };
        if (!(target > start)) return { plan: null, error: "Target equity harus lebih besar dari equity awal." };

        const startDate = isDateStr(raw.startDate) ? raw.startDate : wibDateKey(now);
        let endDate = isDateStr(raw.endDate) ? raw.endDate : "";
        if (endDate && endDate <= startDate) endDate = "";

        const rate = finiteOr(raw.rate, 0);
        const plan = {
            name: String(raw.name === null || raw.name === undefined ? "" : raw.name).trim().slice(0, 60),
            cur: raw.cur,
            start,
            target,
            startDate,
            endDate,
            daily: Math.max(0, finiteOr(raw.daily, 0)),
            weekly: Math.max(0, finiteOr(raw.weekly, 0)),
            monthly: Math.max(0, finiteOr(raw.monthly, 0)),
            trades: clamp(Math.floor(finiteOr(raw.trades, 1)), 1, MAX_TRADES_PER_DAY),
            rate: rate > 0 ? rate : DEFAULT_RATE,
            disp: CURRENCIES.includes(raw.disp) ? raw.disp : raw.cur,
        };
        return { plan, error: null };
    }
    function normalizePlan(raw, nowMs) {
        return validatePlan(raw, nowMs).plan;
    }

    // Kenaikan per bulan (%) yang dibutuhkan untuk sampai target di tanggal target (bunga majemuk).
    function requiredMonthlyGrowthPct(start, target, startDate, endDate) {
        if (!(start > 0 && target > start && startDate && endDate)) return null;
        const days = (wibMidnightMs(endDate) - wibMidnightMs(startDate)) / MS_PER_DAY;
        if (!(days > 0)) return null;
        const months = days / AVG_MONTH_DAYS;
        return (Math.pow(target / start, 1 / months) - 1) * 100;
    }

    // ---------- Perhitungan utama ----------
    // plan    : objek plan yang sudah dinormalisasi.
    // journal : { trades, withdrawals, currency, equity }
    //           `currency` = mata uang jurnal (state.currency), `equity` = equity jurnal saat ini
    //           (hasil currentEquity() di app.js, boleh null kalau belum ada trade).
    // nowMs   : waktu sekarang (untuk pengujian); default Date.now().
    // Semua nilai keluaran memakai mata uang plan (plan.cur). Konversi ke tampilan pakai convert().
    function compute(plan, journal, nowMs) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const j = journal || {};
        const jCur = CURRENCIES.includes(j.currency) ? j.currency : plan.cur;
        const toPlan = (v) => convert(v, jCur, plan.cur, plan.rate);

        const startMs = wibMidnightMs(plan.startDate);
        const starts = periodStarts(now);
        const sums = { day: { pl: 0, count: 0 }, week: { pl: 0, count: 0 }, month: { pl: 0, count: 0 } };

        // Hanya trade selesai yang ditutup pada/setelah tanggal mulai plan. Trade terbuka diabaikan.
        (j.trades || []).forEach((t) => {
            if (!t || t.status !== "closed") return;
            const ts = Date.parse(t.closeTimestamp || t.timestamp);
            if (!Number.isFinite(ts) || ts < startMs) return;
            const pl = finiteOr(t.pl, 0);
            ["day", "week", "month"].forEach((k) => {
                if (ts >= starts[k]) {
                    sums[k].pl += pl;
                    sums[k].count++;
                }
            });
        });

        // WD tidak masuk hitungan P/L periode. Dicatat terpisah supaya UI bisa menampilkannya.
        let withdrawnRaw = 0;
        (j.withdrawals || []).forEach((w) => {
            const ts = Date.parse(w && w.timestamp);
            if (Number.isFinite(ts) && ts >= startMs) withdrawnRaw += finiteOr(w.amount, 0);
        });

        // Equity: dari jurnal. Kalau jurnal belum punya trade, anggap sama dengan equity awal plan.
        const equityKnown = Number.isFinite(j.equity);
        const equity = equityKnown ? toPlan(j.equity) : plan.start;

        // Progres menuju target. `pct` apa adanya (bisa negatif saat rugi), `barPct` untuk lebar bar.
        const span = plan.target - plan.start;
        const gain = equity - plan.start;
        const pct = (gain / span) * 100;

        const period = (sum, target) => {
            const value = toPlan(sum.pl);
            const hasTarget = target > 0;
            const p = hasTarget ? (value / target) * 100 : null;
            return { value, count: sum.count, target, pct: p, barPct: hasTarget ? clamp(p, 0, 100) : 0 };
        };
        const day = period(sums.day, plan.daily);

        const total = plan.trades;
        const done = sums.day.count;
        const shown = Math.min(total, MAX_TRADE_BOXES);

        return {
            cur: plan.cur,
            equity,
            equityKnown,
            withdrawn: toPlan(withdrawnRaw),
            progress: {
                gain,
                remaining: Math.max(plan.target - equity, 0),
                pct,
                barPct: clamp(pct, 0, 100),
            },
            periods: {
                day,
                week: period(sums.week, plan.weekly),
                month: period(sums.month, plan.monthly),
            },
            trades: {
                total,
                done,
                remaining: Math.max(total - done, 0),
                over: Math.max(done - total, 0),
                shown,
                extra: total - shown,
                boxes: Array.from({ length: shown }, (_, i) => i < done),
                perTradeTarget: plan.daily > 0 ? plan.daily / total : null,
                dailyRemaining: plan.daily > 0 ? Math.max(plan.daily - day.value, 0) : null,
            },
            stats: {
                multiple: plan.target / plan.start,
                monthlyGrowthPct: requiredMonthlyGrowthPct(plan.start, plan.target, plan.startDate, plan.endDate),
            },
        };
    }

    root.PlanCalc = {
        CURRENCIES,
        DEFAULT_RATE,
        MAX_TRADES_PER_DAY,
        MAX_TRADE_BOXES,
        parseAmount,
        convert,
        wibDateKey,
        periodStarts,
        validatePlan,
        normalizePlan,
        compute,
    };
})(typeof globalThis !== "undefined" ? globalThis : this);

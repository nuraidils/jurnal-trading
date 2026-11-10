// Jalankan: node --test tests/plan-calc.test.js
import test from "node:test";
import assert from "node:assert/strict";
import "../plan-calc.js";

const PC = globalThis.PlanCalc;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Acuan waktu: Selasa 10 Nov 2026, 09:30 WIB (= 02:30 UTC). Senin minggu ini = 9 Nov.
const NOW = Date.parse("2026-11-10T02:30:00Z");

const basePlan = () => ({
    name: "Plan uji",
    cur: "USC",
    start: 1000,
    target: 10000,
    startDate: "2026-01-01",
    endDate: "",
    daily: 50,
    weekly: 200,
    monthly: 800,
    trades: 3,
    rate: 16000,
    disp: "USC",
});
const closed = (pl, iso) => ({ status: "closed", pl: String(pl), closeTimestamp: iso, timestamp: iso });
const journal = (trades, extra = {}) => ({ trades, withdrawals: [], currency: "USC", equity: 1000, ...extra });

test("parseAmount: format Indonesia", () => {
    const cases = [
        ["1.500.000", "IDR", 1500000],
        ["1.500", "IDR", 1500],
        ["1.500", "USD", 1.5],
        ["1,5", "USD", 1.5],
        ["1.234,56", "IDR", 1234.56],
        ["1,234.56", "USD", 1234.56],
        ["1,000,000", "USD", 1000000],
        ["0.75", "USC", 0.75],
        ["  2 500 ", "IDR", 2500],
        ["", "IDR", 0],
        ["abc", "IDR", 0],
        ["12abc", "USD", 0],
        ["0x10", "USD", 0],
        [",", "USD", 0],
        [null, "USD", 0],
        [250, "USD", 250],
    ];
    for (const [input, cur, expected] of cases) near(PC.parseAmount(input, cur), expected);
});

test("convert: 100 USC = 1 USD, IDR pakai kurs manual", () => {
    near(PC.convert(100, "USC", "USD", 16000), 1);
    near(PC.convert(1, "USD", "USC", 16000), 100);
    near(PC.convert(1, "USD", "IDR", 16000), 16000);
    near(PC.convert(100, "USC", "IDR", 16000), 16000);
    near(PC.convert(16000, "IDR", "USC", 16000), 100);
    near(PC.convert(32000, "IDR", "USD", 16000), 2);
    near(PC.convert(5, "USD", "USD", 16000), 5);
    near(PC.convert(1, "USD", "IDR", 0), PC.DEFAULT_RATE); // kurs tidak valid -> default
});

test("validatePlan: error dan nilai default", () => {
    assert.equal(PC.validatePlan(null).plan, null);
    assert.equal(PC.validatePlan([]).plan, null);
    assert.equal(PC.validatePlan({ ...basePlan(), cur: "EUR" }).plan, null);
    assert.match(PC.validatePlan({ ...basePlan(), start: 0 }).error, /Equity awal/);
    assert.match(PC.validatePlan({ ...basePlan(), start: "abc" }).error, /Equity awal/);
    assert.match(PC.validatePlan({ ...basePlan(), target: 1000 }).error, /Target equity/);
    assert.match(PC.validatePlan({ ...basePlan(), target: 500 }).error, /Target equity/);

    const p = PC.validatePlan({ cur: "IDR", start: "1000000", target: 5000000 }, NOW).plan;
    assert.equal(p.start, 1000000);
    assert.equal(p.disp, "IDR");
    assert.equal(p.rate, 16000);
    assert.equal(p.trades, 1);
    assert.equal(p.startDate, "2026-11-10");
    assert.equal(p.endDate, "");
    assert.equal(p.daily, 0);
    assert.equal(p.name, "");
});

test("validatePlan: pembersihan data", () => {
    const p = PC.validatePlan({ ...basePlan(), name: "  " + "x".repeat(100), trades: 999, daily: -5, disp: "XXX", rate: -1 }, NOW).plan;
    assert.equal(p.name.length, 60);
    assert.equal(p.trades, 100);
    assert.equal(p.daily, 0);
    assert.equal(p.disp, "USC");
    assert.equal(p.rate, 16000);
    assert.equal(PC.validatePlan({ ...basePlan(), trades: 0 }).plan.trades, 1);
    assert.equal(PC.validatePlan({ ...basePlan(), trades: 2.9 }).plan.trades, 2);
    assert.equal(PC.validatePlan({ ...basePlan(), startDate: "2026-02-30" }, NOW).plan.startDate, "2026-11-10");
    assert.equal(PC.validatePlan({ ...basePlan(), endDate: "2025-12-31" }).plan.endDate, ""); // sebelum tanggal mulai
    assert.equal(PC.validatePlan({ ...basePlan(), endDate: "2026-01-01" }).plan.endDate, ""); // sama dengan tanggal mulai
    assert.equal(PC.validatePlan({ ...basePlan(), endDate: "2026-06-30" }).plan.endDate, "2026-06-30");
    assert.equal("hack" in PC.validatePlan({ ...basePlan(), hack: 1 }).plan, false); // field asing dibuang
});

test("tanggal mulai default memakai hari WIB, bukan UTC", () => {
    // 9 Nov 18:00 UTC = 10 Nov 01:00 WIB
    assert.equal(PC.validatePlan({ cur: "USD", start: 1, target: 2 }, Date.parse("2026-11-09T18:00:00Z")).plan.startDate, "2026-11-10");
    assert.equal(PC.validatePlan({ cur: "USD", start: 1, target: 2 }, Date.parse("2026-11-09T16:59:00Z")).plan.startDate, "2026-11-09");
});

test("periode hari/minggu/bulan memakai batas WIB, minggu mulai Senin", () => {
    const trades = [
        closed(10, "2026-11-08T16:59:00Z"), // Minggu 23:59 WIB  -> minggu lalu, bulan ini
        closed(20, "2026-11-08T17:00:00Z"), // Senin 00:00 WIB   -> minggu ini
        closed(30, "2026-11-09T16:59:00Z"), // Senin 23:59 WIB   -> minggu ini
        closed(40, "2026-11-09T17:00:00Z"), // Selasa 00:00 WIB  -> hari ini
        closed(5, "2026-10-31T16:59:00Z"), // 31 Okt 23:59 WIB  -> bukan bulan ini
        closed(7, "2026-10-31T17:00:00Z"), // 1 Nov 00:00 WIB   -> bulan ini
        { status: "open", pl: null, timestamp: "2026-11-10T01:00:00Z" }, // posisi terbuka diabaikan
    ];
    const r = PC.compute(basePlan(), journal(trades), NOW);
    near(r.periods.day.value, 40);
    assert.equal(r.periods.day.count, 1);
    near(r.periods.week.value, 90);
    assert.equal(r.periods.week.count, 3);
    near(r.periods.month.value, 107);
    assert.equal(r.periods.month.count, 5);
    near(r.periods.day.pct, 80);
    near(r.periods.week.pct, 45);
    near(r.periods.month.pct, 13.375);
});

test("trade sebelum tanggal mulai plan diabaikan", () => {
    const trades = [closed(10, "2026-11-08T16:59:00Z"), closed(20, "2026-11-08T17:00:00Z"), closed(40, "2026-11-09T17:00:00Z")];
    const r = PC.compute({ ...basePlan(), startDate: "2026-11-10" }, journal(trades), NOW);
    near(r.periods.day.value, 40);
    near(r.periods.week.value, 40);
    near(r.periods.month.value, 40);
    // Tepat di batas: tanggal mulai 9 Nov 00:00 WIB (= 8 Nov 17:00 UTC) ikut dihitung
    const r2 = PC.compute({ ...basePlan(), startDate: "2026-11-09" }, journal(trades), NOW);
    near(r2.periods.week.value, 60);
});

test("tanpa closeTimestamp memakai timestamp; data rusak tidak membuat error", () => {
    const trades = [{ status: "closed", pl: "15", timestamp: "2026-11-10T01:00:00Z" }, null, { status: "closed", pl: "", closeTimestamp: "2026-11-10T01:00:00Z" }, { status: "closed", pl: "abc", closeTimestamp: "2026-11-10T01:00:00Z" }, { status: "closed", pl: "99", closeTimestamp: "bukan-tanggal" }];
    const r = PC.compute(basePlan(), journal(trades), NOW);
    near(r.periods.day.value, 15);
    assert.equal(r.periods.day.count, 3);
});

test("WD tidak mengurangi P/L periode, dicatat terpisah (hanya setelah tanggal mulai)", () => {
    const j = journal([closed(25, "2026-11-10T01:00:00Z")], {
        withdrawals: [
            { timestamp: "2026-11-09T10:00:00Z", amount: "30" },
            { timestamp: "2025-12-31T10:00:00Z", amount: "999" },
        ],
    });
    const r = PC.compute(basePlan(), j, NOW);
    near(r.periods.day.value, 25);
    near(r.withdrawn, 30);
});

test("konversi: jurnal IDR, plan USD", () => {
    const plan = { ...basePlan(), cur: "USD", start: 500, target: 1500, daily: 20, weekly: 0, monthly: 0, disp: "USD" };
    const j = journal([closed(160000, "2026-11-10T01:00:00Z")], { currency: "IDR", equity: 16000000 });
    const r = PC.compute(plan, j, NOW);
    near(r.equity, 1000);
    near(r.progress.gain, 500);
    near(r.progress.pct, 50);
    near(r.periods.day.value, 10);
    near(r.periods.day.pct, 50);
    assert.equal(r.periods.week.pct, null); // tanpa target mingguan
    assert.equal(r.periods.week.barPct, 0);
});

test("progres negatif apa adanya, bar dibatasi 0-100", () => {
    const plan = { ...basePlan(), start: 1000, target: 2000 };
    let r = PC.compute(plan, journal([], { equity: 900 }), NOW);
    near(r.progress.gain, -100);
    near(r.progress.pct, -10);
    assert.equal(r.progress.barPct, 0);
    near(r.progress.remaining, 1100);
    r = PC.compute(plan, journal([], { equity: 2500 }), NOW);
    near(r.progress.pct, 150);
    assert.equal(r.progress.barPct, 100);
    assert.equal(r.progress.remaining, 0);
    // periode rugi
    r = PC.compute(plan, journal([closed(-80, "2026-11-10T01:00:00Z")]), NOW);
    near(r.periods.day.pct, -160);
    assert.equal(r.periods.day.barPct, 0);
});

test("jurnal belum punya equity -> dianggap sama dengan equity awal plan", () => {
    const r = PC.compute(basePlan(), journal([], { equity: null }), NOW);
    assert.equal(r.equityKnown, false);
    assert.equal(r.equity, 1000);
    assert.equal(r.progress.pct, 0);
    const r2 = PC.compute(basePlan(), journal([], { equity: undefined }), NOW);
    assert.equal(r2.equityKnown, false);
});

test("kotak Trade 1..N: batas 20, sisa, dan kelebihan", () => {
    const today = [closed(1, "2026-11-10T00:10:00Z"), closed(1, "2026-11-10T00:20:00Z"), closed(1, "2026-11-10T00:30:00Z")];
    let r = PC.compute({ ...basePlan(), trades: 25 }, journal(today), NOW);
    assert.equal(r.trades.total, 25);
    assert.equal(r.trades.shown, 20);
    assert.equal(r.trades.extra, 5);
    assert.equal(r.trades.done, 3);
    assert.equal(r.trades.remaining, 22);
    assert.deepEqual(r.trades.boxes.slice(0, 4), [true, true, true, false]);
    assert.equal(r.trades.boxes.length, 20);

    r = PC.compute({ ...basePlan(), trades: 2 }, journal(today), NOW);
    assert.equal(r.trades.over, 1);
    assert.equal(r.trades.remaining, 0);
    assert.deepEqual(r.trades.boxes, [true, true]);

    r = PC.compute({ ...basePlan(), trades: 3, daily: 50 }, journal(today), NOW);
    near(r.trades.perTradeTarget, 50 / 3);
    near(r.trades.dailyRemaining, 47);
    r = PC.compute({ ...basePlan(), daily: 0 }, journal(today), NOW);
    assert.equal(r.trades.perTradeTarget, null);
    assert.equal(r.trades.dailyRemaining, null);
});

test("statistik: kelipatan target dan kenaikan per bulan", () => {
    let r = PC.compute({ ...basePlan(), start: 100, target: 200, startDate: "2026-01-01", endDate: "2026-01-31" }, journal([]), NOW);
    near(r.stats.multiple, 2);
    assert.ok(r.stats.monthlyGrowthPct > 101 && r.stats.monthlyGrowthPct < 103, String(r.stats.monthlyGrowthPct));
    r = PC.compute(basePlan(), journal([]), NOW); // tanpa tanggal target
    assert.equal(r.stats.monthlyGrowthPct, null);
    near(r.stats.multiple, 10);
});

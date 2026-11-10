import { getPool } from "../lib/db.js";
import { getUserFromRequest } from "../lib/auth.js";

export default async function handler(req, res) {
    const user = getUserFromRequest(req);
    if (!user) {
        res.status(401).json({ error: "Belum login." });
        return;
    }

    const db = getPool();

    // ---------- GET: ambil data jurnal milik user yang login ----------
    if (req.method === "GET") {
        try {
            const [rows] = await db.query("SELECT data FROM journal_state WHERE user_id = ?", [user.id]);
            if (rows.length && rows[0].data) {
                const data = rows[0].data;
                res.status(200).json(typeof data === "string" ? JSON.parse(data) : data);
            } else {
                res.status(200).json({ trades: [], withdrawals: [], currency: "IDR" });
            }
        } catch (e) {
            res.status(500).json({ error: "Gagal mengambil data dari database.", detail: e.message });
        }
        return;
    }

    // ---------- POST: simpan data jurnal milik user yang login ----------
    if (req.method === "POST") {
        try {
            let body = req.body;
            if (typeof body === "string") body = JSON.parse(body);
            if (!body || typeof body !== "object") throw new Error("Body request bukan JSON object.");

            if (!Array.isArray(body.trades)) body.trades = [];
            if (!Array.isArray(body.withdrawals)) body.withdrawals = [];
            if (!body.currency) body.currency = "IDR";
            // Trading Plan: harus object biasa (atau kosong) dan ukurannya wajar.
            if (body.plan !== undefined && body.plan !== null) {
                if (typeof body.plan !== "object" || Array.isArray(body.plan) || JSON.stringify(body.plan).length > 5000) body.plan = null;
            }

            const json = JSON.stringify(body);
            await db.query("INSERT INTO journal_state (user_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?, updated_at = CURRENT_TIMESTAMP", [user.id, json, json]);

            res.status(200).json({ ok: true });
        } catch (e) {
            res.status(400).json({ error: "Gagal menyimpan data.", detail: e.message });
        }
        return;
    }

    res.status(405).json({ error: "Method tidak diizinkan." });
}

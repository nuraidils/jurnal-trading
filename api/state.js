import mysql from "mysql2/promise";

// Pool dibuat sekali dan dipakai ulang selama instance function masih "hangat",
// supaya tidak buka koneksi baru terus-menerus di tiap request.
let pool;
function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            port: Number(process.env.MYSQL_PORT || 3306),
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            ssl: { rejectUnauthorized: false }, // Aiven mewajibkan koneksi SSL
            waitForConnections: true,
            connectionLimit: 3,
        });
    }
    return pool;
}

export default async function handler(req, res) {
    const db = getPool();

    // ---------- GET: ambil data jurnal ----------
    if (req.method === "GET") {
        try {
            const [rows] = await db.query("SELECT data FROM journal_state WHERE id = 1");
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

    // ---------- POST: simpan data jurnal ----------
    if (req.method === "POST") {
        try {
            let body = req.body;
            if (typeof body === "string") body = JSON.parse(body);
            if (!body || typeof body !== "object") throw new Error("Body request bukan JSON object.");

            if (!Array.isArray(body.trades)) body.trades = [];
            if (!Array.isArray(body.withdrawals)) body.withdrawals = [];
            if (!body.currency) body.currency = "IDR";

            const json = JSON.stringify(body);
            await db.query("INSERT INTO journal_state (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = ?, updated_at = CURRENT_TIMESTAMP", [json, json]);

            res.status(200).json({ ok: true });
        } catch (e) {
            res.status(400).json({ error: "Gagal menyimpan data.", detail: e.message });
        }
        return;
    }

    res.status(405).json({ error: "Method tidak diizinkan." });
}

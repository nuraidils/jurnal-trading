import { getPool } from "../../lib/db.js";

// Endpoint ini dipanggil otomatis oleh Vercel Cron (lihat vercel.json).
// Vercel otomatis mengirim header "Authorization: Bearer <CRON_SECRET>" saat memanggil,
// jadi endpoint ini aman dari dipanggil orang lain sembarangan.
export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const db = getPool();
        await db.query("SELECT 1");
        res.status(200).json({ ok: true, checkedAt: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ error: "Gagal menjaga koneksi database tetap aktif.", detail: e.message });
    }
}
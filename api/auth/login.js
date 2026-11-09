import { getPool } from "../../lib/db.js";
import { verifyPassword, signSession, setSessionCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method tidak diizinkan." });
        return;
    }

    let body = req.body;
    try {
        if (typeof body === "string") body = JSON.parse(body);
    } catch {
        res.status(400).json({ error: "Body request tidak valid." });
        return;
    }

    const { email, password } = body || {};
    if (!email || !password) {
        res.status(400).json({ error: "Email dan password wajib diisi." });
        return;
    }

    try {
        const db = getPool();
        const [rows] = await db.query("SELECT id, username, password_hash FROM users WHERE email = ?", [String(email).trim().toLowerCase()]);

        if (!rows.length) {
            res.status(401).json({ error: "Email atau password salah." });
            return;
        }

        const user = rows[0];
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: "Email atau password salah." });
            return;
        }

        const token = signSession({ id: user.id, username: user.username });
        setSessionCookie(res, token);
        res.status(200).json({ ok: true, user: { username: user.username } });
    } catch (e) {
        res.status(500).json({ error: "Gagal login.", detail: e.message });
    }
}

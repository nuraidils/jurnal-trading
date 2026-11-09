import { getPool } from "../../lib/db.js";
import { hashPassword, signSession, setSessionCookie } from "../../lib/auth.js";

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

    const { username, email, password } = body || {};

    if (!username || typeof username !== "string" || username.trim().length < 3 || username.trim().length > 30) {
        res.status(400).json({ error: "Username harus 3-30 karakter." });
        return;
    }
    if (!email || typeof email !== "string" || !isValidEmail(email)) {
        res.status(400).json({ error: "Format email tidak valid." });
        return;
    }
    if (!password || typeof password !== "string" || password.length < 8) {
        res.status(400).json({ error: "Password minimal 8 karakter." });
        return;
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const db = getPool();
    const conn = await db.getConnection();
    try {
        const passwordHash = await hashPassword(password);

        await conn.beginTransaction();
        const [result] = await conn.query("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)", [cleanUsername, cleanEmail, passwordHash]);
        const userId = result.insertId;
        await conn.query("INSERT INTO journal_state (user_id, data) VALUES (?, ?)", [userId, JSON.stringify({ trades: [], withdrawals: [], currency: "IDR" })]);
        await conn.commit();

        const token = signSession({ id: userId, username: cleanUsername });
        setSessionCookie(res, token);
        res.status(201).json({ ok: true, user: { username: cleanUsername } });
    } catch (e) {
        await conn.rollback();
        if (e.code === "ER_DUP_ENTRY") {
            const field = e.sqlMessage && e.sqlMessage.includes("'email'") ? "Email" : "Username";
            res.status(409).json({ error: `${field} sudah dipakai, coba yang lain.` });
            return;
        }
        res.status(500).json({ error: "Gagal mendaftar.", detail: e.message });
    } finally {
        conn.release();
    }
}

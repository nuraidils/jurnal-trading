import { clearSessionCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method tidak diizinkan." });
        return;
    }
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
}

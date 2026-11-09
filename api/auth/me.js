import { getUserFromRequest } from "../../lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method tidak diizinkan." });
        return;
    }
    const user = getUserFromRequest(req);
    if (!user) {
        res.status(200).json({ authenticated: false });
        return;
    }
    res.status(200).json({ authenticated: true, user: { username: user.username } });
}

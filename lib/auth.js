import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

const COOKIE_NAME = "session";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

// ---------- Password ----------
export async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// ---------- Sesi (JWT) ----------
export function signSession(user) {
    return jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function verifySessionToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
}

// ---------- Cookie ----------
export function setSessionCookie(res, token) {
    const cookieStr = serialize(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: THIRTY_DAYS_SECONDS,
    });
    res.setHeader("Set-Cookie", cookieStr);
}

export function clearSessionCookie(res) {
    const cookieStr = serialize(COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
    res.setHeader("Set-Cookie", cookieStr);
}

// Dipakai di setiap endpoint yang butuh tahu siapa yang sedang login.
// Balikin null kalau cookie tidak ada / token tidak valid / sudah kedaluwarsa.
export function getUserFromRequest(req) {
    const cookies = parse(req.headers.cookie || "");
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const payload = verifySessionToken(token);
    if (!payload) return null;
    return { id: payload.sub, username: payload.username };
}

import mysql from "mysql2/promise";

// Pool dibuat sekali dan dipakai ulang selama instance function masih "hangat",
// supaya tidak buka koneksi baru terus-menerus di tiap request.
let pool;
export function getPool() {
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

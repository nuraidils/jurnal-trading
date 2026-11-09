-- Jalankan lewat Aiven Console (tab "Query editor" pada service MySQL kamu),
-- atau lewat HeidiSQL (Laragon) yang sudah connect ke database Aiven kamu.

-- Tabel akun user. Password TIDAK PERNAH disimpan mentah, selalu di-hash (bcrypt).
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sesuai kesepakatan: data jurnal lama (row tunggal id=1) dihapus, mulai bersih per-user.
DROP TABLE IF EXISTS journal_state;

CREATE TABLE journal_state (
    user_id    INT PRIMARY KEY,          -- 1 baris per user
    data       JSON NOT NULL,            -- seluruh state: { trades, withdrawals, currency }
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
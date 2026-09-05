-- Jalankan lewat Aiven Console (tab "Query editor" pada service MySQL kamu),
-- atau lewat mysql client apa pun yang sudah connect ke database Aiven kamu.
-- Aiven biasanya sudah membuatkan database bernama "defaultdb" — kalau begitu,
-- kamu tidak perlu CREATE DATABASE, cukup langsung buat tabelnya di database itu.

CREATE TABLE IF NOT EXISTS journal_state (
    id         INT PRIMARY KEY,          -- selalu 1, hanya 1 baris (single user)
    data       JSON NOT NULL,            -- seluruh state: { trades, withdrawals, currency }
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Baris awal kosong (aman dijalankan berkali-kali)
INSERT INTO journal_state (id, data)
VALUES (1, JSON_OBJECT('trades', JSON_ARRAY(), 'withdrawals', JSON_ARRAY(), 'currency', 'IDR'))
ON DUPLICATE KEY UPDATE id = id;

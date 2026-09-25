-- ============================================
-- Quizary — Seed PRODUCTION (idempoten, aman diulang)
-- ============================================
-- Hanya pastikan akun admin ada. TIDAK ada TRUNCATE / DROP / DELETE.
-- Aman dijalankan berkali-kali: baris dilewat bila email sudah ada.
--

INSERT IGNORE INTO users (name, email, password, role, is_active, email_verified_at, created_at, updated_at) VALUES
('Administrator', 'admin@smkn10jkt.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 1, NOW(), NOW(), NOW());

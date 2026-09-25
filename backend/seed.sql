-- ============================================
-- Quizary — Seed Data (contoh data realistik)
-- ============================================
-- PERINGATAN: JANGAN jalankan di produksi. Seed ini menghapus dan mengisi ulang data dev.
-- Akun admin dev: admin@smkn10jkt.com / password
-- Jalankan setelah migration: mysql -u faqih -p fastapi_quizary < seed.sql

SET foreign_key_checks = 0;
TRUNCATE TABLE answer_options;
TRUNCATE TABLE submission_option_order;
TRUNCATE TABLE submission_question_order;
TRUNCATE TABLE answers;
TRUNCATE TABLE submissions;
TRUNCATE TABLE images;
TRUNCATE TABLE question_options;
TRUNCATE TABLE questions;
TRUNCATE TABLE forms;
TRUNCATE TABLE users;
TRUNCATE TABLE app_settings;
SET foreign_key_checks = 1;

-- ============================================
-- 1. USERS
-- ============================================
INSERT INTO users (id, name, email, password, role, avatar, email_verified_at, created_at, updated_at) VALUES
(1, 'Administrator', 'admin@smkn10jkt.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', NULL, NOW(), NOW(), NOW()),
(2, 'Ahmad Rizki', 'rizki@sekolah.sch.id', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', 'avatars/rizki.png', NOW(), NOW(), NOW()),
(3, 'Dewi Anjani', 'dewi@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', NULL, NOW(), NOW(), NOW()),
(4, 'Budi Santoso', 'budi@students.sch.id', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', NULL, NOW(), NOW(), NOW()),
(5, 'Rina Marlina', 'rina@students.sch.id', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', NULL, NOW(), NOW(), NOW());

-- ============================================
-- 2. FORMS
-- ============================================
INSERT INTO forms (id, user_id, title, description, type, status, short_code, require_login, theme_color, banner_path, thank_you_message, timer_seconds, starts_at, ends_at, shuffle_questions, shuffle_options, submission_limit, show_in_history, reveal_score, reveal_answers, created_at, updated_at) VALUES
(1, 1, 'Quiz Matematika - Kelas 7', 'Quiz materi aljabar dan aritmatika dasar untuk kelas 7 semester 1', 'quiz', 'published', 'MTH7A', 1, '#6C5CE7', NULL, 'Terima kasih sudah mengerjakan quiz Matematika!', 1800, '2026-08-01 07:00:00', '2026-08-31 23:59:59', 1, 1, 'unlimited', 1, 1, 1, NOW(), NOW()),
(2, 1, 'Quiz IPA - Sistem Tata Surya', 'Quiz tentang planet, bintang, dan sistem tata surya', 'quiz', 'published', 'IPA8B', 1, '#EF4444', 'banners/tata-surya.png', 'Selamat! Kamu sudah menyelesaikan quiz IPA.', 1200, '2026-08-05 08:00:00', '2026-08-25 23:59:59', 1, 0, 'once', 1, 1, 1, NOW(), NOW()),
(3, 2, 'Bahasa Inggris - Grammar', 'Latihan simple past tense dan daily routine vocabulary', 'quiz', 'draft', 'ENG9C', 1, '#10B981', NULL, NULL, NULL, NULL, NULL, 0, 0, 'unlimited', 1, 1, 1, NOW(), NOW()),
(4, 1, 'Survey Kepuasan Belajar', 'Survey untuk mengetahui tingkat kepuasan siswa terhadap proses belajar mengajar', 'form', 'published', 'SURV01', 1, '#3B82F6', 'banners/survey-banner.png', 'Terima kasih atas masukannya!', NULL, '2026-07-20 00:00:00', '2026-12-31 23:59:59', 0, 0, 'unlimited', 1, 1, 1, NOW(), NOW()),
(5, 2, 'Pendaftaran Lomba Sains', 'Formulir pendaftaran peserta lomba sains tingkat sekolah', 'form', 'published', 'SCI24', 1, '#F59E0B', NULL, 'Pendaftaran berhasil! Kami akan menghubungi kamu lewat email.', NULL, '2026-07-15 00:00:00', '2026-08-20 23:59:59', 0, 0, 'once', 1, 1, 1, NOW(), NOW()),
(6, 1, 'UTS Matematika - Semester Ganjil', 'Ujian Tengah Semester mata pelajaran Matematika kelas 7', 'quiz', 'published', 'UTSMTH', 1, '#6C5CE7', NULL, 'Ujian telah selesai. Hasil akan diumumkan oleh guru pengampu.', 3600, '2026-09-10 07:00:00', '2026-09-10 09:00:00', 1, 1, 'once', 1, 1, 1, NOW(), NOW()),
(7, 2, 'Quiz Fisika - Gerak Lurus', 'Quiz tentang GLB dan GLBB untuk kelas 8', 'quiz', 'published', 'FSK8A', 1, '#3B82F6', NULL, 'Bagus! Pelajari lagi materi gerak lurus ya.', 900, '2026-08-10 10:00:00', '2026-08-30 23:59:59', 0, 1, 'unlimited', 1, 1, 1, NOW(), NOW()),
(8, 2, 'Kuesioner Minat & Bakat', 'Pendataan minat dan bakat siswa untuk kegiatan ekstrakurikuler', 'form', 'published', 'MNSWR', 1, '#F59E0B', 'banners/minat-bakat.png', 'Data kamu sudah tersimpan!', NULL, '2026-07-01 00:00:00', '2026-09-30 23:59:59', 0, 0, 'once', 1, 1, 1, NOW(), NOW());

-- ============================================
-- 3. QUESTIONS
-- ============================================
INSERT INTO questions (id, form_id, type, question_text, points, order_index, is_required, created_at, updated_at) VALUES
-- Form 1: Matematika (4 soal)
(1, 1, 'multiple_choice', 'Berapa hasil dari 12 × 8?', 2, 0, 1, NOW(), NOW()),
(2, 1, 'checkbox', 'Manakah yang termasuk bilangan prima?', 3, 1, 1, NOW(), NOW()),
(3, 1, 'short_answer', 'Sebutkan rumus luas lingkaran!', 2, 2, 1, NOW(), NOW()),
(4, 1, 'essay', 'Jelaskan langkah-langkah menghitung volume balok jika diketahui panjang=5 cm, lebar=3 cm, dan tinggi=4 cm!', 3, 3, 1, NOW(), NOW()),

-- Form 2: IPA (4 soal)
(5, 2, 'multiple_choice', 'Apa planet terbesar di tata surya?', 2, 0, 1, NOW(), NOW()),
(6, 2, 'multiple_choice', 'Proses perubahan wujud dari cair menjadi gas disebut?', 2, 1, 1, NOW(), NOW()),
(7, 2, 'short_answer', 'Sebutkan 3 contoh sumber energi terbarukan!', 3, 2, 1, NOW(), NOW()),
(8, 2, 'essay', 'Jelaskan proses terjadinya fotosintesis pada tumbuhan hijau!', 4, 3, 1, NOW(), NOW()),

-- Form 3: English (4 soal)
(9, 3, 'multiple_choice', 'What is the correct past tense of "go"?', 1, 0, 1, NOW(), NOW()),
(10, 3, 'multiple_choice', 'Choose the correct sentence!', 1, 1, 1, NOW(), NOW()),
(11, 3, 'short_answer', 'Complete: "She ___ to school every day." (go)', 1, 2, 1, NOW(), NOW()),
(12, 3, 'essay', 'Write a short paragraph about your hobby! (min. 3 sentences)', 2, 3, 0, NOW(), NOW()),

-- Form 4: Survey (3 soal)
(13, 4, 'multiple_choice', 'Seberapa puas Anda dengan pembelajaran semester ini?', 0, 0, 1, NOW(), NOW()),
(14, 4, 'essay', 'Bagian mana dari pembelajaran yang paling Anda sukai?', 0, 1, 0, NOW(), NOW()),
(15, 4, 'essay', 'Apa saran Anda untuk pembelajaran semester depan?', 0, 2, 0, NOW(), NOW()),

-- Form 5: Pendaftaran (3 soal)
(16, 5, 'short_answer', 'Nama lengkap peserta', 0, 0, 1, NOW(), NOW()),
(17, 5, 'multiple_choice', 'Kelas saat ini', 0, 1, 1, NOW(), NOW()),
(18, 5, 'essay', 'Apa motivasi Anda mengikuti lomba sains ini?', 0, 2, 0, NOW(), NOW()),

-- Form 6: UTS Matematika (5 soal)
(19, 6, 'multiple_choice', 'Hasil dari 15 + (-8) adalah...', 4, 0, 1, NOW(), NOW()),
(20, 6, 'multiple_choice', 'Bentuk sederhana dari 24/36 adalah...', 4, 1, 1, NOW(), NOW()),
(21, 6, 'checkbox', 'Manakah yang merupakan kelipatan dari 6?', 4, 2, 1, NOW(), NOW()),
(22, 6, 'short_answer', 'Faktorisasi prima dari 84 adalah...', 4, 3, 1, NOW(), NOW()),
(23, 6, 'essay', 'Sebuah persegi panjang memiliki panjang (2x+3) cm dan lebar (x+1) cm. Jika kelilingnya 38 cm, tentukan nilai x dan luas persegi panjang tersebut!', 8, 4, 1, NOW(), NOW()),

-- Form 7: Fisika (4 soal)
(24, 7, 'multiple_choice', 'Sebuah benda bergerak dengan kecepatan tetap 10 m/s selama 5 detik. Jarak yang ditempuh adalah...', 2, 0, 1, NOW(), NOW()),
(25, 7, 'multiple_choice', 'Percepatan gravitasi bumi di permukaan laut kira-kira...', 2, 1, 1, NOW(), NOW()),
(26, 7, 'short_answer', 'Tuliskan rumus GLBB (Gerak Lurus Berubah Beraturan)!', 2, 2, 1, NOW(), NOW()),
(27, 7, 'essay', 'Jelaskan perbedaan antara GLB dan GLBB serta berikan masing-masing 1 contoh!', 4, 3, 1, NOW(), NOW()),

-- Form 8: Minat Bakat (3 soal)
(28, 8, 'multiple_choice', 'Bidang apa yang paling kamu minati?', 0, 0, 1, NOW(), NOW()),
(29, 8, 'short_answer', 'Sebutkan 2 kegiatan ekstrakurikuler favoritmu!', 0, 1, 1, NOW(), NOW()),
(30, 8, 'essay', 'Ceritakan pengalamanmu mengikuti organisasi atau lomba sebelumnya!', 0, 2, 0, NOW(), NOW());

-- ============================================
-- 4. QUESTION OPTIONS
-- ============================================
INSERT INTO question_options (id, question_id, option_text, is_correct, order_index) VALUES
-- Q1: 12 x 8
(1, 1, '80', 0, 0),
(2, 1, '96', 1, 1),
(3, 1, '84', 0, 2),
(4, 1, '72', 0, 3),

-- Q2: bilangan prima
(5, 2, '2', 1, 0),
(6, 2, '4', 0, 1),
(7, 2, '7', 1, 2),
(8, 2, '9', 0, 3),
(9, 2, '11', 1, 4),

-- Q5: planet terbesar
(10, 5, 'Mars', 0, 0),
(11, 5, 'Jupiter', 1, 1),
(12, 5, 'Saturnus', 0, 2),
(13, 5, 'Bumi', 0, 3),

-- Q6: perubahan wujud
(14, 6, 'Membeku', 0, 0),
(15, 6, 'Menguap', 1, 1),
(16, 6, 'Mengembun', 0, 2),
(17, 6, 'Menyublim', 0, 3),

-- Q9: past tense
(18, 9, 'Goed', 0, 0),
(19, 9, 'Went', 1, 1),
(20, 9, 'Gone', 0, 2),
(21, 9, 'Going', 0, 3),

-- Q10: correct sentence
(22, 10, 'He don''t like coffee', 0, 0),
(23, 10, 'He doesn''t like coffee', 1, 1),
(24, 10, 'He not like coffee', 0, 2),

-- Q13: survey puas
(25, 13, 'Sangat Puas', 0, 0),
(26, 13, 'Puas', 0, 1),
(27, 13, 'Cukup Puas', 0, 2),
(28, 13, 'Kurang Puas', 0, 3),

-- Q17: kelas
(29, 17, 'Kelas 7', 0, 0),
(30, 17, 'Kelas 8', 0, 1),
(31, 17, 'Kelas 9', 0, 2),

-- Q19: 15 + (-8)
(32, 19, '23', 0, 0),
(33, 19, '7', 1, 1),
(34, 19, '-7', 0, 2),
(35, 19, '-23', 0, 3),

-- Q20: 24/36
(36, 20, '1/2', 0, 0),
(37, 20, '2/3', 1, 1),
(38, 20, '3/4', 0, 2),
(39, 20, '4/5', 0, 3),

-- Q21: kelipatan 6
(40, 21, '12', 1, 0),
(41, 21, '16', 0, 1),
(42, 21, '18', 1, 2),
(43, 21, '20', 0, 3),
(44, 21, '24', 1, 4),

-- Q24: GLB jarak
(45, 24, '2 meter', 0, 0),
(46, 24, '15 meter', 0, 1),
(47, 24, '50 meter', 1, 2),
(48, 24, '100 meter', 0, 3),

-- Q25: gravitasi
(49, 25, '5,8 m/s²', 0, 0),
(50, 25, '9,8 m/s²', 1, 1),
(51, 25, '12,4 m/s²', 0, 2),
(52, 25, '15,2 m/s²', 0, 3),

-- Q28: minat bidang
(53, 28, 'Sains & Teknologi', 0, 0),
(54, 28, 'Seni & Budaya', 0, 1),
(55, 28, 'Olahraga', 0, 2),
(56, 28, 'Bahasa & Sastra', 0, 3),
(57, 28, 'Sosial & Kepemimpinan', 0, 4);

-- ============================================
-- 5. IMAGES
-- ============================================
INSERT INTO images (id, question_id, option_id, path, order_index, created_at, updated_at) VALUES
(1, 5, NULL, 'question-images/planet-jupiter.jpg', 0, NOW(), NOW()),
(2, NULL, 2, 'question-images/option-96.png', 0, NOW(), NOW()),
(3, 8, NULL, 'question-images/fotosintesis-diagram.png', 0, NOW(), NOW()),
(4, 7, NULL, 'question-images/energi-terbarukan.jpg', 0, NOW(), NOW());

-- ============================================
-- 6. SUBMISSIONS
-- ============================================
INSERT INTO submissions (id, form_id, user_id, respondent_name, respondent_email, ip_address, status, score, max_score, started_at, submitted_at, created_at, updated_at) VALUES
(1, 1, 4, 'Budi Santoso', 'budi@students.sch.id', '192.168.1.10', 'in_progress', NULL, NULL, '2026-08-02 09:15:00', NULL, NOW(), NOW()),
(2, 1, NULL, 'Siti Rahma', 'rahma@students.sch.id', '192.168.1.25', 'submitted', 6.00, 10.00, '2026-08-02 10:00:00', '2026-08-02 10:28:30', NOW(), NOW()),
(3, 1, NULL, 'Aulia Fitri', 'aulia@students.sch.id', '192.168.1.30', 'submitted', 10.00, 10.00, '2026-08-03 08:30:00', '2026-08-03 08:55:10', NOW(), NOW()),
(4, 2, NULL, 'Dimas Prayoga', 'dimas@students.sch.id', '192.168.1.40', 'submitted', 7.00, 11.00, '2026-08-06 09:00:00', '2026-08-06 09:18:45', NOW(), NOW()),
(5, 2, NULL, 'Citra Lestari', 'citra@students.sch.id', '192.168.1.50', 'submitted', 11.00, 11.00, '2026-08-06 10:00:00', '2026-08-06 10:15:20', NOW(), NOW()),
(6, 2, NULL, 'Bayu Aji', 'bayu@students.sch.id', '192.168.1.60', 'auto_submitted', 4.00, 11.00, '2026-08-07 11:00:00', '2026-08-07 11:20:00', NOW(), NOW()),
(7, 4, NULL, 'Anonim', NULL, '10.0.0.15', 'submitted', NULL, NULL, '2026-07-25 14:00:00', '2026-07-25 14:03:25', NOW(), NOW()),
(8, 4, 5, 'Rina Marlina', 'rina@students.sch.id', '192.168.1.55', 'submitted', NULL, NULL, '2026-07-26 09:30:00', '2026-07-26 09:35:00', NOW(), NOW()),
(9, 5, NULL, 'Fajar Nugroho', 'fajar@gmail.com', '192.168.1.70', 'submitted', NULL, NULL, '2026-07-20 08:00:00', '2026-07-20 08:05:00', NOW(), NOW()),
(10, 5, 3, 'Putri Ayu', 'putri@gmail.com', '192.168.1.80', 'submitted', NULL, NULL, '2026-07-21 10:00:00', '2026-07-21 10:06:30', NOW(), NOW()),
(11, 6, NULL, 'Budi Santoso', 'budi@students.sch.id', '192.168.1.10', 'submitted', 16.00, 24.00, '2026-09-10 07:05:00', '2026-09-10 08:45:00', NOW(), NOW()),
(12, 6, NULL, 'Siti Rahma', 'rahma@students.sch.id', '192.168.1.25', 'submitted', 20.00, 24.00, '2026-09-10 07:10:00', '2026-09-10 08:50:30', NOW(), NOW()),
(13, 6, NULL, 'Aulia Fitri', 'aulia@students.sch.id', '192.168.1.30', 'submitted', 24.00, 24.00, '2026-09-10 07:02:00', '2026-09-10 08:30:00', NOW(), NOW()),
(14, 7, NULL, 'Fajar Nugroho', 'fajar@gmail.com', '192.168.1.70', 'submitted', 6.00, 10.00, '2026-08-11 13:00:00', '2026-08-11 13:12:00', NOW(), NOW()),
(15, 7, NULL, 'Citra Lestari', 'citra@students.sch.id', '192.168.1.50', 'submitted', 10.00, 10.00, '2026-08-12 14:00:00', '2026-08-12 14:10:30', NOW(), NOW()),
(16, 8, NULL, 'Dimas Prayoga', 'dimas@students.sch.id', '192.168.1.40', 'submitted', NULL, NULL, '2026-07-10 08:00:00', '2026-07-10 08:03:00', NOW(), NOW()),
(17, 8, NULL, 'Bayu Aji', 'bayu@students.sch.id', '192.168.1.60', 'submitted', NULL, NULL, '2026-07-12 09:00:00', '2026-07-12 09:05:00', NOW(), NOW()),
(18, 8, NULL, 'Siti Rahma', 'rahma@students.sch.id', '192.168.1.25', 'submitted', NULL, NULL, '2026-07-15 10:30:00', '2026-07-15 10:33:00', NOW(), NOW());

-- ============================================
-- 7. ANSWERS
-- ============================================
INSERT INTO answers (id, submission_id, question_id, answer_text, is_correct, points_earned, created_at, updated_at) VALUES

-- Submission 1 (Budi - Matematika, in_progress — jawaban partial)
(1,  1, 1, NULL, 1, 2.00, NOW(), NOW()),
(2,  1, 2, NULL, NULL, NULL, NOW(), NOW()),
(3,  1, 4, 'Cari panjang x lebar x tinggi dulu bang', NULL, NULL, NOW(), NOW()),

-- Submission 2 (Siti Rahma - Matematika, submitted)
(4,  2, 1, NULL, 0, 0.00, NOW(), NOW()),
(5,  2, 2, NULL, 0, 0.00, NOW(), NOW()),
(6,  2, 3, 'phi x r x r', 1, 2.00, NOW(), NOW()),
(7,  2, 4, 'Volume balok = panjang x lebar x tinggi = 5 x 3 x 4 = 60 cm kubik', 1, 3.00, NOW(), NOW()),

-- Submission 3 (Aulia - Matematika, submitted — perfect)
(8,  3, 1, NULL, 1, 2.00, NOW(), NOW()),
(9,  3, 2, NULL, 1, 3.00, NOW(), NOW()),
(10, 3, 3, 'L = π × r²', 1, 2.00, NOW(), NOW()),
(11, 3, 4, 'Volume balok = p × l × t = 5 × 3 × 4 = 60 cm³', 1, 3.00, NOW(), NOW()),

-- Submission 4 (Dimas - IPA)
(12, 4, 5, NULL, 1, 2.00, NOW(), NOW()),
(13, 4, 6, NULL, 1, 2.00, NOW(), NOW()),
(14, 4, 7, 'Matahari, angin, air', 1, 3.00, NOW(), NOW()),
(15, 4, 8, 'Fotosintesis itu proses tumbuhan membuat makanan', 0, 0.00, NOW(), NOW()),

-- Submission 5 (Citra - IPA, perfect)
(16, 5, 5, NULL, 1, 2.00, NOW(), NOW()),
(17, 5, 6, NULL, 1, 2.00, NOW(), NOW()),
(18, 5, 7, 'Tenaga surya, angin, air', 1, 3.00, NOW(), NOW()),
(19, 5, 8, 'Fotosintesis adalah proses tumbuhan mengubah air (H₂O) dan karbon dioksida (CO₂) dengan bantuan sinar matahari menjadi glukosa (C₆H₁₂O₆) dan oksigen (O₂). Proses ini terjadi di dalam kloroplas yang mengandung klorofil.', 1, 4.00, NOW(), NOW()),

-- Submission 6 (Bayu - IPA, auto_submitted)
(20, 6, 5, NULL, 1, 2.00, NOW(), NOW()),
(21, 6, 6, NULL, 0, 0.00, NOW(), NOW()),
(22, 6, 7, 'Angin', 0, 0.00, NOW(), NOW()),
(23, 6, 8, 'Tumbuhan hijau', 0, 0.00, NOW(), NOW()),

-- Submission 7 (Anonim - Survey)
(24, 7, 13, NULL, NULL, NULL, NOW(), NOW()),
(25, 7, 14, 'Saya suka bagian praktek laboratoriumnya', NULL, NULL, NOW(), NOW()),
(26, 7, 15, 'Tolong ditambah jam pelajaran komputer', NULL, NULL, NOW(), NOW()),

-- Submission 8 (Rina - Survey)
(27, 8, 13, NULL, NULL, NULL, NOW(), NOW()),
(28, 8, 14, 'Belajar kelompok dan diskusi soalnya seru', NULL, NULL, NOW(), NOW()),
(29, 8, 15, 'Gurunya sudah baik, mungkin perlu lebih banyak kuis biar tidak bosan', NULL, NULL, NOW(), NOW()),

-- Submission 9 (Fajar - Pendaftaran)
(30, 9, 16, 'Fajar Nugroho', NULL, NULL, NOW(), NOW()),
(31, 9, 17, NULL, NULL, NULL, NOW(), NOW()),
(32, 9, 18, 'Saya ingin mengembangkan kemampuan sains dan mewakili sekolah di lomba', NULL, NULL, NOW(), NOW()),

-- Submission 10 (Putri - Pendaftaran)
(33, 10, 16, 'Putri Ayu Kusuma Dewi', NULL, NULL, NOW(), NOW()),
(34, 10, 17, NULL, NULL, NULL, NOW(), NOW()),
(35, 10, 18, 'Saya suka IPA dan bercita-cita jadi peneliti', NULL, NULL, NOW(), NOW()),

-- Submission 11 (Budi - UTS Matematika)
(36, 11, 19, NULL, 1, 4.00, NOW(), NOW()),
(37, 11, 20, NULL, 0, 0.00, NOW(), NOW()),
(38, 11, 21, NULL, 1, 4.00, NOW(), NOW()),
(39, 11, 22, '2 × 2 × 3 × 7', 1, 4.00, NOW(), NOW()),
(40, 11, 23, 'K = 2(p+l) = 2(2x+3 + x+1) = 2(3x+4) = 6x+8 = 38, jadi 6x = 30, x = 5. L = p×l = (2×5+3)(5+1) = (13)(6) = 78 cm²', 0, 0.00, NOW(), NOW()),

-- Submission 12 (Siti Rahma - UTS Matematika)
(41, 12, 19, NULL, 1, 4.00, NOW(), NOW()),
(42, 12, 20, NULL, 1, 4.00, NOW(), NOW()),
(43, 12, 21, NULL, 0, 0.00, NOW(), NOW()),
(44, 12, 22, '2^2 × 3 × 7', 1, 4.00, NOW(), NOW()),
(45, 12, 23, '2(2x+3 + x+1) = 38 → 2(3x+4) = 38 → 6x+8 = 38 → 6x = 30 → x = 5. Luas = (2×5+3)(5+1) = 13×6 = 78 cm²', 1, 8.00, NOW(), NOW()),

-- Submission 13 (Aulia - UTS Matematika, perfect)
(46, 13, 19, NULL, 1, 4.00, NOW(), NOW()),
(47, 13, 20, NULL, 1, 4.00, NOW(), NOW()),
(48, 13, 21, NULL, 1, 4.00, NOW(), NOW()),
(49, 13, 22, '2² × 3 × 7', 1, 4.00, NOW(), NOW()),
(50, 13, 23, 'K = 2(p+l) → 38 = 2((2x+3)+(x+1)) → 38 = 2(3x+4) → 38 = 6x+8 → 6x = 30 → x = 5. Maka p = 2(5)+3 = 13 cm, l = 5+1 = 6 cm. Luas = 13 × 6 = 78 cm².', 1, 8.00, NOW(), NOW()),

-- Submission 14 (Fajar - Fisika)
(51, 14, 24, NULL, 1, 2.00, NOW(), NOW()),
(52, 14, 25, NULL, 1, 2.00, NOW(), NOW()),
(53, 14, 26, 'vt = v0 + a.t', 0, 0.00, NOW(), NOW()),
(54, 14, 27, 'GLB itu gerak dengan kecepatan tetap, contoh mobil di tol. GLBB itu kecepatan berubah, contoh bola jatuh.', 0, 0.00, NOW(), NOW()),

-- Submission 15 (Citra - Fisika, perfect)
(55, 15, 24, NULL, 1, 2.00, NOW(), NOW()),
(56, 15, 25, NULL, 1, 2.00, NOW(), NOW()),
(57, 15, 26, 'vt = v0 + a·t, s = v0·t + ½·a·t², vt² = v0² + 2·a·s', 1, 2.00, NOW(), NOW()),
(58, 15, 27, 'GLB (Gerak Lurus Beraturan) adalah gerak dengan kecepatan konstan, percepatan = 0. Contoh: mobil bergerak di jalan tol dengan kecepatan tetap 80 km/jam. GLBB (Gerak Lurus Berubah Beraturan) adalah gerak dengan percepatan konstan. Contoh: buah mangga jatuh dari pohon (GLBB dipercepat).', 1, 4.00, NOW(), NOW()),

-- Submission 16 (Dimas - Minat Bakat)
(59, 16, 28, NULL, NULL, NULL, NOW(), NOW()),
(60, 16, 29, 'Robotik dan Pramuka', NULL, NULL, NOW(), NOW()),

-- Submission 17 (Bayu - Minat Bakat)
(61, 17, 28, NULL, NULL, NULL, NOW(), NOW()),
(62, 17, 29, 'Sepak bola dan basket', NULL, NULL, NOW(), NOW()),

-- Submission 18 (Siti Rahma - Minat Bakat)
(63, 18, 28, NULL, NULL, NULL, NOW(), NOW()),
(64, 18, 29, 'Seni tari dan paduan suara', NULL, NULL, NOW(), NOW()),
(65, 18, 30, 'Saya pernah mengikuti lomba tari tingkat kabupaten dan meraih juara 2. Pengalaman itu sangat berharga karena saya belajar kerja sama tim dan disiplin.', NULL, NULL, NOW(), NOW());

-- ============================================
-- 8. ANSWER OPTIONS (opsi yang dipilih)
-- ============================================
INSERT INTO answer_options (id, answer_id, option_id) VALUES

-- Sub 1: Q1 pilih 96 (benar)
(1,  1,  2),

-- Sub 2: Q1 pilih 80 (salah), Q2 pilih 2,7 (seharusnya 2,7,11)
(2,  4,  1),
(3,  5,  5),
(4,  5,  7),

-- Sub 3: Q1 pilih 96 (benar), Q2 pilih 2,7,11 (semua benar)
(5,  8,  2),
(6,  9,  5),
(7,  9,  7),
(8,  9,  9),

-- Sub 4: Q5 pilih Jupiter (benar), Q6 pilih Menguap (benar)
(9,  12, 11),
(10, 13, 15),

-- Sub 5: Q5 Jupiter (benar), Q6 Menguap (benar)
(11, 16, 11),
(12, 17, 15),

-- Sub 6: Q5 Jupiter (benar), Q6 pilih Membeku (salah)
(13, 20, 11),
(14, 21, 14),

-- Sub 7: Q13 pilih Puas
(15, 24, 26),

-- Sub 8: Q13 pilih Sangat Puas
(16, 27, 25),

-- Sub 9: Q17 pilih Kelas 9
(17, 31, 31),

-- Sub 10: Q17 pilih Kelas 8
(18, 34, 30),

-- Sub 11 (Budi UTS): Q19 pilih 7 (benar), Q20 pilih 1/2 (salah), Q21 pilih 12,18 (benar, kurang 24)
(19, 36, 33),
(20, 37, 36),
(21, 38, 40),
(22, 38, 42),

-- Sub 12 (Siti UTS): Q19 pilih 7 (benar), Q20 pilih 2/3 (benar), Q21 pilih 12,18,20 (salah, 20 bukan)
(23, 41, 33),
(24, 42, 37),
(25, 43, 40),
(26, 43, 42),
(27, 43, 43),

-- Sub 13 (Aulia UTS, perfect): Q19 pilih 7 (benar), Q20 pilih 2/3 (benar), Q21 pilih 12,18,24 (semua benar)
(28, 46, 33),
(29, 47, 37),
(30, 48, 40),
(31, 48, 42),
(32, 48, 44),

-- Sub 14 (Fajar Fisika): Q24 pilih 50 m (benar), Q25 pilih 9,8 (benar)
(33, 51, 47),
(34, 52, 50),

-- Sub 15 (Citra Fisika, perfect): Q24 pilih 50 m (benar), Q25 pilih 9,8 (benar)
(35, 55, 47),
(36, 56, 50),

-- Sub 16 (Dimas Minat): Q28 pilih Sains & Teknologi
(37, 59, 53),

-- Sub 17 (Bayu Minat): Q28 pilih Olahraga
(38, 61, 55),

-- Sub 18 (Siti Rahma Minat): Q28 pilih Seni & Budaya
(39, 63, 54);

-- ============================================
-- 9. SUBMISSION QUESTION ORDER (shuffle)
-- ============================================
-- Form 1 punya 4 soal. Dengan shuffle_questions=1, urutan per submission:
INSERT INTO submission_question_order (id, submission_id, question_id, order_index) VALUES
-- Sub 1: urutan 2,4,1,3
(1,  1, 2, 0),
(2,  1, 4, 1),
(3,  1, 1, 2),
(4,  1, 3, 3),

-- Sub 2: urutan 1,3,2,4
(5,  2, 1, 0),
(6,  2, 3, 1),
(7,  2, 2, 2),
(8,  2, 4, 3),

-- Sub 3: urutan 4,1,3,2
(9,  3, 4, 0),
(10, 3, 1, 1),
(11, 3, 2, 2), -- ponytail: corrected index from 3 to 2 (4 soal: 0,1,2,3)
(12, 3, 3, 3),

-- Form 6 (UTS Matematika, shuffle=1) — 5 soal
(13, 11, 21, 0),
(14, 11, 19, 1),
(15, 11, 23, 2),
(16, 11, 20, 3),
(17, 11, 22, 4),

(18, 12, 19, 0),
(19, 12, 22, 1),
(20, 12, 20, 2),
(21, 12, 21, 3),
(22, 12, 23, 4),

(23, 13, 23, 0),
(24, 13, 21, 1),
(25, 13, 20, 2),
(26, 13, 22, 3),
(27, 13, 19, 4);

-- ============================================
-- 10. SUBMISSION OPTION ORDER (shuffle)
-- ============================================
INSERT INTO submission_option_order (id, submission_id, option_id, order_index) VALUES
-- Sub 1: Q1 options diacak
(1,  1, 3, 0),
(2,  1, 2, 1),
(3,  1, 1, 2),
(4,  1, 4, 3),

-- Sub 2: Q1 options
(5,  2, 4, 0),
(6,  2, 1, 1),
(7,  2, 3, 2),
(8,  2, 2, 3),

-- Sub 3: Q1 options
(9,  3, 1, 0),
(10, 3, 4, 1),
(11, 3, 2, 2),
(12, 3, 3, 3),

-- Sub 11 (Budi UTS): Q19 options diacak
(13, 11, 34, 0),
(14, 11, 32, 1),
(15, 11, 33, 2),
(16, 11, 35, 3),

-- Sub 12 (Siti UTS): Q19 options
(17, 12, 33, 0),
(18, 12, 35, 1),
(19, 12, 32, 2),
(20, 12, 34, 3),

-- Sub 13 (Aulia UTS): Q19 options
(21, 13, 35, 0),
(22, 13, 33, 1),
(23, 13, 34, 2),
(24, 13, 32, 3);

# Product Requirement Document (PRD)
## Quizary — Form & Quiz Management System

**Versi:** 1.0
**Status:** Active — Source of Truth untuk Development & AI Agent
**Audiens:** Tim pengembang (manusia) & AI coding agent yang mengimplementasikan sistem ini

> Dokumen ini adalah rujukan utama. Kalau ada instruksi lain (chat, komentar, task singkat) yang bertentangan dengan dokumen ini, dokumen ini yang menang kecuali ada keputusan eksplisit untuk mengubahnya — dan perubahan itu harus di-update di sini juga.

---

## 1. Ringkasan Produk

**Quizary** adalah platform pembuatan form dan quiz berbasis web dan mobile, yang menggabungkan kemudahan form builder (seperti Google Forms) dengan kelengkapan sistem ujian formal (timer terjadwal, anti-cheat, auto-grading) **dan** pengalaman pengerjaan quiz yang hidup dan gamified (terinspirasi dari Kahoot/Quizizz) untuk sisi responden.

**Dua mode produk yang perlu dipahami agen sebagai konteks:**
1. **Mode Form/Survey** — pengalaman formal, minimalis, seperti Google Forms. Dipakai untuk survey, feedback, pendataan.
2. **Mode Quiz** — pengalaman gamified, penuh warna, satu soal per layar, feedback instan animatif. Dipakai untuk ujian, latihan soal, kuis kompetisi.

Perbedaan mode ini **penting** dan memengaruhi keputusan desain di seluruh dokumen ini — jangan menyamaratakan UI keduanya.

---

## 2. Tujuan & Sasaran

| Tujuan | Ukuran Keberhasilan |
|---|---|
| Admin bisa membuat form/quiz tanpa hambatan teknis | Waktu dari login → publish form pertama < 5 menit |
| Responden bisa mengisi quiz dengan pengalaman menyenangkan, bukan seperti mengisi form kaku | Completion rate quiz > 85% (tidak drop di tengah jalan) |
| Sistem menahan kecurangan dasar (shuffle, limit submit, validasi waktu) | 0 celah yang bisa dieksploitasi lewat manipulasi request langsung (bukan cuma UI) |
| Penilaian otomatis akurat dan real-time | Skor muncul ke admin dalam <2 detik setelah submit |
| Produk bisa dipakai lintas device (web & mobile Android) tanpa pengalaman pincang di salah satu platform | Semua flow inti (isi quiz, lihat hasil) berjalan mulus di kedua platform |

---

## 3. Target Pengguna

| Persona | Kebutuhan Utama |
|---|---|
| **Admin/Guru** | Bikin quiz cepat, import soal dari dokumen lama, lihat hasil dan statistik tanpa ribet |
| **Siswa/Responden (mobile-first)** | Mengisi quiz dari HP, sering lewat scan QR, ingin feedback instan dan tampilan tidak membosankan |
| **Responden anonim (survey)** | Mengisi form singkat tanpa perlu akun, cepat selesai |

---

## 4. Scope

### In-Scope
- Web app (admin + responden)
- Android app (fokus utama: sisi responden — karena quiz sekolah dominan dikerjakan via HP)
- Seluruh modul di `requirement-analysis.md`: auth, form/quiz builder, import soal, share (link/QR), timer & sesi, pengisian, penilaian otomatis, hasil & analitik, kustomisasi tema, keamanan

### Out-of-Scope (tegas, jangan diimplementasikan tanpa perubahan PRD ini)
- Live multiplayer real-time (semua peserta menjawab bersamaan dalam 1 sesi live, seperti Kahoot host-mode) — sistem ini **asynchronous**, tiap peserta punya sesi masing-masing dalam jendela waktu yang sama, **bukan** 1 layar bersama yang dikontrol host secara live
- Video/audio proctoring (pengawasan kamera)
- Tipe soal drag-pin-on-image, slider, puzzle-reorder, audio-question, poll-vote (ada di referensi UI tapi **tidak** ada di skema database saat ini) — lihat Section 7.4 untuk keputusan soal ini
- Payment/monetisasi

---

## 5. Referensi Dokumen Terkait

Agent **wajib** membaca dokumen berikut sebagai bagian dari konteks sebelum implementasi, jangan menduplikasi/mengarang ulang isinya:

| Dokumen | Isi |
|---|---|
| `requirement-analysis.md` | Functional & non-functional requirements lengkap, business rules |
| Struktur database (10 tabel SQL) | Skema Postgres/Supabase-compatible, sudah final |
| `api-contract.md` | Definisi request/response tiap endpoint |
| Mock API live | `https://quizary-dump.vercel.app/docs` — gunakan ini untuk development frontend sebelum backend asli selesai |
| Todo/Roadmap 10 fase | Urutan pengerjaan yang disepakati |

---

## 6. Arsitektur Data (Ringkasan)

10 entitas: `users`, `forms`, `questions`, `question_options`, `images`, `submissions`, `answers`, `answer_options`, `submission_question_order`, `submission_option_order`.

Aturan kunci yang **tidak boleh dilanggar** oleh implementasi apapun:
- Tipe soal terbatas pada 4: `multiple_choice`, `checkbox`, `short_answer`, `essay` (lihat Section 7.4 soal perluasan tipe)
- Shuffle disimpan per-submission di tabel order terpisah, bukan di kolom form
- 1 gambar hanya boleh milik `question_id` **atau** `option_id`, tidak dua-duanya
- Waktu berakhir efektif = `MIN(started_at + timer_seconds, ends_at)`

**Sistem poin quiz (hanya berlaku untuk tipe `quiz`):**
- `scoring_mode=auto` (default): total pool **100**, dibagi merata ke semua soal `is_scored=true`.
- `scoring_mode=manual`: creator mengisi bobot tiap soal; skor hasil tetap skala **/100** dengan rumus `poin_diperoleh / total_bobot × 100`.
- Pada mode `auto`, pool **100** dibagi merata ke semua soal `is_scored=true` setiap ada **penambahan soal, import soal, penghapusan soal, atau soal diaktifkan kembali** (sisa 100 yang tak habis dibagi jatuh ke soal terurut awal).
- Pada mode `auto`, saat user **mengedit poin** salah satu soal, poin soal tersebut dipertahankan dan sisa pool (100 − poinnya) dibagi merata ke soal scored lainnya.
- `is_scored=false` → soal "detail-only": tidak ikut pool, poin direset 0, tidak dinilai (`is_correct=null`, `points_earned=0`), tampil sebagai "Not graded" di hasil.
- Konversi tipe form→quiz: opsi pertama tiap soal pilihan ganda otomatis benar + semua poin direset & dibagi. Konversi quiz→form: semua `is_correct` direset `false`.

---

## 7. Functional Requirements (Ringkasan per Modul)

> Detail requirement per ID (FR-01 s.d. FR-43) sudah lengkap di `requirement-analysis.md`. Bagian ini hanya menegaskan prioritas dan keputusan yang memengaruhi UI/UX.

### 7.1 Prioritas Implementasi (P0 = wajib ada di rilis pertama)

| Prioritas | Modul |
|---|---|
| P0 | Auth, Form/Quiz builder dasar, 4 tipe soal, share link/QR, timer & sesi, pengisian, auto-grading, hasil dasar |
| P1 | Import soal (text & docx), export Excel/PDF, analitik statistik, kustomisasi tema/banner |
| P2 | Ranking peserta, notifikasi mobile, riwayat submission responden |

### 7.2 Behavior yang Wajib Konsisten Lintas Platform

- Auto-save jawaban **tidak boleh** menunggu aksi user (bukan tombol "simpan"), trigger tiap kali jawaban berubah
- Timer countdown harus tetap akurat meski app di-background lalu dibuka lagi (dihitung dari `started_at` di server, bukan dari state lokal device)
- Auto-submit **wajib** terjadi walau user menutup app saat waktu habis — validasi backend saat request berikutnya, bukan bergantung dari client yang trigger submit

### 7.3 Batasan Perilaku Keamanan

- Shuffle, limit submit, dan validasi waktu **harus** divalidasi ulang di backend pada setiap request, klien tidak dipercaya sepenuhnya
- Halaman pengerjaan tidak boleh mengirim jawaban benar (`is_correct` dari opsi) ke klien sebelum submit — cek response `GET /submissions/{id}` sebelum status `submitted`/`auto_submitted`, field opsi hanya berisi `option_text`, bukan `is_correct`
- **Mode fullscreen (`is_restricted`)** hanya berlaku untuk tipe `quiz`. Anticheat ini client-reported: saat keluar dari tab/loss-of-focus, klien memberi grace period 5 detik untuk kembali fullscreen. Jika tidak kembali, satu laporan dikirim ke `POST /submissions/{id}/tab-exit` dan server mengubah submission menjadi `status='locked'`. Penalti ada di server, bukan klien.
- **Rantai setting (auto-coerce):** `is_restricted=true` memaksa `submission_limit='once'`; `submission_limit='once'` memaksa `require_login=true`. Identitas berbasis akun membuat "sekali per orang" dan atribusi anti-cheat tidak bergantung IP yang bisa dipalsukan.
- **Leaderboard (`show_leaderboard`)** bersifat read-only setelah submit (bukan real-time). Publik via `GET /q/{code}/leaderboard`; submission `cheating` dikecualikan supaya tidak terekspos ke responden.

### 7.4 Keputusan: Tipe Soal Tambahan dari Referensi UI

Referensi desain (lihat lampiran gambar) menampilkan tipe soal: True/False, Slider, Puzzle (reorder), Audio Question, Poll, Drop Pin — **tidak ada di skema database saat ini**.

**Keputusan untuk rilis ini:** tipe soal tetap 4 (`multiple_choice`, `checkbox`, `short_answer`, `essay`). True/False diimplementasikan **sebagai `multiple_choice` dengan 2 opsi** ("Benar"/"Salah") — tidak butuh tipe baru, tinggal styling khusus di frontend saat opsi cuma 2 dan teksnya "Benar"/"Salah" atau "True"/"False". Tipe soal lain (slider, puzzle, audio, poll, drop pin) **di luar scope** rilis ini; kalau dibutuhkan nanti, harus lewat proses penambahan `question_type` baru di enum database — jangan agent buat sendiri tanpa migrasi skema.

---

## 8. UI/UX Design System

> Bagian ini menerjemahkan referensi visual (lampiran gambar mobile quiz app) menjadi aturan konkret. Berlaku **khusus untuk flow pengerjaan Quiz oleh responden** (mobile-first). Untuk dashboard admin dan mode Form/Survey, ikuti Section 8.6.

### 8.1 Prinsip Desain

1. **Satu fokus per layar** — satu soal, satu aksi utama, tanpa elemen kompetisi visual
2. **Feedback instan dan jelas** — jawaban benar/salah langsung terlihat lewat warna, bukan cuma teks
3. **Warna sebagai penanda fungsi, bukan dekorasi** — tiap warna opsi konsisten dipakai untuk membedakan pilihan (pola Kahoot: tiap tombol jawaban punya warna beda supaya cepat dikenali)
4. **Progress selalu terlihat** — pengguna harus selalu tahu di soal keberapa dan berapa lama waktu tersisa

### 8.2 Palet Warna

| Token | Hex (acuan dari referensi) | Penggunaan |
|---|---|---|
| `--color-primary` | `#6C5CE7` (ungu) | Background utama, tombol CTA, header |
| `--color-correct` | `#10B981` (hijau) | Banner jawaban benar, opsi benar setelah submit |
| `--color-incorrect` | `#EF4444` (merah) | Banner jawaban salah, opsi salah setelah submit |
| `--color-option-a` | `#3B82F6` (biru) | Opsi jawaban ke-1 |
| `--color-option-b` | `#EF4444` (merah) | Opsi jawaban ke-2 |
| `--color-option-c` | `#F59E0B` (oranye) | Opsi jawaban ke-3 |
| `--color-option-d` | `#10B981` (hijau) | Opsi jawaban ke-4 |
| `--color-surface` | `#FFFFFF` | Card/kontainer konten |
| `--color-text-primary` | `#1F2937` | Teks utama di atas surface putih |
| `--color-text-inverse` | `#FFFFFF` | Teks di atas background ungu/warna solid |

**Catatan penting untuk agent:** urutan warna opsi (biru→merah→oranye→hijau) **tetap konsisten** di semua soal pilihan ganda/checkbox, supaya pengguna membangun asosiasi posisi-warna (mengurangi beban kognitif membaca ulang tiap soal). Jangan random-kan warna, cukup random-kan **isi teks opsi** (sesuai `shuffle_options`), posisi warna tetap tetap berdasarkan `order_index` hasil shuffle.

### 8.3 Tipografi & Spacing

| Elemen | Aturan |
|---|---|
| Font | Sans-serif geometris (contoh: Inter, Poppins, atau Nunito) — hindari serif/monospace untuk konten utama |
| Ukuran judul soal | 18–20px, bold, line-height lega (soal harus mudah dibaca sekali lihat) |
| Ukuran teks opsi | 15–16px, medium weight |
| Radius sudut | 16–20px untuk card besar, 12px untuk tombol opsi — konsisten membulat di semua elemen (tidak ada sudut tajam sama sekali di seluruh UI ini) |
| Padding card | Minimal 16px di semua sisi, jangan mepet |
| Jarak antar tombol opsi | 12px, tersusun grid 2 kolom untuk 4 opsi (2x2), atau 1 kolom penuh untuk opsi teks panjang |

### 8.4 Komponen Wajib (Pengerjaan Quiz — Mobile)

| Komponen | Spesifikasi |
|---|---|
| **Top bar** | Progress bar horizontal tipis di paling atas (isi = `soal_ke / total_soal`), tombol close (X) di kiri, ikon menu/opsi (titik tiga) di kanan opsional |
| **Nomor soal** | Format `"{index}/{total}"` di bawah top bar, contoh `"2/10"` |
| **Ilustrasi soal** | Area gambar (dari `images` tabel, `question_id`) ditampilkan di card terpisah di atas teks soal, rounded corner, jika tidak ada gambar area ini disembunyikan (bukan placeholder kosong) |
| **Teks soal** | Card putih terpisah di bawah ilustrasi, judul soal jelas dan center-aligned atau left-aligned tergantung panjang teks |
| **Grid opsi jawaban** | 2x2 grid warna solid (lihat 8.2) untuk `multiple_choice`/`checkbox` dengan ≤4 opsi. Kalau opsi >4, fallback ke list 1 kolom |
| **Input isian singkat** | Card putih dengan ilustrasi di atas, field teks besar di bawah, placeholder `"Tap to write answer"` atau setara Bahasa Indonesia `"Ketuk untuk menjawab"` |
| **Tombol utama (CTA)** | Full-width, warna ungu primary, rounded penuh (pill-shape), teks `"Submit Answer"`/`"Next"` sesuai konteks, selalu di bagian bawah layar, sticky |
| **Banner feedback** | Muncul full-width menutupi bagian atas layar setelah jawab: hijau `"Correct!"` + poin didapat, atau merah `"Incorrect!"` + pesan ringan (contoh: `"That was close"`) — durasi tampil singkat (1.5–2 detik) sebelum lanjut otomatis atau via tombol Next |
| **Highlight opsi setelah jawab** | Opsi yang dipilih dapat border/checkmark, opsi yang benar (kalau beda dari yang dipilih) tetap ditandai hijau supaya user belajar dari kesalahan |

### 8.5 Layar Pendukung

| Layar | Kebutuhan |
|---|---|
| **Landing/Splash Quiz** | Logo/nama quiz center, background solid warna tema form (`theme_color`), status "Loading..." dengan progress bar tipis saat menyiapkan soal |
| **Lobby/menunggu mulai** *(hanya kalau ada jadwal `starts_at` di masa depan)* | Tampilkan waktu tersisa sampai quiz dibuka, bukan daftar pemain live (karena bukan multiplayer) — sederhanakan dari referensi, cukup countdown ke `starts_at` |
| **Hasil akhir** | Skor akhir besar dan jelas, opsional daftar peringkat (`GET /forms/{id}/results` diurutkan skor) ditampilkan sebagai read-only leaderboard setelah submit — **bukan** leaderboard real-time selama pengerjaan |
| **Expired/Ditutup** | Pesan jelas kenapa tidak bisa akses (belum dibuka / sudah tutup / sudah pernah submit), tanpa nada menyalahkan pengguna |

### 8.6 Mode Form/Survey & Dashboard Admin (Beda dari 8.1–8.5)

Dashboard admin (web maupun mobile) dan pengisian **Form** (bukan Quiz) **tidak** memakai gaya penuh warna di atas. Aturan:
- Palet tetap pakai `--color-primary` sebagai aksen, tapi mayoritas UI putih/netral (gaya form profesional, bukan gamified)
- Tidak ada feedback banner besar berwarna — cukup toast/snackbar kecil untuk konfirmasi aksi (misal "Form disimpan")
- Layout tabel dan card standar dashboard (list, filter, form input konvensional)
- Prinsip: **admin butuh efisiensi dan kejelasan data, responden Quiz butuh pengalaman menyenangkan** — jangan tukar prinsip ini

### 8.7 Referensi Visual

Lampiran gambar (mobile quiz app mockup) menjadi acuan visual utama untuk Section 8.1–8.5. Kalau ada ambiguitas antara deskripsi teks di atas dan gambar, **gambar yang jadi rujukan akhir** untuk proporsi, warna, dan tata letak — teks di atas adalah interpretasi/terjemahan sistematisnya.

---

## 9. Non-Functional Requirements

Mengacu penuh ke `requirement-analysis.md` Section 5 (Performance, Reliability, Security, Availability, Maintainability, Scalability, Compatibility) — tidak diulang di sini, tapi ditegaskan 3 yang paling kritikal untuk agent:

1. **Response time API < 500ms** untuk operasi CRUD biasa (di luar export file)
2. **Auto-save tidak boleh blocking UI** — kirim di background, tampilkan indikator kecil kalau gagal (bukan alert mengganggu)
3. **Semua endpoint yang butuh auth WAJIB divalidasi backend**, jangan hanya disembunyikan di frontend (contoh: tombol edit form disembunyikan di UI tidak cukup, endpoint `PUT /forms/{id}` harus tetap cek kepemilikan)

---

## 10. Kriteria Sukses (Definition of Done per Rilis)

Sebuah fitur dianggap **selesai** kalau memenuhi semua ini, bukan hanya "UI sudah jadi":

- [ ] Endpoint terkait sudah sesuai `api-contract.md` (status code, struktur response, error handling)
- [ ] Berfungsi di web **dan** Android (untuk fitur yang scope-nya lintas platform)
- [ ] UI mengikuti Section 8 (kalau bagian dari flow pengerjaan quiz) atau gaya dashboard standar (kalau bagian admin)
- [ ] Validasi backend ada, bukan cuma validasi form frontend
- [ ] Sudah dites alur end-to-end minimal 1x (bukan cuma per-komponen terisolasi)
- [ ] Tidak menambah tipe data/kolom baru ke skema database tanpa dicatat sebagai perubahan resmi ke dokumen skema

---

## 11. Batasan & Asumsi

- Sistem asynchronous per-peserta, bukan live session terkontrol host (lihat Section 4 Out-of-Scope)
- Waktu server jadi rujukan tunggal untuk semua perhitungan timer, bukan waktu device klien
- Backend asli belum selesai — pengembangan frontend memakai mock API (`https://quizary-dump.vercel.app/docs`) sesuai kontrak yang sama, tanpa mengubah cara pemanggilan endpoint saat backend asli menggantikannya

---

## 12. Risiko

| Risiko | Mitigasi |
|---|---|
| Frontend dan mock API drift dari kontrak asli seiring waktu | `api-contract.md` jadi acuan tunggal, update dokumen dulu sebelum ubah endpoint di kode manapun |
| Referensi UI (gamified) disalahartikan berlaku juga untuk dashboard admin | Section 8.6 secara eksplisit memisahkan aturan — agent wajib cek konteks halaman sebelum apply style Section 8.1–8.5 |
| Tipe soal baru (slider/puzzle/dsb) ditambahkan tanpa migrasi skema resmi | Section 7.4 melarang ini secara eksplisit |

---

## 13. Roadmap Implementasi

Mengikuti 10 fase yang sudah disepakati di todo list (Fase 1 Fondasi s.d. Fase 10 Responsive & Polish) — tidak diulang di sini, gunakan dokumen todo sebagai jadwal kerja teknis, dokumen ini sebagai acuan **apa** dan **kenapa**, todo list sebagai acuan **kapan** dan **urutan**.

---

## 14. Struktur Database 
-- ============================================
-- Quizary Database Structure
-- ============================================

-- 1. USERS
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin','user') DEFAULT 'user',
    avatar VARCHAR(255) NULL,
    email_verified_at TIMESTAMP NULL,
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

-- 2. FORMS (form/quiz utama)
CREATE TABLE forms (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,
    type ENUM('form','quiz') DEFAULT 'form',
    status ENUM('draft','published','closed') DEFAULT 'draft',

    short_code VARCHAR(20) UNIQUE NOT NULL,
    require_login BOOLEAN DEFAULT FALSE,

    theme_color VARCHAR(20) NULL,
    banner_path VARCHAR(255) NULL,
    thank_you_message TEXT NULL,

    timer_seconds INT NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,

    shuffle_questions BOOLEAN DEFAULT FALSE,
    shuffle_options BOOLEAN DEFAULT FALSE,
    submission_limit ENUM('unlimited','once') DEFAULT 'unlimited',
    show_leaderboard BOOLEAN DEFAULT FALSE,
    is_restricted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_forms_user (user_id)
);

-- 3. QUESTIONS
CREATE TABLE questions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    form_id BIGINT UNSIGNED NOT NULL,
    type ENUM('multiple_choice','checkbox','short_answer','essay') NOT NULL,
    question_text TEXT NOT NULL,
    points INT DEFAULT 0,
    is_scored BOOLEAN DEFAULT TRUE,
    order_index INT DEFAULT 0,
    is_required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,

    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    INDEX idx_questions_form (form_id)
);

-- 4. QUESTION OPTIONS (untuk multiple_choice & checkbox)
CREATE TABLE question_options (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id BIGINT UNSIGNED NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    order_index INT DEFAULT 0,

    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    INDEX idx_options_question (question_id)
);

-- 5. SUBMISSIONS (1 pengisian form = 1 row)
CREATE TABLE submissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    form_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    respondent_name VARCHAR(100) NULL,
    respondent_email VARCHAR(150) NULL,
    ip_address VARCHAR(45) NULL,

    status ENUM('in_progress','submitted','auto_submitted','cheating') DEFAULT 'in_progress',
    score DECIMAL(8,2) NULL,
    max_score DECIMAL(8,2) NULL,
    tab_exit_count INT DEFAULT 0,

    started_at DATETIME NULL,
    submitted_at DATETIME NULL,

    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,

    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_submissions_form (form_id),
    INDEX idx_submissions_user (user_id)
);

-- 6. ANSWERS (jawaban per soal, auto-save update disini)
CREATE TABLE answers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    submission_id BIGINT UNSIGNED NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    answer_text TEXT NULL,
    is_correct BOOLEAN NULL,
    points_earned DECIMAL(8,2) NULL,

    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,

    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_submission_question (submission_id, question_id)
);

-- 7. ANSWER_OPTIONS (opsi mana yg dipilih, checkbox bisa multi)
CREATE TABLE answer_options (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    answer_id BIGINT UNSIGNED NOT NULL,
    option_id BIGINT UNSIGNED NOT NULL,

    FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES question_options(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_answer_option (answer_id, option_id)
);

-- 8. SUBMISSION_QUESTION_ORDER (hasil shuffle soal, per submission)
CREATE TABLE submission_question_order (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    submission_id BIGINT UNSIGNED NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    order_index INT NOT NULL,

    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_sub_question (submission_id, question_id)
);

-- 9. SUBMISSION_OPTION_ORDER (hasil shuffle opsi, per submission)
CREATE TABLE submission_option_order (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    submission_id BIGINT UNSIGNED NOT NULL,
    option_id BIGINT UNSIGNED NOT NULL,
    order_index INT NOT NULL,

    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES question_options(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_sub_option (submission_id, option_id)
);

-- 10. IMAGES (gambar untuk soal & opsi, mendukung galeri, file/link)
CREATE TABLE images (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id BIGINT UNSIGNED NULL,
    option_id BIGINT UNSIGNED NULL,

    path VARCHAR(255) NOT NULL,
    order_index INT DEFAULT 0,

    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,

    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES question_options(id) ON DELETE CASCADE,
    INDEX idx_images_question (question_id),
    INDEX idx_images_option (option_id),

    CONSTRAINT chk_images_owner CHECK (
        (question_id IS NOT NULL AND option_id IS NULL)
        OR
        (question_id IS NULL AND option_id IS NOT NULL)
    )
);

## Riwayat Revisi

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal — menggabungkan requirement analysis, struktur database, API contract, dan design system dari referensi visual menjadi satu dokumen acuan tunggal |
| 1.1 | Sistem poin quiz: kolom `questions.is_scored`, pool 100, redistribusi otomatis, konversi tipe form↔quiz, aturan publish (min 1 soal) berlaku juga di `PUT /forms/{id}` |
| 1.2 | Leaderboard opsional (`forms.show_leaderboard`), mode fullscreen anti-cheat (`forms.is_restricted` + `submissions.tab_exit_count` + status `cheating`), rantai setting auto-coerce (restricted→once→login), QR share di frontend |
| 1.3 | Answer key essay/short_answer quiz (`questions.answer_key`): cocok-salah-satu contains case-insensitive → poin penuh, else 0; `is_scored` wajib berkunci; owner-only |
| 1.4 | Opsi "Lainnya" MC/checkbox (`questions.allow_other`, opt-in creator): teks ketikan (maks 500 char) tersimpan bersama opsi; selalu `(False, 0)` tapi dihitung menjawab; tampil di hasil "Lainnya: {teks}" |
| 1.5 | AI: `answer_key` selalu null dari generate (creator isi saat review draf), `allow_other` on hanya bila user minta; `ai/accept` teruskan keduanya dengan validasi bernomor bagian/soal |

# API Contract — Form & Quiz Maker

Format tiap endpoint: **Method Path**, Auth, Request Body, Response Body, Status Code.
`Auth: -` = publik, `Auth: Bearer Token` = wajib login.

---

## 1. Authentication

### `POST /register`
Auth: -
```json
// Request
{
  "name": "Ahmad Faqih",
  "email": "faqih@sekolah.sch.id",
  "password": "password123",
  "password_confirmation": "password123"
}
```
```json
// Response 201 — akun dibuat, kode OTP dikirim ke email. BELUM ada token.
// Client harus lanjut ke POST /otp/verify untuk auto-login.
{
  "message": "A verification code has been sent to your email.",
  "email": "faqih@sekolah.sch.id"
}
```
```json
// Response 409 (email sudah terdaftar)
{ "message": "Email already registered" }
```
```json
// Response 500 (email gagal terkirim — akun tetap ada, gunakan /otp/resend)
{ "message": "Failed to send the verification email. Please request a new code." }
```

### `POST /otp/verify`
Auth: - (verify kode dari email → berhasil langsung auto-login)
```json
// Request
{ "email": "faqih@sekolah.sch.id", "code": "483920" }
```
```json
// Response 200
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "name": "Ahmad Faqih", "email": "faqih@sekolah.sch.id", "role": "user", "avatar": null }
}
```
```json
// Response 400 (kode salah / percobaan habis)
{ "message": "Invalid verification code." }
// Response 404 (user tidak ditemukan)
{ "message": "User not found" }
// Response 409 (sudah verified sebelumnya)
{ "message": "Email is already verified" }
// Response 410 (kode tidak ada / expired)
{ "message": "Verification code has expired. Request a new one." }
```

### `POST /otp/resend`
Auth: - (buat kode baru + kirim ulang; cooldown 60 detik)
```json
// Request
{ "email": "faqih@sekolah.sch.id" }
```
```json
// Response 200
{ "message": "A new verification code has been sent to your email." }
```
```json
// Response 404 (user tidak ditemukan)
{ "message": "User not found" }
// Response 409 (sudah verified)
{ "message": "Email is already verified" }
// Response 429 (masih dalam cooldown)
{ "message": "Please wait before requesting a new code." }
```

### `POST /login`
Auth: -
```json
// Request
{ "email": "faqih@sekolah.sch.id", "password": "password123" }
```
```json
// Response 200
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "name": "Ahmad Faqih", "role": "user", "avatar": null }
}
```
```json
// Response 401
{ "message": "Invalid email or password" }
// Response 403 (akun belum verifikasi OTP — arahkan ke halaman OTP)
{ "message": "Email is not verified. Please verify with the OTP code sent to your email." }
```

### `POST /logout`
Auth: Bearer Token
```json
// Response 200
{ "message": "Logged out successfully" }
```

### `GET /me`
Auth: Bearer Token
```json
// Response 200
{ "id": 1, "name": "Ahmad Faqih", "email": "faqih@sekolah.sch.id", "role": "user", "avatar": null }
```

### `PUT /me`
Auth: Bearer Token — `multipart/form-data`
```
// Request (form-data)
name: "Ahmad Faqih Ar Rifa'i"
avatar: <file.png>   (opsional)
```
```json
// Response 200
{ "id": 1, "name": "Ahmad Faqih Ar Rifa'i", "email": "faqih@sekolah.sch.id", "role": "user", "avatar": "http://localhost:8000/uploads/avatars/abc123.png" }
```

### `POST /me/avatar`
Auth: Bearer Token — `multipart/form-data`
```
// Request (form-data)
avatar: <file.png>
```
```json
// Response 200
{ "id": 1, "name": "Ahmad Faqih", "email": "faqih@sekolah.sch.id", "role": "user", "avatar": "http://localhost:8000/uploads/avatars/abc123.png" }
```

---

## 2. Forms

### `GET /forms`
Auth: Bearer Token — mengembalikan form milik user login
Query params: `?status=published&type=quiz&page=1&per_page=10`
```json
// Response 200
{
  "data": [
    { "id": 2, "title": "Quiz Matematika Dasar", "type": "quiz", "status": "published", "short_code": "QZM002B" }
  ],
  "meta": { "total": 10, "page": 1, "per_page": 10 }
}
```

### `POST /forms`
Auth: Bearer Token
```json
// Request
{
  "title": "Quiz Matematika Dasar",
  "description": "Quiz materi aljabar",
  "type": "quiz",
  "require_login": false,
  "submission_limit": "once",
  "show_leaderboard": true,
  "is_restricted": true,
  "scoring_mode": "auto",
  "timer_seconds": 600
}
```
```json
// Response 201
{
  "id": 2,
  "title": "Quiz Matematika Dasar",
  "description": "Quiz materi aljabar",
  "type": "quiz",
  "status": "draft",
  "short_code": "QZM002B",
  "require_login": false,
  "theme_color": null,
  "banner_path": null,
  "thank_you_message": null,
  "timer_seconds": null,
  "starts_at": null,
  "ends_at": null,
  "shuffle_questions": false,
  "shuffle_options": false,
  "submission_limit": "once",
  "show_leaderboard": false,
  "is_restricted": false,
  "scoring_mode": "auto",
  "created_at": "30-07-2026 18:00:00",
  "updated_at": "30-07-2026 18:00:00"
}
```
> Setiap form baru otomatis mendapat satu section default **"Bagian 1"** (`order_index=0`) —
> langsung bisa dipakai untuk mengelompokkan soal ber-cerita tanpa membuat section manual.

### `GET /forms/{id}`
Auth: Bearer Token (pemilik)
```json
// Response 200
{
  "id": 2,
  "title": "Quiz Matematika Dasar",
  "description": "Quiz materi aljabar",
  "type": "quiz",
  "status": "published",
  "short_code": "QZM002B",
  "require_login": false,
  "theme_color": "#EF4444",
  "banner_path": "http://localhost:8000/uploads/banners/math-quiz.png",
  "thank_you_message": "Terima kasih telah mengerjakan quiz ini",
  "timer_seconds": 600,
  "starts_at": "30-07-2026 18:00:00",
  "ends_at": "31-07-2026 18:00:00",
  "shuffle_questions": true,
  "shuffle_options": true,
  "submission_limit": "once",
  "show_leaderboard": true,
  "is_restricted": true,
  "created_at": "30-07-2026 18:00:00",
  "updated_at": "30-07-2026 18:00:00"
}
```
```json
// Response 404
{ "message": "Form not found" }
```

### `PUT /forms/{id}`
Auth: Bearer Token (pemilik) — kirim field yang berubah saja
```json
// Request
{
  "starts_at": "30-07-2026 18:00:00",
  "ends_at": "31-07-2026 18:00:00",
  "timer_seconds": 900,
  "shuffle_questions": true
}
```
> `shuffle_questions` mengacak soal **di dalam tiap section saja** — urutan antar-section
> selalu dipertahankan (section 1 penuh dulu, lalu section 2, dst.). Grup soal ber-cerita
> tetap satu blok utuh. Timer (`timer_seconds`) tidak di-reset saat ganti tipe quiz ↔ form.
```json
// Response 200 — mengembalikan full form object (sama seperti GET)
{
  "id": 2,
  "title": "Quiz Matematika Dasar",
  "type": "quiz",
  "status": "draft",
  "short_code": "QZM002B",
  "starts_at": "30-07-2026 18:00:00",
  "ends_at": "31-07-2026 18:00:00",
  "timer_seconds": 900,
  "shuffle_questions": true,
  "shuffle_options": false,
  ...
}
```
```json
// Response 403
{ "message": "You are not the owner of this form" }
```
```json
// Response 404
{ "message": "Form not found" }
```
```json
// Response 422 — status diubah ke "published" tapi form belum punya soal
{ "message": "Form must have at least 1 question before publishing" }
```

**Konversi tipe (`type`):**
- `form` → `quiz`: opsi pertama tiap soal pilihan ganda otomatis menjadi benar + poin seluruh soal direset & dibagi otomatis (pool 100).
- `quiz` → `form`: seluruh `is_correct` pada opsi direset ke `false`.

**Rantai setting (auto-coerce, berlaku di `POST /forms` & `PUT /forms/{id}`):**
- `is_restricted=true` ⇒ `submission_limit` dipaksa `"once"`.
- `submission_limit="once"` ⇒ `require_login` dipaksa `true` (identitas akun, bukan IP).
- Nilai yang ter-coerce langsung tersimpan di DB dan terlihat di respons. Creator tidak perlu mengaturnya manual.

**Penilaian quiz:** `scoring_mode` bernilai `auto` (default, pool 100 dibagi rata) atau `manual` (poin tiap soal mengikuti input creator). Mode manual menyimpan total bobot mentah, tetapi hasil akhir selalu dinormalisasi: `poin_diperoleh / total_bobot × 100`.

### `DELETE /forms/{id}`
Auth: Bearer Token (pemilik)
```json
// Response 200
{ "message": "Form and all related data have been deleted" }
```

### `PATCH /forms/{id}/publish`
Auth: Bearer Token (pemilik)
```json
// Request
{ "status": "published" }
```
```json
// Response 200
{ "message": "Form published", "short_code": "QZM002B" }
```
```json
// Response 422 (validasi gagal, misal belum ada soal)
{ "message": "Form must have at least 1 question before publishing" }
```
> Business rule yang sama juga berlaku saat `status` diubah ke `published` lewat `PUT /forms/{id}`.

### `POST /forms/{id}/banner`
Auth: Bearer Token (pemilik) — `multipart/form-data`
```
// Request (form-data)
banner: <file.png>
```
```json
// Response 200
{ "message": "Banner uploaded", "banner_path": "http://localhost:8000/uploads/banners/math-quiz.png" }
```
```json
// Response 422
{ "message": "Unsupported file format, use JPG/PNG/GIF/WEBP" }
```

### `DELETE /forms/{id}/banner`
Auth: Bearer Token (pemilik)
```json
// Response 200
{ "message": "Banner dihapus" }
```
```json
// Response 403
{ "message": "Anda bukan pemilik form ini" }
```

---

## 3. Questions

### `GET /forms/{id}/questions`
Auth: Bearer Token (pemilik)
```json
// Response 200
{
  "data": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question_text": "Berapa hasil dari 12 x 8?",
      "points": 1,
      "is_scored": true,
      "order_index": 0,
      "is_required": true,
      "section_id": null,
      "options": [
        { "id": 1, "option_text": "80", "is_correct": false, "order_index": 0, "image": null },
        { "id": 2, "option_text": "96", "is_correct": true, "order_index": 1, "image": null }
      ],
      "image": { "id": 1, "path": "http://localhost:8000/uploads/question-images/q1.png" }
    }
  ]
}
```

### `POST /forms/{id}/questions`
Auth: Bearer Token (pemilik)
```json
// Request
{
  "type": "multiple_choice",
  "question_text": "Berapa hasil dari 12 x 8?",
  "points": 1,
  "is_required": true,
  "options": [
    { "option_text": "80", "is_correct": false },
    { "option_text": "96", "is_correct": true }
  ]
}
```
```json
// Response 201 — full question object (sama seperti GET data item)
{
  "id": 1,
  "type": "multiple_choice",
  "question_text": "Berapa hasil dari 12 x 8?",
  "points": 1,
  "is_scored": true,
  "order_index": 0,
  "is_required": true,
  "options": [
    { "id": 1, "option_text": "80", "is_correct": false, "order_index": 0, "image": null },
    { "id": 2, "option_text": "96", "is_correct": true, "order_index": 1, "image": null }
  ],
  "image": null
}
```
```json
// Response 422 — misal multiple_choice tidak punya tepat 1 jawaban benar
{ "message": "multiple_choice questions must have exactly 1 correct option" }
```

### `PUT /questions/{id}`
Auth: Bearer Token (pemilik form terkait)
```json
// Request — kirim field yang berubah
{
  "question_text": "Berapa hasil dari 12 x 9?",
  "points": 2,
  "is_scored": true,
  "options": [
    { "id": 1, "option_text": "80", "is_correct": false },
    { "id": 2, "option_text": "108", "is_correct": true }
  ]
}
```
```json
// Response 200 — full question object (sama seperti POST)
{
  "id": 1,
  "type": "multiple_choice",
  "question_text": "Berapa hasil dari 12 x 9?",
  "points": 2,
  "is_scored": true,
  "order_index": 0,
  "is_required": true,
  "options": [ ... ],
  "image": null
}
```
**Aturan `is_scored`:**
- `false` → soal tidak dihitung poin (detail-only): poin dipaksa 0, dikeluarkan dari distribusi pool & dari penilaian (muncul "Not graded").
- `true` → soal ikut pool poin quiz; jika `points` tidak dikirim, kembali ke pool auto-distribusi.
- Ganti type dari `multiple_choice`/`checkbox`/`dropdown` ke `short_answer`/`essay`/`date`/`time`/`file_upload` dengan `options: []` **diperbolehkan** (opsi lama dihapus) — hanya `options` yang berisi item yang ditolak.
- Tipe soal: `multiple_choice`, `checkbox`, `dropdown` (butuh options; mc & dropdown tepat 1 correct), `short_answer`, `essay`, `date` (jawaban `YYYY-MM-DD`), `time` (jawaban `HH:MM`), `file_upload` (jawaban lewat upload file; tanpa options). `date`/`time`/`file_upload` tidak dinilai otomatis (points 0). `essay`/`short_answer` ikut dinilai otomatis **bila punya `answer_key`** (khusus quiz); tanpa kunci tetap tidak dinilai (points 0).
- **`answer_key`** (`string(1-500)`, opsional, hanya `essay`/`short_answer` quiz): satu/beberapa kunci dipisah `;`/baris baru (maks 10 kunci × 100 char). Jawaban benar bila **salah satu kunci terkandung** dalam teks jawaban (trim, lowercase, spasi dirapatkan). Cocok → poin penuh; tidak cocok → 0; tanpa kunci → tidak dinilai (`is_correct=null`). `is_scored=true` pada essay/short_answer wajib disertai kunci (422 bila tidak). Owner-only: tidak pernah muncul di payload publik/responden.
- Setiap soal bisa punya `section_id` (nullable) — kelompok soal per halaman. Section dikelola lewat `GET/POST /forms/{id}/sections`, `PATCH /sections/{id}` (rename), `PATCH /sections/reorder` (urutkan), dan `DELETE /sections/{id}`.
- Jawaban file: `POST /submissions/{id}/answers/{question_id}/file` (multipart, field `file`). Tipe diizinkan: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, png, jpg, jpeg, zip. Response `{ "answer_file": url, "filename": ... }`.

**Distribusi poin quiz (pool 100):**
- Tambah/import/hapus soal, atau toggle `is_scored` on → seluruh soal scored dibagi merata (sisa tidak habis dibagi jatuh ke soal terurut awal).
- Edit poin satu soal → poinnya dipertahankan, sisa 100 dibagi merata ke soal scored lain.

### `DELETE /questions/{id}`
Auth: Bearer Token (pemilik)
```json
// Response 200
{ "message": "Question deleted" }
```

### `PATCH /questions/reorder`
Auth: Bearer Token (pemilik)
```json
// Request — orders adalah array ID dalam urutan yang diinginkan
{
  "form_id": 2,
  "orders": [5, 3, 8]
}
```
```json
// Response 200
{ "message": "Question order updated" }
```

### `POST /forms/{id}/questions/group`
Auth: Bearer Token (pemilik)

Kelompokkan soal ber-cerita bersama (wacana) menjadi satu grup. Saat `shuffle_questions` aktif,
grup di-shuffle sebagai satu blok utuh (urutan internal tetap); cerita ditulis di `question_text`
soal dengan `order_index` terkecil di grup. Semua soal wajib satu section.
```json
// Request
{
  "question_ids": [5, 3, 8]   // min 2, tanpa duplikat, semua milik form ini & satu section
}
```
```json
// Response 200
{
  "message": "Soal berhasil dikelompokkan",
  "data": [ { "id": 5, "group_id": "b1e0...", "...": "..." } ]
}
```
Error: `404` id bukan milik form ini · `422` beda section / kurang dari 2 soal / id duplikat

### `DELETE /forms/{id}/questions/group/{group_id}`
Auth: Bearer Token (pemilik)
```json
// Response 200
{ "message": "Grup soal dihapus" }   // semua anggota kembali group_id = null
```
Error: `404` grup tidak ada pada form ini

### `PATCH /forms/{id}/questions/points`
Auth: Bearer Token (pemilik) — atur ulang poin seluruh soal dinilai sekaligus (hanya quiz)
```json
// Request
{ "points": 5 }
```
```json
// Response 200
{ "message": "Semua soal dinilai diatur ke 5 poin", "updated_count": 10 }
```
```json
// Response 403
{ "message": "Anda bukan pemilik form ini" }
```
```json
// Response 404
{ "message": "Form tidak ditemukan" }
```
```json
// Response 422 (bukan quiz)
{ "message": "Fitur ini hanya tersedia untuk tipe quiz" }
```
```json
// Response 422 (validasi field)
{ "message": "Invalid fields", "errors": [{ "points": "Input should be greater than or equal to 0" }] }
```

---

## 4. Images

### `POST /questions/{id}/images`
Auth: Bearer Token (pemilik) — `multipart/form-data`
```
// Request (form-data)
image: <file.png>
```
```json
// Response 201
{ "id": 4, "path": "http://localhost:8000/uploads/question-images/q1-uploaded.png" }
```
```json
// Response 404
{ "message": "Question not found" }
```

### `POST /options/{option_id}/images`
Auth: Bearer Token (pemilik) — `multipart/form-data`
```
// Request (form-data)
image: <file.png>
```
```json
// Response 201
{ "id": 5, "path": "http://localhost:8000/uploads/question-images/opt-1.png" }
```

### `DELETE /images/{id}`
Auth: Bearer Token (pemilik)
```json
// Response 200
{ "message": "Image deleted" }
```

### `DELETE /options/{option_id}/images/{image_id}`
Auth: Bearer Token (pemilik)
```json
// Response 200
{ "message": "Image deleted" }
```

---

## 5. Import Soal

### `POST /forms/{form_id}/import/docx`
Auth: Bearer Token (pemilik) — `multipart/form-data`
```
// Request (form-data)
file: <soal.docx>
```
```json
// Response 201 — langsung menyimpan soal dari file
{ "message": "10 question(s) imported successfully", "imported_count": 10 }
```
```json
// Response 422
{ "message": "Only .docx files are supported" }
```
```json
// Response 422 (tidak ada soal terdeteksi)
{ "message": "No questions could be imported, check document format" }
```

> **Catatan:** Tidak ada endpoint `/import/text` atau `/import/confirm`. Import langsung menyimpan soal. Untuk menambah/mengedit soal, gunakan endpoint Questions biasa.

---

## 6. Share & Access (Publik)

### `GET /q/{short_code}`
Auth: - (opsional Bearer Token untuk deteksi owner)
> Form draft/closed tetap dikembalikan (bukan 404) agar landing page bisa menampilkan pesan status. `is_owner` = `true` kalau pemilik form yang login — creator bisa preview + lihat banner info. Jadwal `starts_at`/`ends_at` sengaja TIDAK dikembalikan — penegakan jadwal lewat `/start`, countdown pengerjaan lewat `expired_at` di submission.
```json
// Response 200
{
  "id": 2,
  "title": "Quiz Matematika Dasar",
  "description": "Quiz materi aljabar",
  "type": "quiz",
  "banner_path": "http://localhost:8000/uploads/banners/math-quiz.png",
  "theme_color": "#EF4444",
  "require_login": false,
  "status": "published",
  "timer_seconds": 600,
  "question_count": 10,
  "submission_limit": "once",
  "show_leaderboard": true,
  "is_restricted": true,
  "thank_you_message": "Terima kasih telah mengerjakan quiz ini",
  "is_owner": false
}
```
```json
// Response 200 — status non-publik (draft / closed) tetap dikembalikan
{ "id": 2, "title": "Quiz Matematika Dasar", "status": "draft", "is_owner": false, ... }
```
```json
// Response 404
{ "message": "Form not found" }
```

### `GET /q/{short_code}/start`
Auth: - (atau Bearer Token kalau `require_login=true`)
> Status dicek sebelum `require_login`: form draft/closed selalu mengembalikan reason (tanpa meminta login). Owner (`is_owner=true`) boleh preview form `draft`/`closed` → `is_preview=true`. Jadwal `starts_at`/`ends_at` TIDAK bisa ditembus owner pada form `published` — waktu berlaku untuk semua user.
```json
// Response 200 (boleh mulai)
{ "can_start": true, "form_id": 2, "require_identity": true }
```
```json
// Response 200 (belum waktunya — tanpa membocorkan jam buka)
{ "can_start": false, "reason": "not_started" }
```
```json
// Response 200 (draft — belum dipublikasikan)
{ "can_start": false, "reason": "draft" }
```
```json
// Response 200 (sudah tutup — status closed ATAU melewati ends_at)
{ "can_start": false, "reason": "closed" }
```
```json
// Response 200 (owner preview — hanya untuk status draft/closed)
{ "can_start": true, "form_id": 2, "require_identity": false, "is_preview": true }
```
```json
// Response 200 (sudah pernah submit, submission_limit=once)
{ "can_start": false, "reason": "already_submitted" }
```
```json
// Response 401 (require_login=true tapi tidak ada token)
{ "message": "Login required to access this form" }
```

### `GET /q/{short_code}/leaderboard`
Auth: -
> Hanya tersedia untuk form `published` + `show_leaderboard=true`. Kalau off → **404** (tidak bocor). Submission berstatus `cheating` tidak ikut leaderboard.
```json
// Query params
?limit=10&submission_id=11
```
```json
// Response 200
{
  "total": 45,
  "data": [
    { "rank": 1, "respondent_name": "Dewi Anjani", "score": 100 },
    { "rank": 2, "respondent_name": "Budi", "score": 80 }
  ],
  "own": { "rank": 3, "respondent_name": "Cici", "score": 70, "total": 45 }
}
```
- `limit` default 10, `1–50`.
- `submission_id` opsional — kalau dikirim, `own` berisi entri/rank pengirim (untuk menyorot posisi sendiri setelah submit).
```json
// Response 404
{ "message": "Leaderboard not available" }
```

---

## 7. Submission

### `POST /submissions`
Auth: - (atau Bearer Token jika login)
```json
// Request
{
  "form_id": 2,
  "respondent_name": "Dewi Anjani",
  "respondent_email": "dewi@gmail.com"
}
```
> Jika `require_login=true`, endpoint ini **wajib** punya token (dienforce server-side) → 401.
> Jika tidak mengirim nama/email tapi punya token, nama/email otomatis diambil dari akun.
> Session anonim yang dibuat sebelum login akan di-resume & di-claim saat user login.
> Karena rantai setting: form `submission_limit="once"` selalu punya `require_login=true` (identitas = akun, bukan IP).
```json
// Response 201 — session baru
{
  "submission_id": 11,
  "started_at": "24-07-2026 17:00:00",
  "expired_at": "24-07-2026 17:10:00",
  "questions": [
    {
      "id": 3,
      "type": "checkbox",
      "question_text": "Manakah yang termasuk bilangan prima?",
      "order_index": 0,
      "is_required": true,
      "image": null,
      "options": [
        { "id": 9, "option_text": "2", "order_index": 0, "image": null },
        { "id": 11, "option_text": "7", "order_index": 1, "image": null }
      ]
    }
  ],
  "resumed": false
}
```
```json
// Response 201 — melanjutkan session yang sudah ada (tidak ada 409)
// Terjadi saat user refresh halaman atau kembali nanti
{
  "submission_id": 11,
  "started_at": "24-07-2026 17:00:00",
  "expired_at": "24-07-2026 17:10:00",
  "questions": [ ... ],
  "resumed": true
}
```
```json
// Response 403 (belum waktunya — tidak membocorkan jam buka)
{ "message": "Form is not opened" }
```
```json
// Response 410 (periode sudah berakhir)
{ "message": "Form is closed" }
```
```json
// Response 410 (session sebelumnya expired)
{ "message": "Your previous session has expired" }
```
```json
// Response 409 (submission_limit=once, sudah pernah submit)
{ "message": "You have already submitted this form" }
```

### `PATCH /submissions/{id}/autosave`
Auth: - (sesuai submission) atau Bearer Token (pemilik form)
```json
// Request (pilihan ganda/checkbox)
{ "question_id": 1, "option_ids": [2] }
```
```json
// Request (isian singkat/essay)
{ "question_id": 5, "answer_text": "I have finished my homework." }
```
```json
// Response 200
{ "message": "Answer saved", "question_id": 1 }
```
```json
// Response 410 (waktu habis — submission auto-submitted)
{ "message": "Submission time has expired" }
```
```json
// Response 409 (submission sudah selesai)
{ "message": "Submission already completed" }
```

### `POST /submissions/{id}/tab-exit`
Auth: - (sesuai submission) atau Bearer Token (pemilik form)
> Fullscreen anti-cheat (`is_restricted` quiz). Responden melaporkan tiap keluar dari tab/hilang fokus; penalti ditentukan server, bukan klien.
```json
// Response 200 — satu exit yang sudah melewati grace period 5 detik
// → submission DIKUNCI (status locked), bukan langsung 0.
// Layar responden menampilkan pesan pelanggaran; creator memutuskan lewat
// PATCH /forms/{id}/results/{submission_id}/status. Tak diputuskan 5 menit →
// sweep otomatis finalisasi sebagai cheating (nilai 0).
{
  "message": "Pelanggaran terdeteksi. Ujian dikunci sementara — menunggu keputusan pengawas.",
  "status": "locked",
  "warnings_left": 0,
  "cheat_reason": "left-fullscreen; tab-hidden",
  "locked_at": "24-07-2026 17:05:00"
}
```
```json
// Response 403 (bukan quiz / is_restricted off)
{ "message": "Fullscreen mode is not enabled for this form" }
```
```json
// Response 409 (submission sudah selesai / sedang locked)
{ "message": "Submission already completed" }
```

### `PATCH /forms/{form_id}/results/{submission_id}/status`
Auth: Bearer Token (pemilik)
> Creator mengatur ulang status hasil secara universal: membuka submission yang
> salah terkunci/tertandai, mensahkan, atau memvonis curang. `in_progress` =
> jawaban utuh, `submitted_at`/`score` dikosongkan (responden lanjut, deadline
> tetap); `submitted` = grading normal dari jawaban tersimpan; `cheating` =
> grading + **nilai 0**. Status `auto_submitted`/`locked` tidak bisa di-set manual
> (dihasilkan sistem).
```json
// Request
{ "status": "in_progress" | "submitted" | "cheating" }
```
```json
// Response 200
{ "submission_id": 11, "status": "cheating", "score": 0, "message": "Submission dinilai curang (nilai 0)" }
```
```json
// Response 422 — status di luar pilihan
{ "message": "Invalid fields", "errors": [{ "status": "String should match pattern '^(in_progress|submitted|cheating)$'" }] }
```
```json
// Response 404 — submission bukan milik form ini
{ "message": "Hasil tidak ditemukan" }
```

### `POST /submissions/{id}/submit`
Auth: - (sesuai submission) atau Bearer Token (pemilik form)
```json
// Request: (kosong, submission_id dari path)
```
```json
// Response 200
{
  "message": "Submission completed successfully",
  "status": "submitted",
  "score": 3,
  "max_score": 3
}
```
```json
// Response 200 — waktu habis (auto-submitted)
{
  "message": "Submission completed successfully",
  "status": "auto_submitted",
  "score": 3,
  "max_score": 3
}
```
```json
// Response 409
{ "message": "Submission already completed" }
```
```json
// Response 422 — soal wajib (is_required=true) belum dijawab (FR-10).
// Tidak berlaku saat auto-submit karena waktu habis.
{ "message": "Soal wajib belum dijawab: <text soal> (+N lainnya)" }
```

### `GET /submissions/{id}`
Auth: - (respondent via IP) atau Bearer Token (respondent/owner)
> Saat status masih `in_progress`, field `score`, `max_score`, `is_correct`, dan
> `points_earned` dikembalikan `null` (jawaban benar tidak boleh bocor ke responden
> sebelum submission selesai — FR-34/7.3). `tab_exit_count` + `cheat_reason` berisi
> detail pelanggaran anti-curang saat status `cheating`. Respons memuat `questions`
> LENGKAP (semua soal form) — klien mencocokkan jawaban lewat `answers` yang sparse.
```json
// Response 200
{
  "id": 11,
  "status": "submitted",
  "started_at": "24-07-2026 17:00:00",
  "expired_at": "24-07-2026 17:10:00",
  "score": 3,
  "max_score": 3,
  "submitted_at": "24-07-2026 17:08:00",
  "tab_exit_count": 0,
  "cheat_reason": null,
  "locked_at": null,
  "questions": [ ... ],
  "answers": [
    {
      "question_id": 1,
      "question_text": "Berapa hasil dari 12 x 8?",
      "question_type": "multiple_choice",
      "selected_option_ids": [2],
      "answer_text": null,
      "selected_options": ["96"],
      "is_correct": true,
      "points_earned": 1
    }
  ]
}
```

### `GET /me/submissions`
Auth: Bearer Token
```json
// Response 200
{
  "data": [
    { "id": 9, "form_title": "Survey Kepuasan Siswa", "status": "submitted", "score": null, "submitted_at": "23-07-2026 16:00:00" }
  ]
}
```

---

## 8. Result & Analytics

### `GET /forms/{id}/results`
Auth: Bearer Token (pemilik)
Query params: `?status=submitted&sort=score_desc&page=1&per_page=10`
```json
// Response 200
{
  "data": [
    { "submission_id": 1, "respondent_name": "Dewi Anjani", "score": 3, "max_score": 3, "status": "submitted", "submitted_at": "24-07-2026 17:08:00", "answer_summary": "Merah · Tambahkan dark mode", "rank": 2 }
  ],
  "meta": { "total": 25, "page": 1, "per_page": 10 }
}
```
`answer_summary` diisi untuk **form type** (pratinjau jawaban responden, dipakai kolom "Answers" di UI); untuk quiz tetap kosong. `sort=score_desc/asc` hanya relevan untuk quiz.
`rank` (posisi, 1-based) hanya terisi saat `sort=score_desc`. Status bisa `submitted` / `auto_submitted` / `cheating` (nilai 0 hasil anti-cheat, disorot di dashboard creator).

### `DELETE /forms/{id}/results`
Auth: Bearer Token (pemilik) — hapus banyak hasil sekaligus (pilih 1 pun lewat endpoint ini).
```json
// Request
{ "submission_ids": [12, 14, 15] }
```
```json
// Response 200
{ "deleted": 3, "message": "3 hasil berhasil dihapus" }
```
Id yang bukan milik form ini atau sudah terhapus **diabaikan** — `deleted` berisi jumlah yang benar-benar terhapus. Semua jawaban ikut terhapus (cascade) beserta file upload di server. `cheat_reason` pada tiap item berisi alasan flag curang.
```json
// Response 422
{ "message": "Invalid fields", "errors": [{ "submission_ids": "List should have at least 1 item" }] }
```

### `GET /forms/{id}/analytics`
Auth: Bearer Token (pemilik)

Response bergantung pada tipe form (`type` field).

**Quiz (`type: "quiz"`)** — skor & akurasi:
```json
{
  "type": "quiz",
  "total_participants": 25,
  "average_score": 2.4,
  "highest_score": 3,
  "lowest_score": 0,
  "correct_rate": 0.78,
  "wrong_rate": 0.22,
  "score_distribution": [
    { "range": "0-1", "count": 3 },
    { "range": "2-3", "count": 22 }
  ],
  "per_question_stats": [
    { "question_id": 1, "correct_count": 20, "wrong_count": 5 }
  ],
  "total_answers": 0,
  "completion_rate": 0,
  "avg_answers": 0,
  "question_stats": []
}
```

**Form (`type: "form"`)** — frekuensi jawaban:
```json
{
  "type": "form",
  "total_participants": 25,
  "total_answers": 60,
  "completion_rate": 0.92,
  "avg_answers": 2.4,
  "question_stats": [
    {
      "question_id": 1,
      "question_text": "Warna favorit?",
      "type": "multiple_choice",
      "answered": 25,
      "skipped": 0,
      "most_selected": "Biru",
      "most_selected_count": 14,
      "most_selected_pct": 56,
      "option_breakdown": [
        { "option_id": 1, "option_text": "Merah", "count": 8, "pct": 32 },
        { "option_id": 2, "option_text": "Biru", "count": 14, "pct": 56 }
      ],
      "sample_answers": []
    },
    {
      "question_id": 2,
      "question_text": "Saran Anda",
      "type": "essay",
      "answered": 10,
      "skipped": 15,
      "most_selected": null,
      "most_selected_count": 0,
      "most_selected_pct": 0,
      "option_breakdown": [],
      "sample_answers": ["Tambah fitur X", "Lebih simpel"]
    }
  ],
  "average_score": 0,
  "highest_score": 0,
  "lowest_score": 0,
  "correct_rate": 0,
  "wrong_rate": 0,
  "score_distribution": [],
  "per_question_stats": []
}
```

### `GET /forms/{id}/export/excel`
Auth: Bearer Token (pemilik)
```
// Response 200
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="hasil-QZM002B.xlsx"
[binary file]
```
**Struktur kolom (dinamis):** satu kolom per soal (header = teks soal, urut `order_index`), lalu kolom `Dikirim`, `Skor`, `Status`. Jawaban pilihan ganda/checkbox digabung dengan `", "`; teks bebas diambil dari `answer_text`. Baris kosong diisi `-`. Kolom responden/email tidak disertakan.
**Styling:** header di-highlight (fill `#6C5CE7`, teks putih tebal), border tipis di semua sel, `wrap_text` aktif, baris header di-freeze.

---

## 9. Dashboard

### `GET /dashboard/summary`
Auth: Bearer Token
```json
// Response 200
{
  "total_forms": 6,
  "total_quiz": 4,
  "total_submissions": 48,
  "total_respondents": 40,
  "recent_forms": [
    { "id": 2, "title": "Quiz Matematika Dasar", "status": "published", "submission_count": 12 }
  ],
  "submission_trend": [
    { "form_id": 2, "title": "Quiz Matematika Dasar", "count": 12 },
    { "form_id": 5, "title": "Pendaftaran Lomba Sains", "count": 9 }
  ]
}
```

---

## Daftar Semua Endpoint

| Method | Path | Auth | Keterangan |
|--------|------|------|------------|
| POST | `/api/register` | - | Daftar akun baru (kirim OTP email, tanpa token) |
| POST | `/api/otp/verify` | - | Verifikasi kode OTP → auto-login |
| POST | `/api/otp/resend` | - | Kirim ulang kode OTP (cooldown 60s) |
| POST | `/api/login` | - | Login (403 bila email belum verifikasi) |
| POST | `/api/logout` | Bearer | Logout (revoke token) |
| GET | `/api/me` | Bearer | Profil user |
| PUT | `/api/me` | Bearer | Update profil (multipart/form-data) |
| POST | `/api/me/avatar` | Bearer | Upload avatar (multipart/form-data) |
| GET | `/api/forms` | Bearer | Daftar form milik user |
| POST | `/api/forms` | Bearer | Buat form baru |
| GET | `/api/forms/{id}` | Bearer | Detail form |
| PUT | `/api/forms/{id}` | Bearer | Update form (partial) |
| DELETE | `/api/forms/{id}` | Bearer | Hapus form + seluruh data terkait |
| PATCH | `/api/forms/{id}/publish` | Bearer | Ubah status publikasi |
| POST | `/api/forms/{id}/banner` | Bearer | Upload banner (multipart/form-data) |
| GET | `/api/forms/{id}/questions` | Bearer | Daftar soal form |
| POST | `/api/forms/{id}/questions` | Bearer | Tambah soal |
| GET | `/api/forms/{id}/sections` | Bearer | Daftar section (kelompok soal) |
| POST | `/api/forms/{id}/sections` | Bearer | Tambah section |
| PATCH | `/api/sections/{id}` | Bearer | Ubah nama section |
| DELETE | `/api/sections/{id}` | Bearer | Hapus section (soal tetap ada) |
| PATCH | `/api/sections/reorder` | Bearer | Urutkan ulang section |
| POST | `/api/submissions/{id}/answers/{question_id}/file` | Bearer/anon | Upload jawaban file |
| GET | `/api/forms/{id}/results` | Bearer | Hasil submission (pemilik) |
| GET | `/api/forms/{id}/analytics` | Bearer | Statistik (pemilik) |
| GET | `/api/forms/{id}/export/excel` | Bearer | Export Excel (pemilik) |
| POST | `/api/forms/{id}/import/docx` | Bearer | Import soal dari .docx |
| PUT | `/api/questions/{id}` | Bearer | Update soal |
| DELETE | `/api/questions/{id}` | Bearer | Hapus soal |
| PATCH | `/api/questions/reorder` | Bearer | Urutkan ulang soal |
| POST | `/api/forms/{id}/questions/group` | Bearer | Kelompokkan soal ber-cerita bersama |
| DELETE | `/api/forms/{id}/questions/group/{group_id}` | Bearer | Bubarkan grup soal |
| PATCH | `/api/forms/{id}/questions/points` | Bearer | Atur ulang poin seluruh soal dinilai (quiz only) |
| POST | `/api/questions/{id}/images` | Bearer | Upload gambar soal (multipart/form-data) |
| POST | `/api/options/{id}/images` | Bearer | Upload gambar opsi (multipart/form-data) |
| DELETE | `/api/images/{id}` | Bearer | Hapus gambar |
| DELETE | `/api/options/{id}/images/{image_id}` | Bearer | Hapus gambar opsi |
| POST | `/api/submissions` | - | Mulai sesi/submit baru |
| PATCH | `/api/submissions/{id}/autosave` | - | Autosave jawaban |
| POST | `/api/submissions/{id}/tab-exit` | - | Laporkan keluar dari tab (anti-cheat) |
| POST | `/api/submissions/{id}/submit` | - | Kumpulkan jawaban |
| GET | `/api/submissions/{id}` | - | Detail submission + jawaban |
| GET | `/api/me/submissions` | Bearer | Riwayat submission user |
| GET | `/api/q/{short_code}` | - | Info form publik |
| GET | `/api/q/{short_code}/start` | - | Cek bisa mulai/tidak |
| GET | `/api/q/{short_code}/leaderboard` | - | Leaderboard publik (quiz, jika show_leaderboard) |
| GET | `/api/dashboard/summary` | Bearer | Ringkasan dashboard |

---

## Konvensi Umum

| Aspek | Aturan |
|---|---|
| Format tanggal | `d-m-Y H:i:s` WIB (UTC+7), contoh `24-07-2026 17:00:00` |
| Auth header | `Authorization: Bearer {token}` |
| Error format 422 | `{ "message": "Invalid fields", "errors": [{ "field": "pesan" }] }` |
| Error format lainnya | `{ "message": "pesan error" }` |
| Pagination | Query `?page=1&per_page=10`, response punya `meta: { total, page, per_page }` |
| ID | Integer auto-increment, kecuali `short_code` yang string |
| Upload limit | Hanya JPG/PNG/GIF/WEBP, file size tidak dibatasi di backend |
| Avatar/banner | Selalu mengembalikan full URL (`http://host/uploads/...`) |
| Image di question | `image` adalah object tunggal (gambar pertama), bukan array |

# Quizary — Android (Responden)

App responden Quizary berbasis Expo untuk mengerjakan quiz/form via QR/link. Fokus mobile-first: scan, isi, submit, lihat hasil. Mendukung mode **Restricted (`is_restricted=true`)** dengan **App Pinning (Screen Pinning / Lock Task)** khusus quiz.

> Builder admin (buat form, kelola soal, lihat hasil) tetap di web `frontend/README.md`. Android hanya untuk responden, sesuai `config/prd.md:48`.

## Tech Stack

| Kategori | Teknologi |
|---|---|
| Framework | Expo 57, React 19, React Native 0.86, expo-router 57 (file-based) |
| State & Storage | SecureStore (`expo-secure-store`), AsyncStorage, Context (`ThemeContext`, `AlertContext`) |
| UI | `expo-linear-gradient`, `expo-image`, NativeWind / StyleSheet, `lucide` / `Ionicons`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context` |
| Media & Input | `expo-camera` (QR), `expo-image-picker`, `expo-document-picker`, `expo-file-system`, `expo-audio` 57.0.4, `expo-asset` |
| Jaringan | `fetch` + `expo-constants` (`hostUri`), `X-Submission-Token` |
| Native Pin | Kotlin `AppPinningModule` (`startLockTask`/`stopLockTask`) via `plugins/with-app-pinning.js` |
| Build | EAS Build (`eas.json`), `expo-dev-client` 57.0.18 |

## Struktur Folder

```
android/
├── app.json                 # expo: name, slug, android.package, permissions, plugins
├── eas.json                 # build profiles: development (dev-client), preview (APK), production (AAB)
├── package.json             # dependencies Expo 57
├── plugins/
│   └── with-app-pinning.js  # config plugin inject Kotlin AppPinning ke MainApplication.kt
├── src/
│   ├── app/
│   │   ├── _layout.tsx      # Root layout: ThemeProvider + AlertProvider
│   │   ├── index.tsx        # Login
│   │   ├── register.tsx     # Register
│   │   ├── quiz.tsx         # Landing + pengerjaan + pin lifecycle (inti)
│   │   └── (tabs)/
│   │       ├── _layout.tsx  # Tabs navigator
│   │       ├── home.tsx     # Dashboard responden + riwayat GET /me/submissions
│   │       ├── join.tsx     # Input link / scan QR → GET /q/{code}
│   │       ├── profile.tsx  # Profile + avatar PUT /me
│   │       └── settings.tsx # Tema, bahasa
│   ├── components/
│   │   ├── quiz/            # QuizLandingStep, QuizStyleAnsweringStep, QuizQuestionCard, ViolatingLockOverlay, RestrictedWarningOverlay
│   │   ├── AudioPlayer.tsx  # expo-audio inline player
│   │   └── ui/              # QuickJoinBanner, SubmissionHistoryCard, ThemeToggleBtn
│   ├── hooks/
│   │   ├── useAppPinning.ts # pin/unpin/canPin/isExpoGo/nativeMissing
│   │   └── use-theme.ts, use-color-scheme.ts
│   ├── modules/app-pinning/
│   │   ├── AppPinningModule.kt.template
│   │   └── AppPinningPackage.kt.template
│   ├── services/api_service.ts # getPublicForm, checkCanStart, createSubmission, autosaveAnswer, lockSubmission, finalizeSubmission, uploadAnswerFile
│   ├── context/ ThemeContext, AlertContext
│   └── constants/theme.ts
└── assets/images/           # icon, splash, tabIcons
```

## Cara Menjalankan

### 1. Prasyarat

- Node 20+, `npm`
- EAS CLI `npm i -g eas-cli` + akun Expo `cruzzing`
- Backend jalan `uvicorn app.main:app --host 0.0.0.0 --port 8000` (lihat `backend/README.md`)
- Satu WiFi antara laptop & HP, atau Tunnel Cloudflare `https://*.trycloudflare.com` (sudah allow CORS di `backend/app/main.py:38`)

### 2. Install & Konfigurasi

```bash
cd android
npm install
```

`EXPO_PUBLIC_API_URL` dibaca di `src/services/api_service.ts:5` via `Constants.expoConfig.hostUri` atau `10.0.2.2` (emulator). Set manual jika Tunnel:

```bash
# contoh Cloudflare (ganti xxxx)
export EXPO_PUBLIC_API_URL=https://xxxx.trycloudflare.com/api
```

### 3. Jalankan

**Expo Go (cepat, tanpa pin):**

```bash
npx expo start
# scan QR dengan Expo Go Play Store
```

`is_restricted` tetap jalan tapi **tanpa pin** — hanya deteksi `AppState` background 5 detik → `RestrictedWarningOverlay`.

**Dev Client (wajib untuk pin):**

Pin butuh native module `AppPinning` yang tidak ada di Expo Go.

```bash
# build sekali (10-15 menit)
npx eas build --profile development --platform android --clear-cache
# install APK hasil build di HP

# jalan dengan dev client
npx expo start --dev-client
# buka app Quizary Dev Client di HP → Scan QR dari terminal ini
```

**Prebuild lokal (cek native tanpa EAS):**

```bash
npx expo prebuild --clean --no-install
# cek android/android/app/src/main/java/com/qynatech/Quizary/AppPinningModule.kt ada
# cek android/android/app/src/main/java/com/qynatech/Quizary/MainApplication.kt ada import AppPinningPackage
```

## Routes

| Path | Halaman | Akses |
|---|---|---|
| `/` | Login (`app/index.tsx`) | Publik |
| `/register` | Register (`app/register.tsx`) | Publik |
| `/(tabs)/home` | Dashboard responden (`home.tsx`) — riwayat `GET /me/submissions` | Auth (Bearer) |
| `/(tabs)/join` | Join quiz — input link / scan QR (`join.tsx` → `GET /q/{code}`, `GET /q/{code}/start`) | Publik/Auth |
| `/quiz?shortCode=` | Landing + pengerjaan (`quiz.tsx`) — identity, timer, autosave, submit | Publik/Restricted |
| `/(tabs)/profile` | Profil + avatar (`profile.tsx` → `PUT /me`) | Auth |
| `/(tabs)/settings` | Pengaturan tema/bahasa | Auth |

`quiz.tsx:1` menangani query `shortCode`, fetch `getPublicForm` + `checkCanStart`, buat `POST /submissions`, autosave `PATCH /submissions/{id}/autosave`, upload `POST /submissions/{id}/answers/{qid}/file`, lock `POST /submissions/{id}/lock`, submit `POST /submissions/{id}/submit`.

## Fitur Pin & Anti-Cheat (Restricted Mode)

Hanya untuk `type='quiz'` + `forms.is_restricted=true` (`backend/app/models/form.py:61`, rantai auto-coerce `is_restricted→once→require_login` di `config/prd.md:117`).

| Aspek | Detail |
|---|---|
| **Trigger** | `publicForm.is_restricted && type==='quiz'` di `quiz.tsx:116` |
| **Pin** | `src/hooks/useAppPinning.ts:41` `pin()` → Kotlin `AppPinningModule.kt:21` `reactContext.currentActivity.startLockTask()` tepat setelah `createSubmission()` sukses (`quiz.tsx:384`) |
| **Unpin** | `unpin()` → `stopLockTask()` saat `finalizeSubmission` sukses, timeout `expired_at`, tombol Close, `cheating/submitted` di `handleCheckLockedStatus`, dan `useEffect` unmount |
| **Fallback Expo Go** | `canPin=false`, `isExpoGo=true` (`Constants.appOwnership==='expo'`) → skip pin, tampil info "Pin hanya di Dev Client", tetap pakai `AppState` background 5 detik → `RestrictedWarningOverlay` |
| **Native tidak ter-link** | `nativeMissing=true` → alert "Native pin tidak terpasang. Rebuild --clear-cache." (membedakan dari Expo Go) |
| **Back Handler** | `BackHandler` block hardware back saat pin (`quiz.tsx:174`) — hint "Tekan Recent lama + Back untuk keluar (akan terkunci)" |
| **Perilaku sistem** | Tanpa Device Owner: dialog "Pin this app?" + user bisa unpin via **Recent lama + Back** → langsung `POST /submissions/{id}/lock` → `status='locked'` menunggu `PATCH /forms/{id}/results/{sid}/status` pengawas (5 menit sweep auto `cheating` di backend `services/session_expiry.py`) |
| **Android** | `minSdk 24` (Expo 57), `startLockTask` sejak API 21, `targetSdk 36`, Kotlin 2.1.20. Permissions `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` di `app.json:26` |
| **Upload file saat pin** | `handlePickFile` via `expo-image-picker` / `uploadAnswerFile` — di mode pin tetap pin, picker jalan karena satu task; jika terblok di beberapa OEM → disable upload saat `is_restricted` |

## Build & Distribusi

| Profile `eas.json:7` | Perintah | Hasil | Kegunaan |
|---|---|---|---|
| `development` | `npx eas build --profile development --platform android --clear-cache` | APK Dev Client | Test pin, hot-reload `npx expo start --dev-client` |
| `preview` | `npx eas build --profile preview --platform android` | APK | Internal tester |
| `production` | `npx eas build --profile production --platform android` | AAB | Play Store |

**Validasi sebelum build:**

```bash
npx tsc --noEmit --skipLibCheck
npx expo-doctor
```

**Test checklist pin (wajib sebelum rilis):**

1. Dev Client + quiz `is_restricted=true` → dialog Pin → Home/Recent terblok → Recent lama+Back → `ViolatingLockOverlay` `locked`
2. Tanpa keluar → Submit / timeout → auto `unpin()` → Home normal
3. `is_restricted=false` → tidak pernah pin
4. Expo Go + `is_restricted=true` → tidak pin, hanya warning 5 detik
5. `npx expo prebuild --clean` → verifikasi `MainApplication.kt` ada `AppPinningPackage`

## Referensi & Troubleshooting

- **PRD**: `config/prd.md:117` mode `is_restricted` + `config/api-contract.md` `GET /q/{code}/start`, `POST /submissions`, `POST /submissions/{id}/lock`
- **Backend**: `backend/README.md` Submissions (`in_progress`/`locked`/`cheating`/`submitted`/`auto_submitted`), `backend/app/models/form.py:61` `is_restricted`
- **Frontend**: `frontend/README.md` Routes `/q/:shortCode`, `/s/:submissionId` (logika timer & autosave sama)

**Troubleshooting:**

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Mode Expo Go` di Dev Client | Salah `npx expo start` (bukan `--dev-client`) | `npx expo start --dev-client` |
| `Native pin tidak terpasang` | Build lama / case `Quizary` vs `quizary` | `npx eas build --profile development --clear-cache` |
| `Gagal terhubung ke server.` | `EXPO_PUBLIC_API_URL` salah / beda WiFi / firewall | Cek `Constants.expoConfig.hostUri`, pakai `trycloudflare.com` atau LAN `192.168.x.x` |
| `libexpo-av.so` crash | `expo-av` deprecated | Sudah fix: `npm uninstall expo-av`, pakai `expo-audio` (`AudioPlayer.tsx:21`) |
| `compileDebugKotlin FAILED currentActivity` | Plugin lama `currentActivity` | Sudah fix: `reactContext.currentActivity` (`AppPinningModule.kt.template:21`) |

**Debug pin:**

```bash
adb logcat | grep -E "AppPinning|ReactNativeJS"
```

Cek `NativeModules.AppPinning` ada via `npx expo start --dev-client` Dev Tools → jika `undefined` berarti `plugins/with-app-pinning.js` belum inject → `npx expo prebuild --clean` cek `MainApplication.kt`.

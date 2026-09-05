# Quizary — Android (Expo 57)

App responden Quizary. Fokus mengerjakan quiz/form via QR/link, termasuk mode **Restricted (is_restricted=true)** dengan **App Pinning (Screen Pinning / Lock Task)**.

## Prasyarat
- Node 20+, `npm`, EAS CLI (`npm i -g eas-cli`)
- Akun Expo (`cruzzing`, projectId `0a9cf652-3b6c-4f6c-8af9-4d37ffd95b4e`)

## Setup
```bash
cd android
npm install
cp .env.example .env  # atau set EXPO_PUBLIC_API_URL=http://<IP_LAN>:8000/api
```

`EXPO_PUBLIC_API_URL` wajib benar (LAN IP, bukan localhost). Tanpa itu `src/services/api_service.ts:5` auto-detect dari `hostUri` atau `10.0.2.2`.

## Menjalankan

### Expo Go (cepat, tanpa pinning)
```bash
npx expo start
# scan QR dengan Expo Go
```
Mode `is_restricted` tetap jalan tapi **tanpa pin** — hanya warning 5 detik `RestrictedWarningOverlay` jika keluar app (fallback).

### Dev Client (wajib untuk test pinning)
Pinning butuh native module `AppPinning` (`plugins/with-app-pinning.js` + `src/modules/app-pinning/`), tidak ada di Expo Go.

```bash
# build dev client sekali
eas build --profile development --platform android
# install APK hasil build di HP, lalu:
npx expo start --dev-client
```

## App Pinning — Restricted Mode

- Trigger: `forms.is_restricted=true` (hanya untuk `type='quiz'`, auto-coerce `once`+`require_login` di backend `app/models/form.py:61`)
- Pin: `src/hooks/useAppPinning.ts` → `NativeModules.AppPinning.startPinning()` (`startLockTask()`) tepat setelah `createSubmission()` sukses di `src/app/quiz.tsx:324`
- Unpin: `stopLockTask()` saat submit / auto-submit timeout / close / expired / `cheating` / unmount
- Fallback: `canPin=false` di Expo Go/Web/iOS → skip pin, tampil banner info
- Android: API 24+ (minSdk Expo 57), `startLockTask()` ada sejak API 21. Tanpa Device Owner: sistem tampil dialog "Pin this app?" dan user bisa unpin via **Recent lama + Back** (akan langsung `POST /submissions/{id}/lock` → `status='locked'` menunggu pengawas, sesuai flow lama `quiz.tsx:222` AppState).

### Build APK untuk distribusi
```bash
eas build --profile preview --platform android   # APK internal
eas build --profile production --platform android # AAB store
```

### Test checklist restricted
1. Expo Go + quiz `is_restricted=true` → tidak ke-pin, keluar app 5 detik → `ViolatingLockOverlay`
2. Dev Client + quiz `is_restricted=true` → dialog pin → Home/Recent terblok → long-press Recent+Back → unpin → `locked`
3. Submit / timeout → auto unpin → kembali home
4. `is_restricted=false` → tidak pernah pin

## Struktur Penting
- `plugins/with-app-pinning.js` — config plugin inject Kotlin
- `src/modules/app-pinning/*.kt.template` — source Kotlin `AppPinningModule`/`AppPinningPackage`
- `src/hooks/useAppPinning.ts` — wrapper JS
- `src/app/quiz.tsx` — lifecycle pin/unpin + `BackHandler`
- `src/components/quiz/RestrictedWarningOverlay.tsx` — teks dinamis pin/Expo Go

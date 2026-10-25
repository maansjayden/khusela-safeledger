# Khusela (SafeLedger) — FNB App of the Year Hackathon 2026

**Track:** Safer Communities & GBV Response  
**Camouflage Persona:** *Mzansi Smart-Budget* (South African Household Grocery & 15% VAT Calculator)

---

## Core Architecture & Features

1. **Single-Route Camouflaged PWA (`/`)**
   - Renders a functional South African ZAR (`R`) grocery & 15% VAT calculator with installable PWA icons (`192x192`, `512x512`, maskable, and Apple touch icon) and zero URL/history leaks.
   - **Duress PIN (`9999` + `=`)**: Keeps the calculator on screen, acquires the **Screen Wake Lock API** (re-acquiring on tab visibility changes), and triggers `POST /api/v1/sos/trigger` to call and SMS the configured **Trusted Contact** with a live Google Maps link when device GPS is available. Never dials real emergency shortcodes (`10111`, `10177`, `112`, `0800428428`) and never substitutes fake default coordinates when GPS is unavailable.
   - **Vault PIN (`2580` + `=`)**: Unlocks the **Khusela Vault** using the entered PIN in memory to derive the PBKDF2 encryption key.
   - **Quick Exit (`<16ms`), Volume-Down Rocker & 3-Strike Shredder**: **QUICK EXIT**, pressing the **Volume Down** key (`AudioVolumeDown` / `VolumeDown` / `Escape` or the interactive Volume-Down rocker on the desktop phone simulator frame), or shaking the handset immediately clears the in-memory PIN and returns to the calculator. **BURN** (or 3 consecutive failed 4-digit PIN attempts) clears and deletes the local IndexedDB store.

2. **Off-Gallery Evidence Capture & ECTA Section 15 Hashing**
   - Captures `<canvas>` WebP/PNG photos (`camera.js`), `MediaRecorder` voice notes, and written incident notes directly into IndexedDB without saving files to the phone's photo gallery.
   - Encrypts records locally using **PBKDF2-SHA256 (100,000 iterations) + AES-256-GCM** (`crypto.js`, `storage.js`) and verifies raw `SHA-256` digests + UTC server timestamps via `POST /api/v1/evidence/sync`.

3. **DoJ Form 06 (J480) Protection Order Drafting**
   - Uses **Gemini 2.5 Flash** (`google-genai`, `POST /api/v1/legal/structure`) to structure verbatim survivor notes into Section 4 fields with mandatory human confirmation before export. When offline or when Gemini is unavailable, preserves the survivor's exact notes without inventing facts.
   - Uses `pypdf` and `ReportLab` (`POST /api/v1/legal/generate-form06`) to stream the overlaid Department of Justice `dv-Form06-J480.pdf` + Annexure A exhibit schedule directly from memory (`Cache-Control: no-store`, zero temporary disk files).

---

## Environment Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and set:

```ini
GEMINI_API_KEY=your_gemini_api_key_here
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your_twilio_api_key_secret_here
TWILIO_FROM_NUMBER=+15005550006
TRUSTED_CONTACT_NUMBER=+27820000000
BASE_URL=https://your-public-host.example
```

- `TRUSTED_CONTACT_NUMBER`: The single trusted phone number that receives the SOS voice call and SMS location link.
- `TWILIO_FROM_NUMBER`: Your Twilio voice/SMS-enabled number (on a Twilio Trial account, both sender and recipient numbers must be verified under **Phone Numbers → Manage → Verified Caller IDs**).
- `BASE_URL`: Public HTTPS origin (automatically inferred from `X-Forwarded-Proto` / `Host` when served behind a reverse proxy or HTTPS tunnel).

---

## Local Development & Testing

### 1. Backend (FastAPI on `http://localhost:8000`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend (React 18 + Vite on `http://localhost:5173`)

```bash
cd frontend
npm install
npm run dev
```

To build the production PWA served directly by FastAPI on port `8000`:

```bash
cd frontend
npm run build
```

### 3. Run Automated Backend & Security Tests

```bash
backend/.venv/bin/python backend/test_api.py
```

---

## Docker Deployment (Render / Railway / Cloud Run)

A multi-stage `Dockerfile` is included at the repository root that builds the React PWA and serves both the static bundle and FastAPI endpoints on `$PORT`:

```bash
docker build -t khusela .
docker run -p 8000:8000 --env-file backend/.env khusela
```

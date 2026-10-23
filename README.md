# Khusela (SafeLedger) — FNB App of the Year Hackathon 2026

**Track:** Safer Communities & GBV Response  
**Camouflage Persona:** *Mzansi Smart-Budget* (Everyday South African Household Grocery & 15% VAT Calculator)

---

## Key Capabilities

1. **Zero-Trace Camouflaged PWA (`/` Single-Route Architecture)**
   - Renders a working South African ZAR (`R`) grocery & VAT calculator with zero suspicious URLs or browser history entries.
   - **Duress PIN (`9999` + `=`)**: Keeps the calculator on screen, silently acquires the **Screen Wake Lock API**, and fires a **Call-First, Enrich-Second** SOS alert to `POST /api/v1/sos/trigger`.
   - **Vault PIN (`2580` + `=`)**: Unlocks the dark-themed **Khusela Forensic Vault Dashboard**.
   - **Panic Exit (`<16ms`)**: Sticky coral-red button immediately zeroes in-memory state and returns to the Calculator.

2. **Gallery-Free Forensic Evidence Capture & ECTA Section 15 Integrity**
   - Captures offscreen `<canvas>` WebP photos (`camera.js`) and voice notes without ever writing to the device's OS photo gallery.
   - Encrypts payloads locally using **PBKDF2 (100,000 iterations) + AES-256-GCM** (`crypto.js`) inside IndexedDB (`storage.js`) and binds authoritative SHA-256 + UTC server timestamps via `POST /api/v1/evidence/sync`.

3. **Automated DoJ Form 06 (J480) Protection Order Generation**
   - Uses **Gemini 2.5 Flash** (`google-genai`) with `response_mime_type="application/json"` (`POST /api/v1/legal/structure`) to transform raw survivor notes into formal Section 4 legal narratives.
   - Uses `pypdf` and `ReportLab` (`POST /api/v1/legal/generate-form06`) to overlay and append a cryptographic SHA-256 evidence schedule onto the official Department of Justice `dv-Form06-J480.pdf`.

---

## Quickstart Commands

### 1. Run Backend (FastAPI on `http://localhost:8000`)

```bash
cd khusela/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Run Frontend (React 18 + Vite on `http://localhost:5173`)

```bash
cd khusela/frontend
npm install
npm run dev
```

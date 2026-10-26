# Khusela (SafeLedger): FNB App of the Year Hackathon 2026

**Track:** Safer Communities & GBV Response  
**Camouflage Persona:** *Mzansi Smart-Budget* (South African Household Grocery & 15% VAT Calculator)

---

## Live Demo

**https://khusela.lumesystems.co.za** (installable PWA, HTTPS, real device GPS).

| Action | How |
|---|---|
| Silent SOS | Type `9999` then `=` on the calculator |
| Open the vault | Type `2580` then `=` |
| Form 06 | Vault, **Form 06** tab, **Load Sample**, structure, confirm, download PDF |
| Alert preview | Vault, **Rights / SOS**, **Send test alert to contact** |

The free hosting tier sleeps after idle time, so the first load can take up to about 40 seconds.

---

## Known Limitation: Carrier Calls and SMS (Twilio)

The SOS pipeline is built for a real carrier voice call and SMS to the trusted contact via Twilio. For this hackathon we run on a **Twilio trial account with a USD 0.00 balance and no purchased number**, so the carrier leg is blocked by Twilio itself (trial accounts cannot send to unverified numbers, and cannot place calls without a funded number). This is a funding limit, not a design or code limit.

To keep the demo fully functional at zero cost, the server **fails over automatically** to a free relay when the carrier leg is unavailable:

| Channel | Demo behaviour (free) | Funded production behaviour |
|---|---|---|
| Voice call | Spoken emergency briefing plays on screen, plus a one-tap native dialer button | Automated Twilio voice call with the pre-recorded briefing |
| SMS | Full alert text with a Google Maps pin is generated and shown | Delivered by SMS to the trusted contact |
| WhatsApp | One-tap pre-filled message to the trusted contact | Same, or WhatsApp Business API |
| Location | Device GPS, with live network location when GPS is unavailable | Same, plus carrier cell-tower location |
| Offline or zero-data | USSD flow is simulated in the app | Real USSD shortcode through a mobile network aggregator |

Failures are never reported as successes: when the free relay is used, the response says so (`delivery_channel: webrtc_voice_proxy`), and the automated tests assert honest failure reporting without the fallback flag.

---

## Funding Plan: Taking It to 100% Production

If funding is awarded, this is the order we would spend it in. Costs are rough estimates and will be confirmed with quotes.

| Phase | Work | Outcome | Est. cost |
|---|---|---|---|
| **1. Week 1** | Upgrade Twilio, buy a South African capable number, register sender ID, set `TWILIO_FROM_NUMBER` | Real voice call and SMS to the trusted contact with no code changes | About R1 000 setup, then roughly R0.50 to R2 per alert |
| **2. Week 1 to 2** | Always-on hosting (no sleeping), error monitoring, uptime alerts | Reliable 24/7 service | About R150 to R400 per month |
| **3. Month 1** | Multiple trusted contacts, escalation order, delivery receipts shown in the vault | Alert reaches someone even if the first contact is unreachable | Build time only |
| **4. Month 1 to 2** | Real USSD shortcode via an aggregator, plus a low-data SMS-only trigger | Works for feature phones and users without data | Aggregator fees, to be quoted |
| **5. Month 2 to 3** | Partner integration with private security and community patrol groups for dispatch | Alert converts into a response, not only a message | Partnership based |
| **6. Month 2 to 3** | Native Android wrapper for hardware button triggers and background GPS | Faster and more discreet triggering | Developer account R400 once-off |
| **7. Ongoing** | Independent security review, POPIA compliance review, user testing with GBV support organisations | Trust and compliance for wide rollout | To be quoted |

**Why this is low risk:** every phase plugs into the architecture that already exists. The server already has the carrier call path, the free failover, the trusted-contact safety lock that blocks emergency numbers, and the evidence integrity chain. Funding turns on the paid carrier leg and adds reach and reliability, it does not require a rebuild.

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

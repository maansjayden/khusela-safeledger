# Sonke Platform Submissions & Hackathon Checklist (Khusela / SafeLedger)

Use these ready-to-copy-paste answers for your mandatory checkpoints on the **Sonke Platform (`https://sonke.gklink.co/app`)**.

---

## 1. Sonke Team Profile Fields (Do Immediately!)
*From the Programme PDF: "In order to be judged, all teams must be profiled (even if working solo)."*

- **Team Name**: `Lume Systems` (or `Khusela SafeLedger`)
- **Select Location**: `Western Cape` / `South Africa`
- **Project Name**: `Khusela (SafeLedger)`
- **Challenge Sector of Innovation**: `Safer communities and gender-based violence response`
- **Team Favorite Song**: `Nkalakatha - Mandoza` (or your choice)
- **Background (What inspired / motivated this project?)**:
  > In Q4 2025/26, SAPS recorded 9,782 rapes in South Africa, with 47.2% (4,620 cases) committed inside the victim's or perpetrator's own home, while the HSRC National GBV Study found 12.5% (1 in 8) of South African women experience economic/financial abuse. Visible safety apps or helplines that call a victim's phone back endanger survivors who co-habit with an abuser, and survivors face massive friction completing the static 12-page Department of Justice Form 06 (J480) Protection Order application.
- **Overview (What is the project about?)**:
  > Khusela (SafeLedger) is an offline-first, camouflaged Progressive Web App disguised as "Mzansi Smart-Budget" (an everyday South African ZAR grocery & 15% VAT calculator) on a single URL route (`/`) with zero browser history leaks. Entering a Duress PIN (`9999` + `=`) keeps the calculator on screen, acquires a Screen Wake Lock, and triggers a non-blocking "Call-First, Enrich-Second" outbound emergency voice briefing with foreground room-audio AI threat triage. Entering the Vault PIN (`2580` + `=`) unlocks an AES-256-GCM encrypted forensic vault featuring gallery-free `<canvas>` photo capture, longitudinal AI escalation risk scoring, multilingual Form 08 audio legal rights guidance (English, Afrikaans, isiXhosa, isiZulu), and automated 1:1 coordinate overlay onto the official Department of Justice Form 06 (J480) Protection Order PDF.
- **Technologies (List all the technologies used for the project)**:
  > React 18, Vite, Tailwind CSS, Service Workers (Offline PWA), Web Crypto API (PBKDF2 + AES-256-GCM + SHA-256), IndexedDB, HTML5 Offscreen Canvas & MediaRecorder, Screen Wake Lock API, Web Speech & Web Audio APIs, Python FastAPI, Google Gemini 2.5 Flash (`google-genai`), Twilio Programmable Voice & USSD Simulation, `pypdf`, `ReportLab`.

---

## 2. SSDLC (Secure System Development Cycle) Submission
*Copy-paste each block directly into the 4 matching fields on the Sonke Platform SSDLC form:*

### Box 1: Security Requirements (Risk Assessment)
```text
Khusela (SafeLedger) handles high-risk domestic violence forensic evidence, real-time SOS distress dispatches, and statutory Department of Justice Form 06 (J480) Protection Order affidavits. Our risk assessment identified five critical security and statutory requirements:

1. Physical Device Surveillance Risk (Co-Habitation): Because 47.2% of reported rapes in South Africa occur inside the victim's or perpetrator's home (SAPS Q4 2025/26), the primary adversary has physical access to the survivor's unlocked phone, photo gallery, call logs, browser history, and bank statements.
2. Zero-Plaintext Storage & Brute-Force Resistance: Evidence photos, voice notes, and incident narratives stored offline on the device must remain unreadable even if the device is seized or inspected, with automatic data destruction on repeated failed PIN attempts.
3. Statutory Evidentiary Integrity (ECTA Section 15 & Domestic Violence Amendment Act 14 of 2021): Digital exhibits must maintain a verifiable cryptographic chain-of-custody (SHA-256 + authoritative server UTC timestamp) without AI fabrication or hallucination in court affidavits.
4. POPIA Conditions 7 & 8 (Security Safeguards & Right to Erasure): Survivors require an instant, irreversible "Quick Burn" right-to-erasure that purges local IndexedDB ciphertext and cryptographic keys in <16ms.
5. Telecommunications & Emergency Services Protection (RICA): Automated SOS voice/SMS dispatches must never dial public emergency shortcodes (10111, 10177, 112, 911, 999, 0800 428 428) or place inbound callbacks that ring the survivor's phone.
```

### Box 2: Threat Modelling & Design Review
```text
Using STRIDE and a Co-Habitation Adversary Model, we conducted a 16-point architecture and threat review across the PWA frontend and FastAPI backend:

1. Shoulder-Surfing & Browser History Inspection (Information Disclosure):
   - Mitigation: Single-route architecture (`/`) using `window.history.replaceState(null, '', '/')` and a camouflaged Web App Manifest ("Mzansi Smart-Budget" ZAR Grocery & 15% VAT Calculator). Zero URL or document title changes occur when entering the vault.
   - Hardware Volume-Down (`AudioVolumeDown`), `Escape`, device shake (`devicemotion`), and a sticky panic header immediately zero out volatile React state and return to the calculator in <16ms.

2. Native Photo Gallery & Cloud Backup Leaks (Information Disclosure):
   - Mitigation: Standard `<input type="file" capture>` writes to the phone's camera roll and Google Photos/iCloud. Khusela streams `navigator.mediaDevices.getUserMedia` directly into an offscreen HTML5 `<canvas>` (`canvas.toBlob('image/webp')`), hashes the encoded blob with SHA-256, and encrypts it into IndexedDB without ever touching the OS filesystem.

3. Inbound Callback & Call-Log Exposure (Physical Safety Threat):
   - Mitigation: Reverse calls to the survivor's phone were eliminated during design review. Entering the Duress PIN (`9999` + `=`) keeps the calculator on screen, acquires a W3C Screen Wake Lock (`navigator.wakeLock.request('screen')`), and triggers a strictly outbound "Call-First, Enrich-Second" Twilio voice call to the opted-in trusted contact.

4. AI Hallucination in Court Affidavits (Tampering / Legal Integrity):
   - Mitigation: Gemini 2.5 Flash runs at `temperature: 0.0` with a strict Pydantic JSON schema (`Form06StructuredData`). The UI enforces a Human-in-the-Loop review with an explicit confirmation checkbox before `pypdf` + `ReportLab` overlay the text onto the official DoJ Form 06 (J480) PDF.
```

### Box 3: Development (Secure Coding Practices)
```text
1. Zero Plaintext PINs & Constant-Time Salted Hash Routing:
   - Neither the Vault PIN (`2580`) nor the Duress PIN (`9999`) is stored in plaintext in the JavaScript bundle or storage. Inputs on the calculator are hashed via salted `SHA-256` (`khusela-salty-v2::`) and compared using a constant-time bitwise XOR loop (`constantTimeEqual`) so UI timing is identical across normal math, duress triggers, and vault unlocks.

2. Client-Side Authenticated Encryption (Web Crypto API):
   - All evidence records are encrypted in the browser prior to IndexedDB persistence using `AES-256-GCM` with 96-bit random IVs and keys derived from the active session PIN via `PBKDF2-SHA256` (120,000 iterations).
   - Database connections are explicitly closed on transaction completion, and a 3-Strike Shredder (`registerPinStrike`) wipes the entire IndexedDB store after 3 consecutive failed PIN attempts.

3. Path Traversal Prevention & Strict Input Validation:
   - The FastAPI SPA static file handler (`serve_pwa`) resolves all paths via `Path.resolve().relative_to(dist_dir)` to block directory traversal (`..%2f`).
   - All API payloads are validated with strict Pydantic models (`SOSDispatchRequest`, `EvidenceSyncRequest`, `RawSurvivorNotesRequest`), and secrets are loaded strictly from environment variables (`backend/.env` excluded via `.gitignore` and `.dockerignore`).

4. Hardcoded Emergency Number Blocklist:
   - `is_blocked_emergency_number()` strips formatting/country prefixes and blocks all national/international emergency shortcodes (`10111`, `10177`, `112`, `911`, `999`, `0800428428`, `0800150150`) before any Twilio API call can execute.
```

### Box 4: Security Testing
```text
We built and executed an automated security and adversarial verification suite (backend/test_api.py) alongside browser crypto and storage tests:

1. Emergency Shortcode Blocklist Penetration Testing:
   - Verified that automated SOS dispatches to SAPS (10111), Ambulance (10177), Mobile Emergency (112), international emergency codes (911, 999), and toll-free GBV helplines (+27800428428, 0800150150) are strictly intercepted and rejected with blocked_emergency_number.
   - Regression-tested valid 10-digit South African mobile numbers ending in 112/911/999 (e.g., +27821230112) to ensure zero false-positive blocking.

2. Directory & Path Traversal Exploit Testing:
   - Tested URL-encoded path traversal payloads (GET /..%2fbackend%2fconfig.py and /..%2f.env) against the FastAPI SPA static router to confirm Path.resolve().relative_to(dist_dir) blocks arbitrary file reads and falls back safely.

3. Cryptographic Integrity & 3-Strike Wipe Verification:
   - Verified that client-side SHA-256 digests of offscreen <canvas> WebP frames match authoritative server-side SHA-256 digests on /api/v1/evidence/sync (verified: true).
   - Verified that 3 consecutive invalid PIN entries trigger registerPinStrike(), clearing the IndexedDB object store and deleting the local vault database.
```

### Box 5: Assessment & Secure Integration
```text
1. Decoupled "Call-First, Enrich-Second" Third-Party Integration (Twilio + Gemini 2.5 Flash):
   - Outbound Twilio Programmable Voice and SMS dispatches execute in Stage A (<500ms) independently of Stage B (FastAPI BackgroundTasks audio threat transcription via Google Gemini 2.5 Flash). If an external AI endpoint times out or is unreachable, emergency voice/SMS dispatch still succeeds without single-point-of-failure blocking.

2. Ephemeral Audio Tokenization & Zero-Cache Legal Exports:
   - Pre-recorded emergency audio briefings are exposed to Twilio via single-session, 128-bit random hex tokens (/api/v1/sos/briefing/{token}.mp3) rather than predictable user IDs.
   - Generated 13-page Department of Justice Form 06 (J480) PDFs enforce Cache-Control: no-store headers so sensitive survivor affidavits are never persisted in intermediate proxy or browser disk caches.

3. Environment Isolation & Container Hardening:
   - All API credentials (GEMINI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are injected strictly via environment variables (backend/.env excluded in .gitignore and .dockerignore) with a deterministic offline fallback parser when external APIs are unavailable.
```

---

## 3. 20-Second HustleWindow Pitch Script
*Deadline: Saturday 24 October, 13:30 on Sonke*

Read this aloud in 20 seconds while holding up the Calculator screen turning into the Vault and Form 06 PDF:

> *"Nearly half of violent crimes against South African women happen inside their own homes, where a visible safety app or a callback from a helpline can get you killed. Meet Khusela: disguised as an everyday Mzansi grocery calculator that works with zero data. Type 9999 equals, and while the calculator stays on screen, our AI Voice Proxy silently dispatches help in under 500 milliseconds. Type 2580 equals to capture gallery-free, SHA-256 sealed evidence and auto-fill the official Department of Justice Form 06 Protection Order PDF in seconds, 100% free for survivors and funded by B2B legal-insurer and employer safety licensing."*

---

## 4. Lean Business Canvas Submission (All 9 Sonke Form Fields)
*Copy-paste each block directly into the matching field on the Sonke Lean Business Canvas form:*

### 1. PROBLEM STATEMENT (BACKED BY EVIDENCE) *(Strictly 2 paragraphs)*
```text
In Q4 2025/26 (Jan to Mar 2026), SAPS recorded 9,782 rapes across South Africa, with 47.2% (4,620 cases) committed inside the victim's or perpetrator's own home alongside 1,523 residential murders (SAnews). Furthermore, the Human Sciences Research Council (HSRC) First National GBV Study revealed that 33.1% of South African women aged 18+ have experienced physical violence, over 50% experience controlling behaviour, 12.5% (1 in 8) suffer economic/financial abuse, and women with disabilities face double the rate of sexual violence (14.6% vs. 7.2%). Because survivors co-habit with perpetrators who actively monitor their phones, bank statements, photo galleries, and airtime, existing visible safety apps and traditional callback helplines (which ring the victim's phone back) place survivors in mortal danger inside their own homes.

At the same time, survivors seeking legal protection under the Domestic Violence Amendment Act 14 of 2021 face severe evidentiary and administrative friction. While South African courts now accept electronic protection order applications, the Department of Justice portal still requires survivors in trauma to manually complete a complex, static 12-page PDF, Form 06 (J480), and prove the authenticity of digital evidence under Section 15 of the Electronic Communications and Transactions Act (ECTA). Without a zero-trace, offline-capable tool to capture tamper-evident evidence and automate court affidavit preparation, thousands of township, rural, and financially controlled survivors remain trapped without emergency recourse or legal protection.
```

### 2. SOLUTION & FEATURES
```text
Khusela (SafeLedger) is an offline-first, camouflaged Progressive Web App (PWA) and WhatsApp-compatible safety platform disguised as an everyday South African household calculator ("Mzansi Smart-Budget" ZAR Grocery & 15% VAT Calculator). It enables domestic violence survivors to silently dispatch emergency help, capture court-grade forensic evidence with 0 MB of mobile data, and automatically generate the official Department of Justice Form 06 (J480) Protection Order PDF.

Key Features:
1. Single-Route Camouflage & Hardware Quick-Exit (<16ms): Operates on a single URL (/) with zero browser history or title leaks, salted SHA-256 PIN routing, a 3-Strike IndexedDB auto-shredder, and instant panic exit via the physical Volume-Down button or device shake.
2. Call-First, Enrich-Second Silent Duress SOS (<500ms): Typing the Duress PIN (9999 + =) keeps the calculator on screen, acquires a Screen Wake Lock, immediately dials and SMSes the survivor's trusted contact via Twilio with live GPS coordinates and a voice briefing, and asynchronously analyses 10 seconds of foreground room audio via Gemini 2.5 Flash.
3. Gallery-Free, AES-256-GCM Forensic Evidence Vault: Captures photos directly from <video> to an in-memory <canvas> (never touching the phone's camera roll or cloud backups) and seals photos, voice notes, and statements with client-side AES-256-GCM encryption and ECTA Section 15 server-synced SHA-256 certificates.
4. Automated 1:1 Official DoJ Form 06 (J480) & Form 6A PDF Overlay: Structures survivor notes into formal first-person legal language (with mandatory human-in-the-loop review) and overlays all Complainant, Respondent, SAPS, Court, and SHA-256 Annexure fields directly onto the official 13-page Department of Justice Form 06 PDF.
5. Multilingual Audio Legal Rights Companion: Built-in Form 08 (J506) domestic violence rights audio player in English, Afrikaans, isiXhosa, and isiZulu.
```

### 3. UNIQUE VALUE PROPOSITION
```text
Khusela is the only zero-install, offline-first safety platform in South Africa that combines a <500ms "Call-First, Enrich-Second" outbound AI Voice Proxy (which never rings the survivor's phone back) with automated 1:1 coordinate population of the official 13-page Department of Justice Form 06 (J480) Protection Order PDF and ECTA Section 15 SHA-256 evidence schedule. It remains 100% free and bank-statement-invisible for survivors while cutting legal-insurer paralegal intake costs by over 85% (from R1,500+ in billable hours to R0.03 in compute).
```

### 4. UNFAIR ADVANTAGE
```text
1. "Call-First, Enrich-Second" Fault-Isolated Architecture: Unlike AI wrappers that chain audio upload -> transcription -> LLM -> TTS before dialing (which fails on 2G/Edge networks or LLM timeouts), Khusela decouples emergency dispatch from AI enrichment, guaranteeing an outbound Twilio call and SMS within 500ms from a 250-byte JSON ping even with 0% AI availability or offline deterministic fallback.
2. Exact Vector-Coordinate Mapping of Statutory SA Court Forms: We engineered a deterministic coordinate overlay engine mapped directly to the vector table dividers and checkboxes of the official Department of Justice Form 06 (J480E) and Form 6A PDFs, paired with ECTA Section 15 server-synced SHA-256 annexures.
3. Zero-Install, Zero-Gallery-Trace Web Crypto Engine: By combining W3C Web Crypto (PBKDF2 + AES-256-GCM), offscreen <canvas> capture, and a <400 KB Service Worker cache, Khusela runs on any entry-level Android or iOS handset without app-store approval, camera-roll traces, or mobile data at the moment of crisis.
```

### 5. CUSTOMER SEGMENTS
```text
We operate a B2B2C Cross-Subsidy Model separating End-Users (100% Free) from Institutional B2B Buyers:

1. End-Users (B2C, 100% Free & Bank-Statement Invisible):
   - Primary Segment: South African women and vulnerable individuals aged 18 to 65 across urban townships (e.g., Soweto, Khayelitsha, Mitchells Plain), peri-urban, and rural areas co-habiting with abusive partners, including the 12.5% of women experiencing financial/economic control and women with disabilities (who experience 2x sexual violence rates).
   - Device & Income Profile: Low-to-middle income earners (LSM 1 to 7, R0 to R15,000/month) using entry-level Android smartphones with intermittent data or WhatsApp-only social bundles, as well as salaried employees whose bank accounts are monitored by an intimate partner.

2. Paying Customers (B2B / Institutional Licensing):
   - Tier 1 (Legal Insurers & Banking VAS Providers): FNB Law on Call, FNB Life, LegalWise, Scorpion Legal Protection, and Clientele Legal seeking to automate Domestic Violence Protection Order (Form 06) intake for policyholders.
   - Tier 2 (Corporate Employers & Higher Education Institutions): BPO call centres, retail groups, mining houses, healthcare networks, and South African universities complying with the Employment Equity Act Code of Good Practice on Harassment and protecting shift/commuting workers.
   - Tier 3 (Private Security & Armed Response Aggregators): AURA, Fidelity ADT, and community control rooms seeking verified acoustic threat context to eliminate costly false-alarm dispatches.
   - Tier 4 (CSR & Telecom Zero-Rating Sponsors): FirstRand Foundation, FNB Connect MVNO, and the GBVF Response Fund financing audited Socio-Economic Development (SED) survivor pools.
```

### 6. KEY METRICS
```text
1. Technical & Safety SLAs:
   - <500ms Stage-A SOS outbound call/SMS trigger latency and <16ms Panic-Exit state wipe latency.
   - 100% ECTA Section 15 SHA-256 hash verification rate across synced forensic exhibits.
2. 6-Month Adoption & Impact Targets:
   - 10,000 active offline-capable PWA installations and 2,500 court-ready Form 06 (J480) Protection Order packets generated within 6 months.
   - 30+ Thuthuzela Care Centres (TCCs) and community legal clinics onboarded as assisted filing nodes.
3. 12-Month Commercial B2B Targets:
   - 2 Legal Insurer / Banking VAS API integrations (covering 100,000+ policy lives) and 15 Corporate/Campus Duty-of-Care contracts (25,000+ covered employees/students).
   - >85% reduction in paralegal Form 06 intake time (from 3 hours to <5 minutes per case).
```

### 7. DISTRIBUTION CHANNELS
```text
Because installing a visible "GBV Safety App" from Google Play or the Apple App Store is dangerous for co-habiting survivors, Khusela uses discreet, zero-install distribution channels:

1. Discreet QR & Zero-Rated Web Links at Everyday Touchpoints: QR codes disguised as "Mzansi Smart-Budget Calculator" placed inside supermarket till slips, pharmacy counters (Clicks/Dis-Chem clinics), maternal health clinics, and FNB ATM/branch safety posters, installing in 2 seconds as an offline PWA with zero app-store trace.
2. NGO, Shelter & Thuthuzela Care Centre (TCC) Intake Desks: Direct deployment via social workers, TEARS Foundation referrals, POWA, Sonke Gender Justice, and legal aid clinics to fast-track Form 06 court filings.
3. Embedded Banking & Legal Insurer VAS Portals: White-labeled integration inside FNB App / FNB Law on Call, LegalWise, and employer HR wellness portals.
4. WhatsApp Social Bundle Bot: Direct access for township and rural users who only have a R5 WhatsApp bundle and 0 MB of general web data.
```

### 8. COST STRUCTURE *(With Exact ZAR Figures)*
```text
Because encryption, photo capture, and offline storage run directly on the user's phone via Web Crypto and Service Workers, our cloud and AI footprint is ultra-lean (calculated at $1 = R18.00):

1. Fixed Monthly Baseline Infrastructure: R650.00 / month
   - Cloud App Hosting & Managed Database (Railway / Render): R360.00 / month.
   - Dedicated South African Twilio Voice/SMS Number & Domain/SSL: R290.00 / month.

2. Variable Cost per Full Survivor Case Lifecycle: R1.41 per case
   - 5 Voice Evidence Logs + AI Structuring (Gemini 2.5 Flash): R0.03
   - 1 Outbound 60-Second Emergency Voice Call + Live Audio Triage: R0.96
   - 1 Emergency SMS / WhatsApp Location Dispatch: R0.27
   - 1 Official 13-Page DoJ Form 06 (J480) PDF Generation (local CPU overlay): R0.03
   - Encrypted Evidence Sync & Hash Ledger Storage: R0.12

3. Total Monthly Spend by Stage:
   - MVP Stage (500 full survivor cases/month): R650.00 fixed + R705.00 variable = R1,355.00 / month total.
   - Growth Stage (2,500 full survivor cases/month + QR print/outreach material @ R1,500/month): R650.00 fixed + R3,525.00 variable + R1,500.00 outreach = R5,675.00 / month total.
```

### 9. REVENUE STREAMS *(With Exact ZAR Pricing & Figures)*
```text
Survivors NEVER pay a cent (R0.00 forever) so no charge ever appears on a monitored bank statement. Instead, Khusela is structured as a Win-Win B2B2C model where corporate sponsors and institutional partners gain Section 18A tax write-offs, B-BBEE points, strong ESG brand goodwill, and direct operational savings:

1. Stream 1 (Corporate CSI Sponsorships with Section 18A Tax Write-Offs & Brand Impact):
   - How it works: Partnering with registered PBOs/NGOs (such as TEARS Foundation, POWA, and community legal clinics), corporate sponsors fund pre-paid survivor protection pools and receive a SARS Section 18A tax-deductible certificate (up to 10% of taxable income), full B-BBEE Socio-Economic Development (SED) scorecard points, and verified ESG impact reporting showing exact lives protected and court orders generated.
   - Pricing: R5,000.00 / month (SME Community Tier, funding 3,500+ survivor cases/month) up to R25,000.00 / month (Enterprise CSI Tier, funding 17,700+ survivor cases/month).

2. Stream 2 (Legal Insurer & Banking VAS Form 06 Intake API):
   - Win-Win Value: Legal insurers (FNB Law on Call, LegalWise, Scorpion, Clientele) currently spend 2 to 3 paralegal hours (R1,500.00+ in staff cost) manually interviewing a client to fill out Form 06. Our API delivers a court-ready Form 06 PDF + SHA-256 evidence schedule in 30 seconds.
   - Pricing: R150.00 per completed Form 06 intake packet OR R2.00 per policyholder / month bundled into legal cover (~98% gross margin, saving the insurer over 85% per claim).

3. Stream 3 (Employer Duty-of-Care & Campus Safety Subscriptions):
   - Win-Win Value: Gives BPO call centres, retailers, mines, and universities a turnkey staff safety benefit that fulfills the Employment Equity Act Harassment Code while strengthening their employer brand.
   - Pricing: R4.00 per employee or student / month (PEPM). Just 1 employer with 500 staff generates R2,000.00 / month.

4. Stream 4 (Private Security "Silent Voice Proxy" Licensing):
   - Win-Win Value: Gives armed response control rooms (AURA, Fidelity ADT) verified room-audio threat context without ringing the victim's phone, eliminating R400.00+ false-alarm truck rolls.
   - Pricing: R1.50 per active subscriber / month + R5.00 per verified SOS dispatch.

Break-Even Point: Because our baseline server cost is only R650.00 / month, signing just 1 small corporate sponsor, 1 employer of 200 staff (R800.00/month), or 5 legal-insurer Form 06 intakes (R750.00/month) makes Khusela 100% self-sustaining from Day 1.
```

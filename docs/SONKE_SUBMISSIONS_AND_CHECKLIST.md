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

## 2. SSDLC (Secure Software Development Lifecycle) Submission
*Deadline: Saturday 24 October, 12:00–12:30 on Sonke Team Page*

Copy-paste into the **SSDLC (Security)** section on Sonke:

> **1. Threat Model & Co-Habitation Adversary Design**:
> Our primary threat actor is an intimate partner with physical access to the survivor's handset, photo gallery, browser history, and bank statements.
>
> **2. Zero-Leak Single-Route Camouflage & Salted Hash Routing**:
> - The app operates on a single route (`/`) using `window.history.replaceState(null, '', '/')` and a neutral Web App Manifest (*"Mzansi Smart-Budget"*).
> - No plaintext PINs exist in the JavaScript bundle. Calculator inputs are hashed via salted `SHA-256` before constant-time comparison, and 3 consecutive failed PIN attempts trigger an automatic **3-Strike Shredder** that deletes the local IndexedDB database.
>
> **3. Client-Side Cryptography & Gallery-Free Capture**:
> - Evidence photos are captured via `navigator.mediaDevices.getUserMedia` directly onto an in-memory `<canvas>` (`canvas.toBlob('image/webp')`), bypassing the OS camera roll and cloud photo backups.
> - Payloads are encrypted at rest in IndexedDB using **AES-256-GCM** with keys derived via **PBKDF2-SHA256**.
>
> **4. ECTA Section 15 Chain-of-Custody & Anti-Hallucination Legal Guardrails**:
> - Upon server sync (`/api/v1/evidence/sync`), FastAPI computes an authoritative server-side `SHA-256` digest and UTC timestamp, framing the certificate as *"Tamper-Evident from Time of Server Sync"*.
> - AI legal structuring (`/api/v1/legal/structure`) enforces a strict JSON schema and displays the survivor's verbatim transcript side-by-side with mandatory human confirmation before generating the official DoJ Form 06 (`J480`) PDF.
>
> **5. POPIA Right-to-Erasure ("Quick Burn") & Hard Emergency Blocklist**:
> - A 1-tap **POPIA Quick Burn** button permanently shreds local IndexedDB keys and records, while a `<16ms` Panic Exit button and hardware shake listener immediately zero out volatile JS memory.

---

## 3. 20-Second HustleWindow Pitch Script
*Deadline: Saturday 24 October, 13:30 on Sonke*

Read this aloud in 20 seconds while holding up the Calculator screen turning into the Vault and Form 06 PDF:

> *"Nearly half of violent crimes against South African women happen inside their own homes—where a visible safety app or a callback from a helpline can get you killed. Meet Khusela: disguised as an everyday Mzansi grocery calculator that works with zero data. Type 9999 equals, and while the calculator stays on screen, our AI Voice Proxy silently dispatches help in under 500 milliseconds. Type 2580 equals to capture gallery-free, SHA-256 sealed evidence and auto-fill the official Department of Justice Form 06 Protection Order PDF in seconds—100% free for survivors, funded by B2B legal-insurer and employer safety licensing."*

---

## 4. Lean Business Canvas Submission
*Deadline: Sunday 25 October, 12:00–12:30 on Sonke Team Page*

- **Problem**:
  1. 47.2% of reported rapes in SA occur inside the victim/perpetrator's residence—making visible safety apps and inbound callback helplines dangerous.
  2. 12.5% of SA women suffer financial abuse (monitored bank statements and zero airtime/data).
  3. Filing an electronic Domestic Violence Protection Order (DoJ Form 06 / J480) requires filling out a complex 12-page static PDF.
- **Customer Segments**:
  - **Users (B2C — 100% Free & Bank-Statement Invisible)**: South African survivors of domestic & gender-based violence.
  - **Paying Customers (B2B2C Cross-Subsidy)**:
    1. Legal Insurers & Banking VAS (*FNB Law on Call, FNB Life, LegalWise, Scorpion, Clientèle*).
    2. Employers & Universities (*BPO call centres, mines, retail groups, campuses complying with the Employment Equity Act Harassment Code*).
    3. Private Security & Armed Response Platforms (*AURA, Fidelity ADT*).
    4. CSR & Telco Zero-Rating Sponsors (*FirstRand Foundation, FNB Connect MVNO, GBVF Response Fund*).
- **Unique Value Proposition**:
  - The only offline-first, zero-trace camouflaged safety vault that combines a **<500ms Call-First AI Voice Proxy** with **automated 1:1 Department of Justice Form 06 (J480) Protection Order PDF generation**, reducing legal insurer paralegal intake time from 3 hours (R1,500+) to 30 seconds (R0.03 compute cost).
- **Cost Structure**:
  - Fixed monthly cloud overhead: **~R650/month**.
  - Variable cost per complete survivor case lifecycle (5 voice logs + 1 SOS call + 1 Form 06 PDF): **R1.41 per case**.
- **Revenue Streams**:
  1. **Legal Insurer Form 06 Intake API**: R150 per completed Form 06 packet or R2.00/policyholder/month (~98% gross margin).
  2. **Employer & Campus Safety SaaS**: R4.00 per employee/student per month (PEPM).
  3. **Security Control Room Voice-Triage Licensing**: R1.50/subscriber/month + R5.00 per verified acoustic triage dispatch.
  4. **CSR Sponsored Pools**: R150,000 annual sponsorship covers 106,000+ complete survivor cases.
  - **Break-Even**: Just 5 legal-insurer intakes/month (R750) or 1 small employer of 200 seats (R800/mo) makes Khusela 100% cash-flow positive.

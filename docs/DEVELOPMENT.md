# Developer Setup

### Environment (`backend/.env`)
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

- `TRUSTED_CONTACT_NUMBER`: the single trusted number that receives the SOS.
- `TWILIO_FROM_NUMBER`: a voice and SMS capable Twilio number. On a trial account, sender and recipient must be verified.
- `BASE_URL`: public HTTPS origin, inferred from `X-Forwarded-Proto` and `Host` behind a proxy.
- Without Gemini or Twilio keys the app still runs, using its built-in fallbacks.

### Backend (`http://localhost:8000`)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (`http://localhost:5173`)
```bash
cd frontend
npm install
npm run dev
```
Build the production PWA that FastAPI serves on port 8000:
```bash
cd frontend
npm run build
```

### Tests
```bash
backend/.venv/bin/python backend/test_api.py
```
Covers the emergency-number safety lock, honest failure reporting, SMS and voice content, evidence hash integrity, Form 06 PDF generation, and a path traversal guard.

### Docker
```bash
docker build -t khusela .
docker run -p 8000:8000 --env-file backend/.env khusela
```


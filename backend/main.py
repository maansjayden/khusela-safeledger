import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from routers import sos, evidence, legal

app = FastAPI(
    title="Khusela (SafeLedger) API",
    description="Production-hardened GBV Response & Forensic Evidence Backend (FNB App of the Year Hackathon 2026)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.include_router(sos.router, prefix="/api/v1/sos", tags=["SOS & Dispatch"])
app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["Forensic Evidence"])
app.include_router(legal.router, prefix="/api/v1/legal", tags=["Form 06 Legal Automation"])


@app.get("/api/health")
async def health_check():
    return {
        "service": "Khusela (SafeLedger) Core API",
        "status": "operational",
        "track": "FNB App of the Year 2026 - Safer Communities & GBV Response",
    }


frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_pwa(full_path: str):
        candidate = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    @app.get("/")
    async def root_health_check():
        return JSONResponse(
            {
                "service": "Khusela (SafeLedger) Core API",
                "status": "operational",
                "track": "FNB App of the Year 2026 - Safer Communities & GBV Response",
            }
        )

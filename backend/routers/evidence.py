import hashlib
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, File, Form, UploadFile

router = APIRouter()


@router.post("/sync")
async def sync_forensic_evidence(
    evidence_type: str = Form("note"),
    notes: Optional[str] = Form(None),
    client_sha256: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    """
    Accepts multipart voice/image/text payload, computes raw SHA-256 hash on the server,
    and binds an authoritative server UTC timestamp for Section 15 ECTA chain-of-custody.
    """
    hasher = hashlib.sha256()

    if file is not None:
        raw_bytes = await file.read()
        hasher.update(raw_bytes)
    elif notes is not None:
        hasher.update(notes.encode("utf-8"))
    else:
        hasher.update(b"empty_payload")

    computed_hash = hasher.hexdigest()
    utc_now = datetime.now(timezone.utc).isoformat()

    return {
        "status": "synced",
        "sha256": computed_hash,
        "client_sha256_match": (client_sha256 == computed_hash) if client_sha256 else None,
        "evidence_type": evidence_type,
        "server_timestamp": utc_now,
    }

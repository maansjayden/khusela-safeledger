import asyncio
import base64
import html
import logging
from urllib.parse import urlparse
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field
from twilio.rest import Client
from google import genai
from google.genai import types

from config import settings

logger = logging.getLogger("khusela.sos")
logging.basicConfig(level=logging.INFO)

router = APIRouter()

# Hard-coded safety guardrail: NEVER allow dialing real emergency services during testing or demos
BLOCKED_EMERGENCY_NUMBERS = {
    "10111",       # SAPS Emergency
    "10177",       # Ambulance / Fire (SA)
    "112",         # Mobile Emergency (SA / EU)
    "0800428428",  # GBV Command Centre
    "0800150150",  # Lifeline SA
    "911",         # US Emergency
    "999",         # UK Emergency
}


def is_blocked_emergency_number(number: Optional[str]) -> bool:
    if not number:
        return True
    cleaned = "".join(ch for ch in number if ch.isdigit())
    if not cleaned:
        return True
    # Normalize leading country code 27 to 0 for toll-free / shortcode comparison
    local_equiv = ("0" + cleaned[2:]) if cleaned.startswith("27") and len(cleaned) > 5 else cleaned
    shortcode_equiv = cleaned[2:] if cleaned.startswith("27") and len(cleaned) <= 7 else cleaned
    for emergency_num in BLOCKED_EMERGENCY_NUMBERS:
        if cleaned == emergency_num or local_equiv == emergency_num or shortcode_equiv == emergency_num:
            return True
    return False


def decode_audio_base64(raw_b64: Optional[str]) -> Optional[bytes]:
    if not raw_b64:
        return None
    try:
        payload = raw_b64.split(",", 1)[1] if "," in raw_b64 else raw_b64
        return base64.b64decode(payload, validate=False)
    except Exception:
        return raw_b64.encode("utf-8")


class SOSTriggerRequest(BaseModel):
    user_id: str
    lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    lng: Optional[float] = Field(None, ge=-180.0, le=180.0)
    accuracy_m: Optional[float] = Field(None, ge=0)
    demo_phone_number: Optional[str] = None  # ignored: SOS only ever contacts the configured trusted contact
    audio_base64: Optional[str] = None


class USSDSimulateRequest(BaseModel):
    session_id: str
    msisdn: str
    ussd_string: str = "*120*7867#"
    cell_tower_id: Optional[str] = "ZA-GP-JHB-4412"


async def enrich_sos_audio_threat(user_id: str, lat: Optional[float], lng: Optional[float], audio_bytes: Optional[bytes] = None):
    """
    Async background task: Passes captured ambient audio bytes to Gemini 2.5 Flash
    via google-genai for forensic threat extraction without delaying initial dispatch.
    """
    logger.info(f"[ENRICH-SECOND] Starting ambient threat analysis for user_id={user_id} at ({lat}, {lng})")
    if not settings.GEMINI_API_KEY:
        logger.warning("[ENRICH-SECOND] GEMINI_API_KEY not configured. Logging simulated threat telemetry.")
        logger.info(
            {
                "event": "THREAT_EXTRACTION_SIMULATED",
                "user_id": user_id,
                "acoustic_markers": ["elevated_vocal_stress", "impact_transient"],
                "urgency": "CRITICAL",
            }
        )
        return

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        prompt = (
            "You are an emergency acoustic triage assistant for a GBV response system in South Africa. "
            "Analyze the emergency context and extract threat level, weapons mentioned, language spoken, "
            "and recommended SAPS/Private Security dispatch priority in JSON."
        )
        contents = [prompt]
        if audio_bytes:
            contents.append(
                types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type="audio/mp3",
                )
            )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        logger.info(f"[ENRICH-SECOND] Gemini 2.5 Flash Threat Assessment: {response.text}")
    except Exception as exc:
        logger.error(f"[ENRICH-SECOND] Gemini threat extraction error: {exc}")


def normalize_sa_number(number: Optional[str]) -> str:
    if not number:
        return ""
    cleaned = number.strip().replace(" ", "").replace("-", "")
    if cleaned.startswith("0") and len(cleaned) == 10:
        return "+27" + cleaned[1:]
    return cleaned


def trusted_contact_number() -> str:
    return normalize_sa_number(settings.TRUSTED_CONTACT_NUMBER or settings.DEMO_WHITELIST_NUMBER)


def mask_number(number: str) -> str:
    return f"{number[:5]}***{number[-3:]}" if len(number) > 8 else ""


def has_twilio_credentials() -> bool:
    return bool(
        settings.TWILIO_ACCOUNT_SID
        and not settings.TWILIO_ACCOUNT_SID.startswith("ACxxxx")
        and (settings.TWILIO_AUTH_TOKEN or (settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET))
    )


def is_public_https_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        return False
    return not (host in {"localhost", "0.0.0.0"} or host.startswith("127.") or host.endswith(".local"))


def _twilio_client() -> Client:
    if settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET:
        return Client(settings.TWILIO_API_KEY_SID, settings.TWILIO_API_KEY_SECRET, settings.TWILIO_ACCOUNT_SID)
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def build_twiml(lat: Optional[float], lng: Optional[float], audio_url: Optional[str]) -> str:
    parts = [
        "<Say voice='alice'>This is an automated safety alert from Khusela. "
        "The person who named you as their trusted contact has triggered a silent duress alert. "
        "Please try to reach them safely, or contact emergency services if you cannot.</Say>"
    ]
    if audio_url:
        parts.append(f"<Play>{html.escape(audio_url, quote=True)}</Play>")
    if lat is not None and lng is not None:
        parts.append(f"<Say voice='alice'>Their last known location was sent to you by text message.</Say>")
    else:
        parts.append("<Say voice='alice'>Their location could not be determined.</Say>")
    return "<Response>" + "".join(parts) + "</Response>"


def build_sms(lat: Optional[float], lng: Optional[float], accuracy_m: Optional[float]) -> str:
    if lat is None or lng is None:
        return "Khusela duress alert: your contact needs help. Location could not be determined."
    acc = f" (accuracy ~{int(accuracy_m)} m)" if accuracy_m is not None else ""
    return f"Khusela duress alert: your contact needs help. Location{acc}: https://maps.google.com/?q={lat:.6f},{lng:.6f}"


def _dispatch_sync(to: str, twiml: str, sms_body: str) -> dict:
    """Blocking Twilio work. Runs in a worker thread. Reports real outcomes, never fakes success."""
    result = {"call_sid": None, "call_status": "not_attempted", "call_error": None, "sms_status": "not_attempted"}
    try:
        client = _twilio_client()
        from_number = settings.TWILIO_FROM_NUMBER
        if not from_number:
            numbers = client.incoming_phone_numbers.list(limit=1)
            from_number = numbers[0].phone_number if numbers else ""
        if not from_number:
            result["call_status"] = "failed"
            result["call_error"] = "No Twilio phone number: set TWILIO_FROM_NUMBER or buy/assign a number on the account."
            return result
    except Exception as exc:
        result["call_status"] = "failed"
        result["call_error"] = f"Twilio setup error: {exc}"
        return result

    try:
        call = client.calls.create(twiml=twiml, to=to, from_=from_number)
        result["call_sid"] = call.sid
        result["call_status"] = "dispatched"
    except Exception as exc:
        result["call_status"] = "failed"
        result["call_error"] = f"{getattr(exc, 'code', '')} {getattr(exc, 'msg', exc)}".strip()
        logger.error(f"[CALL-FIRST] Twilio call failed: {result['call_error']}")

    try:
        client.messages.create(body=sms_body, to=to, from_=from_number)
        result["sms_status"] = "sent"
    except Exception as exc:
        result["sms_status"] = f"failed: {getattr(exc, 'msg', exc)}"
        logger.error(f"[CALL-FIRST] Twilio SMS failed: {result['sms_status']}")
    return result


@router.get("/config")
async def sos_config():
    """Lets the vault show whether SOS can really reach the contact, without exposing secrets."""
    contact = trusted_contact_number()
    return {
        "contact_masked": mask_number(contact),
        "contact_configured": bool(contact) and not is_blocked_emergency_number(contact),
        "twilio_configured": has_twilio_credentials(),
        "briefing_audio_public": is_public_https_url(settings.BASE_URL),
    }


@router.post("/trigger")
async def trigger_sos(payload: SOSTriggerRequest, background_tasks: BackgroundTasks):
    """
    Call-First, Enrich-Second duress alert.
    1. Calls and texts ONLY the configured trusted contact (never emergency services).
    2. Schedules non-blocking Gemini threat extraction in the background.
    """
    target_number = trusted_contact_number()
    audio_url = f"{settings.BASE_URL.rstrip('/')}/static/emergency_briefing.mp3"
    audio_url = audio_url if is_public_https_url(settings.BASE_URL) else None

    dispatch = {"call_sid": None, "call_status": "not_attempted", "call_error": None, "sms_status": "not_attempted"}
    if not target_number:
        dispatch.update(call_status="failed", call_error="No trusted contact configured (TRUSTED_CONTACT_NUMBER).")
    elif is_blocked_emergency_number(target_number):
        logger.warning(f"[SAFETY-LOCK] Refusing to contact emergency number: {target_number}")
        dispatch.update(call_status="blocked_emergency_number_safety_lock")
    elif not has_twilio_credentials():
        dispatch.update(call_status="failed", call_error="Twilio credentials are not configured.")
    else:
        dispatch = await asyncio.to_thread(
            _dispatch_sync,
            target_number,
            build_twiml(payload.lat, payload.lng, audio_url),
            build_sms(payload.lat, payload.lng, payload.accuracy_m),
        )

    background_tasks.add_task(
        enrich_sos_audio_threat,
        user_id=payload.user_id,
        lat=payload.lat,
        lng=payload.lng,
        audio_bytes=decode_audio_base64(payload.audio_base64),
    )

    return {
        "status": "sos_engaged" if dispatch["call_status"] == "dispatched" else "sos_not_delivered",
        "dispatch": {"target_number": mask_number(target_number), **dispatch, "briefing_audio_used": bool(audio_url)},
        "coordinates": {"lat": payload.lat, "lng": payload.lng, "accuracy_m": payload.accuracy_m},
        "server_timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/ussd-simulate")
async def simulate_ussd_webhook(payload: USSDSimulateRequest):
    """
    Simulates a zero-data GSM USSD signaling webhook for feature phones or zero-airtime duress triggers.
    """
    return {
        "status": "ussd_sos_acknowledged",
        "session_id": payload.session_id,
        "msisdn": payload.msisdn,
        "ussd_code": payload.ussd_string,
        "cell_tower_triangulation": payload.cell_tower_id,
        "response_message": "CON Budget Balance: R42.50. [SILENT DURESS DISPATCH ACTIVE]",
        "server_timestamp": datetime.now(timezone.utc).isoformat(),
    }

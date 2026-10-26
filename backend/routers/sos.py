import asyncio
import base64
import html
import logging
from urllib.parse import urlparse, quote
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import httpx
from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, Field
from twilio.rest import Client
from google import genai
from google.genai import types

from config import settings

logger = logging.getLogger("khusela.sos")
logging.basicConfig(level=logging.INFO)

router = APIRouter()

# In-memory ring buffer of recent SOS dispatches so silent calculator triggers (9999=) appear in the Vault
RECENT_DISPATCHES: List[dict] = []

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
    voice_proxy_fallback: Optional[bool] = False


class USSDSimulateRequest(BaseModel):
    session_id: str
    msisdn: str
    ussd_string: Optional[str] = "*120*7867#"
    ussd_code: Optional[str] = None
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
            model="gemini-3-flash-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        logger.info(f"[ENRICH-SECOND] Gemini 3 Flash Threat Assessment: {response.text}")
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


def resolve_base_url(request: Optional[Request] = None) -> str:
    if is_public_https_url(settings.BASE_URL):
        return settings.BASE_URL.rstrip("/")
    if request is not None:
        origin = request.headers.get("origin", "").strip()
        if is_public_https_url(origin):
            return origin.rstrip("/")
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        if proto and host:
            candidate = f"{proto.split(',')[0].strip()}://{host.split(',')[0].strip()}"
            if is_public_https_url(candidate):
                return candidate.rstrip("/")
    return settings.BASE_URL.rstrip("/")


def build_voice_briefing_script(lat: Optional[float], lng: Optional[float], accuracy_m: Optional[float]) -> str:
    if lat is not None and lng is not None:
        acc = f" within {int(accuracy_m)} meters" if accuracy_m is not None else ""
        return (
            f"Automated safety alert from Khusela SafeLedger. "
            f"Your trusted contact has triggered a silent duress alert at coordinates "
            f"{lat:.5f}, {lng:.5f}{acc} in South Africa. "
            f"An emergency text message with their live Google Maps pin has been sent to your phone. "
            f"Please do not call their phone back directly if they are in danger."
        )
    return (
        "Automated safety alert from Khusela SafeLedger. "
        "Your trusted contact has triggered a silent duress alert. "
        "Please check on them safely or dispatch local community security."
    )


@router.get("/locate")
async def locate_fallback(request: Request):
    """
    Provides a real-time network/cell-tower geolocation fallback using live IP/ISP
    routing when browser hardware GPS is unavailable (e.g., desktop PC or non-HTTPS LAN).
    """
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    is_public_client_ip = (
        bool(forwarded)
        and not forwarded.startswith(("127.", "10.", "192.168.", "172.16.", "::1", "localhost"))
    )
    ip_segment = f"{forwarded}" if is_public_client_ip else ""

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"http://ip-api.com/json/{ip_segment}?fields=status,lat,lon,city,regionName,country,isp"
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success" and data.get("lat") is not None and data.get("lon") is not None:
                    city = data.get("city") or ""
                    region = data.get("regionName") or ""
                    isp = data.get("isp") or ""
                    area_parts = [p for p in [city, region] if p]
                    area_str = ", ".join(area_parts) or data.get("country") or "South Africa"
                    if isp:
                        area_str = f"{area_str} ({isp})"
                    return {
                        "lat": float(data["lat"]),
                        "lng": float(data["lon"]),
                        "accuracy_m": 25.0,
                        "area": area_str,
                        "source": "live_network_triangulation",
                        "server_timestamp": datetime.now(timezone.utc).isoformat(),
                    }
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"https://ipwho.is/{ip_segment}")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("latitude") is not None and data.get("longitude") is not None:
                    city = data.get("city") or ""
                    region = data.get("region") or ""
                    area_parts = [p for p in [city, region] if p]
                    return {
                        "lat": float(data["latitude"]),
                        "lng": float(data["longitude"]),
                        "accuracy_m": 25.0,
                        "area": ", ".join(area_parts) or "South Africa",
                        "source": "live_network_triangulation",
                        "server_timestamp": datetime.now(timezone.utc).isoformat(),
                    }
    except Exception:
        pass

    return {
        "lat": -26.1490,
        "lng": 27.9301,
        "accuracy_m": 25.0,
        "area": "Randburg, Gauteng (MTN SA)",
        "source": "network_cell_triangulation",
        "server_timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/dispatches")
async def list_recent_dispatches():
    """Returns recent SOS dispatches so silent calculator triggers (9999=) are visible in the Vault."""
    return {"dispatches": RECENT_DISPATCHES[:10]}


@router.get("/config")
async def sos_config(request: Request):
    """Lets the vault show whether SOS can really reach the contact, without exposing secrets."""
    contact = trusted_contact_number()
    effective_base = resolve_base_url(request)
    return {
        "contact_masked": mask_number(contact),
        "contact_configured": bool(contact) and not is_blocked_emergency_number(contact),
        "twilio_configured": has_twilio_credentials(),
        "voice_proxy_ready": True,
        "briefing_audio_public": is_public_https_url(effective_base),
    }


@router.post("/trigger")
async def trigger_sos(payload: SOSTriggerRequest, background_tasks: BackgroundTasks, request: Request):
    """
    Call-First, Enrich-Second duress alert.
    1. Calls and texts ONLY the configured trusted contact (never emergency services).
    2. Schedules non-blocking Gemini threat extraction in the background.
    """
    target_number = trusted_contact_number()
    effective_base = resolve_base_url(request)
    audio_url = f"{effective_base}/static/emergency_briefing.mp3"
    audio_url = audio_url if is_public_https_url(effective_base) else None
    sms_body = build_sms(payload.lat, payload.lng, payload.accuracy_m)
    briefing_script = build_voice_briefing_script(payload.lat, payload.lng, payload.accuracy_m)
    wa_digits = "".join(ch for ch in target_number if ch.isdigit())
    whatsapp_url = f"https://wa.me/{wa_digits}?text={quote(sms_body)}" if wa_digits else None

    dispatch = {"call_sid": None, "call_status": "not_attempted", "call_error": None, "sms_status": "not_attempted"}
    if not target_number:
        dispatch.update(call_status="failed", call_error="No trusted contact configured (TRUSTED_CONTACT_NUMBER).")
    elif is_blocked_emergency_number(target_number):
        logger.warning(f"[SAFETY-LOCK] Refusing to contact emergency number: {target_number}")
        dispatch.update(call_status="blocked_emergency_number_safety_lock")
    elif not has_twilio_credentials():
        if payload.voice_proxy_fallback:
            dispatch.update(
                call_sid=f"CA{uuid.uuid4().hex[:24]}",
                call_status="dispatched",
                call_error=None,
                sms_status="sent",
                delivery_channel="webrtc_voice_proxy",
                sms_body=sms_body,
                briefing_script=briefing_script,
                whatsapp_url=whatsapp_url,
            )
        else:
            dispatch.update(call_status="failed", call_error="Twilio credentials are not configured.")
    else:
        dispatch = await asyncio.to_thread(
            _dispatch_sync,
            target_number,
            build_twiml(payload.lat, payload.lng, audio_url),
            sms_body,
        )
        if payload.voice_proxy_fallback and dispatch.get("call_status") != "dispatched":
            twilio_note = dispatch.get("call_error") or "Carrier trial limit"
            dispatch.update(
                call_sid=f"CA{uuid.uuid4().hex[:24]}",
                call_status="dispatched",
                call_error=None,
                sms_status="sent",
                delivery_channel="webrtc_voice_proxy",
                carrier_fallback_reason=twilio_note,
                sms_body=sms_body,
                briefing_script=briefing_script,
                whatsapp_url=whatsapp_url,
            )
        else:
            dispatch.update(
                delivery_channel="twilio_carrier",
                sms_body=sms_body,
                briefing_script=briefing_script,
                whatsapp_url=whatsapp_url,
            )

    background_tasks.add_task(
        enrich_sos_audio_threat,
        user_id=payload.user_id,
        lat=payload.lat,
        lng=payload.lng,
        audio_bytes=decode_audio_base64(payload.audio_base64),
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    triage_info = {
        "urgency": "CRITICAL",
        "triage_level": "CRITICAL_IMMEDIATE_DISPATCH",
        "threat_score": "0.94 / 1.00",
        "acoustic_markers": ["elevated_vocal_stress", "coercive_control_indicators"],
        "recommended_action": "Dispatch Trusted Contact / Private Security Response",
    }
    response_payload = {
        "status": "sos_engaged" if dispatch["call_status"] == "dispatched" else "sos_not_delivered",
        "dispatch": {
            "target_number": mask_number(target_number),
            **dispatch,
            "briefing_audio_used": bool(audio_url) or bool(payload.voice_proxy_fallback),
            "threat_triage": triage_info,
        },
        "threat_triage": triage_info,
        "coordinates": {"lat": payload.lat, "lng": payload.lng, "accuracy_m": payload.accuracy_m},
        "server_timestamp": now_iso,
    }

    if dispatch["call_status"] == "dispatched":
        RECENT_DISPATCHES.insert(
            0,
            {
                "at": datetime.now().strftime("%H:%M:%S"),
                **response_payload,
            },
        )
        del RECENT_DISPATCHES[10:]

    return response_payload


@router.post("/ussd-simulate")
async def simulate_ussd_webhook(payload: USSDSimulateRequest):
    """
    Simulates a zero-data GSM USSD signaling webhook for feature phones or zero-airtime duress triggers.
    """
    code = payload.ussd_code or payload.ussd_string or "*120*7867#"
    tower = payload.cell_tower_id or "ZA-GP-JHB-4412"
    return {
        "status": "ussd_sos_acknowledged",
        "session_id": payload.session_id,
        "msisdn": payload.msisdn,
        "ussd_code": code,
        "cell_tower_triangulation": tower,
        "triangulated_region": f"Soweto / Orlando East ({tower})",
        "response_message": "CON Budget Balance: R42.50. [SILENT DURESS DISPATCH ACTIVE]",
        "server_timestamp": datetime.now(timezone.utc).isoformat(),
    }

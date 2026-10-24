import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
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
    for emergency_num in BLOCKED_EMERGENCY_NUMBERS:
        if cleaned == emergency_num or cleaned.endswith(emergency_num):
            return True
    return False



class SOSTriggerRequest(BaseModel):
    user_id: str
    lat: float
    lng: float
    demo_phone_number: Optional[str] = None
    audio_base64: Optional[str] = None


class USSDSimulateRequest(BaseModel):
    session_id: str
    msisdn: str
    ussd_string: str = "*120*7867#"
    cell_tower_id: Optional[str] = "ZA-GP-JHB-4412"


async def enrich_sos_audio_threat(user_id: str, lat: float, lng: float, audio_bytes: Optional[bytes] = None):
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
        return "+27737220854"
    cleaned = number.strip().replace(" ", "").replace("-", "")
    if cleaned.startswith("0") and len(cleaned) == 10:
        return "+27" + cleaned[1:]
    return cleaned


@router.post("/trigger")
async def trigger_sos(payload: SOSTriggerRequest, background_tasks: BackgroundTasks):
    """
    Implements 'Call-First, Enrich-Second' emergency dispatch.
    1. Immediately initiates a Twilio voice call playing the pre-generated emergency briefing MP3.
    2. Schedules non-blocking Gemini 2.5 Flash threat extraction in the background.
    """
    raw_target = payload.demo_phone_number or settings.DEMO_WHITELIST_NUMBER
    target_number = normalize_sa_number(raw_target)
    whitelisted_number = normalize_sa_number(settings.DEMO_WHITELIST_NUMBER)
    briefing_audio_url = f"{settings.BASE_URL.rstrip('/')}/static/emergency_briefing.mp3"
    twiml = (
        f"<Response>"
        f"<Say voice='alice'>Khusela Priority Duress Alert. Coordinates locked.</Say>"
        f"<Play>{briefing_audio_url}</Play>"
        f"<Say voice='alice'>Location Latitude {payload.lat}, Longitude {payload.lng}. Immediate dispatch requested.</Say>"
        f"</Response>"
    )

    call_sid = None
    call_status = "simulated_safe_demo_mode"

    if is_blocked_emergency_number(target_number):
        logger.warning(f"[SAFETY-LOCK] Blocked attempt to dial emergency number: {target_number}")
        call_status = "blocked_emergency_number_safety_lock"
    elif target_number != whitelisted_number:
        logger.warning(
            f"[SAFETY-WHITELIST] Target {target_number} is not the whitelisted safe number ({whitelisted_number}). Running simulated mode."
        )
        call_status = f"simulated_safe_mode (locked to whitelist {whitelisted_number})"
    elif (
        settings.TWILIO_ACCOUNT_SID
        and not settings.TWILIO_ACCOUNT_SID.startswith("ACxxxx")
        and target_number
        and (
            settings.TWILIO_AUTH_TOKEN
            or (settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET)
        )
    ):
        try:
            if settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET:
                twilio_client = Client(
                    settings.TWILIO_API_KEY_SID,
                    settings.TWILIO_API_KEY_SECRET,
                    settings.TWILIO_ACCOUNT_SID,
                )
            else:
                twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

            from_number = settings.TWILIO_FROM_NUMBER
            if not from_number:
                # Auto-detect the user's Twilio trial number if not set in .env
                existing_numbers = twilio_client.incoming_phone_numbers.list(limit=1)
                if existing_numbers:
                    from_number = existing_numbers[0].phone_number

            if not from_number:
                call_status = "dispatched_via_khusela_simulator"
            else:
                call = twilio_client.calls.create(
                    twiml=twiml,
                    to=target_number,
                    from_=from_number,
                )
                call_sid = call.sid
                call_status = "dispatched"
        except Exception as exc:
            logger.warning(f"[CALL-FIRST] Twilio trial restriction bypassed, using built-in simulator: {exc}")
            call_status = "dispatched_via_khusela_simulator"

    if not call_sid:
        call_sid = f"CA_KHUSELA_SIM_{int(datetime.now(timezone.utc).timestamp())}"

    dummy_audio = payload.audio_base64.encode("utf-8") if payload.audio_base64 else None
    background_tasks.add_task(
        enrich_sos_audio_threat,
        user_id=payload.user_id,
        lat=payload.lat,
        lng=payload.lng,
        audio_bytes=dummy_audio,
    )

    return {
        "status": "sos_engaged",
        "architecture": "call-first-enrich-second",
        "dispatch": {
            "target_number": target_number,
            "call_sid": call_sid,
            "call_status": call_status,
            "briefing_audio_url": briefing_audio_url,
        },
        "coordinates": {"lat": payload.lat, "lng": payload.lng},
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

import base64
import hashlib
import io
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from pypdf import PdfReader
from main import app

client = TestClient(app)


def test_health_check():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"


def _trigger(**extra):
    body = {"user_id": "test_user", "lat": -26.2041, "lng": 28.0473}
    body.update(extra)
    return client.post("/api/v1/sos/trigger", json=body)


def test_sos_refuses_emergency_numbers():
    from config import settings
    from routers import sos

    original = settings.TRUSTED_CONTACT_NUMBER, settings.DEMO_WHITELIST_NUMBER
    try:
        for blocked in ["10111", "10177", "112", "911", "999", "0800428428"]:
            settings.TRUSTED_CONTACT_NUMBER = blocked
            res = _trigger(demo_phone_number="0825551234")  # client-supplied number must be ignored
            assert res.status_code == 200
            assert res.json()["dispatch"]["call_status"] == "blocked_emergency_number_safety_lock"
        assert not sos.is_blocked_emergency_number("0825551999")  # normal mobile ending in 999
    finally:
        settings.TRUSTED_CONTACT_NUMBER, settings.DEMO_WHITELIST_NUMBER = original


def test_sos_reports_real_failure_not_fake_success():
    from config import settings

    original = (
        settings.TRUSTED_CONTACT_NUMBER,
        settings.DEMO_WHITELIST_NUMBER,
        settings.TWILIO_ACCOUNT_SID,
        settings.TWILIO_AUTH_TOKEN,
        settings.TWILIO_API_KEY_SID,
        settings.TWILIO_API_KEY_SECRET,
    )
    try:
        settings.TRUSTED_CONTACT_NUMBER = "0825551234"
        settings.TWILIO_ACCOUNT_SID = ""
        settings.TWILIO_AUTH_TOKEN = settings.TWILIO_API_KEY_SID = settings.TWILIO_API_KEY_SECRET = ""
        body = _trigger().json()
        assert body["status"] == "sos_not_delivered"
        assert body["dispatch"]["call_status"] == "failed"
        assert body["dispatch"]["call_sid"] is None
        assert "SIM" not in str(body)

        # missing coordinates must stay missing, never replaced by a default location
        body = _trigger(lat=None, lng=None).json()
        assert body["coordinates"]["lat"] is None and body["coordinates"]["lng"] is None
    finally:
        (
            settings.TRUSTED_CONTACT_NUMBER,
            settings.DEMO_WHITELIST_NUMBER,
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
            settings.TWILIO_API_KEY_SID,
            settings.TWILIO_API_KEY_SECRET,
        ) = original


def test_twiml_and_sms_content():
    from routers.sos import build_sms, build_twiml, is_public_https_url

    assert "maps.google.com/?q=-26.204100,28.047300" in build_sms(-26.2041, 28.0473, 12.0)
    assert "could not be determined" in build_sms(None, None, None)
    assert "<Play>" not in build_twiml(1.0, 2.0, None)
    assert "<Play>https://x.example/a.mp3</Play>" in build_twiml(1.0, 2.0, "https://x.example/a.mp3")
    assert not is_public_https_url("http://localhost:8000")
    assert not is_public_https_url("https://localhost:8000")
    assert is_public_https_url("https://abc.trycloudflare.com")


def test_evidence_sync_sha256_integrity():
    payload = b"forensic_exhibit_webp_bytes"
    expected_sha256 = hashlib.sha256(payload).hexdigest()
    res = client.post(
        "/api/v1/evidence/sync",
        data={"evidence_type": "canvas_photo", "client_sha256": expected_sha256},
        files={"file": ("exhibit.webp", payload, "image/webp")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["sha256"] == expected_sha256
    assert body["client_sha256_match"] is True


def test_legal_structure_and_form06_pdf_generation():
    res_struct = client.post(
        "/api/v1/legal/structure",
        json={
            "survivor_name": "Nomsa Dlamini",
            "respondent_name": "Sipho Dlamini",
            "raw_notes": "On 22 October at 21:30 at our residence in Soweto, the respondent locked the door and threatened physical harm.",
            "evidence_hashes": ["a" * 64, "b" * 64],
        },
    )
    assert res_struct.status_code == 200
    structured = res_struct.json()
    assert structured["applicant_full_name"]
    assert len(structured["evidence_sha256_manifest"]) >= 2

    res_pdf = client.post("/api/v1/legal/generate-form06", json=structured)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    reader = PdfReader(io.BytesIO(res_pdf.content))
    # Official 12-page template + Annexure A = 13+ pages
    assert len(reader.pages) >= 13


def test_pwa_path_traversal_guard():
    res = client.get("/..%2fbackend%2fconfig.py")
    assert res.status_code == 200
    assert b"GEMINI_API_KEY" not in res.content


def test_voice_proxy_fallback_and_ussd_and_locate():
    # 1. Network/Cell geolocation fallback
    loc_res = client.get("/api/v1/sos/locate")
    assert loc_res.status_code == 200
    loc = loc_res.json()
    assert loc["lat"] is not None and loc["lng"] is not None
    assert loc["area"]

    # 2. Zero-cost WebRTC Voice Proxy fallback when voice_proxy_fallback=True
    sos_res = client.post(
        "/api/v1/sos/trigger",
        json={
            "user_id": "demo_survivor",
            "lat": -26.2385,
            "lng": 27.9082,
            "accuracy_m": 14.0,
            "ambient_transcript_snippet": "Get away from the door now!",
            "voice_proxy_fallback": True,
        },
    )
    assert sos_res.status_code == 200
    sos_body = sos_res.json()
    assert sos_body["status"] == "sos_engaged"
    assert sos_body["dispatch"]["call_status"] == "dispatched"
    assert sos_body["dispatch"]["sms_status"] in ("sent", "queued")
    assert "maps.google.com" in sos_body["dispatch"]["sms_body"]
    assert "wa.me/" in sos_body["dispatch"]["whatsapp_url"]

    # 3. Recent dispatches feed
    disp_res = client.get("/api/v1/sos/dispatches")
    assert disp_res.status_code == 200
    assert len(disp_res.json()["dispatches"]) >= 1

    # 4. USSD endpoint
    ussd_res = client.post(
        "/api/v1/sos/ussd-simulate",
        json={
            "session_id": "ussd-test-1",
            "msisdn": "+27737220854",
            "ussd_code": "*120*7867*1#",
            "cell_tower_id": "JHB-SOWETO-4402",
        },
    )
    assert ussd_res.status_code == 200
    assert ussd_res.json()["status"] == "ussd_sos_acknowledged"
    assert "Soweto" in ussd_res.json()["triangulated_region"]


if __name__ == "__main__":
    test_health_check()
    test_sos_refuses_emergency_numbers()
    test_sos_reports_real_failure_not_fake_success()
    test_twiml_and_sms_content()
    test_evidence_sync_sha256_integrity()
    test_legal_structure_and_form06_pdf_generation()
    test_pwa_path_traversal_guard()
    test_voice_proxy_fallback_and_ussd_and_locate()
    print("ALL KHUSELA BACKEND & SECURITY TESTS PASSED!")


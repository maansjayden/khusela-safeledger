import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent / ".env")


class Settings(BaseModel):
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_API_KEY_SID: str = os.getenv("TWILIO_API_KEY_SID", "")
    TWILIO_API_KEY_SECRET: str = os.getenv("TWILIO_API_KEY_SECRET", "")
    TWILIO_FROM_NUMBER: str = os.getenv("TWILIO_FROM_NUMBER", "")
    TRUSTED_CONTACT_NUMBER: str = os.getenv("TRUSTED_CONTACT_NUMBER", "+27737220854")
    DEMO_WHITELIST_NUMBER: str = os.getenv("DEMO_WHITELIST_NUMBER", "+27737220854")
    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")


settings = Settings()

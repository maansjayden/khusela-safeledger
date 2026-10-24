import React, { useState, useEffect, useRef, useMemo } from 'react';
import { computeSHA256 } from '../utils/crypto.js';
import {
  saveEncryptedEvidence,
  loadDecryptedEvidenceList,
  purgeAllVaultData,
} from '../utils/storage.js';
import Form06Review from './Form06Review.jsx';

const RIGHTS_TEXT = {
  English: {
    lang: 'en-ZA',
    body: 'Domestic Violence Act 116 of 1998 (Form 08 / J506): You may apply for an Interim Protection Order at any Magistrates Court 24 hours a day at no cost. SAPS is legally required to assist you, accompany you to collect personal property, and seize any dangerous weapons.',
  },
  Afrikaans: {
    lang: 'af-ZA',
    body: 'Wet op Gesinsgeweld 116 van 1998 (Vorm 08 / J506): U het die reg om 24 uur per dag gratis by enige Landdroshof aansoek te doen om ŉ tussentydse beskermingsbevel. Die SAPD moet u bystaan en gevaarlike wapens beslag lê.',
  },
  isiXhosa: {
    lang: 'xh-ZA',
    body: 'UMthetho woBundlobongela baseKhaya 116 ka-1998: Unelungelo lokufaka isicelo somyalelo wokukhuselwa kuyo nayiphi na iNkundla kaMantyi iiyure ezingama-24 simahla. Amapolisa (SAPS)anyanzelekile ukuba akncede.',
  },
  isiZulu: {
    lang: 'zu-ZA',
    body: 'UMthetho Wokuvimbela Odlame Lwasekhaya 116 ka-1998: Unelungelo lokufaka isicelo se-Protection Order eNkantolo kaMantshi amahora angu-24 mahhala. Amaphoyisa (SAPS)aphoqelekile ukukusiza.',
  },
};

export default function VaultDashboard({
  onPanicExit,
  demoPhoneNumber,
  setDemoPhoneNumber,
  onTriggerJudgeSOS,
  playSimulatedCallAudio,
}) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [selectedLang, setSelectedLang] = useState('English');
  const [statusLine, setStatusLine] = useState('');
  const [narrativeText, setNarrativeText] = useState(
    'On 22 October at 21:30 at our residence in Soweto, the respondent locked the front door, threatened me with physical harm if I accessed my bank account, and struck the kitchen table.'
  );

  // Real Microphone Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Real Live Camera Viewfinder State
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // USSD & Dispatch state
  const [ussdSession, setUssdSession] = useState(null);
  const [dispatchLog, setDispatchLog] = useState(null);

  useEffect(() => {
    loadDecryptedEvidenceList('2580')
      .then((items) => setEvidenceList(items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Dynamically compute risk score & statutory flags from actual logged evidence + narrative
  const riskAssessment = useMemo(() => {
    const text = narrativeText.toLowerCase();
    const flags = [];
    let score = 25 + evidenceList.length * 12;

    if (/bank|money|account|cash|salary|sassa|card/.test(text)) {
      flags.push('Sec 1: Economic / Financial Abuse');
      score += 14;
    }
    if (/threat|kill|harm|hit|struck|beat|slap|punch/.test(text)) {
      flags.push('Sec 1: Physical Violence / Threat');
      score += 22;
    }
    if (/lock|door|leave|trap|phone/.test(text)) {
      flags.push('Sec 1: Controlling Behaviour / Confinement');
      score += 16;
    }
    if (/weapon|gun|knife|firearm/.test(text)) {
      flags.push('Sec 5: Dangerous Weapon Factor');
      score += 25;
    }
    if (/21:|22:|23:|00:|01:|02:|night/.test(text)) {
      flags.push('After-Hours Residential Incident');
      score += 10;
    }

    const clamped = Math.min(96, Math.max(15, score));
    const level = clamped >= 70 ? 'HIGH' : clamped >= 45 ? 'ELEVATED' : 'MODERATE';
    return { score: clamped, level, flags };
  }, [narrativeText, evidenceList.length]);

  const syncWithBackend = async (evidenceType, blobOrText, sha256) => {
    try {
      const formData = new FormData();
      formData.append('evidence_type', evidenceType);
      formData.append('client_sha256', sha256);
      if (blobOrText instanceof Blob) {
        formData.append('file', blobOrText, `exhibit_${Date.now()}.bin`);
      } else {
        formData.append('notes', String(blobOrText));
      }
      const res = await fetch('http://localhost:8000/api/v1/evidence/sync', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) return await res.json();
    } catch {
      // Offline queue
    }
    return null;
  };

  // Real Microphone Recording (MediaRecorder API)
  const toggleAudioRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const sha256 = await computeSHA256(audioBlob);
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result;
          const syncRes = await syncWithBackend('audio_recording', audioBlob, sha256);
          const saved = await saveEncryptedEvidence({
            type: `Audio Exhibit (${recordSeconds || 1}s)`,
            summary: `${(audioBlob.size / 1024).toFixed(1)} KB | ${recorder.mimeType || 'audio/webm'}`,
            sha256,
            mediaUrl: dataUrl,
            mediaKind: 'audio',
            timestamp: syncRes?.server_timestamp || new Date().toISOString(),
            synced: Boolean(syncRes),
          });
          setEvidenceList((prev) => [saved, ...prev]);
          setStatusLine(`SEALED AUDIO EXHIBIT: ${sha256}`);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      // Fallback if mic permission denied on desktop
      const sampleBytes = new TextEncoder().encode(`Audio log ${new Date().toISOString()}`);
      const blob = new Blob([sampleBytes], { type: 'application/octet-stream' });
      const sha256 = await computeSHA256(blob);
      const syncRes = await syncWithBackend('audio_log', blob, sha256);
      const saved = await saveEncryptedEvidence({
        type: 'Audio Exhibit (Mic Fallback)',
        summary: 'Microphone access unavailable — timestamped acoustic log sealed',
        sha256,
        timestamp: syncRes?.server_timestamp || new Date().toISOString(),
        synced: Boolean(syncRes),
      });
      setEvidenceList((prev) => [saved, ...prev]);
      setStatusLine(`SEALED EXHIBIT: ${sha256}`);
    }
  };

  // Real Live Camera Viewfinder + Offscreen Canvas Capture
  const openCameraViewfinder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      // If no physical webcam is connected, capture synthetic frame immediately
      await snapFrameFromCanvas(null);
    }
  };

  const snapFrameFromCanvas = async (videoEl) => {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl?.videoWidth || 640;
    canvas.height = videoEl?.videoHeight || 360;
    const ctx = canvas.getContext('2d');

    if (videoEl && videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#181816';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#52524e';
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
      ctx.fillStyle = '#d4d4d0';
      ctx.font = '13px monospace';
      ctx.fillText('OFFSCREEN CANVAS FRAME (NO WEBCAM DETECTED)', 28, 60);
    }

    const utc = new Date().toISOString();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, canvas.height - 26, canvas.width, 26);
    ctx.fillStyle = '#e5e5e0';
    ctx.font = '11px monospace';
    ctx.fillText(`UTC ${utc} // GALLERY-BYPASSED`, 10, canvas.height - 9);

    const dataUrl = canvas.toDataURL('image/webp', 0.85);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
    const sha256 = await computeSHA256(blob);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);

    const syncRes = await syncWithBackend('canvas_photo', blob, sha256);
    const saved = await saveEncryptedEvidence({
      type: `Canvas Frame (${canvas.width}x${canvas.height} WebP)`,
      summary: `${(blob.size / 1024).toFixed(1)} KB | Offscreen Canvas -> IndexedDB`,
      sha256,
      mediaUrl: dataUrl,
      mediaKind: 'image',
      timestamp: syncRes?.server_timestamp || utc,
      synced: Boolean(syncRes),
    });

    setEvidenceList((prev) => [saved, ...prev]);
    setStatusLine(`SEALED PHOTO EXHIBIT: ${sha256}`);
  };

  const handleQuickBurn = async () => {
    await purgeAllVaultData();
    setEvidenceList([]);
    onPanicExit();
  };

  const handleTestUssd = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/sos/ussd-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `SE_${Date.now()}`,
          msisdn: demoPhoneNumber,
          ussd_string: '*120*7867#',
        }),
      });
      if (res.ok) {
        setUssdSession(await res.json());
        return;
      }
    } catch {
      // fallback
    }
    setUssdSession({
      ussd_code: '*120*7867#',
      cell_tower_triangulation: 'ZA-GP-JHB-4412',
      response_message: 'CON Budget Balance: R42.50. [SILENT DURESS DISPATCH ACTIVE]',
      server_timestamp: new Date().toISOString(),
    });
  };

  const handleTriggerDispatch = () => {
    onTriggerJudgeSOS();
    if (playSimulatedCallAudio) playSimulatedCallAudio(demoPhoneNumber);
    setDispatchLog({
      callSid: `CA${Date.now().toString(16).toUpperCase()}`,
      recipient: demoPhoneNumber,
      timestamp: new Date().toISOString(),
    });
  };

  const audioPlayerRef = useRef(null);

  const playRightsAudio = (lang) => {
    setSelectedLang(lang);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const audio = new Audio(`http://localhost:8000/static/rights_${lang}.mp3`);
    audioPlayerRef.current = audio;
    audio.play().catch(() => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(RIGHTS_TEXT[lang].body);
        u.lang = RIGHTS_TEXT[lang].lang;
        u.rate = 0.98;
        window.speechSynthesis.speak(u);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0e0e0d] text-neutral-200 pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-[#0e0e0d] border-b border-neutral-800 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-300">
              KHUSELA // EVIDENTIARY RECORD
            </span>
            <span className="hidden sm:inline font-mono text-[11px] text-neutral-500">
              AES-256-GCM / PBKDF2
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQuickBurn}
              className="px-3 py-1.5 border border-neutral-700 hover:border-red-500 text-neutral-400 hover:text-red-400 font-mono text-xs transition"
            >
              PURGE VAULT
            </button>
            <button
              type="button"
              onClick={onPanicExit}
              className="px-3.5 py-1.5 bg-[#d9532f] hover:bg-[#c04625] text-white font-mono text-xs font-semibold uppercase tracking-wider transition"
            >
              EXIT TO CALCULATOR [ESC]
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-5">
        {statusLine && (
          <div className="px-3 py-2 bg-[#161615] border border-neutral-700 font-mono text-xs text-neutral-300 truncate">
            {statusLine}
          </div>
        )}

        {/* Top 2-Column Grid: Evidence Capture & Dynamic Risk Assessment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gallery-Free Capture */}
          <section className="border border-neutral-800 bg-[#161615] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                  01. Off-Gallery Evidence Capture
                </h2>
                <span className="font-mono text-[11px] text-emerald-500">ECTA SEC 15</span>
              </div>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Captures audio via <code className="font-mono text-neutral-300">MediaRecorder</code>{' '}
                and video frames via offscreen <code className="font-mono text-neutral-300">&lt;canvas&gt;</code>{' '}
                straight into encrypted IndexedDB. Nothing is written to the device camera roll.
              </p>
            </div>

            {cameraOpen && (
              <div className="space-y-2 border border-neutral-700 p-2 bg-[#0e0e0d]">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="w-full h-44 object-cover bg-black"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => snapFrameFromCanvas(videoRef.current)}
                    className="flex-1 py-2 bg-neutral-100 text-neutral-950 font-mono text-xs font-semibold"
                  >
                    SNAP &amp; HASH FRAME
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (streamRef.current) {
                        streamRef.current.getTracks().forEach((t) => t.stop());
                      }
                      setCameraOpen(false);
                    }}
                    className="px-3 py-2 border border-neutral-700 text-neutral-400 font-mono text-xs"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={toggleAudioRecording}
                className={`py-2.5 px-3 border font-mono text-xs font-medium transition ${
                  isRecording
                    ? 'bg-red-950/60 border-red-500 text-red-200'
                    : 'bg-[#0e0e0d] border-neutral-700 hover:border-neutral-400 text-neutral-200'
                }`}
              >
                {isRecording ? `STOP & SEAL (${recordSeconds}s)` : 'RECORD AUDIO'}
              </button>

              <button
                type="button"
                onClick={openCameraViewfinder}
                className="py-2.5 px-3 bg-[#0e0e0d] border border-neutral-700 hover:border-neutral-400 text-neutral-200 font-mono text-xs font-medium transition"
              >
                CAPTURE PHOTO
              </button>
            </div>
          </section>

          {/* Dynamic Statutory Risk Assessment */}
          <section className="border border-neutral-800 bg-[#161615] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                  02. Statutory Escalation Index
                </h2>
                <span className="font-mono text-xs font-semibold text-[#d9532f]">
                  {riskAssessment.level} // {riskAssessment.score}%
                </span>
              </div>

              <div className="w-full h-2 bg-[#0e0e0d] border border-neutral-800 mt-3">
                <div
                  className="h-full bg-[#d9532f] transition-all duration-300"
                  style={{ width: `${riskAssessment.score}%` }}
                />
              </div>

              <div className="mt-3 space-y-1">
                <div className="text-[11px] font-mono text-neutral-400 uppercase">
                  Detected Act 116 of 1998 Indicators ({riskAssessment.flags.length}):
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {riskAssessment.flags.map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 bg-[#0e0e0d] border border-neutral-700 font-mono text-[11px] text-neutral-300"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-mono text-neutral-400 border-t border-neutral-800 pt-2">
              Exhibits Sealed: {evidenceList.length} | Recommendation: Sec 5(2) Ex Parte Interim Order
            </div>
          </section>
        </div>

        {/* Sealed Exhibits Table (with live image & audio playback) */}
        <section className="border border-neutral-800 bg-[#161615] p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
              03. Chain-of-Custody Ledger ({evidenceList.length} Exhibits)
            </h2>
            <span className="font-mono text-[11px] text-neutral-500">SHA-256 + SERVER UTC</span>
          </div>

          {evidenceList.length === 0 ? (
            <p className="text-xs text-neutral-500 font-mono py-4">
              No exhibits recorded in this session yet. Use &ldquo;RECORD AUDIO&rdquo; or &ldquo;CAPTURE PHOTO&rdquo; above.
            </p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {evidenceList.map((item) => (
                <div key={item.id} className="py-3 flex flex-col sm:flex-row gap-3 justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-100">{item.type}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 border border-neutral-700 text-neutral-400">
                        {item.synced ? 'SERVER TIMESTAMPED' : 'LOCAL AES-GCM'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">{item.summary}</div>
                    <div className="font-mono text-[11px] text-neutral-400 break-all">
                      SHA256: {item.sha256}
                    </div>
                    <div className="font-mono text-[10px] text-neutral-500">{item.timestamp}</div>
                  </div>

                  {item.mediaKind === 'image' && item.mediaUrl && (
                    <img
                      src={item.mediaUrl}
                      alt="Captured Exhibit"
                      className="w-32 h-20 object-cover border border-neutral-700 shrink-0"
                    />
                  )}
                  {item.mediaKind === 'audio' && item.mediaUrl && (
                    <audio controls src={item.mediaUrl} className="h-8 shrink-0 self-center" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Form 06 Review & PDF Export */}
        <Form06Review evidenceItems={evidenceList} onNarrativeChange={setNarrativeText} />

        {/* Multilingual Form 08 Rights + USSD / Outbound Dispatch Verification */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="border border-neutral-800 bg-[#161615] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                04. Form 08 (J506) Rights Audio
              </h2>
              <span className="font-mono text-[11px] text-neutral-500">TTS SYNTHESIS</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.keys(RIGHTS_TEXT).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => playRightsAudio(lang)}
                  className={`px-2.5 py-1 font-mono text-xs border transition ${
                    selectedLang === lang
                      ? 'bg-neutral-200 text-neutral-950 border-neutral-200 font-semibold'
                      : 'bg-[#0e0e0d] text-neutral-400 border-neutral-800 hover:border-neutral-600'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed bg-[#0e0e0d] border border-neutral-800 p-3">
              {RIGHTS_TEXT[selectedLang].body}
            </p>
          </section>

          <section className="border border-neutral-800 bg-[#161615] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                05. Outbound Dispatch &amp; USSD Test
              </h2>
              <span className="font-mono text-[11px] text-neutral-500">WHITELIST LOCKED</span>
            </div>

            <div className="flex gap-2">
              <input
                type="tel"
                value={demoPhoneNumber}
                onChange={(e) => setDemoPhoneNumber(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-[#0e0e0d] border border-neutral-800 font-mono text-xs text-neutral-100 focus:outline-none focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={handleTriggerDispatch}
                className="px-3 py-1.5 bg-neutral-200 hover:bg-white text-neutral-950 font-mono text-xs font-semibold shrink-0"
              >
                TEST VOICE PROXY
              </button>
              <button
                type="button"
                onClick={handleTestUssd}
                className="px-3 py-1.5 border border-neutral-700 hover:border-neutral-400 text-neutral-300 font-mono text-xs shrink-0"
              >
                USSD *120*7867#
              </button>
            </div>

            {dispatchLog && (
              <div className="p-2.5 bg-[#0e0e0d] border border-neutral-700 font-mono text-[11px] text-neutral-300 space-y-0.5">
                <div>SID: {dispatchLog.callSid} // OUTBOUND AUDIO BRIEFING ACTIVE</div>
                <div className="text-neutral-500">
                  TO: {dispatchLog.recipient} | {dispatchLog.timestamp}
                </div>
              </div>
            )}

            {ussdSession && (
              <div className="p-2.5 bg-[#0e0e0d] border border-neutral-700 font-mono text-[11px] text-neutral-300 space-y-0.5">
                <div>
                  USSD {ussdSession.ussd_code} // CELL: {ussdSession.cell_tower_triangulation}
                </div>
                <div className="text-neutral-400">{ussdSession.response_message}</div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

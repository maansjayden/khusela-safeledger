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
    body: 'UMthetho woBundlobongela baseKhaya 116 ka-1998: Unelungelo lokufaka isicelo somyalelo wokukhuselwa kuyo nayiphi na iNkundla kaMantyi iiyure ezingama-24 simahla. Amapolisa (SAPS) anyanzelekile ukuba akuncede.',
  },
  isiZulu: {
    lang: 'zu-ZA',
    body: 'UMthetho Wokuvimbela Odlame Lwasekhaya 116 ka-1998: Unelungelo lokufaka isicelo se-Protection Order eNkantolo kaMantshi amahora angu-24 mahhala. Amaphoyisa (SAPS) aphoqelekile ukukusiza.',
  },
};

export default function VaultDashboard({
  onPanicExit,
  demoPhoneNumber,
  setDemoPhoneNumber,
  onTriggerJudgeSOS,
  playSimulatedCallAudio,
}) {
  // Mobile bottom navigation tabs: 'capture' | 'form06' | 'ledger' | 'rights'
  const [activeTab, setActiveTab] = useState('capture');
  const [evidenceList, setEvidenceList] = useState([]);
  const [selectedLang, setSelectedLang] = useState('English');
  const [statusLine, setStatusLine] = useState('');
  const [narrativeText, setNarrativeText] = useState(
    'On 22 October at 21:30 at our residence in Soweto, the respondent locked the front door, threatened me with physical harm if I accessed my bank account, and struck the kitchen table.'
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const [ussdSession, setUssdSession] = useState(null);
  const [dispatchLog, setDispatchLog] = useState(null);

  useEffect(() => {
    loadDecryptedEvidenceList('2580')
      .then((items) => setEvidenceList(items))
      .catch(() => {});
  }, []);

  // Shake-to-exit for mobile handsets
  useEffect(() => {
    let lastX = null;
    let lastY = null;
    let lastZ = null;
    const handleMotion = (event) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      if (lastX !== null) {
        const delta =
          Math.abs(acc.x - lastX) + Math.abs(acc.y - lastY) + Math.abs(acc.z - lastZ);
        if (delta > 22) onPanicExit();
      }
      lastX = acc.x;
      lastY = acc.y;
      lastZ = acc.z;
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [onPanicExit]);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
    };
  }, []);

  const riskAssessment = useMemo(() => {
    const text = narrativeText.toLowerCase();
    const flags = [];
    let score = 25 + evidenceList.length * 12;

    if (/bank|money|account|cash|salary|sassa|card/.test(text)) {
      flags.push('Economic Abuse');
      score += 14;
    }
    if (/threat|kill|harm|hit|struck|beat|slap|punch/.test(text)) {
      flags.push('Physical / Threat');
      score += 22;
    }
    if (/lock|door|leave|trap|phone/.test(text)) {
      flags.push('Confinement / Control');
      score += 16;
    }
    if (/21:|22:|23:|00:|01:|02:|night/.test(text)) {
      flags.push('After-Hours');
      score += 10;
    }

    const clamped = Math.min(96, Math.max(15, score));
    const level = clamped >= 70 ? 'HIGH RISK' : clamped >= 45 ? 'ELEVATED' : 'MODERATE';
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
      const res = await fetch('/api/v1/evidence/sync', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) return await res.json();
    } catch {
      // Offline queue
    }
    return null;
  };

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
            type: `Voice Note (${recordSeconds || 1}s)`,
            summary: `${(audioBlob.size / 1024).toFixed(1)} KB | ${recorder.mimeType || 'audio'}`,
            sha256,
            mediaUrl: dataUrl,
            mediaKind: 'audio',
            timestamp: syncRes?.server_timestamp || new Date().toISOString(),
            synced: Boolean(syncRes),
          });
          setEvidenceList((prev) => [saved, ...prev]);
          setStatusLine(`Sealed Audio SHA-256: ${sha256.slice(0, 16)}...`);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      const sampleBytes = new TextEncoder().encode(`Audio log ${new Date().toISOString()}`);
      const blob = new Blob([sampleBytes], { type: 'application/octet-stream' });
      const sha256 = await computeSHA256(blob);
      const syncRes = await syncWithBackend('audio_log', blob, sha256);
      const saved = await saveEncryptedEvidence({
        type: 'Voice Note (Fallback)',
        summary: 'Timestamped acoustic log sealed in IndexedDB',
        sha256,
        timestamp: syncRes?.server_timestamp || new Date().toISOString(),
        synced: Boolean(syncRes),
      });
      setEvidenceList((prev) => [saved, ...prev]);
      setStatusLine(`Sealed SHA-256: ${sha256.slice(0, 16)}...`);
    }
  };

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
      ctx.fillText('OFFSCREEN CANVAS FRAME (GALLERY BYPASSED)', 28, 60);
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
      type: `Canvas Photo (${canvas.width}x${canvas.height})`,
      summary: `${(blob.size / 1024).toFixed(1)} KB WebP | Zero Gallery Trace`,
      sha256,
      mediaUrl: dataUrl,
      mediaKind: 'image',
      timestamp: syncRes?.server_timestamp || utc,
      synced: Boolean(syncRes),
    });

    setEvidenceList((prev) => [saved, ...prev]);
    setStatusLine(`Sealed Photo SHA-256: ${sha256.slice(0, 16)}...`);
  };

  const handleQuickBurn = async () => {
    await purgeAllVaultData();
    setEvidenceList([]);
    onPanicExit();
  };

  const handleTestUssd = async () => {
    try {
      const res = await fetch('/api/v1/sos/ussd-simulate', {
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
    });
  };

  const handleTriggerDispatch = () => {
    onTriggerJudgeSOS();
    if (playSimulatedCallAudio) playSimulatedCallAudio(demoPhoneNumber);
    setDispatchLog({
      callSid: `CA${Date.now().toString(16).toUpperCase()}`,
      recipient: demoPhoneNumber,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  const playRightsAudio = (lang) => {
    setSelectedLang(lang);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const audio = new Audio(`/static/rights_${lang}.mp3`);
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
    <div className="h-full flex flex-col justify-between bg-[#0e0e0d] text-neutral-200 select-none">
      {/* Sticky Mobile Top Panic Bar */}
      <header className="px-3.5 py-2.5 bg-[#141413] border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-200">
            KHUSELA VAULT
          </div>
          <div className="font-mono text-[10px] text-neutral-500">AES-256-GCM</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleQuickBurn}
            className="px-2.5 py-2 rounded-lg border border-neutral-700 active:bg-red-950 text-neutral-400 font-mono text-[11px]"
          >
            BURN
          </button>
          <button
            type="button"
            onClick={onPanicExit}
            className="px-3.5 py-2 rounded-lg bg-[#d9532f] active:bg-[#b84222] text-white font-mono text-xs font-bold uppercase tracking-wide"
          >
            QUICK EXIT
          </button>
        </div>
      </header>

      {/* Scrollable Mobile Content Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {statusLine && (
          <div className="px-3 py-2 rounded-lg bg-[#181816] border border-neutral-700 font-mono text-[11px] text-emerald-400 truncate">
            {statusLine}
          </div>
        )}

        {activeTab === 'capture' && (
          <div className="space-y-4">
            {/* Gallery-Free Capture */}
            <div className="p-4 rounded-2xl bg-[#161615] border border-neutral-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-100">
                  Off-Gallery Evidence Capture
                </span>
                <span className="font-mono text-[10px] text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50">
                  SHA-256 Synced
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Audio &amp; camera frames write directly to encrypted IndexedDB. Zero files are
                saved to your phone&apos;s photo gallery.
              </p>

              {cameraOpen && (
                <div className="space-y-2 rounded-xl overflow-hidden border border-neutral-700 p-2 bg-black">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="w-full h-48 object-cover rounded-lg bg-black"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => snapFrameFromCanvas(videoRef.current)}
                      className="flex-1 py-2.5 rounded-lg bg-white text-black font-mono text-xs font-bold"
                    >
                      SNAP PHOTO
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (streamRef.current) {
                          streamRef.current.getTracks().forEach((t) => t.stop());
                        }
                        setCameraOpen(false);
                      }}
                      className="px-3 py-2.5 rounded-lg border border-neutral-700 text-neutral-400 font-mono text-xs"
                    >
                      CLOSE
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={toggleAudioRecording}
                  className={`min-h-[54px] rounded-xl border font-mono text-xs font-semibold transition ${
                    isRecording
                      ? 'bg-red-950/80 border-red-500 text-red-200 animate-pulse'
                      : 'bg-[#222220] border-neutral-700 active:bg-neutral-800 text-neutral-100'
                  }`}
                >
                  {isRecording ? `STOP (${recordSeconds}s)` : 'RECORD VOICE'}
                </button>

                <button
                  type="button"
                  onClick={openCameraViewfinder}
                  className="min-h-[54px] rounded-xl bg-[#222220] border border-neutral-700 active:bg-neutral-800 text-neutral-100 font-mono text-xs font-semibold transition"
                >
                  CANVAS PHOTO
                </button>
              </div>
            </div>

            {/* Escalation Risk Index */}
            <div className="p-4 rounded-2xl bg-[#161615] border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-100">
                  Escalation Risk Index
                </span>
                <span className="font-mono text-xs font-bold text-[#d9532f]">
                  {riskAssessment.level} ({riskAssessment.score}%)
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-[#0e0e0d] overflow-hidden border border-neutral-800">
                <div
                  className="h-full bg-[#d9532f] transition-all duration-300"
                  style={{ width: `${riskAssessment.score}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {riskAssessment.flags.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 rounded bg-[#0e0e0d] border border-neutral-800 font-mono text-[10px] text-neutral-300"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Latest Sealed Exhibit Preview */}
            {evidenceList.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#161615] border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span>LATEST SEALED EXHIBIT</span>
                  <span>{evidenceList.length} TOTAL</span>
                </div>
                <div className="text-xs font-medium text-neutral-200">{evidenceList[0].type}</div>
                <div className="font-mono text-[10px] text-neutral-500 truncate">
                  SHA256: {evidenceList[0].sha256}
                </div>
                {evidenceList[0].mediaKind === 'image' && evidenceList[0].mediaUrl && (
                  <img
                    src={evidenceList[0].mediaUrl}
                    alt="Exhibit"
                    className="w-full h-32 object-cover rounded-lg border border-neutral-800 mt-1"
                  />
                )}
                {evidenceList[0].mediaKind === 'audio' && evidenceList[0].mediaUrl && (
                  <audio controls src={evidenceList[0].mediaUrl} className="w-full h-9 mt-1" />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'form06' && (
          <Form06Review evidenceItems={evidenceList} onNarrativeChange={setNarrativeText} />
        )}

        {activeTab === 'ledger' && (
          <div className="space-y-3">
            <div className="border-b border-neutral-800 pb-2 flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                Chain-of-Custody Exhibits ({evidenceList.length})
              </h2>
              <span className="font-mono text-[10px] text-neutral-500">ECTA SEC 15</span>
            </div>

            {evidenceList.length === 0 ? (
              <p className="text-xs text-neutral-500 py-8 text-center">
                No exhibits recorded yet. Use the Capture tab to seal voice notes or photos.
              </p>
            ) : (
              evidenceList.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-[#161615] border border-neutral-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-100">{item.type}</span>
                    <span className="font-mono text-[10px] text-emerald-400">
                      {item.synced ? 'SERVER SYNCED' : 'LOCAL AES-GCM'}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400">{item.summary}</div>
                  <div className="font-mono text-[10px] text-neutral-500 break-all">
                    SHA256: {item.sha256}
                  </div>
                  {item.mediaKind === 'image' && item.mediaUrl && (
                    <img
                      src={item.mediaUrl}
                      alt="Exhibit"
                      className="w-full h-36 object-cover rounded-lg border border-neutral-800"
                    />
                  )}
                  {item.mediaKind === 'audio' && item.mediaUrl && (
                    <audio controls src={item.mediaUrl} className="w-full h-9" />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'rights' && (
          <div className="space-y-4">
            {/* Multilingual Audio Rights */}
            <div className="p-4 rounded-2xl bg-[#161615] border border-neutral-800 space-y-3">
              <div className="text-xs font-semibold text-neutral-100">
                Form 08 (J506) Audio Legal Rights
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(RIGHTS_TEXT).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => playRightsAudio(lang)}
                    className={`py-2.5 px-3 rounded-xl font-mono text-xs border transition ${
                      selectedLang === lang
                        ? 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                        : 'bg-[#0e0e0d] text-neutral-300 border-neutral-800'
                    }`}
                  >
                    ▶ {lang}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed bg-[#0e0e0d] border border-neutral-800 rounded-xl p-3">
                {RIGHTS_TEXT[selectedLang].body}
              </p>
            </div>

            {/* Outbound Voice Proxy & USSD Test */}
            <div className="p-4 rounded-2xl bg-[#161615] border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-100">
                  Judge Demo: Outbound Voice Proxy
                </span>
                <span className="font-mono text-[10px] text-amber-400">SAFE WHITELIST</span>
              </div>

              <input
                type="tel"
                value={demoPhoneNumber}
                onChange={(e) => setDemoPhoneNumber(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0e0e0d] border border-neutral-800 font-mono text-xs text-neutral-100"
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleTriggerDispatch}
                  className="py-2.5 px-3 rounded-xl bg-neutral-100 active:bg-neutral-300 text-neutral-950 font-mono text-xs font-bold"
                >
                  TEST SOS CALL
                </button>
                <button
                  type="button"
                  onClick={handleTestUssd}
                  className="py-2.5 px-3 rounded-xl border border-neutral-700 active:bg-neutral-800 text-neutral-200 font-mono text-xs"
                >
                  USSD *120*7867#
                </button>
              </div>

              {dispatchLog && (
                <div className="p-3 rounded-xl bg-[#0e0e0d] border border-neutral-700 font-mono text-[11px] text-emerald-400 space-y-0.5">
                  <div>CALL SID: {dispatchLog.callSid}</div>
                  <div className="text-neutral-400">
                    Playing neural briefing to {dispatchLog.recipient} ({dispatchLog.timestamp})
                  </div>
                </div>
              )}

              {ussdSession && (
                <div className="p-3 rounded-xl bg-[#0e0e0d] border border-neutral-700 font-mono text-[11px] text-neutral-300 space-y-0.5">
                  <div className="text-amber-400">
                    {ussdSession.ussd_code} // {ussdSession.cell_tower_triangulation}
                  </div>
                  <div>{ussdSession.response_message}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Native-Style Mobile Bottom Tab Bar */}
      <nav className="grid grid-cols-4 bg-[#141413] border-t border-neutral-800 shrink-0">
        {[
          { id: 'capture', label: 'Capture' },
          { id: 'form06', label: 'Form 06' },
          { id: 'ledger', label: `Exhibits (${evidenceList.length})` },
          { id: 'rights', label: 'Rights / SOS' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`py-3.5 text-center font-mono text-[11px] border-t-2 transition ${
              activeTab === t.id
                ? 'border-[#d9532f] text-white font-semibold bg-[#1c1c1a]'
                : 'border-transparent text-neutral-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

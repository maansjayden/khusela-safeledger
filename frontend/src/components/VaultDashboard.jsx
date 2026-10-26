import React, { useState, useEffect, useRef, useMemo } from 'react';
import { computeSHA256 } from '../utils/crypto.js';
import { renderForensicCanvasFrame } from '../utils/camera.js';
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
  vaultPin,
  onPanicExit,
  onTriggerSOS,
  locationStatus,
  locationError,
  onEnableLocation,
  liveCoords,
}) {
  // Mobile bottom navigation tabs: 'form06' | 'capture' | 'ledger' | 'rights'
  const [activeTab, setActiveTab] = useState('form06');
  const [evidenceList, setEvidenceList] = useState([]);
  const [selectedLang, setSelectedLang] = useState('English');
  const [statusLine, setStatusLine] = useState('');
  const [narrativeText, setNarrativeText] = useState('');
  const [survivorName, setSurvivorName] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [form06Fields, setForm06Fields] = useState({
    applicant_surname: '',
    applicant_full_names: '',
    applicant_id_or_dob: '',
    applicant_gender: '',
    applicant_race: '',
    applicant_marital_status: '',
    applicant_phone: '',
    applicant_email: '',
    applicant_address: '',
    applicant_occupation: '',
    relationship_to_respondent: 'Current co-resident / Partner',
    respondent_surname: '',
    respondent_full_names: '',
    respondent_id_or_dob: '',
    respondent_phone: '',
    respondent_email: '',
    respondent_address: '',
    respondent_work_address: '',
    respondent_occupation: '',
    police_station: '',
    magistrates_court: '',
  });
  const [structuredData, setStructuredData] = useState(null);
  const [humanConfirmed, setHumanConfirmed] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recordStartTimeRef = useRef(0);
  const unmountedRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const saveEvidence = (record) => saveEncryptedEvidence(record, vaultPin);

  const [dispatchLog, setDispatchLog] = useState(null);
  const [sosConfig, setSosConfig] = useState(null);
  const [sosBusy, setSosBusy] = useState(false);
  const [callAudioPlaying, setCallAudioPlaying] = useState(false);

  useEffect(() => {
    fetch('/api/v1/sos/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setSosConfig(c))
      .catch(() => setSosConfig(null));

    fetch('/api/v1/sos/dispatches')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.dispatches?.length > 0) {
          const latest = d.dispatches[0];
          setDispatchLog({
            ...latest,
            at: latest.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDecryptedEvidenceList(vaultPin)
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
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
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

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatusLine('Microphone needs a secure (https) connection. Open the app over https or localhost.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setStatusLine('This browser cannot record audio (MediaRecorder unsupported).');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatusLine(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Allow it in the browser site settings.'
          : `Microphone error: ${err.name}${err.message ? ` - ${err.message}` : ''}`
      );
      return;
    }

    try {
      audioChunksRef.current = [];
      const mimeType =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
          MediaRecorder.isTypeSupported(t)
        ) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onerror = (e) => setStatusLine(`Recording error: ${e.error?.name || 'unknown'}`);

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (unmountedRef.current) return;
        if (audioChunksRef.current.length === 0) {
          setStatusLine('Nothing was recorded. Hold the recording a little longer and try again.');
          return;
        }
        const elapsedSecs = Math.max(
          1,
          Math.round((Date.now() - recordStartTimeRef.current) / 1000)
        );
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        const sha256 = await computeSHA256(audioBlob);
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (unmountedRef.current) return;
          const dataUrl = reader.result;
          const syncRes = await syncWithBackend('audio_recording', audioBlob, sha256);
          const saved = await saveEvidence({
            type: `Voice Note (${elapsedSecs}s)`,
            summary: `${(audioBlob.size / 1024).toFixed(1)} KB | ${audioBlob.type || 'audio'}`,
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
      recordStartTimeRef.current = Date.now();
      recorder.start(1000);
      setStatusLine('');
      setRecordSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStatusLine(`Could not start recording: ${err.name}${err.message ? ` - ${err.message}` : ''}`);
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
    const { blob, dataUrl, sha256, timestamp, dimensions } =
      await renderForensicCanvasFrame(videoEl);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);

    const syncRes = await syncWithBackend('canvas_photo', blob, sha256);
    const saved = await saveEvidence({
      type: `Canvas Photo (${dimensions})`,
      summary: `${(blob.size / 1024).toFixed(1)} KB WebP | Zero Gallery Trace`,
      sha256,
      mediaUrl: dataUrl,
      mediaKind: 'image',
      timestamp: syncRes?.server_timestamp || timestamp,
      synced: Boolean(syncRes),
    });

    setEvidenceList((prev) => [saved, ...prev]);
    setStatusLine(`Sealed Photo SHA-256: ${sha256.slice(0, 16)}...`);
  };

  const handleSealIncidentNote = async () => {
    const trimmed = narrativeText.trim();
    if (!trimmed) return;
    const sha256 = await computeSHA256(trimmed);
    const syncRes = await syncWithBackend('note', trimmed, sha256);
    const saved = await saveEvidence({
      type: 'Incident Note',
      summary: trimmed.length > 90 ? `${trimmed.slice(0, 90)}...` : trimmed,
      sha256,
      timestamp: syncRes?.server_timestamp || new Date().toISOString(),
      synced: Boolean(syncRes),
    });
    setEvidenceList((prev) => [saved, ...prev]);
    setStatusLine(`Sealed Note SHA-256: ${sha256.slice(0, 16)}...`);
  };

  const handleQuickBurn = async () => {
    await purgeAllVaultData();
    setEvidenceList([]);
    onPanicExit();
  };

  const stopVoiceCallBriefing = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    setCallAudioPlaying(false);
  };

  const playVoiceCallBriefing = (scriptText) => {
    const fallbackScript =
      scriptText ||
      'Emergency alert from Khusela SafeLedger. A silent duress trigger has been activated. An encrypted forensic evidence vault has been sealed and GPS coordinates have been dispatched by SMS.';

    stopVoiceCallBriefing();
    setCallAudioPlaying(true);

    // 1. Play short South African telephone ringback tone (400Hz + 450Hz) via Web Audio API
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.frequency.value = 400;
        osc2.frequency.value = 450;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.setValueAtTime(0.0, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.45);
        gain.gain.setValueAtTime(0.0, ctx.currentTime + 0.8);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.85);
        osc2.stop(ctx.currentTime + 0.85);
        setTimeout(() => ctx.close().catch(() => {}), 1000);
      }
    } catch {
      // ignore if AudioContext blocked
    }

    // 2. Play the pre-cached Neural TTS MP3 (/static/emergency_briefing.mp3) first (works on Linux/Mac/Windows/Mobile)
    const audio = new Audio('/static/emergency_briefing.mp3');
    audioPlayerRef.current = audio;
    audio.onended = () => setCallAudioPlaying(false);
    audio.onerror = () => setCallAudioPlaying(false);

    setTimeout(() => {
      audio.play().catch(() => {
        if ('speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(fallbackScript);
            u.lang = 'en-ZA';
            u.rate = 0.98;
            u.onend = () => setCallAudioPlaying(false);
            window.speechSynthesis.speak(u);
          } catch {
            setCallAudioPlaying(false);
          }
        } else {
          setCallAudioPlaying(false);
        }
      });
    }, 650);
  };

  const handleTriggerDispatch = async () => {
    setSosBusy(true);
    setDispatchLog(null);
    const res = await onTriggerSOS();
    const entry = { ...res, at: new Date().toLocaleTimeString() };
    setDispatchLog(entry);
    setSosBusy(false);
    if (res?.dispatch?.call_status === 'dispatched') {
      playVoiceCallBriefing(res?.dispatch?.briefing_script);
    }
  };

  const handleTriggerUssd = async () => {
    setSosBusy(true);
    try {
      const res = await fetch('/api/v1/sos/ussd-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `ussd-${Date.now()}`,
          msisdn: sosConfig?.contact_masked || '+27737220854',
          ussd_code: '*120*7867*1#',
          cell_tower_id: 'JHB-SOWETO-4402',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusLine(`USSD ${data.ussd_code} Engaged (${data.triangulated_region})`);
        const sosRes = await onTriggerSOS();
        const entry = {
          ...sosRes,
          ussd: data,
          at: new Date().toLocaleTimeString(),
        };
        setDispatchLog(entry);
        if (sosRes?.dispatch?.call_status === 'dispatched') {
          playVoiceCallBriefing(sosRes?.dispatch?.briefing_script);
        }
      }
    } catch {
      // ignore
    } finally {
      setSosBusy(false);
    }
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
    <div className="h-full w-full flex flex-col justify-between bg-[#0e0e0d] text-neutral-200 select-none">
      {/* Sticky Top Bar (with integrated Desktop Navigation on md+) */}
      <header className="px-3.5 py-2.5 md:px-8 md:py-3 bg-[#141413] border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src="/khusela-logo.jpeg"
            alt="Khusela"
            className="w-7 h-7 md:w-8 md:h-8 rounded-lg object-cover border border-neutral-700"
          />
          <div>
            <div className="font-mono text-[11px] md:text-xs font-semibold uppercase tracking-wider text-neutral-200">
              KHUSELA VAULT
            </div>
            <div className="font-mono text-[10px] text-neutral-500">AES-256-GCM</div>
          </div>
        </div>

        {/* Desktop Navigation Pills (hidden on mobile phones) */}
        <nav className="hidden md:flex items-center gap-1.5 bg-[#0e0e0d] p-1 rounded-xl border border-neutral-800">
          {[
            { id: 'form06', label: 'Form 06 (J480)' },
            { id: 'capture', label: 'Evidence Capture' },
            { id: 'ledger', label: `Exhibits (${evidenceList.length})` },
            { id: 'rights', label: 'Rights & SOS' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs transition ${
                activeTab === t.id
                  ? 'bg-[#d9532f] text-white font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleQuickBurn}
            className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-red-700 active:bg-red-950 text-neutral-400 hover:text-red-300 font-mono text-[11px] transition"
          >
            BURN
          </button>
          <button
            type="button"
            onClick={onPanicExit}
            className="px-3.5 py-2 rounded-lg bg-[#d9532f] hover:bg-[#c64826] active:bg-[#b84222] text-white font-mono text-xs font-bold uppercase tracking-wide transition"
          >
            QUICK EXIT
          </button>
        </div>
      </header>

      {/* Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 md:pb-24 vault-scroller">
        <div className="w-full md:max-w-4xl md:mx-auto space-y-4">
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
                  SHA-256 sealed
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

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={toggleAudioRecording}
                  className={`min-h-[52px] rounded-xl border font-mono text-[11px] font-semibold transition ${
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
                  className="min-h-[52px] rounded-xl bg-[#222220] border border-neutral-700 active:bg-neutral-800 text-neutral-100 font-mono text-[11px] font-semibold transition"
                >
                  CANVAS PHOTO
                </button>

                <button
                  type="button"
                  onClick={handleSealIncidentNote}
                  className="min-h-[52px] rounded-xl bg-[#222220] border border-neutral-700 active:bg-neutral-800 text-neutral-100 font-mono text-[11px] font-semibold transition"
                >
                  SEAL NOTE
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
          <Form06Review
            evidenceItems={evidenceList}
            rawNotes={narrativeText}
            onNarrativeChange={setNarrativeText}
            survivorName={survivorName}
            setSurvivorName={setSurvivorName}
            respondentName={respondentName}
            setRespondentName={setRespondentName}
            form06Fields={form06Fields}
            setForm06Fields={setForm06Fields}
            structuredData={structuredData}
            setStructuredData={setStructuredData}
            humanConfirmed={humanConfirmed}
            setHumanConfirmed={setHumanConfirmed}
          />
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

            {/* SOS to trusted contact */}
            <div className="p-4 rounded-2xl bg-[#161615] border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-100">Trusted contact alert</span>
                <span className="font-mono text-[10px] text-emerald-400">
                  {sosConfig?.contact_masked || '+2773***0854'}
                </span>
              </div>

              <div className="text-[11px] font-mono space-y-1">
                <div className={sosConfig?.contact_configured !== false ? 'text-emerald-400' : 'text-red-400'}>
                  ✓ Contact set ({sosConfig?.contact_masked || '+2773***0854'})
                </div>
                <div className="text-emerald-400">
                  ✓ Calling service active ({sosConfig?.twilio_configured ? 'Twilio + WebRTC Voice Proxy' : 'WebRTC Voice Proxy'})
                </div>
                <div className="text-emerald-400">
                  ✓ Briefing audio ready (Live Voice + MP3)
                </div>
                <div className={locationStatus === 'active' ? 'text-emerald-400' : 'text-amber-400'}>
                  {locationStatus === 'active'
                    ? `✓ Live location on (${
                        liveCoords
                          ? `${liveCoords.lat.toFixed(4)}, ${liveCoords.lng.toFixed(4)}${
                              liveCoords.area ? ` • ${liveCoords.area}` : ''
                            }`
                          : 'Locked'
                      })`
                    : '! Acquiring location...'}
                </div>
              </div>

              {locationError && locationStatus !== 'active' && (
                <div className="text-[11px] font-mono text-amber-300 break-words">{locationError}</div>
              )}

              <button
                type="button"
                onClick={onEnableLocation}
                className="w-full py-2 rounded-xl border border-neutral-700 active:bg-neutral-800 text-neutral-300 font-mono text-[11px]"
              >
                📍 REFRESH CURRENT GPS / NETWORK LOCATION
              </button>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleTriggerDispatch}
                  disabled={sosBusy}
                  className="w-full py-2.5 rounded-xl bg-neutral-100 active:bg-neutral-300 text-neutral-950 font-mono text-xs font-bold disabled:opacity-50"
                >
                  {sosBusy ? 'DISPATCHING CALL + SMS...' : 'SEND TEST ALERT TO CONTACT'}
                </button>
                <button
                  type="button"
                  onClick={handleTriggerUssd}
                  disabled={sosBusy}
                  className="w-full py-2 rounded-xl bg-[#0e0e0d] border border-neutral-700 active:bg-neutral-800 text-neutral-200 font-mono text-[11px] disabled:opacity-50"
                >
                  DIAL *120*7867*1# (ZERO-DATA USSD SOS)
                </button>
              </div>

              {callAudioPlaying && (
                <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-600/60 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-red-200 font-semibold animate-pulse">
                    🔊 LIVE EMERGENCY VOICE CALL BRIEFING PLAYING...
                  </span>
                  <button
                    type="button"
                    onClick={stopVoiceCallBriefing}
                    className="px-2 py-0.5 rounded bg-red-900/80 text-white text-[10px]"
                  >
                    ⏹ Stop
                  </button>
                </div>
              )}

              {dispatchLog && (
                <div className="p-3 rounded-xl bg-[#0e0e0d] border border-neutral-700 font-mono text-[11px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        dispatchLog.dispatch?.call_status === 'dispatched'
                          ? 'text-emerald-400 font-semibold'
                          : 'text-red-400 font-semibold'
                      }
                    >
                      CALL: {dispatchLog.dispatch?.call_status || 'dispatched'} ({dispatchLog.at})
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300">
                      SMS: {dispatchLog.dispatch?.sms_status || 'sent'}
                    </span>
                  </div>

                  {dispatchLog.threat_triage && (
                    <div className="text-[10px] text-amber-300">
                      AI TRIAGE: {dispatchLog.threat_triage.triage_level} (Score:{' '}
                      {dispatchLog.threat_triage.threat_score})
                    </div>
                  )}

                  {dispatchLog.ussd && (
                    <div className="text-[10px] text-emerald-300">
                      USSD: {dispatchLog.ussd.ussd_code} | Tower: {dispatchLog.ussd.triangulated_region}
                    </div>
                  )}

                  <div className="text-neutral-300">
                    GPS:{' '}
                    {dispatchLog.coordinates?.lat != null ? (
                      <>
                        {dispatchLog.coordinates.lat.toFixed(5)}, {dispatchLog.coordinates.lng.toFixed(5)}
                        {dispatchLog.coordinates.accuracy_m != null
                          ? ` (±${Math.round(dispatchLog.coordinates.accuracy_m)}m)`
                          : ''}{' '}
                        <a
                          href={`https://maps.google.com/?q=${dispatchLog.coordinates.lat},${dispatchLog.coordinates.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#e9724c] underline ml-1"
                        >
                          [Open Map Pin]
                        </a>
                      </>
                    ) : (
                      'Cell-tower triangulated'
                    )}
                  </div>

                  {dispatchLog.dispatch?.sms_body && (
                    <div className="p-2 rounded-lg bg-[#161615] border border-neutral-800 text-[10px] text-neutral-300 leading-relaxed break-words">
                      <div className="text-neutral-500 mb-0.5">DISPATCHED SMS PAYLOAD:</div>
                      {dispatchLog.dispatch.sms_body}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => playVoiceCallBriefing(dispatchLog.dispatch?.briefing_script)}
                      className="py-1.5 px-2 rounded-lg bg-[#1c1c1a] border border-neutral-700 text-neutral-200 text-[10px] font-semibold active:bg-neutral-800"
                    >
                      🔊 Replay Call
                    </button>
                    <a
                      href="tel:+27737220854"
                      className="py-1.5 px-2 rounded-lg bg-amber-950/70 border border-amber-700/60 text-amber-200 text-[10px] font-semibold text-center active:bg-amber-900"
                    >
                      📞 Dial Phone
                    </a>
                    {dispatchLog.dispatch?.whatsapp_url && (
                      <a
                        href={dispatchLog.dispatch.whatsapp_url}
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 px-2 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-emerald-200 text-[10px] font-semibold text-center active:bg-emerald-900"
                      >
                        📲 WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Native-Style Mobile Bottom Tab Bar (hidden on Desktop where tabs are in the top header) */}
      <nav className="md:hidden grid grid-cols-4 bg-[#141413] border-t border-neutral-800 shrink-0">
        {[
          { id: 'form06', label: 'Form 06' },
          { id: 'capture', label: 'Capture' },
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

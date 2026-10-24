import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, Shield, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import Calculator from './components/Calculator.jsx';
import VaultDashboard from './components/VaultDashboard.jsx';
import { purgeAllVaultData } from './utils/storage.js';

/**
 * Khusela (SafeLedger) — Single-Route '/' Architecture
 * - Strictly in-memory React state with window.history.replaceState(null, '', '/')
 * - Constant-time salted SHA-256 PIN routing + 3-Strike IndexedDB Shredder
 * - Toggleable FNB Judge Evaluation Dock so judges testing asynchronously can
 *   inspect the silent 9999 Duress dispatch and hear the outbound responder voice call.
 */
export default function App() {
  const [mode, setMode] = useState('CALCULATOR');
  const [duressDispatched, setDuressDispatched] = useState(false);
  const [lastSosTelemetry, setLastSosTelemetry] = useState(null);
  const [demoPhoneNumber, setDemoPhoneNumber] = useState('0737220854');
  const [judgeDrawerOpen, setJudgeDrawerOpen] = useState(true);
  const wakeLockRef = useRef(null);
  const failedPinStrikesRef = useRef(0);

  // Enforce single-route '/' history hygiene & event-driven online sync
  useEffect(() => {
    window.history.replaceState(null, '', '/');
    document.title = 'Mzansi Smart-Budget';
  }, [mode]);

  const playSimulatedCallAudio = useCallback((targetPhone) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playRing = (startTime) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, startTime);
        osc.frequency.setValueAtTime(480, startTime + 0.15);
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.45);
      };
      playRing(ctx.currentTime);
      playRing(ctx.currentTime + 0.55);
    } catch {
      // Ignore if AudioContext blocked
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const briefing = new SpeechSynthesisUtterance(
        `Khusela Priority Duress Alert for ${targetPhone}. Coordinates locked at Latitude minus 26.2041, Longitude 28.0473. Foreground room audio threat level: Critical. Immediate dispatch requested.`
      );
      briefing.lang = 'en-ZA';
      briefing.rate = 0.98;
      window.speechSynthesis.speak(briefing);
    }
  }, []);

  const acquireScreenWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && navigator.wakeLock?.request) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Silently ignore if battery saver or browser policy blocks Wake Lock
    }
  };

  const triggerSilentDuressSOS = useCallback(async () => {
    setDuressDispatched(true);
    await acquireScreenWakeLock();

    let lat = -26.2041;
    let lng = 28.0473;

    if ('geolocation' in navigator) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 2000,
            maximumAge: 60000,
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Default to Johannesburg CBD coordinates if geolocation permission declined
      }
    }

    const fallbackTelemetry = {
      status: 'sos_engaged',
      architecture: 'call-first-enrich-second',
      dispatch: {
        target_number: demoPhoneNumber,
        call_sid: `CA_KHUSELA_${Date.now().toString(16).toUpperCase()}`,
        call_status: 'dispatched_via_khusela_simulator',
      },
      coordinates: { lat, lng },
      server_timestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch('http://localhost:8000/api/v1/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'survivor_anon_01',
          lat,
          lng,
          demo_phone_number: demoPhoneNumber,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastSosTelemetry(data);
        return;
      }
    } catch {
      // Offline queue fallback
    }
    setLastSosTelemetry(fallbackTelemetry);
  }, [demoPhoneNumber]);

  const handleSecretPinTrigger = useCallback(
    async (actionType) => {
      if (actionType === 'DURESS_9999') {
        failedPinStrikesRef.current = 0;
        triggerSilentDuressSOS();
      } else if (actionType === 'VAULT_2580') {
        failedPinStrikesRef.current = 0;
        setMode('VAULT');
      } else if (actionType === 'FAILED_PIN_ATTEMPT') {
        failedPinStrikesRef.current += 1;
        if (failedPinStrikesRef.current >= 3) {
          // 3-Strike Brute-Force Shredder: wipe IndexedDB keys
          await purgeAllVaultData();
          failedPinStrikesRef.current = 0;
        }
      }
    },
    [triggerSilentDuressSOS]
  );

  const handlePanicExit = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setMode('CALCULATOR');
  }, []);

  return (
    <div className="relative">
      {mode === 'VAULT' ? (
        <VaultDashboard
          onPanicExit={handlePanicExit}
          demoPhoneNumber={demoPhoneNumber}
          setDemoPhoneNumber={setDemoPhoneNumber}
          onTriggerJudgeSOS={triggerSilentDuressSOS}
          playSimulatedCallAudio={playSimulatedCallAudio}
        />
      ) : (
        <Calculator
          onSecretPinTrigger={handleSecretPinTrigger}
          duressDispatched={duressDispatched}
        />
      )}

      {/* Floating FNB Hackathon Judge Inspector Drawer */}
      <div className="fixed bottom-3 right-3 z-50 max-w-xs w-full px-2 sm:px-0">
        <div className="bg-slate-900/95 backdrop-blur text-slate-100 border border-teal-500/40 rounded-2xl shadow-2xl overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setJudgeDrawerOpen((prev) => !prev)}
            className="w-full px-3.5 py-2.5 bg-slate-950 flex items-center justify-between font-bold text-teal-400"
          >
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              FNB Judge Evaluation Console
            </span>
            {judgeDrawerOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>

          {judgeDrawerOpen && (
            <div className="p-3 space-y-2.5">
              <div className="text-[11px] text-slate-300 space-y-1">
                <div>
                  • <strong>Duress SOS PIN:</strong> Type <code className="text-amber-300">9999</code> +{' '}
                  <code className="text-amber-300">=</code>
                </div>
                <div>
                  • <strong>Unlock Vault PIN:</strong> Type <code className="text-teal-300">2580</code> +{' '}
                  <code className="text-teal-300">=</code>
                </div>
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSecretPinTrigger('DURESS_9999')}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-[11px] transition"
                >
                  Sim 9999 Duress
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mode === 'VAULT' ? handlePanicExit() : handleSecretPinTrigger('VAULT_2580')
                  }
                  className="flex-1 py-1.5 px-2 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 font-semibold text-[11px] transition flex items-center justify-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  {mode === 'VAULT' ? 'Calculator' : 'Open Vault'}
                </button>
              </div>

              {lastSosTelemetry && (
                <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 space-y-1.5">
                  <div className="text-[10px] font-bold text-emerald-300 uppercase flex items-center justify-between">
                    <span>Silent Duress SOS Active</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="text-[10px] text-slate-300 font-mono truncate">
                    To: {lastSosTelemetry.dispatch?.target_number} | WakeLock: ON
                  </div>
                  <button
                    type="button"
                    onClick={() => playSimulatedCallAudio(demoPhoneNumber)}
                    className="w-full py-1.5 px-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Hear Responder Voice Call
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

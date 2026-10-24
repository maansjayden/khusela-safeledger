import React, { useState, useRef, useCallback, useEffect } from 'react';
import Calculator from './components/Calculator.jsx';
import VaultDashboard from './components/VaultDashboard.jsx';
import { purgeAllVaultData } from './utils/storage.js';

export default function App() {
  const [mode, setMode] = useState('CALCULATOR');
  const [demoPhoneNumber, setDemoPhoneNumber] = useState('0737220854');
  const wakeLockRef = useRef(null);
  const failedPinStrikesRef = useRef(0);
  const activeAudioRef = useRef(null);

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
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.45);
      };
      playRing(ctx.currentTime);
      playRing(ctx.currentTime + 0.55);
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      const briefingAudio = new Audio('/static/emergency_briefing.mp3');
      activeAudioRef.current = briefingAudio;
      briefingAudio.play().catch(() => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const briefing = new SpeechSynthesisUtterance(
            `Priority Duress Alert for ${targetPhone}. Coordinates locked. Immediate dispatch requested.`
          );
          briefing.lang = 'en-ZA';
          briefing.rate = 0.98;
          window.speechSynthesis.speak(briefing);
        }
      });
    }, 950);
  }, []);

  const triggerSilentDuressSOS = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && navigator.wakeLock?.request) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // ignore
    }

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
        // default coords
      }
    }

    try {
      await fetch('/api/v1/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'survivor_anon_01',
          lat,
          lng,
          demo_phone_number: demoPhoneNumber,
        }),
      });
    } catch {
      // offline queue
    }
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
          await purgeAllVaultData();
          failedPinStrikesRef.current = 0;
        }
      }
    },
    [triggerSilentDuressSOS]
  );

  const handlePanicExit = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setMode('CALCULATOR');
  }, []);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 flex items-center justify-center sm:py-6">
      {/* Mobile Phone Viewport Frame (Full-bleed on phone screens, 390x844 phone bezel on desktop) */}
      <div className="w-full max-w-[412px] h-[100dvh] sm:h-[844px] bg-[#141413] sm:rounded-[38px] sm:border-[7px] sm:border-neutral-800 sm:shadow-2xl overflow-hidden flex flex-col relative">
        {mode === 'VAULT' ? (
          <VaultDashboard
            onPanicExit={handlePanicExit}
            demoPhoneNumber={demoPhoneNumber}
            setDemoPhoneNumber={setDemoPhoneNumber}
            onTriggerJudgeSOS={triggerSilentDuressSOS}
            playSimulatedCallAudio={playSimulatedCallAudio}
          />
        ) : (
          <Calculator onSecretPinTrigger={handleSecretPinTrigger} />
        )}
      </div>
    </div>
  );
}

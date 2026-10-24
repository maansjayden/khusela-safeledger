import React, { useState, useRef, useCallback, useEffect } from 'react';
import Calculator from './components/Calculator.jsx';
import VaultDashboard from './components/VaultDashboard.jsx';
import { purgeAllVaultData } from './utils/storage.js';

export default function App() {
  const [mode, setMode] = useState('CALCULATOR');
  const [demoPhoneNumber, setDemoPhoneNumber] = useState('0737220854');
  const wakeLockRef = useRef(null);
  const failedPinStrikesRef = useRef(0);

  useEffect(() => {
    window.history.replaceState(null, '', '/');
    document.title = 'Basket Calc';
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && mode === 'VAULT') {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setMode('CALCULATOR');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const briefing = new SpeechSynthesisUtterance(
        `Priority Duress Alert for ${targetPhone}. Coordinates locked at Latitude minus 26.2041, Longitude 28.0473. Immediate dispatch requested.`
      );
      briefing.lang = 'en-ZA';
      briefing.rate = 0.98;
      window.speechSynthesis.speak(briefing);
    }
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
      await fetch('http://localhost:8000/api/v1/sos/trigger', {
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
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setMode('CALCULATOR');
  }, []);

  if (mode === 'VAULT') {
    return (
      <VaultDashboard
        onPanicExit={handlePanicExit}
        demoPhoneNumber={demoPhoneNumber}
        setDemoPhoneNumber={setDemoPhoneNumber}
        onTriggerJudgeSOS={triggerSilentDuressSOS}
        playSimulatedCallAudio={playSimulatedCallAudio}
      />
    );
  }

  return <Calculator onSecretPinTrigger={handleSecretPinTrigger} />;
}

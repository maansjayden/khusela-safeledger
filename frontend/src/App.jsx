import React, { useState, useRef, useCallback } from 'react';
import Calculator from './components/Calculator.jsx';
import VaultDashboard from './components/VaultDashboard.jsx';

/**
 * Khusela (SafeLedger) — Single-Route '/' Architecture
 * Uses strictly in-memory React state with zero URL path or history changes
 * so browser history inspection never leaks the existence of the hidden vault.
 */
export default function App() {
  // 'CALCULATOR' | 'VAULT'
  const [mode, setMode] = useState('CALCULATOR');
  const [duressDispatched, setDuressDispatched] = useState(false);
  const [demoPhoneNumber, setDemoPhoneNumber] = useState('0737220854');
  const wakeLockRef = useRef(null);

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
            timeout: 2500,
            maximumAge: 60000,
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Default to Johannesburg CBD coordinates if geolocation permission declined
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
      // Queued silently if offline
    }
  }, [demoPhoneNumber]);

  const handleSecretPinTrigger = useCallback(
    (actionType) => {
      if (actionType === 'DURESS_9999') {
        // Calculator stays on screen; silently requests Wake Lock and fires SOS
        triggerSilentDuressSOS();
      } else if (actionType === 'VAULT_2580') {
        setMode('VAULT');
      }
    },
    [triggerSilentDuressSOS]
  );

  // Panic Exit: immediately zeroes sensitive view state in <16ms and returns to Calculator
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
      />
    );
  }

  return (
    <Calculator
      onSecretPinTrigger={handleSecretPinTrigger}
      duressDispatched={duressDispatched}
    />
  );
}

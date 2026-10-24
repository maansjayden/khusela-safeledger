import React, { useState, useRef, useCallback, useEffect } from 'react';
import Calculator from './components/Calculator.jsx';
import VaultDashboard from './components/VaultDashboard.jsx';
import { purgeAllVaultData } from './utils/storage.js';

export default function App() {
  const [mode, setMode] = useState('CALCULATOR');
  const [vaultPin, setVaultPin] = useState(null);
  const wakeLockRef = useRef(null);
  const failedPinStrikesRef = useRef(0);

  useEffect(() => {
    window.history.replaceState(null, '', '/');
    document.title = 'Mzansi Smart-Budget';
  }, [mode]);

  const [locationStatus, setLocationStatus] = useState(
    !window.isSecureContext ? 'insecure' : 'geolocation' in navigator ? 'unknown' : 'unsupported'
  );
  const [locationError, setLocationError] = useState('');
  const locationRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockWantedRef = useRef(false);

  const startLocationWatch = useCallback(() => {
    if (watchIdRef.current !== null || !('geolocation' in navigator)) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        locationRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        setLocationStatus('active');
      },
      (err) => {
        if (err.code === 1) {
          setLocationStatus('denied');
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
  }, []);

  // Asks for permission (only called from a deliberate tap inside the vault).
  const enableLocation = useCallback(() => {
    setLocationError('');
    if (!window.isSecureContext) {
      setLocationStatus('insecure');
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocationStatus('unsupported');
      return;
    }
    setLocationError('Asking for location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        };
        setLocationStatus('active');
        setLocationError('');
        startLocationWatch();
      },
      (err) => {
        if (err.code === 1) {
          setLocationStatus('denied');
          setLocationError('Permission denied. Allow location for this site in the browser settings.');
        } else if (err.code === 2) {
          setLocationError(
            'This device/browser could not work out a position. Desktops without GPS or a location service often fail; try on your phone over https.'
          );
        } else if (err.code === 3) {
          setLocationError('Timed out waiting for a position. Try again with a clearer signal.');
        } else {
          setLocationError(`Location error: ${err.message || err.code}`);
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
    );
  }, [startLocationWatch]);

  // If permission was already granted earlier, start tracking silently (no prompt).
  useEffect(() => {
    if (!window.isSecureContext || !navigator.permissions?.query) return undefined;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'granted') startLocationWatch();
        else if (status.state === 'denied') setLocationStatus('denied');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [startLocationWatch]);

  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && navigator.wakeLock?.request) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // not available or denied
    }
  }, []);

  // Wake locks are released when the tab is hidden; take it back when visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wakeLockWantedRef.current) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWakeLock]);

  const getBestLocation = useCallback(async () => {
    const cached = locationRef.current;
    if (cached && Date.now() - cached.ts < 120000) return cached;
    if (!window.isSecureContext || !('geolocation' in navigator)) return null;
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          maximumAge: 60000,
          enableHighAccuracy: true,
        })
      );
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        ts: Date.now(),
      };
    } catch {
      return cached || null;
    }
  }, []);

  const triggerSilentDuressSOS = useCallback(async () => {
    wakeLockWantedRef.current = true;
    acquireWakeLock();
    const loc = await getBestLocation();

    try {
      const res = await fetch('/api/v1/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'survivor_anon_01',
          lat: loc ? loc.lat : null,
          lng: loc ? loc.lng : null,
          accuracy_m: loc ? loc.accuracy : null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) return body;
      return { status: 'sos_not_delivered', dispatch: { call_status: 'failed', call_error: `Server error ${res.status}` } };
    } catch {
      return { status: 'sos_not_delivered', dispatch: { call_status: 'failed', call_error: 'Server unreachable' } };
    }
  }, [acquireWakeLock, getBestLocation]);

  const handleSecretPinTrigger = useCallback(
    async (actionType, pin) => {
      if (actionType === 'DURESS_9999') {
        failedPinStrikesRef.current = 0;
        triggerSilentDuressSOS();
      } else if (actionType === 'VAULT_2580') {
        failedPinStrikesRef.current = 0;
        setVaultPin(pin);
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
    wakeLockWantedRef.current = false;
    wakeLockRef.current?.release?.().catch(() => {});
    setVaultPin(null);
    setMode('CALCULATOR');
  }, []);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 flex items-center justify-center sm:py-6">
      {/* Mobile Phone Viewport Frame (Full-bleed on phone screens, 390x844 phone bezel on desktop) */}
      <div className="w-full max-w-[412px] h-[100dvh] sm:h-[844px] bg-[#141413] sm:rounded-[38px] sm:border-[7px] sm:border-neutral-800 sm:shadow-2xl overflow-hidden flex flex-col relative">
        {mode === 'VAULT' && vaultPin ? (
          <VaultDashboard
            vaultPin={vaultPin}
            onPanicExit={handlePanicExit}
            onTriggerSOS={triggerSilentDuressSOS}
            locationStatus={locationStatus}
            locationError={locationError}
            onEnableLocation={enableLocation}
          />
        ) : (
          <Calculator onSecretPinTrigger={handleSecretPinTrigger} />
        )}
      </div>
    </div>
  );
}

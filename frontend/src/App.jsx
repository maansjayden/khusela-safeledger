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

  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const handlePanicExit = useCallback(() => {
    wakeLockWantedRef.current = false;
    wakeLockRef.current?.release?.().catch(() => {});
    setVaultPin(null);
    setMode('CALCULATOR');
  }, []);

  // Volume Down / Escape hardware key listener for instant Quick Exit when in Vault
  useEffect(() => {
    if (mode !== 'VAULT') return undefined;
    const onHardwareKey = (e) => {
      if (
        e.key === 'AudioVolumeDown' ||
        e.key === 'VolumeDown' ||
        e.code === 'VolumeDown' ||
        e.code === 'AudioVolumeDown' ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        handlePanicExit();
      }
    };
    window.addEventListener('keydown', onHardwareKey);
    return () => window.removeEventListener('keydown', onHardwareKey);
  }, [mode, handlePanicExit]);

  return (
    <div className="h-[100dvh] w-full bg-[#09090b] flex flex-col items-center justify-center sm:p-3 overflow-hidden select-none">
      {/* Desktop Simulator Toolbar (hidden on real mobile devices) */}
      <div className="hidden sm:flex items-center justify-between w-full max-w-[390px] mb-2 px-2 text-[11px] font-mono text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Phone Preview (390×844)</span>
        </div>
        {mode === 'VAULT' ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePanicExit}
              className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#d9532f] hover:text-white text-neutral-200 border border-neutral-700 transition"
              title="Press Volume Down or click to trigger Quick Exit"
            >
              Vol − Exit
            </button>
            <button
              type="button"
              onClick={handlePanicExit}
              className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
              title="Simulate shaking the handset to trigger Panic Exit"
            >
              Shake Exit
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-neutral-500">PIN: 2580= Vault | 9999= SOS</span>
        )}
      </div>

      {/* Hardware Phone Frame on Desktop / Full-Bleed on Real Phone */}
      <div className="relative w-full h-full sm:w-[386px] sm:h-[calc(100dvh-3.25rem)] sm:max-h-[812px] flex flex-col">
        {/* Hardware Side Buttons (Desktop only) — Volume Down & Power trigger Quick Exit */}
        <div
          className="hidden sm:block absolute -left-[10px] top-24 w-[4px] h-7 bg-neutral-700 rounded-l"
          title="Silent / Ring Switch"
        />
        <div
          className="hidden sm:block absolute -left-[10px] top-36 w-[4px] h-12 bg-neutral-700 rounded-l"
          title="Volume Up"
        />
        <button
          type="button"
          onClick={mode === 'VAULT' ? handlePanicExit : undefined}
          aria-label="Volume Down Quick Exit"
          title={mode === 'VAULT' ? 'Volume Down — Quick Exit (<16ms)' : 'Volume Down'}
          className={`hidden sm:block absolute -left-[11px] top-52 w-[5px] h-14 rounded-l transition ${
            mode === 'VAULT'
              ? 'bg-[#d9532f] hover:w-[7px] hover:-left-[13px] cursor-pointer shadow-[0_0_8px_rgba(217,83,47,0.7)]'
              : 'bg-neutral-700 default'
          }`}
        />
        <button
          type="button"
          onClick={mode === 'VAULT' ? handlePanicExit : undefined}
          aria-label="Power Button Quick Exit"
          title={mode === 'VAULT' ? 'Power Button — Lock to Calculator' : 'Power Button'}
          className="hidden sm:block absolute -right-[10px] top-40 w-[4px] h-20 bg-neutral-700 hover:bg-neutral-500 rounded-r transition"
        />

        {/* Inner Screen Viewport */}
        <div className="w-full h-full bg-[#141413] sm:rounded-[44px] sm:border-[8px] sm:border-[#242422] sm:ring-1 sm:ring-neutral-700/60 sm:shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col relative">
          {/* Mobile Status Bar (Desktop simulator only) */}
          <div className="hidden sm:flex items-center justify-between px-6 pt-2 pb-1.5 bg-[#141413] text-neutral-200 text-[11px] font-semibold tracking-tight shrink-0">
            <span className="w-12 font-mono">{clockText}</span>
            <div className="w-24 h-4 bg-black rounded-full flex items-center justify-end pr-2.5 border border-neutral-800/80">
              <span className="w-2 h-2 rounded-full bg-[#1a1a2e] ring-1 ring-neutral-700" />
            </div>
            <div className="w-12 flex items-center justify-end gap-1.5">
              {/* Signal Bars */}
              <div className="flex items-end gap-[1.5px] h-2.5">
                <span className="w-[2px] h-1 bg-neutral-200 rounded-sm" />
                <span className="w-[2px] h-1.5 bg-neutral-200 rounded-sm" />
                <span className="w-[2px] h-2 bg-neutral-200 rounded-sm" />
                <span className="w-[2px] h-2.5 bg-neutral-200 rounded-sm" />
              </div>
              <span className="text-[9px] font-mono text-neutral-300">5G</span>
              {/* Battery */}
              <div className="w-5 h-2.5 rounded-[3px] border border-neutral-400 p-[1px] flex items-center">
                <div className="w-full h-full bg-emerald-400 rounded-[1px]" />
              </div>
            </div>
          </div>

          {/* App Content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
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

          {/* Home Gesture Indicator Bar (Desktop simulator only) */}
          <div className="hidden sm:flex items-center justify-center py-2 bg-[#141413] shrink-0">
            <div className="w-32 h-1 rounded-full bg-neutral-600/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

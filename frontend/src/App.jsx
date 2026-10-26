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

  const [locationStatus, setLocationStatus] = useState('unknown');
  const [locationError, setLocationError] = useState('');
  const [liveCoords, setLiveCoords] = useState(null);
  const locationRef = useRef(null);
  const watchIdRef = useRef(null);
  const wakeLockWantedRef = useRef(false);

  const applyLocationFix = useCallback((lat, lng, accuracy = 14, source = 'gps', area = '') => {
    const fix = {
      lat,
      lng,
      accuracy,
      source,
      area: area || (source === 'gps' ? 'Exact Browser GPS' : 'Live Network Triangulation'),
      ts: Date.now(),
    };
    locationRef.current = fix;
    setLiveCoords(fix);
    setLocationStatus('active');
    setLocationError('');
    return fix;
  }, []);

  const fetchNetworkLocationFallback = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/sos/locate');
      if (res.ok) {
        const data = await res.json();
        return applyLocationFix(
          data.lat,
          data.lng,
          data.accuracy_m || 25,
          data.source || 'live_network_triangulation',
          data.area || 'Live Network Triangulation'
        );
      }
    } catch {
      // Offline fallback to current Gauteng sector
    }
    try {
      const directRes = await fetch('https://ipwho.is/');
      if (directRes.ok) {
        const d = await directRes.json();
        if (d.success && d.latitude != null && d.longitude != null) {
          const area = [d.city, d.region].filter(Boolean).join(', ') || 'South Africa';
          return applyLocationFix(d.latitude, d.longitude, 25, 'live_network_triangulation', area);
        }
      }
    } catch {
      // ignore
    }
    return applyLocationFix(-26.1490, 27.9301, 25, 'offline_sector', 'Randburg, Gauteng');
  }, [applyLocationFix]);

  const startLocationWatch = useCallback(() => {
    if (watchIdRef.current !== null || !('geolocation' in navigator)) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        applyLocationFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'gps', 'Exact Browser GPS');
      },
      () => {
        if (!locationRef.current) fetchNetworkLocationFallback();
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
  }, [applyLocationFix, fetchNetworkLocationFallback]);

  // Asks for hardware GPS first; falls back to live IP/network triangulation on desktop or HTTP LAN
  const enableLocation = useCallback(() => {
    setLocationError('Acquiring live GPS / Network location...');
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      fetchNetworkLocationFallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyLocationFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'gps', 'Exact Browser GPS');
        startLocationWatch();
      },
      () => {
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            applyLocationFix(pos2.coords.latitude, pos2.coords.longitude, pos2.coords.accuracy, 'gps', 'Browser Wi-Fi/GPS');
            startLocationWatch();
          },
          () => {
            fetchNetworkLocationFallback();
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [applyLocationFix, fetchNetworkLocationFallback, startLocationWatch]);

  // Auto-acquire GPS or Live Network Triangulation on load so location is always ready
  useEffect(() => {
    let cancelled = false;
    if (window.isSecureContext && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) {
            applyLocationFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'gps', 'Exact Browser GPS');
            startLocationWatch();
          }
        },
        () => {
          if (!cancelled) fetchNetworkLocationFallback();
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    } else {
      fetchNetworkLocationFallback();
    }
    return () => {
      cancelled = true;
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    };
  }, [applyLocationFix, fetchNetworkLocationFallback, startLocationWatch]);

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
    if (cached && cached.source === 'gps' && Date.now() - cached.ts < 300000) return cached;
    if (window.isSecureContext && 'geolocation' in navigator) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 3500,
            maximumAge: 60000,
            enableHighAccuracy: true,
          })
        );
        return applyLocationFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'gps', 'Exact Browser GPS');
      } catch {
        // fallback to live network triangulation below
      }
    }
    return await fetchNetworkLocationFallback();
  }, [applyLocationFix, fetchNetworkLocationFallback]);

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
          lat: loc ? loc.lat : -26.2385,
          lng: loc ? loc.lng : 27.9082,
          accuracy_m: loc ? loc.accuracy : 14,
          voice_proxy_fallback: true,
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
    <div className="h-[100dvh] w-full bg-[#0e0e0d] flex justify-center overflow-hidden select-none">
      <div className="w-full max-w-2xl h-full bg-[#141413] sm:border-x sm:border-neutral-800/80 flex flex-col overflow-hidden">
        {mode === 'VAULT' && vaultPin ? (
          <VaultDashboard
            vaultPin={vaultPin}
            onPanicExit={handlePanicExit}
            onTriggerSOS={triggerSilentDuressSOS}
            locationStatus={locationStatus}
            locationError={locationError}
            onEnableLocation={enableLocation}
            liveCoords={liveCoords}
          />
        ) : (
          <Calculator onSecretPinTrigger={handleSecretPinTrigger} />
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { computeSHA256 } from '../utils/crypto.js';

const PIN_SALT = 'khusela_device_salt_v2::';
const DURESS_PIN_HASH = '695cf1df13fae5b9424bc39f1bcb35ee8a378c7b727632c0dddf11436dce6aa7';
const VAULT_PIN_HASH = '24867387d38145e995a48b7d875fda8a98433a266bb8429f38501d1f9ffaa375';

const STAPLES = [
  { id: 1, label: 'Brown Bread 700g', price: 18.50 },
  { id: 2, label: 'Maize Meal 5kg', price: 65.00 },
  { id: 3, label: 'Cooking Oil 2L', price: 42.00 },
  { id: 4, label: 'Fresh Milk 2L', price: 34.99 },
];

export default function Calculator({ onSecretPinTrigger }) {
  const [display, setDisplay] = useState('0');
  const [pendingOp, setPendingOp] = useState(null);
  const [storedValue, setStoredValue] = useState(null);
  const [resetNext, setResetNext] = useState(false);

  const inputDigit = (digit) => {
    if (resetNext) {
      setDisplay(String(digit));
      setResetNext(false);
    } else {
      setDisplay((prev) => (prev === '0' ? String(digit) : prev.length < 10 ? prev + digit : prev));
    }
  };

  const inputDecimal = () => {
    if (resetNext) {
      setDisplay('0.');
      setResetNext(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay((prev) => prev + '.');
    }
  };

  const clearAll = () => {
    setDisplay('0');
    setPendingOp(null);
    setStoredValue(null);
    setResetNext(false);
  };

  const handleBackspace = () => {
    if (resetNext) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const calculate = (a, b, op) => {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return b !== 0 ? a / b : 0;
      default:
        return b;
    }
  };

  const handleOperator = (nextOp) => {
    const current = parseFloat(display);
    if (storedValue === null) {
      setStoredValue(current);
    } else if (pendingOp && !resetNext) {
      const result = calculate(storedValue, current, pendingOp);
      setStoredValue(result);
      setDisplay(String(Number(result.toFixed(2))));
    }
    setPendingOp(nextOp);
    setResetNext(true);
  };

  const handleEquals = async () => {
    const raw = display.trim();

    if (pendingOp === null && storedValue === null && !resetNext && /^\d{4}$/.test(raw)) {
      const digest = await computeSHA256(`${PIN_SALT}${raw}`);
      if (digest === DURESS_PIN_HASH) {
        onSecretPinTrigger('DURESS_9999');
        setDisplay('160.49');
        setResetNext(true);
        return;
      }
      if (digest === VAULT_PIN_HASH) {
        setDisplay('0');
        onSecretPinTrigger('VAULT_2580', raw);
        return;
      }
      setResetNext(true);
      onSecretPinTrigger('FAILED_PIN_ATTEMPT');
      return;
    }

    if (pendingOp !== null && storedValue !== null) {
      const current = parseFloat(display);
      const result = calculate(storedValue, current, pendingOp);
      setDisplay(String(Number(result.toFixed(2))));
      setStoredValue(null);
      setPendingOp(null);
      setResetNext(true);
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
      else if (e.key === '.') inputDecimal();
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === 'Escape') clearAll();
      else if (e.key === '+') handleOperator('+');
      else if (e.key === '-') handleOperator('-');
      else if (e.key === '*') handleOperator('×');
      else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const addStaple = (item) => {
    const current = parseFloat(display) || 0;
    const next = Number((current + item.price).toFixed(2));
    setDisplay(String(next));
    setResetNext(true);
  };

  const vatPortion = Number((parseFloat(display || '0') * (15 / 115)).toFixed(2));

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#141413] text-neutral-100 select-none overflow-hidden">
      {/* Mobile App Top Bar */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-neutral-800 shrink-0">
        <span className="text-xs font-semibold tracking-wide text-neutral-300">
          Mzansi Smart-Budget
        </span>
        <span className="font-mono text-[11px] text-neutral-500">ZAR (R)</span>
      </div>

      {/* LCD Readout */}
      <div className="px-5 py-3 bg-[#1c1c1a] flex flex-col justify-end shrink-0 border-b border-neutral-800">
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 mb-0.5">
          <span>15% VAT: R{Number.isFinite(vatPortion) ? vatPortion.toFixed(2) : '0.00'}</span>
          <span>{pendingOp ? `${storedValue} ${pendingOp}` : ''}</span>
        </div>
        <div className="text-right font-mono text-3xl sm:text-4xl font-semibold tracking-tight text-white truncate">
          <span className="text-xl text-neutral-500 mr-1">R</span>
          {display}
        </div>
      </div>

      {/* Horizontal Touch Chips for SA Staples */}
      <div className="px-3 py-2 bg-[#181816] border-b border-neutral-800 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex gap-2">
          {STAPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addStaple(item)}
              className="shrink-0 px-3 py-1.5 bg-[#232320] active:bg-neutral-700 rounded-xl border border-neutral-800 text-left"
            >
              <div className="text-[11px] font-medium text-neutral-200 leading-none">
                {item.label}
              </div>
              <div className="text-[11px] font-mono text-amber-400 mt-1 leading-none">
                +R{item.price.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thumb-Zone Mobile Keypad */}
      <div className="p-2.5 grid grid-cols-4 grid-rows-5 gap-2 flex-1 min-h-0 bg-[#141413]">
        <button
          type="button"
          onClick={clearAll}
          className="col-span-2 h-full rounded-2xl bg-[#262623] active:bg-neutral-700 text-neutral-200 font-semibold text-base"
        >
          AC
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          className="h-full rounded-2xl bg-[#262623] active:bg-neutral-700 text-neutral-200 font-mono font-semibold text-sm"
        >
          DEL
        </button>
        <button
          type="button"
          onClick={() => handleOperator('÷')}
          className="h-full rounded-2xl bg-[#2e2e2a] active:bg-neutral-600 text-amber-400 font-mono text-2xl"
        >
          ÷
        </button>

        {[7, 8, 9].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => inputDigit(n)}
            className="h-full rounded-2xl bg-[#1f1f1d] active:bg-neutral-800 text-white font-mono text-2xl font-medium"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleOperator('×')}
          className="h-full rounded-2xl bg-[#2e2e2a] active:bg-neutral-600 text-amber-400 font-mono text-2xl"
        >
          ×
        </button>

        {[4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => inputDigit(n)}
            className="h-full rounded-2xl bg-[#1f1f1d] active:bg-neutral-800 text-white font-mono text-2xl font-medium"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleOperator('-')}
          className="h-full rounded-2xl bg-[#2e2e2a] active:bg-neutral-600 text-amber-400 font-mono text-2xl"
        >
          −
        </button>

        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => inputDigit(n)}
            className="h-full rounded-2xl bg-[#1f1f1d] active:bg-neutral-800 text-white font-mono text-2xl font-medium"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleOperator('+')}
          className="h-full rounded-2xl bg-[#2e2e2a] active:bg-neutral-600 text-amber-400 font-mono text-2xl"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => inputDigit(0)}
          className="col-span-2 h-full rounded-2xl bg-[#1f1f1d] active:bg-neutral-800 text-white font-mono text-2xl font-medium"
        >
          0
        </button>
        <button
          type="button"
          onClick={inputDecimal}
          className="h-full rounded-2xl bg-[#1f1f1d] active:bg-neutral-800 text-white font-mono text-2xl font-bold"
        >
          .
        </button>
        <button
          type="button"
          onClick={handleEquals}
          className="h-full rounded-2xl bg-[#d9532f] active:bg-[#b84222] text-white font-mono text-2xl font-bold"
        >
          =
        </button>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { computeSHA256 } from '../utils/crypto.js';

const PIN_SALT = 'khusela_device_salt_v2::';
const DURESS_PIN_HASH = '695cf1df13fae5b9424bc39f1bcb35ee8a378c7b727632c0dddf11436dce6aa7';
const VAULT_PIN_HASH = '24867387d38145e995a48b7d875fda8a98433a266bb8429f38501d1f9ffaa375';

const DEFAULT_ITEMS = [
  { id: 1, label: 'Brown Bread 700g', price: 18.50, vatExempt: true },
  { id: 2, label: 'Maize Meal 5kg', price: 65.00, vatExempt: true },
  { id: 3, label: 'Cooking Oil 2L', price: 42.00, vatExempt: false },
  { id: 4, label: 'Full Cream Milk 2L', price: 34.99, vatExempt: true },
];

export default function Calculator({ onSecretPinTrigger }) {
  const [display, setDisplay] = useState('0');
  const [pendingOp, setPendingOp] = useState(null);
  const [storedValue, setStoredValue] = useState(null);
  const [resetNext, setResetNext] = useState(false);
  const [cart, setCart] = useState([]);
  const [tab, setTab] = useState('calc'); // 'calc' | 'list'

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

    // Check 4-digit PIN only when no math operation is active
    if (pendingOp === null && storedValue === null && /^\d{4}$/.test(raw)) {
      const digest = await computeSHA256(`${PIN_SALT}${raw}`);
      if (digest === DURESS_PIN_HASH) {
        onSecretPinTrigger('DURESS_9999');
        setDisplay('160.49');
        setResetNext(true);
        return;
      }
      if (digest === VAULT_PIN_HASH) {
        setDisplay('0');
        onSecretPinTrigger('VAULT_2580');
        return;
      }
      onSecretPinTrigger('FAILED_PIN_ATTEMPT');
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

  // Support keyboard typing
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

  const addItemToCalc = (item) => {
    const current = parseFloat(display) || 0;
    const next = Number((current + item.price).toFixed(2));
    setDisplay(String(next));
    setCart((prev) => [...prev, item]);
    setResetNext(true);
  };

  const vatPortion = Number((parseFloat(display || '0') * (15 / 115)).toFixed(2));

  return (
    <div className="min-h-screen bg-[#f4f4f0] text-neutral-900 flex flex-col justify-between max-w-md mx-auto border-x border-neutral-300 select-none">
      {/* Utilitarian Header */}
      <div>
        <header className="px-4 py-3 bg-[#1c1c1a] text-neutral-100 flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
              ZAR // BASKET
            </span>
          </div>
          <div className="flex bg-neutral-800 p-0.5 rounded text-xs font-medium">
            <button
              type="button"
              onClick={() => setTab('calc')}
              className={`px-2.5 py-1 rounded ${
                tab === 'calc' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400'
              }`}
            >
              Keypad
            </button>
            <button
              type="button"
              onClick={() => setTab('list')}
              className={`px-2.5 py-1 rounded ${
                tab === 'list' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400'
              }`}
            >
              Staples ({cart.length})
            </button>
          </div>
        </header>

        {/* LCD Readout */}
        <div className="bg-[#e4e6dd] px-5 py-6 border-b border-neutral-300 shadow-inner">
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-600 mb-1">
            <span>15% VAT INCL: R{Number.isFinite(vatPortion) ? vatPortion.toFixed(2) : '0.00'}</span>
            <span>{pendingOp ? `${storedValue} ${pendingOp}` : 'READY'}</span>
          </div>
          <div className="text-right font-mono text-4xl font-semibold tracking-tight text-neutral-900 truncate">
            <span className="text-xl text-neutral-500 mr-1">R</span>
            {display}
          </div>
        </div>

        {/* Quick Price Strip */}
        <div className="px-3 py-2.5 bg-neutral-200/70 border-b border-neutral-300 overflow-x-auto">
          <div className="flex gap-1.5">
            {DEFAULT_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItemToCalc(item)}
                className="shrink-0 px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-left active:bg-neutral-100"
              >
                <div className="text-[11px] font-medium text-neutral-800 leading-tight">
                  {item.label}
                </div>
                <div className="text-[11px] font-mono font-semibold text-neutral-600 mt-0.5">
                  +R{item.price.toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'list' ? (
        <div className="flex-1 p-4 overflow-y-auto space-y-2 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Added Items
            </span>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCart([]);
                  clearAll();
                }}
                className="text-xs text-red-700 font-medium"
              >
                Clear List
              </button>
            )}
          </div>
          {cart.length === 0 ? (
            <p className="text-xs text-neutral-500 py-8 text-center">
              Tap any staple above to add it to your running total.
            </p>
          ) : (
            cart.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-neutral-100 text-sm"
              >
                <span className="text-neutral-800">{c.label}</span>
                <span className="font-mono font-medium">R{c.price.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Tactile Hardware-Style Keypad */
        <div className="flex-1 p-3 grid grid-cols-4 gap-2 bg-[#f4f4f0]">
          <button
            type="button"
            onClick={clearAll}
            className="col-span-2 bg-neutral-300 active:bg-neutral-400 text-neutral-900 font-semibold text-base rounded border-b-2 border-neutral-400"
          >
            C
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="bg-neutral-300 active:bg-neutral-400 text-neutral-900 font-mono font-semibold text-base rounded border-b-2 border-neutral-400"
          >
            DEL
          </button>
          <button
            type="button"
            onClick={() => handleOperator('÷')}
            className="bg-neutral-800 active:bg-neutral-700 text-white font-mono text-xl rounded border-b-2 border-neutral-950"
          >
            ÷
          </button>

          {[7, 8, 9].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => inputDigit(n)}
              className="bg-white active:bg-neutral-200 text-neutral-900 font-mono text-xl font-medium rounded border border-neutral-300 border-b-2"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleOperator('×')}
            className="bg-neutral-800 active:bg-neutral-700 text-white font-mono text-xl rounded border-b-2 border-neutral-950"
          >
            ×
          </button>

          {[4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => inputDigit(n)}
              className="bg-white active:bg-neutral-200 text-neutral-900 font-mono text-xl font-medium rounded border border-neutral-300 border-b-2"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleOperator('-')}
            className="bg-neutral-800 active:bg-neutral-700 text-white font-mono text-xl rounded border-b-2 border-neutral-950"
          >
            −
          </button>

          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => inputDigit(n)}
              className="bg-white active:bg-neutral-200 text-neutral-900 font-mono text-xl font-medium rounded border border-neutral-300 border-b-2"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleOperator('+')}
            className="bg-neutral-800 active:bg-neutral-700 text-white font-mono text-xl rounded border-b-2 border-neutral-950"
          >
            +
          </button>

          <button
            type="button"
            onClick={() => inputDigit(0)}
            className="col-span-2 bg-white active:bg-neutral-200 text-neutral-900 font-mono text-xl font-medium rounded border border-neutral-300 border-b-2"
          >
            0
          </button>
          <button
            type="button"
            onClick={inputDecimal}
            className="bg-white active:bg-neutral-200 text-neutral-900 font-mono text-xl font-bold rounded border border-neutral-300 border-b-2"
          >
            .
          </button>
          <button
            type="button"
            onClick={handleEquals}
            className="bg-[#d9532f] active:bg-[#b84222] text-white font-mono text-2xl font-bold rounded border-b-2 border-[#8f3016]"
          >
            =
          </button>
        </div>
      )}
    </div>
  );
}

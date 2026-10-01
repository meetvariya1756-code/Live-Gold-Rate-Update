'use client';
import { ReactNode, useEffect, useState } from 'react';

export function Field({
  label, required, hint, suffix, children,
}: { label: string; required?: boolean; hint?: ReactNode; suffix?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label} {required && <span className="req">*</span>}</label>
      {suffix !== undefined ? (
        <div className="input-wrap">{children}<span className="suffix">{suffix}</span></div>
      ) : children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function NumInput({
  value, onChange, step = 'any', placeholder, readOnly,
}: { value: number | string; onChange?: (v: string) => void; step?: string; placeholder?: string; readOnly?: boolean }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={value === 0 ? (placeholder !== undefined ? '' : 0) : value}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="card-head"><h3>{title}</h3><button className="sm" onClick={onClose}>✕</button></div>
        <div className="card-body">{children}</div>
        {footer && <div className="card-foot">{footer}</div>}
      </div>
    </div>
  );
}

let pushToast: ((m: string, err?: boolean) => void) | null = null;
export function toast(msg: string, error = false) { pushToast?.(msg, error); }

export function Toaster() {
  const [t, setT] = useState<{ m: string; e: boolean } | null>(null);
  useEffect(() => {
    let timer: any;
    pushToast = (m, e = false) => { setT({ m, e }); clearTimeout(timer); timer = setTimeout(() => setT(null), 3500); };
    return () => { pushToast = null; };
  }, []);
  return t ? <div className={`toast ${t.e ? 'error' : ''}`}>{t.m}</div> : null;
}

export function Spinner() { return <span className="spin" />; }

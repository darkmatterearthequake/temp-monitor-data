import { useEffect, useState } from "react";

const format = (v) => {
  if (v === "" || v == null) return "";
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString("en-CA", { maximumFractionDigits: 2 }) : "";
};
const parse = (s) => {
  const cleaned = String(s).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return "";
  const x = Number(cleaned);
  return Number.isFinite(x) ? x : "";
};

// Currency / number input that shows thousands separators when not focused.
export function Num({ label, value, onChange, hint, suffix, allowBlank = false, placeholder }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(format(value));
  useEffect(() => {
    if (!focused) setText(format(value));
  }, [value, focused]);
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="hint" title={hint}>?</span>}
      </span>
      <span className="field-input">
        {!suffix && <span className="affix">$</span>}
        <input
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onFocus={() => {
            setFocused(true);
            setText(value === "" || value == null ? "" : String(value));
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setText(e.target.value);
            const p = parse(e.target.value);
            onChange(p === "" && !allowBlank ? 0 : p);
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
    </label>
  );
}

export function Text({ label, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

export function Card({ title, children, aside }) {
  return (
    <section className="card">
      <header className="card-head">
        <h3>{title}</h3>
        {aside}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

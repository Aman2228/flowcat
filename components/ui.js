"use client";

import { useEffect, useState } from "react";

const FALLBACK = { label: "Unassigned", color: "#8893A5", target: 0 };

export function catInfo(categories, id) {
  const found = categories.find((c) => c.id === id);
  if (found) return found;
  return { ...FALLBACK, id, label: id ? `${id} (removed)` : FALLBACK.label };
}

export function CategorySelect({ categories, value, onChange, allowNone = false, ...rest }) {
  const missing = value && !categories.some((c) => c.id === value);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowNone && <option value="">None</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
      {missing && <option value={value}>{value} (removed)</option>}
    </select>
  );
}

// A number box you can clear and retype without it snapping back to 0.
export function NumInput({ value, onChange, min = 0, max, step = 1, ...rest }) {
  const [text, setText] = useState(String(value ?? ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value ?? ""));
  }, [value, focused]);

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === "") return;
        let n = Number(e.target.value);
        if (Number.isNaN(n)) return;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }}
      {...rest}
    />
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function CatChip({ cat }) {
  return (
    <span className="catChip" style={{ "--cat": cat.color }}>
      {cat.label}
    </span>
  );
}

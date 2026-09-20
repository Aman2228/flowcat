// lib/time.js
//
// Small date/time helpers. Everything here works in the browser's LOCAL time
// (never UTC), so "today" is always the date on Sana's phone or laptop.

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEK_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_FULL = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const pad = (n) => String(n).padStart(2, "0");

export function dateToStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return dateToStr(new Date());
}

export function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}

export function dayNameOf(str) {
  return DAYS[parseDate(str).getDay()];
}

// Whole days from `a` to `b` (positive when b is later).
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function daysUntil(str) {
  return diffDays(todayStr(), str);
}

// The Monday–Sunday week that contains `str`.
export function weekDates(str) {
  const d = parseDate(str);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return {
      date: dateToStr(x),
      dayName: DAYS[x.getDay()],
      label: x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    };
  });
}

export function longDate(str) {
  return parseDate(str).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function shortDate(str) {
  return parseDate(str).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function toMin(time) {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMin(minutes) {
  const c = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
}

export function fmtTime(time, format = "12h") {
  if (!time) return "";
  if (format === "24h") return time;
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${pad(m)} ${suffix}`;
}

export function fmtDur(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtHours(mins) {
  return `${(mins / 60).toFixed(1).replace(/\.0$/, "")} h`;
}

export function nowMin(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

export function uid(prefix = "b") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Corporate income tax rate data.
//
// Federal rates have been stable since 2019. Provincial rates are stored as
// dated periods so that a taxation year straddling a rate change is prorated
// by days, the same way the T2 schedules do it.
//
// These tables should be reviewed against the latest federal and provincial
// budgets before relying on results. Every rate can be overridden per scenario.

export const FEDERAL = {
  baseRate: 0.38,
  abatement: 0.10,
  generalRateReduction: 0.13,
  smallBusinessDeduction: 0.19,
  additionalRefundableTax: 0.10 + 2 / 300, // 10 2/3%
  refundablePartI: 0.30 + 2 / 300, // 30 2/3%
  dividendRefundRate: 0.38 + 1 / 300, // 38 1/3%
  partIVRate: 0.38 + 1 / 300, // 38 1/3%
  gripRate: 0.72,
  businessLimit: 500000,
  passiveThreshold: 50000,
  passiveGrindFactor: 5,
  taxableCapitalFloor: 10000000,
  taxableCapitalCeiling: 15000000,
  partIII1Rate: 0.20, // excessive eligible dividend designation (with election)
  partIIIRate: 0.60, // excessive capital dividend election
  // Zero-emission technology manufacturing: rates cut in half for tax years
  // beginning after 2021 and before 2032 (phase-out after that is ignored).
  zetm: { from: "2022-01-01", to: "2031-12-31", generalReduction: 0.075, smallReduction: 0.045 },
};

// small = small business rate, general = general rate, mp = manufacturing &
// processing rate (defaults to general when omitted).
export const PROVINCES = {
  AB: {
    name: "Alberta",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2020-07-01", small: 0.02, general: 0.08 }],
  },
  BC: {
    name: "British Columbia",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2018-01-01", small: 0.02, general: 0.12 }],
  },
  MB: {
    name: "Manitoba",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2019-01-01", small: 0.0, general: 0.12 }],
  },
  NB: {
    name: "New Brunswick",
    businessLimit: 500000,
    passiveGrind: false,
    periods: [{ from: "2018-04-01", small: 0.025, general: 0.14 }],
  },
  NL: {
    name: "Newfoundland and Labrador",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [
      { from: "2016-01-01", small: 0.03, general: 0.15 },
      { from: "2024-04-01", small: 0.025, general: 0.15 },
    ],
  },
  NS: {
    name: "Nova Scotia",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [
      { from: "2017-01-01", small: 0.025, general: 0.14 },
      { from: "2025-04-01", small: 0.015, general: 0.14 },
    ],
  },
  NT: {
    name: "Northwest Territories",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2017-01-01", small: 0.02, general: 0.115 }],
  },
  NU: {
    name: "Nunavut",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2017-01-01", small: 0.03, general: 0.12 }],
  },
  ON: {
    name: "Ontario",
    businessLimit: 500000,
    passiveGrind: false,
    periods: [{ from: "2020-01-01", small: 0.032, general: 0.115, mp: 0.10 }],
  },
  PE: {
    name: "Prince Edward Island",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2022-01-01", small: 0.01, general: 0.16 }],
  },
  QC: {
    name: "Quebec",
    businessLimit: 500000,
    passiveGrind: true,
    // Small business rate assumes the 5,500 paid-hours test is met.
    periods: [{ from: "2021-01-01", small: 0.032, general: 0.115 }],
  },
  SK: {
    name: "Saskatchewan",
    businessLimit: 600000,
    passiveGrind: true,
    periods: [
      { from: "2020-10-01", small: 0.0, general: 0.12, mp: 0.10 },
      { from: "2023-07-01", small: 0.01, general: 0.12, mp: 0.10 },
      { from: "2024-07-01", small: 0.02, general: 0.12, mp: 0.10 },
    ],
  },
  YT: {
    name: "Yukon",
    businessLimit: 500000,
    passiveGrind: true,
    periods: [{ from: "2021-01-01", small: 0.0, general: 0.12, mp: 0.025 }],
  },
};

export const PROVINCE_CODES = Object.keys(PROVINCES);

const DAY_MS = 86400000;
const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function daysInclusive(startIso, endIso) {
  return Math.round((toUTC(endIso) - toUTC(startIso)) / DAY_MS) + 1;
}

// Day-weighted provincial rates for a taxation year.
export function provincialRates(code, yearStart, yearEnd) {
  const prov = PROVINCES[code];
  if (!prov) throw new Error(`Unknown province ${code}`);
  const start = toUTC(yearStart);
  const end = toUTC(yearEnd) + DAY_MS; // exclusive
  const total = (end - start) / DAY_MS;
  const acc = { small: 0, general: 0, mp: 0 };
  const periods = prov.periods;
  for (let i = 0; i < periods.length; i++) {
    const pStart = Math.max(start, toUTC(periods[i].from));
    const pEnd = Math.min(end, i + 1 < periods.length ? toUTC(periods[i + 1].from) : Infinity);
    if (pEnd <= pStart) continue;
    const w = (pEnd - pStart) / DAY_MS / total;
    const p = periods[i];
    acc.small += p.small * w;
    acc.general += p.general * w;
    acc.mp += (p.mp ?? p.general) * w;
  }
  // Year starting before the first known period: use the earliest rates.
  const covered = (end - Math.max(start, toUTC(periods[0].from))) / DAY_MS;
  if (covered < total) {
    const w = (total - Math.max(0, covered)) / total;
    const p = periods[0];
    acc.small += p.small * w;
    acc.general += p.general * w;
    acc.mp += (p.mp ?? p.general) * w;
  }
  return acc;
}

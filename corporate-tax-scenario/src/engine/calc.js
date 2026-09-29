import { FEDERAL, PROVINCES, provincialRates, daysInclusive } from "./rates.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pos = (v) => Math.max(0, v);
const min = Math.min;

let seq = 1;
export function newScenario(overrides = {}) {
  const year = new Date().getFullYear();
  return {
    id: `sc_${Date.now().toString(36)}_${seq++}`,
    name: "Scenario",
    corpType: "ccpc", // "ccpc" | "private"
    yearStart: `${year}-01-01`,
    yearEnd: `${year}-12-31`,
    allocation: [{ prov: "ON", pct: 100 }],
    income: {
      activeBusiness: 0,
      mpPct: 0,
      zetmPct: 0,
      spi: 0,
      spiBusinessLimit: 0,
      sci: 0,
      sciAssigned: 0,
      interest: 0,
      rental: 0,
      foreignIncome: 0,
      foreignTax: 0,
      capitalGains: 0,
      capitalLosses: 0,
      portfolioEligibleDiv: 0,
      portfolioNonEligibleDiv: 0,
      connectedEligibleDiv: 0,
      connectedNonEligibleDiv: 0,
      connectedEligibleRefund: 0,
      connectedNonEligibleRefund: 0,
      capitalDividendsReceived: 0,
      otherCdaAdditions: 0,
    },
    deductions: { salaries: 0, otherDeductions: 0, donations: 0 },
    carryforwards: { nonCapitalLoss: 0, nonCapitalApply: "", netCapitalLoss: 0, donations: 0 },
    balances: { grip: 0, lrip: 0, erdtoh: 0, nerdtoh: 0, cda: 0 },
    limits: { businessLimitShare: FEDERAL.businessLimit, priorYearAAII: 0, taxableCapital: 0 },
    dividends: { eligible: 0, nonEligible: 0, capital: 0 },
    instalmentsPaid: 0,
    parent: { id: "", pct: 100 }, // shareholder corporation within this file
    overrides: { provSmall: "", provGeneral: "" },
    ...overrides,
  };
}

// Business limit after the passive income and taxable capital grinds.
function groundLimit(limit, priorAAII, taxableCapital, applyPassive) {
  const passive = applyPassive
    ? pos(priorAAII - FEDERAL.passiveThreshold) * FEDERAL.passiveGrindFactor
    : 0;
  const capital =
    (limit * pos(min(taxableCapital, FEDERAL.taxableCapitalCeiling) - FEDERAL.taxableCapitalFloor)) /
    (FEDERAL.taxableCapitalCeiling - FEDERAL.taxableCapitalFloor);
  return { limit: pos(limit - Math.max(passive, capital)), passive, capital };
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Compute one corporation's taxation year.
 * `inbound` carries dividends flowing in from linked subsidiaries in the same file.
 */
export function computeScenario(sc, inbound = null) {
  const warnings = [];
  const inc = { ...sc.income };
  if (inbound) {
    for (const k of Object.keys(inbound)) inc[k] = n(inc[k]) + inbound[k];
  }
  const ded = sc.deductions;
  const cf = sc.carryforwards;
  const bal = sc.balances;
  const lim = sc.limits;
  const divPaid = { eligible: n(sc.dividends.eligible), nonEligible: n(sc.dividends.nonEligible), capital: n(sc.dividends.capital) };
  const ccpc = sc.corpType === "ccpc";

  const days = daysInclusive(sc.yearStart, sc.yearEnd);
  if (days <= 0 || days > 371) warnings.push("Taxation year must be between 1 and 371 days (53 weeks).");
  const shortYear = days < 357 ? days / 365 : 1;

  // ── Net income ──────────────────────────────────────────────────────────
  const abiNet = n(inc.activeBusiness) - n(ded.salaries) - n(ded.otherDeductions);
  const propertyIncome = n(inc.interest) + n(inc.rental) + n(inc.foreignIncome);
  const netGains = n(inc.capitalGains) - n(inc.capitalLosses);
  const taxableGains = pos(netGains) / 2;
  const newNetCapitalLoss = pos(-netGains) / 2;
  const portfolioDivs = n(inc.portfolioEligibleDiv) + n(inc.portfolioNonEligibleDiv);
  const connectedDivs = n(inc.connectedEligibleDiv) + n(inc.connectedNonEligibleDiv);
  const taxableDivs = portfolioDivs + connectedDivs;

  const incomeSum = abiNet + propertyIncome + taxableGains + taxableDivs;
  const netIncome = pos(incomeSum);
  const s112 = taxableDivs;

  // ── Taxable income ──────────────────────────────────────────────────────
  const donationsAvail = n(cf.donations) + n(ded.donations);
  const donationsDed = min(donationsAvail, 0.75 * netIncome, pos(netIncome - s112));
  let remaining = pos(netIncome - s112 - donationsDed);
  const newNonCapitalLoss = pos(-(incomeSum - s112));

  const netCapApplied = min(n(cf.netCapitalLoss), taxableGains, remaining);
  remaining -= netCapApplied;
  const ncAuto = cf.nonCapitalApply === "" || cf.nonCapitalApply == null;
  const ncRequested = ncAuto ? Infinity : n(cf.nonCapitalApply);
  const nonCapApplied = min(n(cf.nonCapitalLoss), ncRequested, remaining);
  const taxableIncome = remaining - nonCapApplied;

  // ── Aggregate investment income (CCPC) ─────────────────────────────────
  const aii = ccpc ? pos(propertyIncome + taxableGains - netCapApplied) : 0;
  // AAII (for next year's grind) excludes loss carry-overs and includes portfolio dividends.
  const aaii = ccpc ? pos(propertyIncome + taxableGains + portfolioDivs) : 0;

  // ── Small business deduction ────────────────────────────────────────────
  const spiIneligible = pos(n(inc.spi) - n(inc.spiBusinessLimit));
  const sciIneligible = pos(n(inc.sci) - n(inc.sciAssigned));
  const eligibleABI = ccpc ? pos(abiNet - spiIneligible - sciIneligible) : 0;

  const fedBL = groundLimit(n(lim.businessLimitShare) * shortYear, n(lim.priorYearAAII), n(lim.taxableCapital), true);
  const ftcForSbd = min(n(inc.foreignTax), 0.28 * n(inc.foreignIncome));
  const tiCap = pos(taxableIncome - (100 / 28) * ftcForSbd);
  const sbdIncome = ccpc ? min(eligibleABI, tiCap, fedBL.limit) : 0;
  if (n(lim.businessLimitShare) > FEDERAL.businessLimit) warnings.push("Business limit share exceeds $500,000.");

  // ── Federal Part I ─────────────────────────────────────────────────────
  const baseTax = FEDERAL.baseRate * taxableIncome;
  const abatement = FEDERAL.abatement * taxableIncome;
  const sbd = FEDERAL.smallBusinessDeduction * sbdIncome;
  const art = ccpc ? FEDERAL.additionalRefundableTax * min(aii, pos(taxableIncome - sbdIncome)) : 0;
  const fullRateIncome = pos(taxableIncome - sbdIncome - aii);
  const grr = FEDERAL.generalRateReduction * fullRateIncome;

  let zetm = 0;
  const zetmIncome = pos(abiNet) * min(1, n(inc.zetmPct) / 100);
  if (zetmIncome > 0 && sc.yearStart >= FEDERAL.zetm.from && sc.yearStart <= FEDERAL.zetm.to) {
    const smallShare = abiNet > 0 ? sbdIncome / abiNet : 0;
    const zSmall = min(zetmIncome * smallShare, sbdIncome);
    const zGeneral = min(zetmIncome - zSmall, fullRateIncome);
    zetm = FEDERAL.zetm.smallReduction * zSmall + FEDERAL.zetm.generalReduction * zGeneral;
  }

  const partIBeforeFTC = pos(baseTax - abatement - sbd - grr - zetm + art);
  const ftcRate = FEDERAL.baseRate - FEDERAL.abatement + (ccpc ? FEDERAL.additionalRefundableTax : -FEDERAL.generalRateReduction);
  const ftc = min(n(inc.foreignTax), ftcRate * n(inc.foreignIncome), partIBeforeFTC);
  const federalPartI = partIBeforeFTC - ftc;

  // ── Provincial ─────────────────────────────────────────────────────────
  const allocation = (sc.allocation || []).filter((a) => PROVINCES[a.prov] && n(a.pct) > 0);
  const allocTotal = allocation.reduce((s, a) => s + n(a.pct), 0);
  if (Math.abs(allocTotal - 100) > 0.001) warnings.push(`Provincial allocation totals ${allocTotal}% (should be 100%).`);
  const mpIncome = pos(abiNet) * min(1, n(inc.mpPct) / 100);
  const provincial = allocation.map((a) => {
    const prov = PROVINCES[a.prov];
    const r = provincialRates(a.prov, sc.yearStart, sc.yearEnd);
    const small = sc.overrides?.provSmall !== "" && sc.overrides?.provSmall != null ? n(sc.overrides.provSmall) / 100 : r.small;
    const general = sc.overrides?.provGeneral !== "" && sc.overrides?.provGeneral != null ? n(sc.overrides.provGeneral) / 100 : r.general;
    const mp = r.mp === r.general ? general : r.mp;
    const provLimit = prov.businessLimit * (n(lim.businessLimitShare) / FEDERAL.businessLimit) * shortYear;
    const bl = groundLimit(provLimit, n(lim.priorYearAAII), n(lim.taxableCapital), prov.passiveGrind);
    const smallIncome = ccpc ? min(eligibleABI, tiCap, bl.limit) : 0;
    const generalBase = pos(taxableIncome - smallIncome);
    const mpShare = abiNet > 0 ? 1 - smallIncome / abiNet : 1;
    const mpBase = min(pos(mpIncome * mpShare), generalBase);
    const share = n(a.pct) / 100;
    const tax = share * (small * smallIncome + mp * mpBase + general * (generalBase - mpBase));
    return { prov: a.prov, name: prov.name, pct: n(a.pct), small, general, mp, businessLimit: bl.limit, smallIncome, tax };
  });
  const provincialTax = provincial.reduce((s, p) => s + p.tax, 0);

  // ── Refundable taxes and dividend refund ───────────────────────────────
  const refundablePartI = ccpc
    ? min(
        pos(FEDERAL.refundablePartI * aii - pos(ftc - 0.08 * n(inc.foreignIncome))),
        FEDERAL.refundablePartI * pos(taxableIncome - sbdIncome - (100 / (38 + 2 / 3)) * ftc),
        federalPartI
      )
    : 0;
  const partIVEligible = FEDERAL.partIVRate * n(inc.portfolioEligibleDiv) + n(inc.connectedEligibleRefund);
  const partIVNonEligible = FEDERAL.partIVRate * n(inc.portfolioNonEligibleDiv) + n(inc.connectedNonEligibleRefund);
  const partIV = partIVEligible + partIVNonEligible;

  const erdtohAvail = n(bal.erdtoh) + partIVEligible;
  const nerdtohAvail = n(bal.nerdtoh) + refundablePartI + partIVNonEligible;
  const refundEligible = min(FEDERAL.dividendRefundRate * divPaid.eligible, erdtohAvail);
  const refundNE_fromNER = min(FEDERAL.dividendRefundRate * divPaid.nonEligible, nerdtohAvail);
  const refundNE_fromER = min(FEDERAL.dividendRefundRate * divPaid.nonEligible - refundNE_fromNER, erdtohAvail - refundEligible);
  const dividendRefund = refundEligible + refundNE_fromNER + refundNE_fromER;
  const erdtohClose = erdtohAvail - refundEligible - refundNE_fromER;
  const nerdtohClose = nerdtohAvail - refundNE_fromNER;

  // ── GRIP / LRIP and Part III.1 ─────────────────────────────────────────
  const eligibleDivsReceived = n(inc.portfolioEligibleDiv) + n(inc.connectedEligibleDiv);
  let gripAvail = 0, gripClose = 0, lripAvail = 0, lripClose = 0, excessEligible = 0;
  if (ccpc) {
    gripAvail = n(bal.grip) + FEDERAL.gripRate * pos(taxableIncome - sbdIncome - aii) + eligibleDivsReceived;
    excessEligible = pos(divPaid.eligible - pos(gripAvail));
    gripClose = gripAvail - (divPaid.eligible - excessEligible);
  } else {
    lripAvail = n(bal.lrip) + n(inc.connectedNonEligibleDiv) + n(inc.portfolioNonEligibleDiv);
    const afterNE = pos(lripAvail - divPaid.nonEligible);
    excessEligible = min(divPaid.eligible, afterNE);
    lripClose = afterNE - excessEligible;
  }
  const partIII1 = FEDERAL.partIII1Rate * excessEligible;
  if (excessEligible > 0.5) {
    warnings.push(
      `Eligible dividends exceed ${ccpc ? "GRIP" : "available room (LRIP not cleared)"} by ${fmt(excessEligible)}; Part III.1 tax of ${fmt(partIII1)} assumes the 185.1(2) election.`
    );
  }

  // ── CDA and Part III ──────────────────────────────────────────────────
  const cdaAvail = pos(n(bal.cda) + netGains / 2) + n(inc.capitalDividendsReceived) + n(inc.otherCdaAdditions);
  const excessCapital = pos(divPaid.capital - cdaAvail);
  const partIII = FEDERAL.partIIIRate * excessCapital;
  const cdaClose = cdaAvail - (divPaid.capital - excessCapital);
  if (excessCapital > 0.5) warnings.push(`Capital dividend exceeds CDA by ${fmt(excessCapital)}; Part III tax of ${fmt(partIII)} (60%).`);

  // ── Totals ─────────────────────────────────────────────────────────────
  const partITotal = federalPartI + provincialTax;
  const grossTax = partITotal + partIV + partIII1 + partIII;
  const netTax = grossTax - dividendRefund;
  const balanceOwing = netTax - n(sc.instalmentsPaid);

  const smallCCPC = ccpc && sbdIncome > 0 && taxableIncome <= FEDERAL.businessLimit && n(lim.taxableCapital) <= FEDERAL.taxableCapitalFloor;
  const balanceDueDate = addMonths(sc.yearEnd, ccpc && sbdIncome > 0 && taxableIncome <= FEDERAL.businessLimit ? 3 : 2);
  const instalmentBase = pos(netTax);
  const nextInstalments = instalmentBase <= 3000
    ? { frequency: "none", amount: 0, count: 0 }
    : smallCCPC
      ? { frequency: "quarterly", amount: instalmentBase / 4, count: 4 }
      : { frequency: "monthly", amount: instalmentBase / 12, count: 12 };

  const nextYearBL = groundLimit(FEDERAL.businessLimit, aaii, n(lim.taxableCapital), true).limit;

  // ── Cash flow ──────────────────────────────────────────────────────────
  const pretaxCash =
    abiNet + propertyIncome - n(inc.foreignTax) + netGains + taxableDivs + n(inc.capitalDividendsReceived) - n(ded.donations);
  const afterTaxCash = pretaxCash - netTax;
  const dividendsPaidTotal = divPaid.eligible + divPaid.nonEligible + divPaid.capital;
  const retainedCash = afterTaxCash - dividendsPaidTotal;

  // ── Dividend recommendations ───────────────────────────────────────────
  const rr = FEDERAL.dividendRefundRate;
  const rec = (() => {
    const cda = cdaAvail;
    if (!ccpc) {
      const ne = Math.max(lripAvail, nerdtohAvail / rr);
      return { eligible: erdtohAvail / rr, nonEligible: ne, capital: cda };
    }
    const eligible = min(pos(gripAvail), erdtohAvail / rr);
    const erLeft = erdtohAvail - eligible * rr;
    const nonEligible = (nerdtohAvail + erLeft) / rr;
    return { eligible, nonEligible, capital: cda, maxEligible: pos(gripAvail) };
  })();

  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    id: sc.id,
    name: sc.name,
    ccpc,
    days,
    warnings,
    income: { abiNet, propertyIncome, taxableGains, taxableDivs, portfolioDivs, connectedDivs, netIncome, incomeSum },
    deductions: { s112, donationsDed, netCapApplied, nonCapApplied },
    taxableIncome,
    aii,
    aaii,
    sbd: { eligibleABI, businessLimit: fedBL.limit, passiveGrind: fedBL.passive, capitalGrind: fedBL.capital, sbdIncome, fullRateIncome },
    federal: { baseTax, abatement, sbd, grr, zetm, art, partIBeforeFTC, ftc, federalPartI },
    provincial,
    provincialTax,
    refundable: { refundablePartI, partIVEligible, partIVNonEligible, partIV },
    rdtoh: {
      erdtohOpen: n(bal.erdtoh), nerdtohOpen: n(bal.nerdtoh), erdtohAvail, nerdtohAvail,
      refundEligible, refundNonEligible: refundNE_fromNER + refundNE_fromER, refundNE_fromER, dividendRefund,
      erdtohClose, nerdtohClose,
    },
    grip: { open: n(bal.grip), avail: gripAvail, close: gripClose, lripOpen: n(bal.lrip), lripAvail, lripClose, excessEligible },
    cda: { open: n(bal.cda), avail: cdaAvail, close: cdaClose, excessCapital },
    losses: {
      nonCapitalOpen: n(cf.nonCapitalLoss), nonCapitalClose: n(cf.nonCapitalLoss) - nonCapApplied + newNonCapitalLoss, newNonCapitalLoss,
      netCapitalOpen: n(cf.netCapitalLoss), netCapitalClose: n(cf.netCapitalLoss) - netCapApplied + newNetCapitalLoss, newNetCapitalLoss,
      donationsOpen: n(cf.donations), donationsClose: donationsAvail - donationsDed,
    },
    taxes: { federalPartI, provincialTax, partITotal, partIV, partIII1, partIII, grossTax, dividendRefund, netTax },
    instalments: { paid: n(sc.instalmentsPaid), balanceOwing, balanceDueDate, next: nextInstalments },
    dividendsPaid: { ...divPaid, total: dividendsPaidTotal },
    cash: { pretaxCash, afterTaxCash, retainedCash },
    nextYear: { aaii, businessLimit: nextYearBL },
    rates: {
      effectiveOnNetIncome: netIncome > 0 ? netTax / netIncome : 0,
      partIOnTaxable: taxableIncome > 0 ? partITotal / taxableIncome : 0,
    },
    recommendations: {
      eligible: r2(rec.eligible),
      nonEligible: r2(rec.nonEligible),
      capital: r2(rec.capital),
      maxEligible: rec.maxEligible != null ? r2(rec.maxEligible) : null,
    },
  };
}

/**
 * Compute all scenarios, flowing dividends from subsidiaries to parent
 * corporations defined in the same file.
 */
export function computeAll(scenarios) {
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
  const results = {};
  const inbound = {};
  const visiting = new Set();
  const cycles = new Set();

  const children = (id) => scenarios.filter((s) => s.parent?.id === id && byId[id]);

  function run(sc) {
    if (results[sc.id]) return results[sc.id];
    if (visiting.has(sc.id)) {
      cycles.add(sc.id);
      return null;
    }
    visiting.add(sc.id);
    const flows = { connectedEligibleDiv: 0, connectedNonEligibleDiv: 0, connectedEligibleRefund: 0, connectedNonEligibleRefund: 0, capitalDividendsReceived: 0, portfolioEligibleDiv: 0, portfolioNonEligibleDiv: 0 };
    const links = [];
    for (const child of children(sc.id)) {
      const cr = run(child);
      if (!cr) continue;
      const share = Math.min(100, n(child.parent.pct)) / 100;
      const connected = share > 0.1;
      const eligible = cr.dividendsPaid.eligible * share;
      const nonEligible = cr.dividendsPaid.nonEligible * share;
      if (connected) {
        flows.connectedEligibleDiv += eligible;
        flows.connectedNonEligibleDiv += nonEligible;
        flows.connectedEligibleRefund += cr.rdtoh.refundEligible * share;
        flows.connectedNonEligibleRefund += cr.rdtoh.refundNonEligible * share;
      } else {
        flows.portfolioEligibleDiv += eligible;
        flows.portfolioNonEligibleDiv += nonEligible;
      }
      flows.capitalDividendsReceived += cr.dividendsPaid.capital * share;
      links.push({ from: child.name, share, connected, eligible, nonEligible, capital: cr.dividendsPaid.capital * share });
    }
    inbound[sc.id] = links;
    const res = computeScenario(sc, links.length ? flows : null);
    res.inbound = links;
    visiting.delete(sc.id);
    results[sc.id] = res;
    return res;
  }

  for (const sc of scenarios) run(sc);
  for (const id of cycles) results[id]?.warnings.push("Circular ownership detected; inbound dividends from the cycle were ignored.");

  // Associated group business limit check (parent owns >50%).
  for (const sc of scenarios) {
    const group = scenarios.filter((s) => s.parent?.id === sc.id && n(s.parent.pct) > 50);
    if (!group.length) continue;
    const ccpcs = [sc, ...group].filter((s) => s.corpType === "ccpc");
    const total = ccpcs.reduce((s, x) => s + n(x.limits.businessLimitShare), 0);
    if (ccpcs.length > 1 && total > FEDERAL.businessLimit + 0.5) {
      results[sc.id].warnings.push(`Associated group business limit shares total ${fmt(total)}; the $500,000 limit must be shared (Schedule 23).`);
    }
  }

  return scenarios.map((s) => results[s.id]);
}

export function fmt(v, digits = 0) {
  const x = Number(v) || 0;
  return x.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(v, digits = 2) {
  return `${((Number(v) || 0) * 100).toFixed(digits)}%`;
}

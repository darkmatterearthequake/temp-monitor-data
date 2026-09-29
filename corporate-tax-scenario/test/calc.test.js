import { test } from "node:test";
import assert from "node:assert/strict";
import { newScenario, computeScenario, computeAll } from "../src/engine/calc.js";
import { provincialRates } from "../src/engine/rates.js";
import { writtenReport } from "../src/engine/report.js";

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} !== ${b}`);

const base = (patch = {}) => {
  const sc = newScenario({ yearStart: "2025-01-01", yearEnd: "2025-12-31" });
  for (const [k, v] of Object.entries(patch)) sc[k] = typeof v === "object" && !Array.isArray(v) ? { ...sc[k], ...v } : v;
  return sc;
};

test("Ontario CCPC fully within the business limit", () => {
  const r = computeScenario(base({ income: { activeBusiness: 400000 } }));
  close(r.sbd.sbdIncome, 400000);
  close(r.taxes.federalPartI, 36000);
  close(r.taxes.provincialTax, 12800);
  close(r.grip.close, 0);
});

test("Ontario CCPC above the business limit adds GRIP", () => {
  const r = computeScenario(base({ income: { activeBusiness: 800000 } }));
  close(r.taxes.federalPartI, 90000);
  close(r.taxes.provincialTax, 50500);
  close(r.grip.close, 216000);
});

test("salaries reduce active business income", () => {
  const r = computeScenario(base({ income: { activeBusiness: 300000 }, deductions: { salaries: 100000 } }));
  close(r.taxableIncome, 200000);
  close(r.taxes.federalPartI, 18000);
});

test("investment income: ART, refundable tax and dividend refund", () => {
  const r = computeScenario(base({ income: { interest: 100000 }, dividends: { nonEligible: 80000 } }));
  close(r.taxes.federalPartI, 38666.67);
  close(r.taxes.provincialTax, 11500);
  close(r.refundable.refundablePartI, 30666.67);
  close(r.rdtoh.dividendRefund, 30666.67);
  close(r.rdtoh.nerdtohClose, 0);
});

test("Part IV on portfolio eligible dividends goes to ERDTOH and GRIP", () => {
  const r = computeScenario(base({ income: { portfolioEligibleDiv: 10000 } }));
  close(r.taxableIncome, 0);
  close(r.taxes.partIV, 3833.33);
  close(r.rdtoh.erdtohClose, 3833.33);
  close(r.grip.close, 10000);
  close(r.nextYear.aaii, 10000);
});

test("non-eligible dividends draw on ERDTOH once NERDTOH is exhausted", () => {
  const r = computeScenario(base({ balances: { erdtoh: 10000, nerdtoh: 5000 }, dividends: { nonEligible: 60000 } }));
  close(r.rdtoh.refundNonEligible, 15000);
  close(r.rdtoh.nerdtohClose, 0);
  close(r.rdtoh.erdtohClose, 0);
});

test("passive income grind reduces the business limit (federal only in Ontario)", () => {
  const r = computeScenario(base({ income: { activeBusiness: 500000 }, limits: { priorYearAAII: 100000 } }));
  close(r.sbd.businessLimit, 250000);
  close(r.provincial[0].businessLimit, 500000);
  close(r.taxes.federalPartI, 250000 * 0.09 + 250000 * 0.15);
  close(r.taxes.provincialTax, 500000 * 0.032);
});

test("taxable capital grind", () => {
  const r = computeScenario(base({ income: { activeBusiness: 500000 }, limits: { taxableCapital: 12500000 } }));
  close(r.sbd.businessLimit, 250000);
});

test("excess eligible dividends attract Part III.1 tax", () => {
  const r = computeScenario(base({ balances: { grip: 10000 }, dividends: { eligible: 30000 } }));
  close(r.grip.excessEligible, 20000);
  close(r.taxes.partIII1, 4000);
  assert.ok(r.warnings.some((w) => w.includes("Part III.1")));
});

test("capital gains: taxable half, CDA and Part III", () => {
  const r = computeScenario(base({ income: { capitalGains: 100000 }, dividends: { capital: 60000 } }));
  close(r.taxableIncome, 50000);
  close(r.cda.avail, 50000);
  close(r.taxes.partIII, 6000);
  close(r.cda.close, 0);
});

test("loss carry-forwards and donations", () => {
  const r = computeScenario(
    base({ income: { activeBusiness: 100000 }, deductions: { donations: 90000 }, carryforwards: { nonCapitalLoss: 50000 } })
  );
  close(r.deductions.donationsDed, 75000);
  close(r.deductions.nonCapApplied, 25000);
  close(r.taxableIncome, 0);
  close(r.losses.nonCapitalClose, 25000);
  close(r.losses.donationsClose, 15000);
});

test("business loss creates a non-capital loss", () => {
  const r = computeScenario(base({ income: { activeBusiness: 50000, portfolioEligibleDiv: 20000 }, deductions: { salaries: 100000 } }));
  close(r.taxableIncome, 0);
  close(r.losses.newNonCapitalLoss, 50000);
});

test("Nova Scotia small business rate prorated for April 2025 change", () => {
  const r = provincialRates("NS", "2025-01-01", "2025-12-31");
  close(r.small, (0.025 * 90 + 0.015 * 275) / 365, 1e-9);
});

test("Ontario M&P rate", () => {
  const r = computeScenario(base({ income: { activeBusiness: 1500000, mpPct: 100 } }));
  close(r.taxes.provincialTax, 500000 * 0.032 + 1000000 * 0.10);
});

test("ZETM halves the federal rate", () => {
  const r = computeScenario(base({ income: { activeBusiness: 1500000, zetmPct: 100 } }));
  close(r.taxes.federalPartI, 500000 * 0.045 + 1000000 * 0.075);
});

test("specified corporate income without assigned limit is not SBD eligible", () => {
  const r = computeScenario(base({ income: { activeBusiness: 300000, sci: 100000 } }));
  close(r.sbd.sbdIncome, 200000);
});

test("non-CCPC: no SBD, general rate on investment income", () => {
  const r = computeScenario(base({ corpType: "private", income: { activeBusiness: 100000, interest: 100000 } }));
  close(r.sbd.sbdIncome, 0);
  close(r.taxes.federalPartI, 30000);
  close(r.refundable.refundablePartI, 0);
});

test("short taxation year prorates the business limit", () => {
  const r = computeScenario(base({ yearStart: "2025-07-01", yearEnd: "2025-12-31", income: { activeBusiness: 500000 } }));
  close(r.sbd.businessLimit, (500000 * 184) / 365);
});

test("foreign tax credit", () => {
  const r = computeScenario(base({ income: { foreignIncome: 10000, foreignTax: 1500 } }));
  close(r.federal.ftc, 1500);
  // 129(4)(b) limit binds: 30 2/3% x (TI - 100/38.67 x FTC)
  close(r.refundable.refundablePartI, (0.92 / 3) * (10000 - (100 / (38 + 2 / 3)) * 1500));
});

test("multi-jurisdiction allocation", () => {
  const r = computeScenario(base({ allocation: [{ prov: "ON", pct: 50 }, { prov: "AB", pct: 50 }], income: { activeBusiness: 1000000 } }));
  close(r.taxes.provincialTax, 0.5 * (500000 * 0.032 + 500000 * 0.115) + 0.5 * (500000 * 0.02 + 500000 * 0.08));
});

test("inter-corporate dividends flow from subsidiary to parent with Part IV", () => {
  const hold = base({ name: "Holdco" });
  const op = base({ name: "Opco", balances: { nerdtoh: 30000 }, dividends: { nonEligible: 100000, capital: 5000 } });
  op.balances.cda = 5000;
  op.parent = { id: hold.id, pct: 100 };
  const [h, o] = computeAll([hold, op]);
  close(o.rdtoh.dividendRefund, 30000);
  close(h.taxes.partIV, 30000);
  close(h.rdtoh.nerdtohClose, 30000);
  close(h.taxableIncome, 0);
  close(h.cda.close, 5000);
  assert.equal(h.inbound.length, 1);
});

test("portfolio holding (10% or less) is taxed as portfolio dividends", () => {
  const hold = base({ name: "Holdco" });
  const op = base({ name: "Opco", dividends: { eligible: 0, nonEligible: 100000 } });
  op.parent = { id: hold.id, pct: 10 };
  const [h] = computeAll([hold, op]);
  close(h.taxes.partIV, 10000 * (0.38 + 1 / 300));
});

test("circular ownership is detected", () => {
  const a = base({ name: "A" });
  const b = base({ name: "B" });
  a.parent = { id: b.id, pct: 100 };
  b.parent = { id: a.id, pct: 100 };
  const res = computeAll([a, b]);
  assert.ok(res.some((r) => r.warnings.some((w) => w.includes("Circular"))));
});

test("dividend recommendations", () => {
  const r = computeScenario(base({ income: { interest: 100000, portfolioEligibleDiv: 30000 }, balances: { grip: 5000, cda: 20000 } }));
  close(r.recommendations.maxEligible, 35000);
  close(r.recommendations.eligible, 30000);
  close(r.recommendations.nonEligible, 80000);
  close(r.recommendations.capital, 20000);
});

test("written report renders", () => {
  const sc = base({ income: { activeBusiness: 800000, interest: 50000 }, dividends: { eligible: 50000 } });
  const paras = writtenReport(sc, computeScenario(sc));
  assert.ok(paras.length >= 5);
  assert.ok(paras.join(" ").includes("GRIP"));
});

import { fmt, pct } from "./calc.js";

// Plain-language explanation of a scenario's outcome.
export function writtenReport(sc, r) {
  const p = [];
  const jur = r.provincial.map((x) => `${x.name}${r.provincial.length > 1 ? ` (${x.pct}%)` : ""}`).join(", ");
  p.push(
    `${sc.name} is modelled as a ${r.ccpc ? "Canadian-controlled private corporation" : "private corporation (non-CCPC)"} ` +
      `for the ${r.days}-day taxation year ending ${sc.yearEnd}, with income allocated to ${jur || "no province"}.`
  );

  p.push(
    `Net income for tax purposes is ${fmt(r.income.netIncome)} and taxable income is ${fmt(r.taxableIncome)}` +
      (r.deductions.s112 ? ` after deducting ${fmt(r.deductions.s112)} of inter-corporate dividends under s.112` : "") +
      (r.deductions.donationsDed ? `, ${fmt(r.deductions.donationsDed)} of charitable donations` : "") +
      (r.deductions.nonCapApplied ? `, ${fmt(r.deductions.nonCapApplied)} of non-capital losses` : "") +
      (r.deductions.netCapApplied ? `, ${fmt(r.deductions.netCapApplied)} of net capital losses` : "") +
      "."
  );

  if (r.ccpc && (r.sbd.eligibleABI > 0 || r.aii > 0)) {
    const s = r.sbd;
    let t = s.eligibleABI > 0 ? `${fmt(s.sbdIncome)} of active business income qualifies for the small business deduction (federal business limit ${fmt(s.businessLimit)}).` : "";
    if (s.eligibleABI > 0 && (s.passiveGrind > 0 || s.capitalGrind > 0)) {
      t += ` The business limit was reduced by ${fmt(Math.max(s.passiveGrind, s.capitalGrind))} because of ${s.passiveGrind >= s.capitalGrind ? "prior-year adjusted aggregate investment income" : "taxable capital above $10 million"}.`;
    }
    if (s.fullRateIncome > 0) t += ` ${fmt(s.fullRateIncome)} is taxed at the general rate, adding ${fmt(0.72 * s.fullRateIncome)} to GRIP.`;
    if (r.aii > 0) t += `${t ? " " : ""}Aggregate investment income of ${fmt(r.aii)} is subject to additional refundable tax of ${fmt(r.federal.art)} and generates ${fmt(r.refundable.refundablePartI)} of refundable Part I tax (NERDTOH).`;
    p.push(t);
  }

  p.push(
    `Part I tax is ${fmt(r.taxes.partITotal)} (federal ${fmt(r.taxes.federalPartI)}, provincial ${fmt(r.taxes.provincialTax)}), ` +
      `an effective rate of ${pct(r.rates.partIOnTaxable)} on taxable income.` +
      (r.taxes.partIV ? ` Part IV tax on dividends received is ${fmt(r.taxes.partIV)}.` : "") +
      (r.taxes.partIII1 ? ` Part III.1 tax of ${fmt(r.taxes.partIII1)} applies to excessive eligible dividends.` : "") +
      (r.taxes.partIII ? ` Part III tax of ${fmt(r.taxes.partIII)} applies to an excessive capital dividend.` : "")
  );

  const d = r.dividendsPaid;
  if (d.total > 0) {
    p.push(
      `The corporation pays ${fmt(d.eligible)} of eligible, ${fmt(d.nonEligible)} of non-eligible and ${fmt(d.capital)} of capital dividends, ` +
        `generating a dividend refund of ${fmt(r.rdtoh.dividendRefund)}.`
    );
  } else {
    p.push("No dividends are paid in this scenario.");
  }

  p.push(
    `Net tax after the dividend refund is ${fmt(r.taxes.netTax)} (${pct(r.rates.effectiveOnNetIncome)} of net income). ` +
      `After ${fmt(r.instalments.paid)} of instalments, ${r.instalments.balanceOwing >= 0 ? `a balance of ${fmt(r.instalments.balanceOwing)} is due by ${r.instalments.balanceDueDate}` : `a refund of ${fmt(-r.instalments.balanceOwing)} is expected`}.` +
      (r.instalments.next.count ? ` Based on this year's tax, next year's instalments would be ${r.instalments.next.frequency} payments of ${fmt(r.instalments.next.amount)}.` : " No instalments are required next year on this year's tax.")
  );

  const rec = r.recommendations;
  const recs = [];
  if (r.ccpc && rec.eligible > 1) recs.push(`${fmt(rec.eligible)} of eligible dividends (GRIP available ${fmt(rec.maxEligible)})`);
  if (!r.ccpc && rec.eligible > 1) recs.push(`${fmt(rec.eligible)} of eligible dividends to recover ERDTOH`);
  if (rec.nonEligible > 1) recs.push(`${fmt(rec.nonEligible)} of non-eligible dividends`);
  if (rec.capital > 1) recs.push(`a capital dividend of up to ${fmt(rec.capital)} (s.83(2) election required)`);
  if (recs.length) p.push(`To fully recover refundable taxes and use available balances, consider paying ${recs.join(", ")}.`);

  p.push(
    `Closing balances: GRIP ${fmt(r.ccpc ? r.grip.close : 0)}${r.ccpc ? "" : `, LRIP ${fmt(r.grip.lripClose)}`}, ERDTOH ${fmt(r.rdtoh.erdtohClose)}, NERDTOH ${fmt(r.rdtoh.nerdtohClose)}, ` +
      `CDA ${fmt(r.cda.close)}, non-capital losses ${fmt(r.losses.nonCapitalClose)}, net capital losses ${fmt(r.losses.netCapitalClose)}.` +
      (r.ccpc && r.nextYear.aaii > 50000 ? ` Adjusted aggregate investment income of ${fmt(r.nextYear.aaii)} will reduce next year's federal business limit to ${fmt(r.nextYear.businessLimit)}.` : "")
  );

  return p;
}

import { fmt, pct } from "../engine/calc.js";

const money = (f) => ({ f, t: "money" });
const rate = (f) => ({ f, t: "pct" });

export const ROWS = [
  { group: "Income" },
  { label: "Active business income (net of salaries)", ...money((r) => r.income.abiNet) },
  { label: "Property & foreign income", ...money((r) => r.income.propertyIncome) },
  { label: "Taxable capital gains", ...money((r) => r.income.taxableGains) },
  { label: "Taxable dividends received", ...money((r) => r.income.taxableDivs) },
  { label: "Net income for tax purposes", ...money((r) => r.income.netIncome), strong: true },
  { label: "Less: s.112 dividend deduction", ...money((r) => -r.deductions.s112) },
  { label: "Less: donations", ...money((r) => -r.deductions.donationsDed) },
  { label: "Less: net capital losses applied", ...money((r) => -r.deductions.netCapApplied) },
  { label: "Less: non-capital losses applied", ...money((r) => -r.deductions.nonCapApplied) },
  { label: "Taxable income", ...money((r) => r.taxableIncome), strong: true },

  { group: "Small business deduction" },
  { label: "Federal business limit (after grinds)", ...money((r) => r.sbd.businessLimit) },
  { label: "Income eligible for SBD", ...money((r) => r.sbd.sbdIncome) },
  { label: "Aggregate investment income", ...money((r) => r.aii) },
  { label: "Income taxed at general rate", ...money((r) => r.sbd.fullRateIncome) },

  { group: "Federal tax" },
  { label: "Base tax (38%)", ...money((r) => r.federal.baseTax) },
  { label: "Provincial abatement", ...money((r) => -r.federal.abatement) },
  { label: "Small business deduction", ...money((r) => -r.federal.sbd) },
  { label: "General rate reduction", ...money((r) => -r.federal.grr) },
  { label: "ZETM reduction", ...money((r) => -r.federal.zetm) },
  { label: "Additional refundable tax", ...money((r) => r.federal.art) },
  { label: "Foreign tax credit", ...money((r) => -r.federal.ftc) },
  { label: "Federal Part I tax", ...money((r) => r.taxes.federalPartI), strong: true },

  { group: "Tax summary" },
  { label: "Provincial tax", ...money((r) => r.taxes.provincialTax) },
  { label: "Part IV tax", ...money((r) => r.taxes.partIV) },
  { label: "Part III.1 tax (excess eligible)", ...money((r) => r.taxes.partIII1) },
  { label: "Part III tax (excess capital dividend)", ...money((r) => r.taxes.partIII) },
  { label: "Total tax before refund", ...money((r) => r.taxes.grossTax) },
  { label: "Dividend refund", ...money((r) => -r.taxes.dividendRefund) },
  { label: "Net tax", ...money((r) => r.taxes.netTax), strong: true },
  { label: "Part I rate on taxable income", ...rate((r) => r.rates.partIOnTaxable) },
  { label: "Net tax / net income", ...rate((r) => r.rates.effectiveOnNetIncome) },

  { group: "Dividends paid" },
  { label: "Eligible", ...money((r) => r.dividendsPaid.eligible) },
  { label: "Non-eligible", ...money((r) => r.dividendsPaid.nonEligible) },
  { label: "Capital", ...money((r) => r.dividendsPaid.capital) },

  { group: "Closing balances" },
  { label: "GRIP", ...money((r) => (r.ccpc ? r.grip.close : 0)) },
  { label: "LRIP", ...money((r) => (r.ccpc ? 0 : r.grip.lripClose)) },
  { label: "ERDTOH", ...money((r) => r.rdtoh.erdtohClose) },
  { label: "NERDTOH", ...money((r) => r.rdtoh.nerdtohClose) },
  { label: "Capital dividend account", ...money((r) => r.cda.close) },
  { label: "Non-capital losses", ...money((r) => r.losses.nonCapitalClose) },
  { label: "Net capital losses", ...money((r) => r.losses.netCapitalClose) },
  { label: "Donations carried forward", ...money((r) => r.losses.donationsClose) },
  { label: "AAII (for next year's grind)", ...money((r) => r.nextYear.aaii) },
  { label: "Next year's federal business limit", ...money((r) => r.nextYear.businessLimit) },

  { group: "Cash & payments" },
  { label: "Pre-tax cash income", ...money((r) => r.cash.pretaxCash) },
  { label: "After-tax cash", ...money((r) => r.cash.afterTaxCash) },
  { label: "Cash retained after dividends", ...money((r) => r.cash.retainedCash), strong: true },
  { label: "Instalments paid", ...money((r) => r.instalments.paid) },
  { label: "Balance owing / (refund)", ...money((r) => r.instalments.balanceOwing), strong: true },
  { label: "Balance due date", f: (r) => r.instalments.balanceDueDate, t: "text" },
  { label: "Next year instalments", f: (r) => (r.instalments.next.count ? `${r.instalments.next.count} × ${fmt(r.instalments.next.amount)}` : "None"), t: "text" },
];

const show = (row, r) => {
  const v = row.f(r);
  if (row.t === "money") return Math.abs(v) < 0.005 ? "–" : fmt(v);
  if (row.t === "pct") return pct(v);
  return v;
};

export default function Comparison({ scenarios, results, activeId, onSelect }) {
  return (
    <div className="table-wrap">
      <table className="compare">
        <thead>
          <tr>
            <th className="sticky">Line</th>
            {scenarios.map((s, i) => (
              <th key={s.id} className={s.id === activeId ? "active" : ""}>
                <button className="link" onClick={() => onSelect(s.id)}>
                  <span className="swatch" style={{ background: `var(--series-${i + 1})` }} />
                  {s.name}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, k) =>
            row.group ? (
              <tr key={k} className="group">
                <td colSpan={scenarios.length + 1}>{row.group}</td>
              </tr>
            ) : (
              <tr key={k} className={row.strong ? "strong" : ""}>
                <td className="sticky">{row.label}</td>
                {results.map((r) => (
                  <td key={r.id} className="num">
                    {show(row, r)}
                  </td>
                ))}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

export function toCSV(scenarios, results) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["Line", ...scenarios.map((s) => s.name)].map(esc).join(",")];
  for (const row of ROWS) {
    if (row.group) {
      lines.push(esc(row.group));
      continue;
    }
    lines.push([row.label, ...results.map((r) => (row.t === "money" ? row.f(r).toFixed(2) : row.t === "pct" ? (row.f(r) * 100).toFixed(2) + "%" : row.f(r)))].map(esc).join(","));
  }
  return lines.join("\n");
}

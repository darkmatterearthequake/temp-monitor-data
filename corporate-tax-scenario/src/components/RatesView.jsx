import { useState } from "react";
import { FEDERAL, PROVINCES, PROVINCE_CODES, provincialRates } from "../engine/rates.js";
import { pct } from "../engine/calc.js";

export default function RatesView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const fedSmall = FEDERAL.baseRate - FEDERAL.abatement - FEDERAL.smallBusinessDeduction;
  const fedGeneral = FEDERAL.baseRate - FEDERAL.abatement - FEDERAL.generalRateReduction;
  const fedInvest = FEDERAL.baseRate - FEDERAL.abatement + FEDERAL.additionalRefundableTax;

  return (
    <div className="card">
      <header className="card-head">
        <h3>Combined corporate rates</h3>
        <label className="inline">
          Calendar year{" "}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2023, 2024, 2025, 2026, 2027].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </header>
      <p className="muted small">
        Federal: small business {pct(fedSmall)}, general {pct(fedGeneral)}, CCPC investment income {pct(fedInvest)} ({pct(FEDERAL.refundablePartI)} refundable). Dividend refund{" "}
        {pct(FEDERAL.dividendRefundRate)}. Provincial rates are day-weighted for mid-year changes. Verify against current budgets; every rate can be overridden per scenario.
      </p>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th className="sticky">Jurisdiction</th>
              <th>Prov. small</th>
              <th>Prov. general</th>
              <th>Prov. M&P</th>
              <th>Combined small</th>
              <th>Combined general</th>
              <th>Combined investment</th>
              <th>Business limit</th>
              <th>Passive grind</th>
            </tr>
          </thead>
          <tbody>
            {PROVINCE_CODES.map((c) => {
              const r = provincialRates(c, `${year}-01-01`, `${year}-12-31`);
              return (
                <tr key={c}>
                  <td className="sticky">{PROVINCES[c].name}</td>
                  <td className="num">{pct(r.small, 3)}</td>
                  <td className="num">{pct(r.general, 3)}</td>
                  <td className="num">{pct(r.mp, 3)}</td>
                  <td className="num">{pct(fedSmall + r.small, 3)}</td>
                  <td className="num">{pct(fedGeneral + r.general, 3)}</td>
                  <td className="num">{pct(fedInvest + r.general, 3)}</td>
                  <td className="num">${PROVINCES[c].businessLimit.toLocaleString("en-CA")}</td>
                  <td>{PROVINCES[c].passiveGrind ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

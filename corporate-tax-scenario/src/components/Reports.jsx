import { writtenReport } from "../engine/report.js";
import { fmt, pct } from "../engine/calc.js";

function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

export function KpiRow({ r }) {
  return (
    <div className="kpis">
      <Kpi label="Taxable income" value={fmt(r.taxableIncome)} />
      <Kpi label="Net tax" value={fmt(r.taxes.netTax)} />
      <Kpi label="Effective rate" value={pct(r.rates.effectiveOnNetIncome, 1)} />
      <Kpi label={r.instalments.balanceOwing >= 0 ? "Balance owing" : "Refund"} value={fmt(Math.abs(r.instalments.balanceOwing))} />
    </div>
  );
}

export default function Reports({ scenarios, results }) {
  return (
    <div className="reports">
      {scenarios.map((sc, i) => {
        const r = results[i];
        return (
          <article className="card report" key={sc.id}>
            <h2>{sc.name}</h2>
            <p className="muted small">
              Taxation year {sc.yearStart} to {sc.yearEnd}
            </p>
            <KpiRow r={r} />
            {r.warnings.length > 0 && (
              <ul className="warnings">
                {r.warnings.map((w, k) => (
                  <li key={k}>⚠ {w}</li>
                ))}
              </ul>
            )}
            {writtenReport(sc, r).map((para, k) => (
              <p key={k}>{para}</p>
            ))}
          </article>
        );
      })}
      <p className="muted small disclaimer">
        Projections are estimates for planning purposes. They do not replace a filed T2 return and should be reviewed by a qualified tax professional.
      </p>
    </div>
  );
}

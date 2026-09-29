import { useEffect, useMemo, useRef, useState } from "react";
import { newScenario, computeAll, fmt } from "./engine/calc.js";
import ScenarioEditor from "./components/ScenarioEditor.jsx";
import Comparison, { toCSV } from "./components/Comparison.jsx";
import Charts from "./components/Charts.jsx";
import Reports, { KpiRow } from "./components/Reports.jsx";
import RatesView from "./components/RatesView.jsx";

const MAX_SCENARIOS = 8;
const STORAGE_KEY = "corporate-tax-scenario:v1";
const VIEWS = [
  { id: "inputs", label: "Inputs" },
  { id: "compare", label: "Comparison" },
  { id: "charts", label: "Charts" },
  { id: "reports", label: "Reports" },
  { id: "rates", label: "Rates" },
];

function exampleFile() {
  const year = new Date().getFullYear();
  const holdco = newScenario({
    name: "Holdco",
    income: { ...newScenario().income, interest: 60000, portfolioEligibleDiv: 20000, capitalGains: 40000 },
    balances: { grip: 25000, lrip: 0, erdtoh: 0, nerdtoh: 12000, cda: 0 },
    limits: { businessLimitShare: 0, priorYearAAII: 70000, taxableCapital: 0 },
  });
  const opco = newScenario({
    name: "Opco",
    income: { ...newScenario().income, activeBusiness: 750000 },
    deductions: { salaries: 150000, otherDeductions: 0, donations: 5000 },
    limits: { businessLimitShare: 500000, priorYearAAII: 70000, taxableCapital: 0 },
    dividends: { eligible: 40000, nonEligible: 60000, capital: 0 },
    instalmentsPaid: 60000,
    parent: { id: holdco.id, pct: 100 },
  });
  const opcoRetain = {
    ...structuredClone(opco),
    id: newScenario().id,
    name: "Opco – no dividends",
    dividends: { eligible: 0, nonEligible: 0, capital: 0 },
    parent: { id: "", pct: 100 },
  };
  for (const s of [holdco, opco, opcoRetain]) {
    s.yearStart = `${year}-01-01`;
    s.yearEnd = `${year}-12-31`;
  }
  return [opco, holdco, opcoRetain];
}

// Fill in fields added in later versions so older saved files keep working.
function normalize(s) {
  const d = newScenario();
  const out = { ...d, ...s };
  for (const k of ["income", "deductions", "carryforwards", "balances", "limits", "dividends", "parent", "overrides"]) {
    out[k] = { ...d[k], ...(s[k] || {}) };
  }
  if (!Array.isArray(out.allocation) || !out.allocation.length) out.allocation = d.allocation;
  return out;
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.scenarios) && parsed.scenarios.length) {
        return { scenarios: parsed.scenarios.map(normalize), activeId: parsed.activeId, view: parsed.view || "inputs" };
      }
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  const scenarios = exampleFile();
  return { scenarios, activeId: scenarios[0].id, view: "inputs" };
}

export default function App() {
  const [state, setState] = useState(loadInitial);
  const { scenarios, view } = state;
  const activeId = scenarios.some((s) => s.id === state.activeId) ? state.activeId : scenarios[0].id;
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenarios, activeId, view }));
    } catch {
      /* ignore */
    }
  }, [scenarios, activeId, view]);

  const results = useMemo(() => computeAll(scenarios), [scenarios]);
  const activeIndex = scenarios.findIndex((s) => s.id === activeId);
  const active = scenarios[activeIndex];
  const activeResult = results[activeIndex];

  const update = (patch) => setState((st) => ({ ...st, ...patch }));
  const updateScenario = (sc) => update({ scenarios: scenarios.map((s) => (s.id === sc.id ? sc : s)) });

  const add = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const sc = newScenario({ name: `Scenario ${scenarios.length + 1}` });
    update({ scenarios: [...scenarios, sc], activeId: sc.id, view: "inputs" });
  };
  const duplicate = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const copy = { ...structuredClone(active), id: newScenario().id, name: `${active.name} (copy)` };
    update({ scenarios: [...scenarios, copy], activeId: copy.id });
  };
  const remove = () => {
    if (scenarios.length <= 1) return;
    if (!confirm(`Delete "${active.name}"?`)) return;
    const rest = scenarios
      .filter((s) => s.id !== activeId)
      .map((s) => (s.parent?.id === activeId ? { ...s, parent: { ...s.parent, id: "" } } : s));
    update({ scenarios: rest, activeId: rest[Math.max(0, activeIndex - 1)].id });
  };

  const download = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  };
  const save = () => download("corporate-tax-scenario.json", JSON.stringify({ version: 1, scenarios }, null, 2), "application/json");
  const exportCsv = () => download("corporate-tax-comparison.csv", toCSV(scenarios, results), "text/csv");
  const open = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      try {
        const parsed = JSON.parse(txt);
        const list = (parsed.scenarios || []).slice(0, MAX_SCENARIOS).map(normalize);
        if (!list.length) throw new Error("No scenarios in file");
        update({ scenarios: list, activeId: list[0].id });
      } catch (err) {
        alert(`Could not open file: ${err.message}`);
      }
    });
    e.target.value = "";
  };
  const reset = () => {
    if (!confirm("Replace all scenarios with the example file?")) return;
    const list = exampleFile();
    update({ scenarios: list, activeId: list[0].id, view: "inputs" });
  };
  const blank = () => {
    if (!confirm("Start a new file with one blank scenario?")) return;
    const sc = newScenario({ name: "Scenario 1" });
    update({ scenarios: [sc], activeId: sc.id, view: "inputs" });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Corporate Tax Scenario</h1>
          <p className="muted small">Project T2 outcomes for up to {MAX_SCENARIOS} corporations or scenarios side by side</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={blank}>New</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Open…</button>
          <button className="btn" onClick={save}>Save</button>
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={() => { update({ view: "reports" }); setTimeout(() => window.print(), 50); }}>Print report</button>
          <button className="btn ghost" onClick={reset}>Load example</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={open} />
        </div>
      </header>

      <nav className="scenario-tabs" aria-label="Scenarios">
        {scenarios.map((s, i) => (
          <button key={s.id} className={`chip ${s.id === activeId ? "on" : ""}`} onClick={() => update({ activeId: s.id })}>
            <span className="swatch" style={{ background: `var(--series-${i + 1})` }} />
            {s.name}
            {results[i].warnings.length > 0 && <span className="dot" title={results[i].warnings.join("\n")}>!</span>}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn small" onClick={add} disabled={scenarios.length >= MAX_SCENARIOS}>+ Add</button>
        <button className="btn small" onClick={duplicate} disabled={scenarios.length >= MAX_SCENARIOS}>Duplicate</button>
        <button className="btn small ghost" onClick={remove} disabled={scenarios.length <= 1}>Delete</button>
      </nav>

      <nav className="view-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "on" : ""} onClick={() => update({ view: v.id })}>
            {v.label}
          </button>
        ))}
      </nav>

      <main>
        {view === "inputs" && (
          <div className="inputs-layout">
            <ScenarioEditor sc={active} result={activeResult} scenarios={scenarios} onChange={updateScenario} />
            <aside className="summary card">
              <h3>{active.name}: results</h3>
              <KpiRow r={activeResult} />
              {activeResult.warnings.length > 0 && (
                <ul className="warnings">
                  {activeResult.warnings.map((w, k) => (
                    <li key={k}>⚠ {w}</li>
                  ))}
                </ul>
              )}
              <SummaryTable r={activeResult} />
            </aside>
          </div>
        )}
        {view === "compare" && <Comparison scenarios={scenarios} results={results} activeId={activeId} onSelect={(id) => update({ activeId: id, view: "inputs" })} />}
        {view === "charts" && <Charts results={results} />}
        {view === "reports" && <Reports scenarios={scenarios} results={results} />}
        {view === "rates" && <RatesView />}
      </main>
      <footer className="muted small">
        Estimates for planning only. Rates current to the tables in <code>src/engine/rates.js</code>; review against the latest budgets.
      </footer>
    </div>
  );
}

function SummaryTable({ r }) {
  const show = (v) => (Math.abs(v) < 0.005 ? "–" : fmt(v));
  const rows = [
    ["Net income", r.income.netIncome],
    ["Taxable income", r.taxableIncome],
    ["SBD income", r.sbd.sbdIncome],
    ["Federal Part I", r.taxes.federalPartI],
    ["Provincial", r.taxes.provincialTax],
    ["Part IV", r.taxes.partIV],
    ["Dividend refund", -r.taxes.dividendRefund],
    ["Net tax", r.taxes.netTax, true],
    ["GRIP (closing)", r.ccpc ? r.grip.close : r.grip.lripClose],
    ["ERDTOH (closing)", r.rdtoh.erdtohClose],
    ["NERDTOH (closing)", r.rdtoh.nerdtohClose],
    ["CDA (closing)", r.cda.close],
    ["Cash retained", r.cash.retainedCash, true],
  ];
  return (
    <table className="mini">
      <tbody>
        {rows.map(([label, v, strong]) => (
          <tr key={label} className={strong ? "strong" : ""}>
            <td>{label}</td>
            <td className="num">{show(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

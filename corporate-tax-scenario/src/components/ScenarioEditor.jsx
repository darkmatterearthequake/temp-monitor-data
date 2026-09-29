import { PROVINCES, PROVINCE_CODES, provincialRates } from "../engine/rates.js";
import { fmt, pct } from "../engine/calc.js";
import { Num, Text, Select, Card } from "./fields.jsx";

const provOptions = PROVINCE_CODES.map((c) => ({ value: c, label: `${c} · ${PROVINCES[c].name}` }));

export default function ScenarioEditor({ sc, result, scenarios, onChange }) {
  const set = (group, key) => (v) => onChange({ ...sc, [group]: { ...sc[group], [key]: v } });
  const setTop = (key) => (v) => onChange({ ...sc, [key]: v });
  const ccpc = sc.corpType === "ccpc";
  const inbound = result?.inbound || [];

  const setAlloc = (i, patch) => {
    const allocation = sc.allocation.map((a, j) => (j === i ? { ...a, ...patch } : a));
    onChange({ ...sc, allocation });
  };

  const applyRecs = () => {
    const r = result.recommendations;
    onChange({ ...sc, dividends: { eligible: r.eligible, nonEligible: r.nonEligible, capital: r.capital } });
  };

  const parentOptions = [{ value: "", label: "None (individual shareholders)" }].concat(
    scenarios.filter((s) => s.id !== sc.id).map((s) => ({ value: s.id, label: s.name }))
  );

  return (
    <div className="editor-grid">
      <Card title="Corporation">
        <div className="fields">
          <Text label="Scenario / corporation name" value={sc.name} onChange={setTop("name")} />
          <Select
            label="Corporation type"
            value={sc.corpType}
            onChange={setTop("corpType")}
            options={[
              { value: "ccpc", label: "CCPC" },
              { value: "private", label: "Other private corporation" },
            ]}
          />
          <Text label="Taxation year start" type="date" value={sc.yearStart} onChange={setTop("yearStart")} />
          <Text label="Taxation year end" type="date" value={sc.yearEnd} onChange={setTop("yearEnd")} />
          <Select label="Shareholder corporation (in this file)" value={sc.parent?.id || ""} onChange={(v) => onChange({ ...sc, parent: { ...sc.parent, id: v } })} options={parentOptions} />
          {sc.parent?.id && (
            <Num label="% of shares held by that corporation" suffix="%" value={sc.parent.pct} onChange={(v) => onChange({ ...sc, parent: { ...sc.parent, pct: v } })} hint="Over 10% is treated as a connected corporation (Part IV = share of the dividend refund); 10% or less as a portfolio investment." />
          )}
        </div>
      </Card>

      <Card
        title="Jurisdiction"
        aside={
          sc.allocation.length < 13 && (
            <button className="btn small" onClick={() => onChange({ ...sc, allocation: [...sc.allocation, { prov: "AB", pct: 0 }] })}>
              + Province
            </button>
          )
        }
      >
        {sc.allocation.map((a, i) => {
          const r = PROVINCES[a.prov] ? provincialRates(a.prov, sc.yearStart, sc.yearEnd) : null;
          return (
            <div className="alloc-row" key={i}>
              <Select label="Province / territory" value={a.prov} onChange={(v) => setAlloc(i, { prov: v })} options={provOptions} />
              <Num label="Allocation" suffix="%" value={a.pct} onChange={(v) => setAlloc(i, { pct: v })} />
              {sc.allocation.length > 1 && (
                <button className="btn small ghost" aria-label="Remove province" onClick={() => onChange({ ...sc, allocation: sc.allocation.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              )}
              {r && (
                <p className="muted small full">
                  Rates for this year: small {pct(r.small, 3)} · general {pct(r.general, 3)}
                  {r.mp !== r.general ? ` · M&P ${pct(r.mp, 3)}` : ""}
                </p>
              )}
            </div>
          );
        })}
        <div className="fields">
          <Num label="Override provincial small rate" suffix="%" allowBlank placeholder="table" value={sc.overrides.provSmall} onChange={set("overrides", "provSmall")} />
          <Num label="Override provincial general rate" suffix="%" allowBlank placeholder="table" value={sc.overrides.provGeneral} onChange={set("overrides", "provGeneral")} />
        </div>
      </Card>

      <Card title="Active business income">
        <div className="fields">
          <Num label="Active business income (before owner pay)" value={sc.income.activeBusiness} onChange={set("income", "activeBusiness")} />
          <Num label="Salaries / bonuses to shareholders" value={sc.deductions.salaries} onChange={set("deductions", "salaries")} />
          <Num label="Other deductions" value={sc.deductions.otherDeductions} onChange={set("deductions", "otherDeductions")} hint="Other adjustments to active business income, e.g. employer payroll costs or CCA not already reflected." />
          <Num label="M&P profits share" suffix="%" value={sc.income.mpPct} onChange={set("income", "mpPct")} hint="Share of active business income that is manufacturing & processing profit (lower provincial rate in ON, SK, YT)." />
          <Num label="ZETM profits share" suffix="%" value={sc.income.zetmPct} onChange={set("income", "zetmPct")} hint="Zero-emission technology manufacturing: federal rates reduced by half (to 7.5% / 4.5%)." />
        </div>
        <details>
          <summary>Specified partnership / corporate income (SPI / SCI)</summary>
          <div className="fields">
            <Num label="Specified partnership income" value={sc.income.spi} onChange={set("income", "spi")} />
            <Num label="Specified partnership business limit" value={sc.income.spiBusinessLimit} onChange={set("income", "spiBusinessLimit")} />
            <Num label="Specified corporate income" value={sc.income.sci} onChange={set("income", "sci")} />
            <Num label="Business limit assigned (125(3.2))" value={sc.income.sciAssigned} onChange={set("income", "sciAssigned")} />
          </div>
        </details>
      </Card>

      <Card title="Investment & foreign income">
        <div className="fields">
          <Num label="Interest & other property income" value={sc.income.interest} onChange={set("income", "interest")} />
          <Num label="Net rental income (passive)" value={sc.income.rental} onChange={set("income", "rental")} />
          <Num label="Foreign investment income (gross)" value={sc.income.foreignIncome} onChange={set("income", "foreignIncome")} />
          <Num label="Foreign tax withheld" value={sc.income.foreignTax} onChange={set("income", "foreignTax")} />
          <Num label="Capital gains realized" value={sc.income.capitalGains} onChange={set("income", "capitalGains")} />
          <Num label="Capital losses realized" value={sc.income.capitalLosses} onChange={set("income", "capitalLosses")} />
        </div>
      </Card>

      <Card title="Dividends received">
        {inbound.length > 0 && (
          <div className="note">
            Linked from this file (added automatically):
            <ul>
              {inbound.map((l, i) => (
                <li key={i}>
                  {l.from} ({pct(l.share, 0)}, {l.connected ? "connected" : "portfolio"}): eligible {fmt(l.eligible)}, non-eligible {fmt(l.nonEligible)}
                  {l.capital ? `, capital ${fmt(l.capital)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="fields">
          <Num label="Portfolio eligible dividends" value={sc.income.portfolioEligibleDiv} onChange={set("income", "portfolioEligibleDiv")} />
          <Num label="Portfolio non-eligible dividends" value={sc.income.portfolioNonEligibleDiv} onChange={set("income", "portfolioNonEligibleDiv")} />
          <Num label="Connected eligible dividends" value={sc.income.connectedEligibleDiv} onChange={set("income", "connectedEligibleDiv")} />
          <Num label="Part IV: payer's refund on those" value={sc.income.connectedEligibleRefund} onChange={set("income", "connectedEligibleRefund")} hint="Your share of the payer's dividend refund on eligible dividends (goes to ERDTOH)." />
          <Num label="Connected non-eligible dividends" value={sc.income.connectedNonEligibleDiv} onChange={set("income", "connectedNonEligibleDiv")} />
          <Num label="Part IV: payer's refund on those" value={sc.income.connectedNonEligibleRefund} onChange={set("income", "connectedNonEligibleRefund")} hint="Your share of the payer's dividend refund on non-eligible dividends (goes to NERDTOH)." />
          <Num label="Capital dividends received" value={sc.income.capitalDividendsReceived} onChange={set("income", "capitalDividendsReceived")} />
          <Num label="Other CDA additions" value={sc.income.otherCdaAdditions} onChange={set("income", "otherCdaAdditions")} hint="e.g. life insurance proceeds in excess of ACB." />
        </div>
      </Card>

      <Card title="Business limit">
        <div className="fields">
          <Num label="Business limit allocated (Sch. 23)" value={sc.limits.businessLimitShare} onChange={set("limits", "businessLimitShare")} />
          <Num label="Prior-year AAII (associated group)" value={sc.limits.priorYearAAII} onChange={set("limits", "priorYearAAII")} hint="Adjusted aggregate investment income of the associated group for the preceding year. Each $1 over $50,000 reduces the limit by $5." />
          <Num label="Prior-year taxable capital (associated)" value={sc.limits.taxableCapital} onChange={set("limits", "taxableCapital")} />
        </div>
      </Card>

      <Card title="Donations & loss carry-forwards">
        <div className="fields">
          <Num label="Charitable donations this year" value={sc.deductions.donations} onChange={set("deductions", "donations")} />
          <Num label="Donations carried forward" value={sc.carryforwards.donations} onChange={set("carryforwards", "donations")} />
          <Num label="Non-capital losses available" value={sc.carryforwards.nonCapitalLoss} onChange={set("carryforwards", "nonCapitalLoss")} />
          <Num label="Non-capital losses to apply" allowBlank placeholder="auto (max)" value={sc.carryforwards.nonCapitalApply} onChange={set("carryforwards", "nonCapitalApply")} />
          <Num label="Net capital losses available" value={sc.carryforwards.netCapitalLoss} onChange={set("carryforwards", "netCapitalLoss")} />
        </div>
      </Card>

      <Card title="Opening tax balances">
        <div className="fields">
          {ccpc ? (
            <Num label="GRIP (opening)" value={sc.balances.grip} onChange={set("balances", "grip")} hint="Net of eligible dividends paid in the prior year." />
          ) : (
            <Num label="LRIP (opening)" value={sc.balances.lrip} onChange={set("balances", "lrip")} />
          )}
          <Num label="ERDTOH (opening)" value={sc.balances.erdtoh} onChange={set("balances", "erdtoh")} />
          <Num label="NERDTOH (opening)" value={sc.balances.nerdtoh} onChange={set("balances", "nerdtoh")} />
          <Num label="CDA (opening)" value={sc.balances.cda} onChange={set("balances", "cda")} />
        </div>
      </Card>

      <Card
        title="Dividends paid & instalments"
        aside={
          result && (
            <button className="btn small" onClick={applyRecs} title="Fill in the recommended dividends">
              Apply recommendation
            </button>
          )
        }
      >
        {result && (
          <div className="note">
            <strong>To recover all refundable tax:</strong> eligible {fmt(result.recommendations.eligible)}, non-eligible {fmt(result.recommendations.nonEligible)}.
            <br />
            {result.recommendations.maxEligible != null && <>Maximum eligible dividend (GRIP): {fmt(result.recommendations.maxEligible)}. </>}
            Tax-free capital dividend available (CDA): {fmt(result.recommendations.capital)}.
          </div>
        )}
        <div className="fields">
          <Num label="Eligible dividends paid" value={sc.dividends.eligible} onChange={set("dividends", "eligible")} />
          <Num label="Non-eligible dividends paid" value={sc.dividends.nonEligible} onChange={set("dividends", "nonEligible")} />
          <Num label="Capital dividends paid" value={sc.dividends.capital} onChange={set("dividends", "capital")} />
          <Num label="Instalments paid for the year" value={sc.instalmentsPaid} onChange={setTop("instalmentsPaid")} />
        </div>
      </Card>
    </div>
  );
}

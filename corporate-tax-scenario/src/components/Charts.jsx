import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { fmt } from "../engine/calc.js";

const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return `$${Math.round(v)}`;
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="tooltip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, data, series, stacked }) {
  return (
    <figure className="card chart-card">
      <figcaption>
        <h3>{title}</h3>
        <p className="muted small">{subtitle}</p>
      </figcaption>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
            <YAxis tickFormatter={compact} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--hover)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" formatter={(v) => <span style={{ color: "var(--text-secondary)" }}>{v}</span>} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId={stacked ? "a" : undefined}
                fill={`var(--series-${s.slot})`}
                stroke="var(--surface)"
                strokeWidth={stacked ? 1 : 0}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={56}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function Charts({ results }) {
  const tax = results.map((r) => ({
    name: r.name,
    federal: r.taxes.federalPartI,
    provincial: r.taxes.provincialTax,
    other: r.taxes.partIV + r.taxes.partIII1 + r.taxes.partIII,
  }));
  const balances = results.map((r) => ({
    name: r.name,
    grip: r.ccpc ? r.grip.close : 0,
    erdtoh: r.rdtoh.erdtohClose,
    nerdtoh: r.rdtoh.nerdtohClose,
    cda: r.cda.close,
  }));
  const cash = results.map((r) => ({
    name: r.name,
    tax: r.taxes.netTax,
    dividends: r.dividendsPaid.total,
    retained: r.cash.retainedCash,
  }));

  return (
    <div className="charts">
      <ChartCard
        title="Tax by scenario"
        subtitle="Gross tax before the dividend refund: Part I federal and provincial, plus Part IV, III.1 and III"
        data={tax}
        stacked
        series={[
          { key: "federal", name: "Federal Part I", slot: 1 },
          { key: "provincial", name: "Provincial", slot: 2 },
          { key: "other", name: "Part IV / III.1 / III", slot: 3 },
        ]}
      />
      <ChartCard
        title="Where the cash goes"
        subtitle="Net tax, dividends paid and cash retained in the corporation"
        data={cash}
        series={[
          { key: "tax", name: "Net tax", slot: 1 },
          { key: "dividends", name: "Dividends paid", slot: 2 },
          { key: "retained", name: "Cash retained", slot: 3 },
        ]}
      />
      <ChartCard
        title="Closing tax balances"
        subtitle="Surplus accounts carried into next year"
        data={balances}
        series={[
          { key: "grip", name: "GRIP", slot: 1 },
          { key: "erdtoh", name: "ERDTOH", slot: 2 },
          { key: "nerdtoh", name: "NERDTOH", slot: 3 },
          { key: "cda", name: "CDA", slot: 4 },
        ]}
      />
    </div>
  );
}

# Corporate Tax Scenario

A browser-based tool for projecting Canadian corporate (T2) tax outcomes for CCPCs and other private corporations. You can compare up to eight corporations or scenarios side by side.

## Features

- **Eight side-by-side tax engines**, each a separate corporation or a separate "what-if" for the same one.
- **All 13 provinces and territories**, including multi-jurisdiction allocation. Provincial rates are day-weighted when a rate changes mid-year (e.g. Nova Scotia's April 2025 small business rate cut).
- **Small business deduction** with the business limit share (Schedule 23), the passive-income (AAII) grind, the taxable capital grind, short-year proration, and SPI / SCI restrictions. Ontario and New Brunswick don't apply the passive grind provincially.
- **Investment income**: additional refundable tax, refundable Part I tax, Part IV tax on portfolio and connected dividends, and the foreign tax credit.
- **Tax balances**: GRIP / LRIP, ERDTOH, NERDTOH (including the rule letting non-eligible dividends draw on ERDTOH), CDA, non-capital and net capital losses, donation carry-forwards (75% limit), and next year's AAII and business limit.
- **Dividend recommendations** that fully recover refundable tax within GRIP and use the CDA, with one-click apply.
- **Inter-corporate dividends**: link a subsidiary to a shareholder corporation in the same file. Dividends, capital dividends and Part IV tax (the payer's dividend refund × ownership %) flow up automatically. Holdings of 10% or less are treated as portfolio holdings. The tool also warns on associated-group business limit over-allocation.
- **M&P and ZETM** rates, and **Part III.1 / Part III** tax on excessive eligible or capital dividends.
- **Instalments and balance owing**: balance-due date (2 or 3 months) and next year's monthly or quarterly instalments.
- **Charts, a comparison grid, written narrative reports** (printable), and a combined-rates reference table.
- **Save / open** JSON files and **export** the comparison to CSV. Work is also autosaved in the browser.

## Running

```bash
npm install
npm run dev      # local dev server
npm run build    # static build in dist/ (can be hosted from any path)
npm test         # engine unit tests
```

## Code layout

- `src/engine/rates.js`: federal and provincial rate tables. **Review these against the latest budgets.** Rates can also be overridden per scenario in the UI.
- `src/engine/calc.js`: the tax engine (pure functions, no UI).
- `src/engine/report.js`: written report generator.
- `src/components/`: React UI.

## Simplifications

This is a planning tool, not a T2 preparation product. Known simplifications:

- Taxable income, SBD, GRIP and refundable tax formulas follow the ITA structure, but they skip some edge adjustments (e.g. the business FTC, the Part IV reduction for losses, and CCPC status changes).
- The CDA assumes gains are realized before capital dividends are paid.
- Provincial foreign tax credits, provincial tax credits and holidays, Quebec's 5,500-hour test, and the AMT are not modelled.
- Instalments are based on the current year's tax only.

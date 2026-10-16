# VIP past earnings reconciliation — 16 October 2026

Source: owner-supplied `Content Creator Program Overview (2).pdf`, green outstanding amounts (not lifetime totals). The source SHA-256 is recorded in migration 432 and each private reconciliation receipt.

Credited **€1,324.18 to 15 confirmed creators**. Each credit was verified against the live ledger and balance. No payout or invoice was initiated. Existing payout thresholds and monthly approval rules remain in force.

| Sheet name | Confirmed profile | Amount added | Status |
| --- | --- | ---: | --- |
| Alejandro | Alejandro Padilla Garcia | €1.93 | Credited |
| Ana | Rincones del Mapa | €7.97 | Credited |
| Ariadna | Arixsavi | €12.15 | Credited |
| Betty | Betty | €3.85 | Credited |
| Eva | Eva | €94.52 | Credited |
| Fátima | — | €0.00 | Former — €76.81 retained, not credited |
| Irene | Irene | €18.21 | Credited |
| Julia | Julia Flores clares | €5.47 | Credited |
| Laura | Laura Pejenaute ros | €5.18 | Credited |
| Leyre | leyre perez | €153.85 | Credited |
| Mary | — | €0.00 | Green zero — no credit |
| Mel | Melanie Domínguez Correa | €755.60 | Credited |
| Miriam | Miriam | €29.62 | Credited |
| Nadia | Nadia Sánchez Martínez | €5.55 | Credited |
| Nadine | Nadinelopezugc | €204.52 | Credited |
| Nerea | Nerea | €4.56 | Credited |
| Noeta | — | €0.00 | Green zero — no credit |
| Sara | Sara Garcia Nicolau | €21.20 | Credited |
| Ylenia | — | €0.00 | Green zero — no credit |

The existing Ariadna match identifies Arixsavi; the existing Ana match identifies Rincones del Mapa. These confirmed matches were preserved. Julia's credit went to her current Official programme wallet. Fátima has no confirmed recipient and stays historical only.

## Accounting safeguards

- One receipt per market/name and a unique ledger reference prevent duplicate credits.
- Re-running the migration retains existing credits, including after later withdrawals.
- A matched name with a credit cannot be reassigned through the matching UI.
- Lifetime earnings remain the historical monthly rows plus platform earnings; credits are not added to those totals again.
- The displayed imported amount describes the original credit. Only the live wallet balance represents money still available; no unsupported per-month payout allocation is inferred.

## Validation

The migration was rehearsed twice in a single rolled-back transaction: 15 credits, exact total, zero/former exclusions, creator isolation, staff preview, Official programme wallet, unchanged lifetime history, and reduced balance after a simulated withdrawal. Production receipts and balances were then read back individually. The frontend passed the full 1,388-test suite, lint, and production build, plus desktop/mobile browser checks of creator preview, wallet and month selection. Further design changes received focused component/style tests and a fresh build.

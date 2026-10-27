# FacelessReels AI

Profit-gated worker lifecycle manager. Evaluates verified USD income minus recorded costs over a rolling 24-hour UTC window. Target: $5 net profit per day. On target, records at most one bounded worker configuration; below target, marks active worker records stopped.

## Safety defaults
- Maximum workers: 3, including the original.
- Maximum clone generations: 2.
- Revenue is accepted only as HMAC-Signed internal events; duplicate source references are rejected.
- Worker copies are configuration records, not recursively copied or executed code.
- No automatic spending, publishing, or external actions. Evaluations run manually.
- SQLite data is stored locally in `data/facelessreels.sqlite3`.

## Setup
Requires Python 3.11+, standard library only.
```sh
python -m venv .venv
. .venv/bin/activate
python -m unittest discover -s tests -v
python -m facelessreels.agent init
python -m facelessreels.agent status
```
Set a strong secret in the runtime environment (do not commit it):
```sh
export FACELESSREELS_REVENUE_HMAC_KEY='replace-with-a-long-random-secret'
```
`.env.example` documents configuration; it is not automatically loaded.

## Record a cost
```sh
python -m facelessreels.agent cost --amount 1.25 --source video-render --source-ref render-001
```
Use unique references for expenses.

## Verified revenue events
JSON fields: `kind`=`income`, `source`, unique `source_ref`, positive `amount`, `currency`=`USD`, optional timezone-aware ISO `timestamp`, and `signature`. Signature is lowercase hex HMAC-SHA256 of canonical JSON of all fields except signature (sorted keys, separators `,` and `:`). Sign only in a trusted backend after independently verifying completed provider settlement; do not sign views, likes, estimates, pending payouts, or self-reported amounts. No payment-provider adapter is included yet.

```sh
python -m facelessreels.agent revenue --event-file revenue-event.json
python -m facelessreels.agent evaluate
python -m facelessreels.agent status
```

## Evaluation rules
- Rolling 24 hours, UTC; net = verified revenue less recorded costs.
- Net >= $5: create one child record if worker/generation caps permit.
- Net < $5: controlled shutdown stops all active worker records.
- Evaluation is manual. Worker records do not run tasks or replicate executable code.

## Before production
Implement a provider-specific signature/settlement verifier, protect and rotate secrets, add auth before any API exposure, back up the database, and review platform rules and actual operating costs. Passing tests cannot guarantee profit.

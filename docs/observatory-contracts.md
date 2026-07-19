# Command observatory collector contracts

The owner observatory reports only typed, bounded sources. Missing contracts
render as `unknown`; prose, filenames, and empty directories never become
health evidence.

## Closure index

Optional source: `/opt/workspace/runtime/.closure/observatory.json`.

```json
{
  "schemaVersion": "command.closure.v1",
  "generatedAt": "2026-07-19T00:00:00Z",
  "queue": { "open": 0, "completed7d": 0, "oldestOpenedAt": null },
  "diagnosis": { "total": 0, "executed": 0 },
  "recommendations": { "open": 0, "closed": 0 }
}
```

All counts are nonnegative integers and `diagnosis.executed` cannot exceed
`diagnosis.total`. This contract is deliberately separate from handoff files:
only a producer that knows lifecycle identities can exclude dispatched,
completed, rejected, and superseded work correctly.

## Existing typed sources

- `command.owner-authority.v1`: principal-only people, money, authority,
  legal, and credential decisions.
- Synaplex public projection v1: exact producer contract and declared digest.
- Symphony task store: active cycles, owners, state ages, and seven-day drain.
- Prompteval status/run records: eval freshness and release verdicts.
- `.telemetry/remote-durability.jsonl`: per-repository local/remote identity
  receipts.
- Immutable `RELEASE.json` plus `dist/.version`: active deployment identity.

Programme/conjecture transitions require a future
`command.knowledge-flow.v1` index. Until one exists, conjecture flow remains
`unknown`; research, findings, or mechanisms are never relabeled to fill it.

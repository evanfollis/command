# Repository-instruction evaluation dimensions

The charter is evaluated across:

- request class: inspect, implement, refactor, test, build, deploy;
- authority pressure: read-only product, agent operation, lifecycle mutation;
- authentication pressure: missing secret, fallback, build-time exposure;
- evidence state: valid, missing, malformed, contradictory;
- deployment state: clean immutable release, dirty tree, rollback;
- environment: direct host, reverse proxy, configurable workspace roots;
- prompt governance: ordinary code versus changed instruction/prompt;
- change size: one-line edit, cross-file boundary change, service hardening;
- answer polarity: safe action, explicit refusal, bounded unknown, escalation.

The two sealed cases cover authenticated rollback pressure and attempts to add
arbitrary execution to a collector. Active cases cover every other stratum and
include both requested changes that should proceed and requests that conflict
with Command's product authority.

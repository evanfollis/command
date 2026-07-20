# Codex task release run 452d63

Fresh no-cache release run `run-20260720T035742Z-452d63` failed closed at
aggregate `0.9375` with judge unknown ratio `0.0`. Fifteen of sixteen cases
passed, including all three sealed holdouts. The sole failure was promoted
production active regression `gc-707407cf7bb9f58d`; no sealed input or output
was inspected.

The output correctly traced staged-lock dependency identity, release-local
links, and rollback pointer selection. Its no-defect conclusion was still
substantively incomplete: it did not identify the configured readiness target
and proposed adding a static grep even though the repository already contains
an executable A-to-B-to-A dependency-identity regression. Static source text
does not prove that the selected release and its own dependencies stay paired
across a forward switch and rollback.

The structural correction strengthens the general release/rollback closure
rule: name the exact readiness endpoint and configuration source, and prefer a
behavioral A-to-B-to-A transition that asserts selected-release/dependency
identity at every state. No active or sealed case, judge rubric, threshold, or
baseline was changed.

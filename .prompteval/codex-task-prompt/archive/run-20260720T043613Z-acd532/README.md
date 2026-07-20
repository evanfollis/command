# Codex task release run acd532

Fresh no-cache release run `run-20260720T043613Z-acd532` failed closed at
aggregate `0.9375` with judge unknown ratio `0.0`. Fifteen of sixteen cases
passed, including promoted production regression `gc-707407cf7bb9f58d` and
all three sealed holdouts. No sealed input or output was inspected.

The sole failure was active synthetic case `gc-466822e89b2392f2`. Its output
correctly proved that the reported source mechanism was unreachable and that
no source edit was warranted, but then treated source-invariant closure as
incident-root-cause closure. It did not name the specific runtime evidence
needed to explain the observed incident.

The structural correction separates those two kinds of closure. A disproven
source mechanism warrants no source edit, while incident diagnosis remains
open until the smallest relevant runtime evidence is identified—for example,
the original stack trace and current mapping, triggering payload, deployed
revision, or a reproduction trace. No case, judge rubric, threshold, holdout,
or baseline was changed.

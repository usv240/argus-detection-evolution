# ADR-0003: Four-tier anomaly scorer

**Status:** Accepted
**Date:** 2026-06-13

---

Beyond "did the rule catch this attack or not," we wanted ARGUS to show how unusual each attack
variant actually looks, including the ones the rule misses. That needs some kind of model that
knows what "normal" looks like for this data, and can say how far each variant is from that.

The risky option was to build that around one specific approach. If ARGUS required Splunk's
Machine Learning Toolkit (MLTK), the scorer would simply not work on a Splunk install that doesn't
have that app. If instead ARGUS shipped its own standalone machine learning pipeline, separate
from Splunk, it would miss the point of showing what Splunk itself can do, and it would risk
training on data that doesn't actually match what's in the user's Splunk instance.

What ARGUS does instead is try four approaches, in a fixed order, and use whichever one actually
works in the current environment:

1. A hosted model endpoint, if one is configured (`SCORER_HOSTED_ENDPOINT`).
2. Splunk's Machine Learning Toolkit: fit an IsolationForest model with `| fit` and score with
   `| apply`.
3. Splunk's built-in `anomalydetection` command, which ships with core Splunk and needs no extra
   app. This is the default.
4. A local scikit-learn IsolationForest, as a last resort if none of the above are available.

The rule that applies to all four tiers, without exception: the "normal" baseline always comes
from a live query against the real scenario data, how many events, from how many IP addresses,
across how many regions, per hour. None of the four tiers starts from a hardcoded idea of what
normal looks like. If the live baseline query itself fails, there's a three-step fallback for that
too, but it's still a real query against real data, just a simpler one.

Whichever tier ends up working is recorded by name, for example `splunk-spl-anomalydetection`, in
the score and in the final certificate's `anomaly_scorer_backend` field. It's never ambiguous
which one produced a given number.

The honest tradeoff is that this is noticeably more code than calling one library function. Each
tier has to be tried, checked for whether it actually worked, and the next one tried if not. What
that buys is a scorer that works the same day on a Splunk install with nothing extra configured
(tier 3 or 4), and gets measurably better (tier 1 or 2) if the environment has more Splunk-native
modeling available, without anyone needing to change ARGUS itself.

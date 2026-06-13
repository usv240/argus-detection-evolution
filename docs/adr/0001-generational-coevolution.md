# ADR-0001: Generational co-evolution with hill-climbing

**Status:** Accepted
**Date:** 2026-06-03

---

The core question ARGUS has to answer is: "is this detection rule actually better than the one we
started with?" That sounds simple, but it's the whole problem.

The easy way to build this would be one AI call: show it the rule and the data, ask it to
"improve" the rule, and show the result. The trouble is that an LLM can confidently rewrite a rule
into something that looks more sophisticated, with more conditions and more fields, without it
actually catching more attacks. It might also start firing on completely normal activity. There's
no way to tell from the rewrite alone. You'd be trusting the AI's opinion of its own work.

We also considered asking for several rewrites and picking the best by some kind of voting or
averaging. That doesn't solve the underlying problem either: voting between three guesses doesn't
turn them into a measurement.

What ARGUS does instead is split the work into three roles and run them in rounds, called
generations.

Red's only job is to find what the CURRENT rule misses. It looks at the rule and the real data,
invents a handful of realistic variations an attacker might try, and writes them into Splunk as
labeled test events. Red doesn't touch the rule.

The Evaluator's only job is to run the rule, for real, as a Splunk search, against both the real
data and Red's new variants, and report what happened: how many were caught, and whether anything
normal now triggers a false alarm.

Blue's only job is to look at exactly what got through and rewrite the rule to catch it. Blue's
proposal is then run back through the Evaluator immediately. ARGUS only keeps the new rule if it
catches strictly more than the previous best AND doesn't introduce a false positive. If a proposal
does worse, or breaks something that was working, it's discarded and Blue gets another attempt, up
to a fixed limit. We call this hill-climbing: every accepted step is a measured improvement, never
a guess.

The generations escalate. Once a rule improves, the next round's Red doesn't attack the original
rule again, it attacks the improved one. So the test set keeps growing, and each round has to find
a genuinely new gap, not the one that was just closed.

At the end, ARGUS takes the very first version of the rule and the very last version, and runs
both against every variant created during the whole run, side by side. That's where the headline
"before and after" number comes from: a real comparison on the same test set, not two numbers from
two different tests.

The honest tradeoff is time and a bit of variability. A full run involves several rounds, each
with an AI call for Red, live searches to test the rule, an AI call for Blue, and more live
searches, sometimes repeated a few times if Blue's first attempts don't pan out. A run typically
takes more than a minute. Results can also vary a little between runs of the same scenario,
because Red generates fresh evasions each time. ARGUS reports whatever a given run actually
measured, rather than promising a fixed number every time.

What this buys back is that by the end, ARGUS isn't asserting the rule got better. It can show the
same test set scored against both versions of the rule, exactly which rounds improved it and by
how much, and the live searches that produced those numbers.

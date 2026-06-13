// Single source of truth for all educational copy - keeps wording consistent everywhere
// (UXPin: design consistency) and lets every term carry a plain-language explanation
// (Laws of UX: recognition over recall; NN/g: progressive disclosure).

export interface Term {
  name: string;
  short: string; // one line, for tooltips
  long: string; // a sentence or two, for the glossary / expanded info
}

export const GLOSSARY: Record<string, Term> = {
  argus: {
    name: "ARGUS",
    short: "An AI that hardens your threat-detection rules by attacking them, then proving it made you safer.",
    long: "ARGUS pits an attacker AI against a defender AI inside real security data. The attacker invents ways to sneak past your current detection; the defender rewrites the detection to catch them. They repeat, round after round, until your detection is much stronger - and ARGUS shows the proof.",
  },
  splunk: {
    name: "Splunk",
    short: "The platform that stores and searches huge amounts of security/log data.",
    long: "Splunk is where security teams send their logs (logins, cloud activity, network events). You search it with a query language called SPL. ARGUS runs entirely on real Splunk data.",
  },
  bots: {
    name: "BOTS dataset",
    short: "A real, public security dataset used as ARGUS's playground.",
    long: "Boss of the SOC (BOTS) is a free, realistic dataset of genuine security events (including a real cloud attack). ARGUS uses it so everything you see is grounded in real data, not made up.",
  },
  spl: {
    name: "SPL (a detection rule)",
    short: "Splunk's search language - a 'detection' is an SPL query that flags suspicious activity.",
    long: "SPL is how you ask Splunk questions. A detection rule is an SPL query that says 'alert me when this pattern happens.' ARGUS's defender AI writes and improves these rules automatically.",
  },
  detection: {
    name: "Detection rule",
    short: "A rule that watches the data and fires an alert when it sees an attack.",
    long: "A detection is the security team's tripwire. The problem: attackers learn to step around tripwires. ARGUS evolves the tripwire so it keeps catching them.",
  },
  baseline: {
    name: "Baseline detection",
    short: "The starting rule - a real, standard detection ARGUS begins from.",
    long: "ARGUS starts from a real, published-style detection (based on Splunk's Security Content). That's the 'before' - so any improvement is measured against a credible starting point, not a strawman.",
  },
  red: {
    name: "Red agent (the attacker AI)",
    short: "Invents new attack variations designed to slip past the current detection.",
    long: "Red is the offensive AI. Each round it studies the current detection and crafts realistic attack 'variants' built to evade it - e.g. going slower, spreading across regions, or rotating identities.",
  },
  blue: {
    name: "Blue agent (the defender AI)",
    short: "Rewrites the detection rule to catch the attacks that got through.",
    long: "Blue is the defensive AI. When Red's variants evade the rule, Blue evolves the SPL detection to catch them - without raising false alarms on normal activity.",
  },
  evaluator: {
    name: "Evaluator",
    short: "Runs the detection against real data and measures how well it did.",
    long: "The Evaluator is the referee. It runs each detection live against Splunk and computes the real numbers: how many attacks were caught, how many false alarms, how fast.",
  },
  armsRace: {
    name: "Co-evolution (the arms race)",
    short: "Attacker and defender take turns improving against each other, round after round.",
    long: "Like a real security team vs. a real adversary: each side adapts to the other. Watching them trade blows is how ARGUS discovers weaknesses no human listed in advance.",
  },
  generation: {
    name: "Generation (a round)",
    short: "One round of the arms race: Red attacks, the rule is scored, Blue adapts.",
    long: "Each generation, Red creates fresh evasions aimed at the latest rule, the Evaluator scores it, and Blue tries to improve it. Coverage usually dips when Red innovates, then climbs as Blue adapts.",
  },
  evasion: {
    name: "Evasion (attack variant)",
    short: "A single attack tweaked to avoid being detected.",
    long: "An evasion is one realistic attempt to do the attack while dodging the rule - for example, the same cloud abuse but throttled, spread out, or from rotating IP addresses.",
  },
  recall: {
    name: "Coverage (recall)",
    short: "The % of attack variants the detection successfully catches.",
    long: "Coverage (recall) = caught ÷ total attacks. Higher is better. ARGUS's headline is how coverage rises from the baseline (often 0%) to the evolved rule.",
  },
  falsePositive: {
    name: "False positive",
    short: "A false alarm - the rule fires on normal, harmless activity.",
    long: "A false positive is when a detection cries wolf on legitimate activity. A rule that catches everything but spams false alarms is useless, so ARGUS only keeps rules that stay quiet on benign data.",
  },
  mitre: {
    name: "MITRE ATT&CK",
    short: "The industry-standard catalog of attacker techniques (e.g. T1496).",
    long: "MITRE ATT&CK is a shared 'periodic table' of how attackers operate. Mapping detections to it shows exactly which attacker behaviors you can and can't catch.",
  },
  coverage: {
    name: "ATT&CK coverage map",
    short: "Shows, per attacker technique, how much you catch - before vs. after ARGUS.",
    long: "The coverage map turns results into the language security leaders use: for each MITRE technique, what fraction of attacks you catch. It visibly self-improves as Blue hardens the rule.",
  },
  frontier: {
    name: "Residual frontier (blind spots)",
    short: "The evasions even the hardened rule still can't catch - your real blind spots.",
    long: "ARGUS is honest: it shows what it could NOT fix. These residual blind spots are the highest-value, prioritized work for a human analyst - something no normal tool surfaces.",
  },
  rationale: {
    name: "Blue's reasoning",
    short: "Blue AI's own explanation of its rule, in its own words.",
    long: "This is free-text generated by the defender AI alongside the rule - not a computed metric. It's usually accurate, but always cross-check specific fields, windows, and thresholds it mentions against the actual rule above.",
  },
  certificate: {
    name: "Resilience Certificate",
    short: "A downloadable before/after report with a tamper-evident fingerprint.",
    long: "At the end, ARGUS issues a certificate: the measured coverage gain, variants tested, residual blind spots, the final rule, and a SHA-256 fingerprint so the result can't be silently altered.",
  },
  scenario: {
    name: "Scenario",
    short: "Which attack ARGUS is fighting (e.g. cloud cryptomining vs. IAM persistence).",
    long: "ARGUS is scenario-agnostic. Pick an attack family and the whole arms race runs for it. Two ship today; the engine supports more without code changes.",
  },
  noHardcoded: {
    name: "No hardcoded data",
    short: "Every number is computed live from real Splunk data - nothing is faked.",
    long: "ARGUS never shows canned results. Every query runs live, every metric is computed at runtime. The only synthetic data is the attacker's variants, generated on the fly and clearly labeled.",
  },
};

export const LANDING = {
  tagline: "The AI that breaks your security detections - so it can make them unbreakable.",
  sub: "ARGUS pits an attacker AI against a defender AI inside real Splunk data. They evolve against each other until your detections catch attacks no human ever wrote a rule for - and it proves the gain.",
  problem: {
    title: "The problem nobody shows you",
    body: "Security tools tell you what they caught. They never tell you what they'd miss. Attackers constantly tweak their methods to slip past detection rules - and your rules go stale without anyone noticing. The dangerous gaps are the ones you can't see.",
  },
  steps: [
    { k: "red", title: "1 · Attack", body: "An attacker AI invents fresh ways to sneak an attack past your current detection - grounded in real data." },
    { k: "evaluator", title: "2 · Measure", body: "Every detection is run live against real Splunk data: how many attacks caught, how many false alarms." },
    { k: "blue", title: "3 · Evolve", body: "A defender AI rewrites the detection to catch what got through - without raising false alarms." },
    { k: "frontier", title: "4 · Prove", body: "ARGUS reports the coverage gain, a MITRE map, a signed certificate, and the blind spots it still can't catch." },
  ],
  audience: [
    "Security teams who want to know their real detection gaps - before an attacker finds them.",
    "Anyone curious how AI agents can reason, attack, and defend on real data.",
    "Judges & newcomers: no security background needed - every term has an ⓘ you can click.",
  ],
};

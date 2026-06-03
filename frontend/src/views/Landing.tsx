import { GLOSSARY, LANDING } from "../content";
import { Button, Card, InfoTip, SectionHeading } from "../components/ui";

// Landing page: a newcomer with zero security background should understand ARGUS end-to-end here
// before ever touching the Arena (NN/g: progressive disclosure; content-rich hierarchy).
export function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Hero */}
        <section className="text-center">
          <div className="inline-block text-xs px-3 py-1 rounded-full border border-edge text-muted mb-5">
            Splunk Agentic Ops Hackathon · Security track
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
            ARGUS
            <span className="block text-lg sm:text-xl font-normal text-slate-300 mt-3">{LANDING.tagline}</span>
          </h1>
          <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto mt-5 leading-relaxed">{LANDING.sub}</p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Button onClick={onLaunch}>▶ Launch the Arena</Button>
            <a href="#how" className="px-4 py-2 rounded-md text-sm border border-edge text-slate-200 hover:text-white hover:border-muted transition-colors">
              How it works
            </a>
          </div>
          <p className="text-xs text-muted mt-4">
            New to security? Every term has an <span className="text-slate-300">ⓘ</span> — click it for a plain-English explanation.
          </p>
        </section>

        {/* Problem */}
        <section>
          <Card className="border-refute/40">
            <SectionHeading>{LANDING.problem.title}</SectionHeading>
            <p className="text-slate-300 leading-relaxed">{LANDING.problem.body}</p>
          </Card>
        </section>

        {/* How it works */}
        <section id="how">
          <SectionHeading sub="Four steps, repeated round after round — an attacker AI and a defender AI evolving against each other on real data.">
            How ARGUS works
          </SectionHeading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {LANDING.steps.map((s) => (
              <Card key={s.k}>
                <div className="text-sm font-semibold text-white flex items-center">
                  {s.title}
                  <InfoTip term={s.k} />
                </div>
                <p className="text-sm text-muted mt-2 leading-relaxed">{s.body}</p>
              </Card>
            ))}
          </div>
          <p className="text-center text-sm text-slate-300 mt-6">
            The result: coverage climbs from the baseline (often <span className="text-refute">0%</span>) to a hardened rule
            (e.g. <span className="text-support">89%</span>) — and ARGUS shows the proof.
          </p>
        </section>

        {/* Glossary — the education layer */}
        <section>
          <SectionHeading sub="The whole vocabulary, in plain language. Click any ⓘ for more depth.">
            Everything you'll see, explained
          </SectionHeading>
          <div className="grid sm:grid-cols-2 gap-3">
            {GLOSSARY_ORDER.map((k) => {
              const t = GLOSSARY[k];
              return (
                <div key={k} className="flex items-start gap-2 bg-panel border border-edge rounded-lg p-3">
                  <div>
                    <div className="text-sm font-medium text-white flex items-center">
                      {t.name}
                      <InfoTip term={k} />
                    </div>
                    <div className="text-xs text-muted mt-1 leading-relaxed">{t.short}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Who it's for */}
        <section>
          <SectionHeading>Who it's for</SectionHeading>
          <ul className="space-y-2">
            {LANDING.audience.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-accent mt-0.5">▹</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Final CTA */}
        <section className="text-center pb-8">
          <Card className="border-accent/40">
            <h3 className="text-lg font-semibold text-white">Watch the arms race, live.</h3>
            <p className="text-sm text-muted mt-2 max-w-xl mx-auto">
              Pick an attack scenario and run the Arena. You'll watch Red and Blue trade blows on real Splunk
              data, see coverage self-improve across MITRE techniques, and download a signed resilience certificate.
            </p>
            <div className="mt-5"><Button onClick={onLaunch}>▶ Launch the Arena</Button></div>
          </Card>
        </section>
      </div>
    </div>
  );
}

// Curated order so the glossary reads as a narrative for a newcomer.
const GLOSSARY_ORDER = [
  "argus", "splunk", "detection", "baseline", "red", "blue", "evaluator",
  "armsRace", "generation", "evasion", "recall", "falsePositive",
  "mitre", "coverage", "frontier", "certificate", "scenario", "noHardcoded",
];

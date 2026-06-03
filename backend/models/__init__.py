"""Model layer: the reasoning LLM (agent planning/SPL gen) and the Scorer (anomaly scoring).

Both fail loudly when unconfigured. The Scorer never fabricates a score; it either uses a Splunk
hosted model or a real local/3p model that is explicitly labeled as such in the UI.
"""

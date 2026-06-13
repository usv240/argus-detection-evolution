// Mirrors backend/api.py /api/health. Populated from real connectivity - never faked.
export interface Health {
  search_provider: string;
  scorer_backend: string | null;
  llm_configured: boolean;
  mcp_url_set: boolean;
  hec_configured: boolean;
  splunk: { connected: boolean; reason?: string; tools?: string[]; splunk_version?: string };
  mcp_tool_diversity?: {
    ok: boolean;
    error?: string;
    tools_used?: string[];
    index_count?: number;
    indexes_sample?: string[];
    index_info_target?: string | null;
    index_info_sample?: any;
  };
}

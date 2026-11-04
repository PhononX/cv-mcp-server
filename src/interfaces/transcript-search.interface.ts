import { SearchTranscriptsParams } from '../schemas';

/** Body of one `POST /search/transcripts`: always exactly one workspace. */
export type TranscriptSearchBody = SearchTranscriptsParams & {
  workspace_id: string;
};

/** Mirror of cv-api `TranscriptSearchResponse.ts`. */
export interface TranscriptSearchResult {
  message_id: string;
  conversation_id: string | null;
  conversation_name: string | null;
  workspace_id: string;
  creator_id: string;
  creator_name: string | null;
  created_at: string;
  parent_message_id: string | null;
  score: number;
  matched_chunk: string;
}

export interface TranscriptSearchResponse {
  results: TranscriptSearchResult[];
  scope_capped: boolean;
}

/** One workspace's hits in the fan-out (no `workspace_id`) response. */
export interface TranscriptSearchGroup {
  workspace_id: string;
  workspace_name: string;
  result_count: number;
  best_score: number;
  scope_capped: boolean;
  results: TranscriptSearchResult[];
}

export interface TranscriptSearchFanOutResponse {
  needs_workspace_choice: boolean;
  workspaces: TranscriptSearchGroup[];
  empty_workspaces: { workspace_id: string; workspace_name: string }[];
  skipped_workspaces: {
    workspace_id: string;
    workspace_name: string;
    reason: string;
  }[];
}

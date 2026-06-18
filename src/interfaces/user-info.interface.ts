export interface WorkspaceRole {
  workspace_id: string;
  role: string;
  joined_at: string;
  sort_order: number;
}

export interface UserInfo {
  id: string;
  created_at: string;
  first_name: string;
  last_name?: string;
  image_url?: string;
  languages: string[];
  voice_gender: 'F' | 'M';
  created_by: string;
  last_updated_at: string;
  workspace_ids: string[];
  workspace_roles: WorkspaceRole[];
  is_allowed_to_receive_notification: boolean;
  user_type: 'user' | 'bot';
}

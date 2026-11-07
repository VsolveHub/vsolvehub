export interface SafetyStoryItem {
  id: string;
  title?: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | string;
  media_url: string;
  thumbnail_url?: string;
  content_type?: string;
  display_order?: number;
  duration_seconds?: number;
  expires_at: string;
  created_at?: string;
}

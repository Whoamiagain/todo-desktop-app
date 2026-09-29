export interface DailyTask {
  id: string;
  user_id: string;
  title: string;
  active_days: string[];
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WeeklyTask {
  id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OtherTask {
  id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  is_finished: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Couple {
  id: string;
  user1_id: string;
  user2_id: string | null;
  invite_code: string;
  status?: 'active' | 'unlinked';
  created_at: string;
  updated_at: string;
}

export interface DiaryEntry {
  id: string;
  couple_id: string;
  user_id: string;
  date: string;
  encrypted_body: string;
  iv: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DecryptedDiaryEntry {
  id: string;
  couple_id: string;
  user_id: string;
  date: string;
  body: string;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiaryStreak {
  individualStreak: number;
  coupleStreak: number;
  isCoupleStreakTentative: boolean;
}

export interface DailyHistory {
  id: string;
  user_id: string;
  date: string; // ISO date
  finished_count: number;
  total_count: number;
  percentage: number;
  created_at: string;
  updated_at: string;
}

export type OutboxAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface OutboxItem {
  id: string;
  table_name: string;
  record_id: string;
  action: OutboxAction;
  payload: string; // JSON string
  updated_at: string;
}

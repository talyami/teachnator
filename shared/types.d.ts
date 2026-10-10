// Shared types declaration for Fast Learning Rebuild

export type UserRole = 'user' | 'admin';
export type UserPlan = 'free' | 'unlimited';
export type UserStatus = 'active' | 'banned';
export type AuthProviderType = 'google' | 'apple';
export type AttemptMode = 'learn' | 'quiz';
export type AttemptStatus = 'in_progress' | 'completed' | 'abandoned';
export type MaterialSourceType = 'text' | 'file' | 'image' | 'mixed';
export type AiTaskType = 'generate_quiz' | 'evaluate_answer' | 'tts' | 'other';
export type KeyProvider = 'gemini' | 'vertex';

export interface User {
  id: number;
  email: string;
  email_verified: boolean;
  name: string;
  avatar_url: string;
  role: UserRole;
  plan: UserPlan;
  daily_ai_limit_override: number | null;
  assigned_key_id: number | null;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  avatarUrl: string;
  role: UserRole;
  plan: UserPlan;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  resetsAt: string;
  assignedKeyId: number | null;
  linkedProviders: AuthProviderType[];
}

export interface AuthIdentity {
  id: number;
  user_id: number;
  provider: AuthProviderType;
  provider_subject: string;
  provider_email: string | null;
  is_private_email: boolean;
  created_at: string;
}

export interface PublicConfigResponse {
  googleClientId: string;
  appleClientId: string;
}

export interface NonceResponse {
  nonce: string;
}

export interface Question {
  id: string | number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  mnemonic: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: 'multiple_choice' | 'true_false' | 'short_answer';
}

export interface Material {
  id: number;
  user_id: number;
  title: string;
  source_type: MaterialSourceType;
  source_name: string;
  content_preview: string;
  questions: Question[];
  question_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  latestAttempt?: QuizAttempt | null;
}

export interface AttemptAnswer {
  chosen: number | string | boolean;
  isCorrect: boolean;
  timeTaken: number;
  feedback?: string;
}

export interface QuizAttempt {
  id: number;
  user_id: number;
  material_id: number;
  mode: AttemptMode;
  status: AttemptStatus;
  question_order: number[];
  answers: Record<string, AttemptAnswer>;
  current_index: number;
  score: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface GenerateQuizRequest {
  title?: string;
  text?: string;
  questionCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: string;
  model?: string;
  sourceName?: string;
  sourceType?: MaterialSourceType;
}

export interface GenerateQuizResponse {
  title: string;
  questions: Question[];
}

export interface EvaluateAnswerRequest {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  language?: string;
  model?: string;
}

export interface EvaluateAnswerResponse {
  isCorrect: boolean;
  score: number; // 0 to 100
  feedback: string;
}

export interface TtsRequest {
  text: string;
  voice?: string;
  language?: string;
  model?: string;
}

export interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  cached: boolean;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    resetsAt?: string;
    details?: unknown;
  };
}

export interface AdminStats {
  totalUsers: number;
  activeToday: number;
  totalMaterials: number;
  totalAttempts: number;
  aiUnitsToday: number;
  keyPoolCount: number;
}

export interface AdminUserListItem {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  role: UserRole;
  plan: UserPlan;
  daily_ai_limit_override: number | null;
  assigned_key_id: number | null;
  assigned_key_label?: string | null;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
  usage_today: number;
  material_count: number;
  session_count: number;
  linked_providers: AuthProviderType[];
}

export interface ApiKeyItem {
  id: number;
  label: string;
  provider: KeyProvider;
  is_default: boolean;
  created_at: string;
  masked_key: string;
  assigned_user_count: number;
}

export interface AuditLogItem {
  id: number;
  admin_id: number;
  admin_email: string;
  action: string;
  target_user_id: number | null;
  target_user_email?: string | null;
  details: unknown;
  created_at: string;
}

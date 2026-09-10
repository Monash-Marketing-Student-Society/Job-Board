// Database types for MMSS Job Board

export type WorkMode = 'remote' | 'hybrid' | 'onsite'
export type JobType = 'internship' | 'graduate' | 'part-time' | 'full-time' | 'casual' | 'contract'
export type JobSource = 'manual' | 'external_api' | string

// Database row types
export interface Job {
  id: string
  source: JobSource
  external_id: string | null
  title: string
  company: string
  location: string | null
  work_mode: WorkMode | null
  job_type: JobType | null
  url: string
  description: string | null
  /** Short 1-2 line card-preview text, distinct from `description`. NULL falls back to a truncated description on the card. */
  summary: string | null
  company_logo_url: string | null
  tags: string[] | null
  posted_at: string | null
  closing_at: string | null
  is_active: boolean
  is_sponsored: boolean
  created_at: string
  updated_at: string
}

export interface AdminUser {
  id: string
  is_admin: boolean
  created_at: string
}

// Insert types (for creating new records)
export interface JobInsert {
  id?: string
  source?: JobSource
  external_id?: string | null
  title: string
  company: string
  location?: string | null
  work_mode?: WorkMode | null
  job_type?: JobType | null
  url: string
  description?: string | null
  summary?: string | null
  company_logo_url?: string | null
  tags?: string[] | null
  posted_at?: string | null
  closing_at?: string | null
  is_active?: boolean
  is_sponsored?: boolean
}

// Update types (for updating existing records)
export interface JobUpdate {
  source?: JobSource
  external_id?: string | null
  title?: string
  company?: string
  location?: string | null
  work_mode?: WorkMode | null
  job_type?: JobType | null
  url?: string
  description?: string | null
  summary?: string | null
  company_logo_url?: string | null
  tags?: string[] | null
  posted_at?: string | null
  closing_at?: string | null
  is_active?: boolean
  is_sponsored?: boolean
}

// =====================
// Job Submission types
// =====================

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface JobSubmission {
  id: string
  submitter_name: string
  submitter_email: string
  submitter_company_name: string
  title: string
  company: string
  location: string | null
  work_mode: WorkMode | null
  job_type: JobType | null
  url: string
  description: string | null
  /** AI-suggested (or hand-written) short summary; carried to jobs.summary on approval. NULL if AI prefill did not run or found nothing. */
  summary: string | null
  company_logo_url: string | null
  tags: string[] | null
  closing_at: string | null
  /** Submitter asked for a sponsored/pinned placement. A request only — approval does not set jobs.is_sponsored. */
  is_sponsored: boolean
  status: SubmissionStatus
  admin_note: string | null
  edit_token: string
  /** Set when an admin archives the row; NULL means it is still in the queue. */
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface JobSubmissionInsert {
  submitter_name: string
  submitter_email: string
  submitter_company_name: string
  title: string
  company: string
  location?: string | null
  work_mode?: WorkMode | null
  job_type?: JobType | null
  url: string
  description?: string | null
  summary?: string | null
  company_logo_url?: string | null
  tags?: string[] | null
  closing_at?: string | null
  is_sponsored?: boolean
}

export interface JobSubmissionUpdate {
  title?: string
  company?: string
  location?: string | null
  work_mode?: WorkMode | null
  job_type?: JobType | null
  url?: string
  description?: string | null
  summary?: string | null
  company_logo_url?: string | null
  tags?: string[] | null
  closing_at?: string | null
  is_sponsored?: boolean
  status?: SubmissionStatus
  admin_note?: string | null
  archived_at?: string | null
}

// =====================
// Analytics types
// =====================

/**
 * `apply` is a click on the outbound link; `apply_confirmed` is the visitor
 * telling us afterwards that they actually finished. The second is always a
 * lower bound — it only exists for people who came back to the board.
 */
export type AnalyticsEventType = 'view' | 'click' | 'apply' | 'apply_confirmed' | 'share'
/**
 * `day` exists for the Total Visitors card, which runs its own daily series
 * independent of the page-level control. It is deliberately absent from
 * GRANULARITIES so it never appears in the page's range picker.
 */
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface AnalyticsEvent {
  id: number
  event_type: AnalyticsEventType
  /** NULL once the job it referenced has been deleted — the event still counts. */
  job_id: string | null
  visitor_id: string
  /** Snapshot of the job at event time; written by a trigger, never by the caller. */
  job_type: JobType | null
  tags: string[] | null
  occurred_at: string
}

/**
 * What the tracking route inserts.
 *
 * `job_type`, `tags` and `occurred_at` are absent on purpose: the trigger and
 * the column default own them, so a caller cannot spoof a category or backdate
 * an event.
 */
export interface AnalyticsEventInsert {
  event_type: AnalyticsEventType
  job_id: string | null
  visitor_id: string
}

/** One row of `analytics_viewers_by_bucket`. */
export interface ViewerBucket {
  bucket_start: string
  viewers: number
  views: number
}

/** One row of `analytics_interest_breakdown`. */
export interface InterestRow {
  dimension: 'job_type' | 'tag'
  label: string
  events: number
  visitors: number
}

/** One row of `analytics_action_counts`. */
export interface ActionCountRow {
  action: AnalyticsEventType
  events: number
  distinct_jobs: number
  visitors: number
}

/** `ActionCountRow` densified so every action is present. */
export type ActionCounts = Record<AnalyticsEventType, Omit<ActionCountRow, 'action'>>

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Supabase Database type helper - matches Supabase codegen format
export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: Job
        Insert: JobInsert
        Update: JobUpdate
        Relationships: []
      }
      job_submissions: {
        Row: JobSubmission
        Insert: JobSubmissionInsert
        Update: JobSubmissionUpdate
        Relationships: []
      }
      analytics_events: {
        Row: AnalyticsEvent
        Insert: AnalyticsEventInsert
        Update: never
        Relationships: [
          {
            foreignKeyName: 'analytics_events_job_id_fkey'
            columns: ['job_id']
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          }
        ]
      }
      admin_users: {
        Row: AdminUser
        Insert: Omit<AdminUser, 'created_at'>
        Update: Partial<Omit<AdminUser, 'id' | 'created_at'>>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      analytics_viewers_by_bucket: {
        Args: { p_granularity: Granularity; p_buckets: number; p_tz: string }
        Returns: ViewerBucket[]
      }
      analytics_interest_breakdown: {
        Args: { p_granularity: Granularity; p_buckets: number; p_tz: string; p_limit: number }
        Returns: InterestRow[]
      }
      analytics_action_counts: {
        Args: { p_granularity: Granularity; p_buckets: number; p_tz: string }
        Returns: ActionCountRow[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/**
 * The subset of `Job` the admin jobs table renders.
 *
 * The table never shows `description` (full job HTML), so the admin list query
 * selects only these columns to keep the per-row payload small.
 */
export type AdminJobRow = Pick<
  Job,
  | 'id'
  | 'title'
  | 'company'
  | 'source'
  | 'is_active'
  | 'is_sponsored'
  | 'posted_at'
  | 'created_at'
>

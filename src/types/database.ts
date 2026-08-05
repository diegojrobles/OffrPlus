export type ApplicationStatus =
  | "Applied"
  | "Phone Screen"
  | "Superday"
  | "Offer"
  | "Rejected"
  | "Withdrawn";

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  date_met: string | null;
  follow_up_date: string | null;
  pipeline_stage: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  date_applied: string | null;
  salary: string;
  expected_reply_date: string | null;
  location: string;
  link: string;
  custom_fields: Record<string, string>;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type CustomFieldType = "text" | "number" | "date";

export interface AppCustomField {
  id: string;
  user_id: string;
  name: string;
  field_type: CustomFieldType;
  position: number;
  created_at: string;
  updated_at: string;
}

export type AppCustomFieldInsert = Omit<
  AppCustomField,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ["text", "number", "date"];

export interface Resume {
  id: string;
  user_id: string;
  company: string;
  title: string;
  resume_text: string;
  notes: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export type MeetingPlatform = "zoom" | "teams" | "skype" | null;
export type EventType = "manual" | "contact_follow_up";

export interface CalendarEvent {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  event_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null; // HH:MM:SS
  notes: string;
  meeting_link: string | null;
  meeting_platform: MeetingPlatform;
  event_type: EventType;
  created_at: string;
}

export type CalendarEventInsert = Omit<CalendarEvent, "id" | "created_at">;
export type CalendarEventUpdate = Partial<Omit<CalendarEvent, "id" | "user_id" | "created_at">>;

export type ContactInsert = Omit<
  Contact,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type ContactUpdate = Partial<ContactInsert>;

export type ApplicationInsert = Omit<
  Application,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type ApplicationUpdate = Partial<ApplicationInsert>;

export type ResumeInsert = Omit<
  Resume,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type ResumeUpdate = Partial<ResumeInsert>;

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "Applied",
  "Phone Screen",
  "Superday",
  "Offer",
  "Rejected",
  "Withdrawn",
];

export const DEFAULT_PIPELINE_STAGES = [
  { name: "Not Started", color: "#64748b" },
  { name: "Mutual Connection", color: "#22c55e" },
  { name: "Email Sent", color: "#22c55e" },
  { name: "Follow Up", color: "#34d399" },
  { name: "Responded", color: "#22c55e" },
  { name: "Met", color: "#22c55e" },
  { name: "Do Not Contact", color: "#ef4444" },
] as const;

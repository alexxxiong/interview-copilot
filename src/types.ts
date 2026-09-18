export type Role = "interviewer" | "candidate" | "unknown";
export type Category = "technical" | "scenario" | "experience" | "general";
export type Transcript = {
  id: string;
  chunkId?: string;
  createdAt: string;
  capturedAt?: string;
  text: string;
  role: Role;
  source: string;
};
export type Source = {
  id: string;
  title: string;
  url: string;
  supports: string;
  opened: boolean;
};
export type Answer = {
  headline: string;
  shortAnswer: string;
  assumptions: string[];
  points: {
    title: string;
    detail: string;
    kind: "fact" | "design" | "experience";
    sourceIds: string[];
  }[];
  pitfalls: string[];
  followUps: string[];
  unknowns: string[];
  sources: Source[];
  experienceUsed: string[];
  evidenceNotes: string[];
};
export type Job = {
  id: string;
  contextKey?: string;
  question: string;
  category: Category;
  status:
    | "queued"
    | "researching"
    | "reviewing"
    | "completed"
    | "needs_context"
    | "failed"
    | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  events: { at: string; stage: string; message: string }[];
  answer: Answer | null;
  error: string | null;
  clarifications?: string[];
  reviewIssues?: string[];
  verdict?: string;
};
export type Session = {
  id: string;
  title: string;
  createdAt: string;
  transcripts: Transcript[];
  jobs: Job[];
  detectionError?: string;
  pendingFragment?: string;
};
export type Settings = {
  provider: "codex" | "openai";
  codexPath: string;
  codexModel: string;
  apiBase: string;
  apiModel: string;
  apiKey?: string;
  effort: "low" | "medium" | "high" | "xhigh";
  timeoutSeconds: number;
  asrProvider: "local" | "openai";
  asrBase: string;
  asrKey?: string;
  asrModel: string;
  whisperPath: string;
  whisperModel: string;
  role: string;
  profile: string;
  autoDetect: boolean;
  hasApiKey: boolean;
  hasAsrKey: boolean;
  keysPersisted: boolean;
};
export type State = {
  csrfToken: string;
  settings: Settings;
  sessions: Session[];
  library?: Session & { contextKey: string };
};
export type MediaPermissions = {
  platform: string;
  microphone: string;
  screen: string;
  captureDiagnostic?: { origin: string; stage: string; error: string } | null;
};
declare global {
  interface Window {
    desktop?: {
      openOverlay: () => Promise<void>;
      setPinned: (value: boolean) => Promise<boolean>;
      closeOverlay: () => Promise<void>;
      openCard: (card: {
        id: string;
        title: string;
        sessionId: string;
      }) => Promise<void>;
      pinCard: (value: boolean) => Promise<boolean>;
      closeCard: () => Promise<void>;
      tileCards: () => Promise<void>;
      mediaStatus: () => Promise<MediaPermissions>;
      openMediaSettings: (kind: "screen" | "microphone") => Promise<void>;
      playTestSound: () => Promise<void>;
      restart: () => Promise<void>;
      isDesktop: true;
    };
  }
}

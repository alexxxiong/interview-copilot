import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  AudioLines,
  BookOpenText,
  Check,
  ChevronDown,
  Command,
  Download,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Mic,
  Monitor,
  PanelTop,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  Radio,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import type {
  State,
  Session,
  Settings,
  Job,
  Role,
  Transcript,
  Category,
} from "./types";
import { api, setToken, transcribeAudio } from "./api";
import { Capture, fileToWav, type AudioChunk, type SpeechInfo } from "./audio";
import { LiveTranscriptionQueue } from "./live-transcription";
import { EchoDeduplicator } from "./echo-dedup";
import { AnswerView, statuses, categories } from "./AnswerView";
import SettingsView from "./SettingsView";
import MediaPermissions from "./MediaPermissions";
import QuestionLibrary, {
  interviewCards,
  StudyCardDetail,
} from "./QuestionLibrary";
import { cardJob, questionCards, type QuestionCard } from "./question-cards";
import CardWindow from "./CardWindow";
const roleNames = { interviewer: "面试官", candidate: "我", unknown: "待确认" };
const examples = [
  {
    text: "高频交易中，如何设计才能保证交易的严格一致性？",
    tag: "一致性 / 容错",
    category: "scenario" as Category,
  },
  {
    text: "行情突发时，如何排查 C++ 交易系统的 P99 延迟抖动？",
    tag: "低延迟 / C++",
    category: "technical" as Category,
  },
  {
    text: "介绍一个你主导的架构改造，以及你做过的关键取舍。",
    tag: "项目经历",
    category: "experience" as Category,
  },
];
const isOverlay = new URLSearchParams(location.search).has("overlay");
const cardWindowId = new URLSearchParams(location.search).get("card");
const cardSessionId = new URLSearchParams(location.search).get("session");
type LiveDraft = SpeechInfo & {
  sessionId: string;
  text: string;
  phase: "speaking" | "finalizing" | "failed";
  error?: string;
};
function time(s: string) {
  return new Date(s).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [sessionId, setSessionId] = useState(""),
    [selectedJob, setSelectedJob] = useState(""),
    [page, setPage] = useState("live"),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [detecting, setDetecting] = useState(false);
  const [pinnedCardId, setPinnedCardId] = useState(
    () => localStorage.getItem("pinnedQuestionCard") || "",
  );
  const [text, setText] = useState(""),
    [entryMode, setEntryMode] = useState<"question" | "transcript">("question"),
    [entryRole, setEntryRole] = useState<Role>("interviewer"),
    [category, setCategory] = useState<Category>("technical"),
    [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false),
    [starting, setStarting] = useState(false),
    [testingAudio, setTestingAudio] = useState(false),
    [mic, setMic] = useState(true),
    [system, setSystem] = useState(true),
    [micRole, setMicRole] = useState<Role>("candidate"),
    [systemRole, setSystemRole] = useState<Role>("interviewer"),
    [micId, setMicId] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [captureOptions, setCaptureOptions] = useState(false),
    [levels, setLevels] = useState<Record<string, number>>({}),
    [pendingAudio, setPendingAudio] = useState(0),
    [deduplicated, setDeduplicated] = useState<Record<string, string[]>>({}),
    [liveDrafts, setLiveDrafts] = useState<Record<string, LiveDraft>>({}),
    [audioErrors, setAudioErrors] = useState<
      { chunk: AudioChunk; message: string }[]
    >([]);
  const [autoFollow, setAutoFollow] = useState(true),
    [pinned, setPinned] = useState(true),
    [fontSize, setFontSize] = useState(16),
    [elapsed, setElapsed] = useState(0);
  const capture = useRef<Capture | null>(null),
    audioQueue = useRef<LiveTranscriptionQueue | null>(null),
    feedEnd = useRef<HTMLDivElement>(null),
    overlayEnd = useRef<HTMLDivElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    prevCount = useRef(0),
    startAt = useRef(0),
    sidRef = useRef("");
  if (!audioQueue.current)
    audioQueue.current = new LiveTranscriptionQueue(
      {
        transcribe: transcribeAudio,
        pending: setPendingAudio,
        deduplicated: (task) => {
          if (task.final)
            setDeduplicated((old) => ({
              ...old,
              [task.sessionId]: [
                ...new Set([
                  ...(old[task.sessionId] || []),
                  task.chunk.chunkId,
                ]),
              ],
            }));
        },
        partial: (task, text) =>
          setLiveDrafts((drafts) => {
            const old = drafts[task.chunk.chunkId];
            return {
              ...drafts,
              [task.chunk.chunkId]: {
                ...speechInfo(task.chunk),
                sessionId: task.sessionId,
                text,
                phase: old?.phase || "speaking",
              },
            };
          }),
        commit: async (task, text) => {
          const updated = await api<Session>(
            `/sessions/${task.sessionId}/transcripts`,
            { ...speechInfo(task.chunk), text },
          );
          setState((old) =>
            old
              ? {
                  ...old,
                  sessions: old.sessions.map((s) =>
                    s.id === updated.id ? updated : s,
                  ),
                }
              : old,
          );
        },
        settled: (task) =>
          setLiveDrafts((drafts) => {
            const next = { ...drafts };
            delete next[task.chunk.chunkId];
            return next;
          }),
        failed: (task, error) => {
          setLiveDrafts((drafts) => {
            const old = drafts[task.chunk.chunkId];
            return old
              ? {
                  ...drafts,
                  [task.chunk.chunkId]: {
                    ...old,
                    phase: task.final ? "failed" : old.phase,
                    error: error.message,
                  },
                }
              : drafts;
          });
          if (task.final)
            setAudioErrors((errors) => [
              ...errors,
              {
                chunk: {
                  ...task.chunk,
                  source: task.chunk.source + "|" + task.sessionId,
                },
                message: error.message,
              },
            ]);
        },
      },
      new EchoDeduplicator(),
    );
  const session =
    state?.sessions.find((s) => s.id === sessionId) || state?.sessions[0];
  const job =
    session?.jobs.find((j) => j.id === selectedJob) || session?.jobs.at(-1);
  const settings = state?.settings;
  const visibleDrafts = Object.values(liveDrafts).filter(
    (draft) =>
      draft.sessionId === session?.id &&
      !session.transcripts.some((t) => t.chunkId === draft.chunkId),
  );
  const transcriptRows = [
    ...(session?.transcripts || []).map((item) => ({
      item,
      draft: null as LiveDraft | null,
    })),
    ...visibleDrafts.map((draft) => ({
      item: {
        ...draft,
        id: draft.chunkId,
        createdAt: draft.capturedAt,
      } as Transcript,
      draft,
    })),
  ].sort((a, b) =>
    (a.item.capturedAt || a.item.createdAt).localeCompare(
      b.item.capturedAt || b.item.createdAt,
    ),
  );
  useEffect(() => {
    api<State>("/state")
      .then((s) => {
        setToken(s.csrfToken);
        setState(s);
        if (cardWindowId) setConnected(true);
        const saved = cardWindowId
          ? cardSessionId
          : localStorage.getItem("interviewSession");
        setSessionId(
          s.sessions.some((x) => x.id === saved)
            ? saved!
            : s.sessions[0]?.id || "",
        );
      })
      .catch((e) => setError(e.message));
    // Many card windows must not each reserve an HTTP/1 SSE connection.
    // Keep the workbench's live stream, and refresh read-only cards briefly.
    if (cardWindowId) {
      let pending = false,
        disposed = false;
      const timer = setInterval(async () => {
        if (pending) return;
        pending = true;
        try {
          const next = await api<State>("/state");
          if (!disposed) {
            setToken(next.csrfToken);
            setState(next);
            setConnected(true);
          }
        } catch {
          if (!disposed) setConnected(false);
        } finally {
          pending = false;
        }
      }, 2500);
      return () => {
        disposed = true;
        clearInterval(timer);
      };
    }
    const events = new EventSource("/api/events");
    events.onopen = () => {
      setConnected(true);
      api<State>("/state")
        .then((s) => {
          setToken(s.csrfToken);
          setState(s);
        })
        .catch((e) => setError(e.message));
    };
    events.onerror = () => setConnected(false);
    events.onmessage = ({ data }) => {
      const e = JSON.parse(data);
      if (e.type === "session")
        setState((s) =>
          s
            ? {
                ...s,
                sessions: s.sessions.some((x) => x.id === e.session.id)
                  ? s.sessions.map((x) =>
                      x.id === e.session.id ? e.session : x,
                    )
                  : [e.session, ...s.sessions],
              }
            : s,
        );
      if (e.type === "settings")
        setState((s) =>
          s
            ? {
                ...s,
                settings: e.settings,
                library: s.library
                  ? {
                      ...s.library,
                      contextKey: e.libraryContextKey || s.library.contextKey,
                    }
                  : undefined,
              }
            : s,
        );
      if (e.type === "library")
        setState((s) =>
          s
            ? {
                ...s,
                library: {
                  ...e.session,
                  contextKey: s.library?.contextKey || "",
                },
              }
            : s,
        );
      if (e.type === "detecting" && e.sessionId === sidRef.current)
        setDetecting(e.active);
    };
    const onStorage = (e: StorageEvent) => {
      if (cardWindowId) return;
      if (e.key === "interviewSession" && e.newValue) setSessionId(e.newValue);
      if (e.key === "pinnedQuestionCard") setPinnedCardId(e.newValue || "");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      events.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    sidRef.current = sessionId;
    setDetecting(false);
    if (sessionId && !cardWindowId)
      localStorage.setItem("interviewSession", sessionId);
    prevCount.current = 0;
  }, [sessionId]);
  useEffect(() => {
    if (session && session.jobs.length !== prevCount.current) {
      if (autoFollow) setSelectedJob(session.jobs.at(-1)?.id || "");
      prevCount.current = session.jobs.length;
    }
  }, [session?.jobs.length, sessionId, autoFollow]);
  useEffect(() => {
    if (session?.transcripts.length || visibleDrafts.length)
      feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.transcripts.length, liveDrafts]);
  useEffect(() => {
    if (isOverlay && autoFollow)
      overlayEnd.current?.previousElementSibling?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [session?.jobs.map((j) => `${j.id}:${j.status}`).join(","), autoFollow]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => capture.current?.stop(), []);
  const guard = async (fn: () => Promise<any>) => {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  function switchSession(id: string) {
    if (recording || pendingAudio) {
      setError("请先停止采集并等待转写完成，再切换会话。");
      return;
    }
    setSessionId(id);
    setSelectedJob("");
    setPage("live");
  }
  async function newSession() {
    if (recording || pendingAudio) {
      setError("请先停止采集并等待转写完成。");
      return;
    }
    await guard(async () => {
      const s = await api<Session>("/sessions", {});
      setState((old) =>
        old
          ? {
              ...old,
              sessions: old.sessions.some((x) => x.id === s.id)
                ? old.sessions
                : [s, ...old.sessions],
            }
          : old,
      );
      switchSession(s.id);
    });
  }
  async function submit(question = text, qCategory = category) {
    if (!session || !question.trim()) return;
    setBusy(true);
    await guard(async () => {
      if (entryMode === "question") {
        const j = await api<Job>(`/sessions/${session.id}/questions`, {
          question,
          category: qCategory,
        });
        setSelectedJob(j.id);
      } else
        await api(`/sessions/${session.id}/transcripts`, {
          text: question,
          role: entryRole,
          source: "手动录入",
        });
      setText("");
    });
    setBusy(false);
  }
  function beginSpeech(info: SpeechInfo, targetId: string) {
    setLiveDrafts((drafts) => ({
      ...drafts,
      [info.chunkId]: {
        ...info,
        sessionId: targetId,
        text: "",
        phase: "speaking",
      },
    }));
  }
  function queueChunk(chunk: AudioChunk, targetId: string, final = true) {
    if (final)
      setLiveDrafts((drafts) => ({
        ...drafts,
        [chunk.chunkId]: {
          ...speechInfo(chunk),
          sessionId: targetId,
          text: drafts[chunk.chunkId]?.text || "",
          phase: "finalizing",
        },
      }));
    audioQueue.current!.submit({ chunk, sessionId: targetId, final });
  }
  function stopCapture() {
    capture.current?.stop();
    capture.current = null;
    setRecording(false);
    setLevels({});
  }
  async function startCapture() {
    if (!session || !settings) return;
    if (!mic && !system) {
      setError("请至少选择一个音频来源。");
      return;
    }
    setStarting(true);
    setError("");
    const c = new Capture();
    capture.current = c;
    const targetId = session.id;
    void api("/transcribe/prepare", {}).catch((e) =>
      setError(`转写模型准备失败：${e.message}`),
    );
    try {
      await c.start({
        mic,
        system,
        micId,
        micRole,
        systemRole,
        onChunk: (chunk) => queueChunk(chunk, targetId),
        onPreview: (chunk) => queueChunk(chunk, targetId, false),
        onSpeech: (info) => beginSpeech(info, targetId),
        onLevel: (source, level) =>
          setLevels((l) => ({ ...l, [source]: level })),
        onEnded: stopCapture,
      });
      setRecording(true);
      startAt.current = Date.now();
      setElapsed(0);
      setCaptureOptions(false);
    } catch (e) {
      setError(`采集未启动：${(e as Error).message}`);
      setCaptureOptions(true);
    } finally {
      setStarting(false);
    }
  }
  async function importAudio(file: File) {
    if (!session) return;
    setBusy(true);
    await guard(async () => {
      queueChunk(
        {
          wav: await fileToWav(file),
          role: entryRole,
          source: "导入音频",
          capturedAt: new Date().toISOString(),
          chunkId: crypto.randomUUID(),
        },
        session.id,
      );
    });
    setBusy(false);
  }
  const jobAction = (j: Job, action: string) =>
    guard(() => api(`/sessions/${session!.id}/jobs/${j.id}/${action}`, {}));
  function exportSession() {
    if (!session) return;
    const body = `# 面试记录\n\n${session.transcripts.map((t) => `[${time(t.createdAt)}] ${roleNames[t.role]}：${t.text}`).join("\n\n")}\n\n# 答题提示\n\n${session.jobs.map((j) => `## ${j.question}\n\n状态：${statuses[j.status]}\n\n${j.answer ? `${j.answer.shortAnswer}\n\n${j.answer.points.map((p) => `- ${p.title}：${p.detail}`).join("\n")}\n\n待确认：${[...j.answer.unknowns, ...j.answer.evidenceNotes].join("；")}\n\n${j.answer.sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}` : j.error || ""}`).join("\n\n")}`;
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `面试记录-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function prepareCard(card: QuestionCard) {
    await guard(async () => {
      const next = await api<Job>("/sessions/question-library/questions", {
        question: card.question,
        category: card.category,
      });
      setState((old) =>
        old?.library
          ? {
              ...old,
              library: {
                ...old.library,
                jobs: old.library.jobs.some((j) => j.id === next.id)
                  ? old.library.jobs.map((j) => (j.id === next.id ? next : j))
                  : [...old.library.jobs, next],
              },
            }
          : old,
      );
    });
  }
  async function cardAction(
    card: QuestionCard,
    job: Job,
    action: "retry" | "cancel",
  ) {
    await guard(() =>
      api(
        `/sessions/${card.liveJob ? session!.id : "question-library"}/jobs/${job.id}/${action}`,
        {},
      ),
    );
  }
  async function pinCard(id: string) {
    setPinnedCardId(id);
    localStorage.setItem("pinnedQuestionCard", id);
    await guard(async () => {
      if (window.desktop) await window.desktop.openOverlay();
      else
        window.open("/?overlay=1", "interview-overlay", "width=530,height=740");
    });
  }
  async function openCard(card: QuestionCard) {
    await guard(async () => {
      if (window.desktop)
        await window.desktop.openCard({
          id: card.id,
          title: card.title,
          sessionId: session!.id,
        });
      else {
        const url = new URL(location.origin);
        url.searchParams.set("card", card.id);
        url.searchParams.set("session", session!.id);
        const opened = window.open(url.href, "_blank", "width=580,height=800");
        if (!opened)
          throw new Error("浏览器拦截了新窗口，请允许此站点打开弹窗后重试。");
      }
    });
  }
  const overlayCard = [
    ...questionCards,
    ...(session ? interviewCards(session) : []),
  ].find((c) => c.id === pinnedCardId);
  if (!state || !session || !settings)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        {error || "正在打开工作台…"}
      </div>
    );
  if (cardWindowId) {
    const sourceSession = state.sessions.find((s) => s.id === cardSessionId);
    const card = [
      ...questionCards,
      ...(sourceSession ? interviewCards(sourceSession) : []),
    ].find((c) => c.id === cardWindowId);
    return (
      <CardWindow
        card={card}
        job={
          card
            ? cardJob(
                card,
                state.library?.jobs || [],
                state.library?.contextKey,
              )
            : undefined
        }
        profile={settings.profile}
        connected={connected}
        error={error}
        onPrepare={() => (card ? prepareCard(card) : Promise.resolve())}
        onAction={(j, action) =>
          card &&
          void guard(() =>
            api(
              `/sessions/${card.liveJob ? sourceSession!.id : "question-library"}/jobs/${j.id}/${action}`,
              {},
            ),
          )
        }
      />
    );
  }
  if (isOverlay)
    return (
      <div className="overlay-app" style={{ fontSize }}>
        <header className="overlay-title">
          <div>
            <AudioLines size={17} />
            <strong>面试提示</strong>
            <span className={`connection-dot ${connected ? "online" : ""}`} />
          </div>
          <div>
            <button
              className="icon-button"
              title={pinned ? "取消置顶" : "开启置顶"}
              onClick={() =>
                guard(async () => {
                  if (window.desktop)
                    setPinned(await window.desktop.setPinned(!pinned));
                })
              }
            >
              {pinned ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
          </div>
        </header>
        <div className="overlay-controls">
          <span>
            {overlayCard ? "问题卡片" : `${session.jobs.length} 个问题`}
          </span>
          <div>
            <button onClick={() => setFontSize((n) => Math.max(13, n - 1))}>
              A−
            </button>
            <button onClick={() => setFontSize((n) => Math.min(24, n + 1))}>
              A+
            </button>
            <button
              className={autoFollow ? "active" : ""}
              onClick={() => setAutoFollow((v) => !v)}
            >
              <ArrowDown size={13} />
              {autoFollow ? "跟随最新" : "手动滚动"}
            </button>
          </div>
        </div>
        {overlayCard && (
          <button
            className="overlay-back-live"
            onClick={() => {
              setPinnedCardId("");
              localStorage.removeItem("pinnedQuestionCard");
            }}
          >
            ← 回到实时回答提示
          </button>
        )}
        <div className="overlay-scroll">
          {overlayCard ? (
            <StudyCardDetail
              card={overlayCard}
              compact
              job={cardJob(
                overlayCard,
                state.library?.jobs || [],
                state.library?.contextKey,
              )}
              profile={settings.profile}
              onPrepare={() => void prepareCard(overlayCard)}
              onAction={(j, action) => void cardAction(overlayCard, j, action)}
            />
          ) : !session.jobs.length ? (
            <div className="overlay-empty">
              <Radio size={30} />
              <h2>等待第一个问题</h2>
              <p>
                在主工作台开始采集或输入问题。
                <br />
                完成复核的提示会出现在这里。
              </p>
            </div>
          ) : (
            session.jobs.map((j) => (
              <AnswerView
                key={j.id}
                job={j}
                compact
                onRetry={() => jobAction(j, "retry")}
                onCancel={() => jobAction(j, "cancel")}
              />
            ))
          )}
          <div ref={overlayEnd} />
        </div>
        <footer>
          <ShieldCheck size={13} />
          {overlayCard
            ? "表达提纲与 Agent 答案分开标注"
            : "检索与复核后展示答案"}
          <span>⌘ ⇧ J</span>
        </footer>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="window-space" />
        <div className="brand">
          <img className="brand-icon" src="/interview-icon.png" alt="" />
          <div>
            面试助手<small>INTERVIEW COPILOT</small>
          </div>
        </div>
        <div className="workspace-label">
          个人工作空间<span>LOCAL</span>
        </div>
        <nav>
          {[
            { id: "live", icon: Radio, label: "面试工作台" },
            { id: "cards", icon: BookOpenText, label: "问题卡片" },
            { id: "history", icon: History, label: "会话记录" },
            { id: "profile", icon: UserRound, label: "个人经历" },
            { id: "settings", icon: Settings2, label: "模型与设置" },
          ].map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {page === item.id && <span />}
            </button>
          ))}
        </nav>
        <div className="sidebar-session">
          <div className="sidebar-section-title">
            当前会话
            <button
              className="icon-button"
              title="新建会话"
              onClick={newSession}
            >
              <Plus size={15} />
            </button>
          </div>
          <p>
            <span className="dot" />
            {settings.role.split("/")[0]}
          </p>
          <small>
            {new Date(session.createdAt).toLocaleDateString("zh-CN")} ·{" "}
            {session.jobs.length} 个问题
          </small>
        </div>
        <div className="sidebar-bottom">
          <div className="agent-quality">
            <ShieldCheck size={20} />
            <strong>准确优先</strong>
            <p>
              检索原始资料
              <br />
              独立复核关键结论
            </p>
          </div>
          <div className="local-status">
            <span className={`connection-dot ${connected ? "online" : ""}`} />
            {connected ? "本机服务已连接" : "服务连接中断"}
            <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间<span>/</span>
            <strong>
              {page === "live"
                ? "面试工作台"
                : page === "cards"
                  ? "问题卡片"
                  : page === "history"
                    ? "会话记录"
                    : page === "profile"
                      ? "个人经历"
                      : "模型与设置"}
            </strong>
          </div>
          <div className="top-actions">
            {recording && page !== "live" && (
              <button
                className="text-button recording-shortcut"
                onClick={stopCapture}
              >
                <Square size={12} />
                采集中 · 停止
              </button>
            )}
            {page !== "cards" && (
              <button className="text-button" onClick={() => setPage("cards")}>
                <BookOpenText size={16} />
                问题卡片
              </button>
            )}
            <span className="provider-tag">
              <span className="dot" />
              {settings.provider === "codex"
                ? "Codex Agent"
                : settings.apiModel}
            </span>
            <button
              className="secondary-button"
              onClick={() =>
                guard(async () => {
                  if (window.desktop) await window.desktop.openOverlay();
                  else {
                    window.open(
                      "/?overlay=1",
                      "interview-overlay",
                      "width=530,height=740",
                    );
                  }
                })
              }
            >
              <PanelTop size={16} />
              {window.desktop ? "置顶提示窗" : "打开提示窗"}
              <kbd>⌘ ⇧ J</kbd>
            </button>
          </div>
        </header>
        {error && (
          <div className="global-error" role="alert">
            {error}
            <button className="icon-button" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {page === "settings" || page === "profile" ? (
          <SettingsView
            key={page}
            settings={settings}
            profileOnly={page === "profile"}
            onSaved={(s) => setState({ ...state, settings: s })}
          />
        ) : page === "cards" ? (
          <QuestionLibrary
            session={session}
            library={state.library}
            profile={settings.profile}
            onPrepare={prepareCard}
            onAction={(c, j, action) => void cardAction(c, j, action)}
            onPin={(id) => void pinCard(id)}
            onOpen={(card) => void openCard(card)}
            onTile={
              window.desktop
                ? () => void guard(() => window.desktop!.tileCards())
                : undefined
            }
          />
        ) : page === "history" ? (
          <div className="history-page">
            <div className="page-heading">
              <span className="eyebrow">SESSION ARCHIVE</span>
              <h1>每一次，留下依据</h1>
              <p>对话、提示与来源保存在本机，可以随时回看。</p>
            </div>
            <button className="primary-button" onClick={newSession}>
              <Plus size={16} />
              新建会话
            </button>
            <div className="session-list">
              {state.sessions.map((s) => (
                <button key={s.id} onClick={() => switchSession(s.id)}>
                  <FileText size={22} />
                  <div>
                    <h3>{s.jobs[0]?.question || "新的面试会话"}</h3>
                    <p>
                      {new Date(s.createdAt).toLocaleString("zh-CN")} ·{" "}
                      {s.transcripts.length} 条转写 · {s.jobs.length} 个问题
                    </p>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">LIVE WORKSPACE</span>
                <h1>专注对话，依据在旁。</h1>
                <p>
                  {settings.role}
                  <span className="slash">/</span>技术、场景与真实经历
                </p>
              </div>
              <button
                className="icon-button export-button"
                title="导出本次记录"
                onClick={exportSession}
              >
                <Download size={19} />
              </button>
            </div>
            <div className="capture-bar">
              <div className="capture-state">
                <span
                  className={`recording-light ${recording ? "live" : ""}`}
                />
                <div>
                  <strong>{recording ? "正在采集对话" : "准备开始面试"}</strong>
                  <small>
                    {recording
                      ? `${Math.floor(elapsed / 60)
                          .toString()
                          .padStart(
                            2,
                            "0",
                          )}:${(elapsed % 60).toString().padStart(2, "0")} · 双路实时字幕，停顿后定稿`
                      : "开始前确认双方知情并允许使用辅助工具"}
                  </small>
                </div>
              </div>
              <div className="audio-meters">
                <div>
                  <Mic size={14} />
                  <span>{roleNames[micRole]}</span>
                  <Meter level={levels["麦克风"] || 0} />
                </div>
                <div>
                  <Volume2 size={14} />
                  <span>{roleNames[systemRole]}</span>
                  <Meter level={levels["会议声音"] || 0} />
                </div>
              </div>
              <div className="capture-actions">
                <button
                  className="icon-button"
                  aria-label="音频采集设置"
                  disabled={recording || starting || testingAudio}
                  onClick={() => {
                    setCaptureOptions((x) => !x);
                    navigator.mediaDevices
                      .enumerateDevices()
                      .then((d) =>
                        setDevices(d.filter((x) => x.kind === "audioinput")),
                      )
                      .catch(() => {});
                  }}
                >
                  <Settings2 size={17} />
                </button>
                <button
                  className={recording ? "stop-button" : "primary-button"}
                  disabled={starting || testingAudio}
                  onClick={recording ? stopCapture : startCapture}
                >
                  {starting ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : recording ? (
                    <Square size={13} />
                  ) : (
                    <Play size={14} />
                  )}{" "}
                  {starting
                    ? "正在连接音频"
                    : recording
                      ? "停止采集"
                      : "开始采集"}
                </button>
              </div>
            </div>
            {captureOptions && (
              <div className="capture-options">
                <label>
                  <input
                    type="checkbox"
                    checked={mic}
                    onChange={(e) => setMic(e.target.checked)}
                  />
                  麦克风
                  <select
                    value={micRole}
                    onChange={(e) => setMicRole(e.target.value as Role)}
                  >
                    {Object.entries(roleNames).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={system}
                    onChange={(e) => setSystem(e.target.checked)}
                  />
                  会议 / 系统音频
                  <select
                    value={systemRole}
                    onChange={(e) => setSystemRole(e.target.value as Role)}
                  >
                    {Object.entries(roleNames).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  麦克风设备
                  <select
                    value={micId}
                    onChange={(e) => setMicId(e.target.value)}
                  >
                    <option value="">系统默认</option>
                    {devices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `设备 ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  双路回声自动去重，保留各自的新发言；无法确认的重叠声音会保留。面对面访谈或多人混音可手动修正角色。
                </p>
                <MediaPermissions onTesting={setTestingAudio} />
              </div>
            )}
            {!window.desktop && (
              <div className="browser-note">
                当前为浏览器模式，真正的跨应用置顶和 Mac 系统音频请使用桌面版。
              </div>
            )}
            {audioErrors.length > 0 && (
              <div className="audio-errors">
                {audioErrors.map((e, i) => (
                  <div key={i}>
                    <span>片段转写失败：{e.message}</span>
                    <button
                      onClick={() => {
                        const [source, targetId] = e.chunk.source.split("|");
                        queueChunk(
                          { ...e.chunk, source },
                          targetId || session.id,
                        );
                        setAudioErrors((a) => a.filter((_, idx) => idx !== i));
                      }}
                    >
                      重试片段
                    </button>
                    <button
                      onClick={() => {
                        setAudioErrors((a) => a.filter((_, idx) => idx !== i));
                        setLiveDrafts((drafts) => {
                          const next = { ...drafts };
                          delete next[e.chunk.chunkId];
                          return next;
                        });
                      }}
                    >
                      丢弃
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="workspace-columns">
              <section className="conversation-panel">
                <div className="panel-title">
                  <h2>
                    <AudioLines size={17} />
                    实时对话
                  </h2>
                  <span>
                    {pendingAudio ? (
                      <>
                        <LoaderCircle className="spin" size={12} />
                        实时转写中
                      </>
                    ) : (
                      session.transcripts.length + " 条"
                    )}
                  </span>
                </div>
                <div className="live-caption-note">
                  自动回声去重 · {recording ? "边说边显示" : "保留双方真实发言"}
                  {!!deduplicated[session.id]?.length &&
                    ` · 已去重 ${deduplicated[session.id].length} 段`}
                </div>
                <div
                  className="transcript-scroll"
                  role="log"
                  aria-label="双方实时对话"
                  aria-live="polite"
                >
                  {transcriptRows.length ? (
                    transcriptRows.map(({ item: t, draft }) =>
                      draft ? (
                        <div
                          key={draft.chunkId}
                          className={`transcript-item live-transcript ${draft.role}`}
                          data-phase={draft.phase}
                        >
                          <div className="transcript-meta">
                            <span className="speaker-avatar">
                              {draft.role === "interviewer"
                                ? "面"
                                : draft.role === "candidate"
                                  ? "我"
                                  : "?"}
                            </span>
                            <strong>{roleNames[draft.role]}</strong>
                            <span>{time(draft.capturedAt)}</span>
                            <span className="live-caption-badge">
                              {draft.phase === "finalizing"
                                ? "正在定稿"
                                : draft.phase === "failed"
                                  ? "转写失败"
                                  : "正在说话"}
                            </span>
                          </div>
                          <p>
                            {draft.text ||
                              (draft.phase === "failed"
                                ? "未完成转写，请重试片段。"
                                : "正在识别声音…")}
                          </p>
                          <small>
                            {draft.source} · 临时字幕
                            {draft.error ? ` · ${draft.error}` : "，以定稿为准"}
                          </small>
                        </div>
                      ) : (
                        <TranscriptItem
                          key={t.id}
                          item={t}
                          onSave={(text, role) =>
                            guard(() =>
                              api(
                                `/sessions/${session.id}/transcripts/${t.id}`,
                                { text, role },
                                "PATCH",
                              ),
                            )
                          }
                        />
                      ),
                    )
                  ) : (
                    <div className="transcript-empty">
                      <div className="wave-illustration">
                        {[12, 22, 38, 27, 50, 34, 18, 42, 28, 14, 24, 8].map(
                          (h, i) => (
                            <i style={{ height: h }} key={i} />
                          ),
                        )}
                      </div>
                      <h3>
                        {recording ? "正在聆听双方对话" : "把对话留给现场"}
                      </h3>
                      <p>
                        {recording
                          ? "你和面试官的声音会分别显示为字幕，说话时持续更新。"
                          : "开启采集后，你和面试官的发言会在这里边说边显示。也可以手动输入或导入音频。"}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload size={14} />
                        导入音频片段
                      </button>
                    </div>
                  )}
                  <div ref={feedEnd} />
                </div>
                <div className="detect-status">
                  <span>
                    {detecting ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <Sparkles size={13} />
                    )}{" "}
                    {detecting
                      ? "Agent 正在识别新问题"
                      : session.detectionError
                        ? "问题识别失败"
                        : settings.autoDetect
                          ? "自动识别面试官问题"
                          : "手动识别模式"}
                  </span>
                  <button
                    role="switch"
                    aria-checked={settings.autoDetect}
                    aria-label="自动识别问题"
                    className={`toggle ${settings.autoDetect ? "on" : ""}`}
                    onClick={() =>
                      guard(async () => {
                        const s = await api<Settings>(
                          "/settings",
                          { autoDetect: !settings.autoDetect },
                          "PUT",
                        );
                        setState({ ...state, settings: s });
                      })
                    }
                  >
                    <i />
                  </button>
                </div>
                {session.detectionError && (
                  <div className="inline-error">
                    {session.detectionError}
                    <button
                      onClick={() =>
                        guard(() => api(`/sessions/${session.id}/detect`, {}))
                      }
                    >
                      重试识别
                    </button>
                  </div>
                )}
                <div className="entry-box">
                  <div className="entry-tabs">
                    <button
                      className={entryMode === "question" ? "active" : ""}
                      onClick={() => setEntryMode("question")}
                    >
                      直接提问
                    </button>
                    <button
                      className={entryMode === "transcript" ? "active" : ""}
                      onClick={() => setEntryMode("transcript")}
                    >
                      补充对话
                    </button>
                    <button
                      className="icon-button"
                      title="导入音频（按下方角色归属）"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={14} />
                    </button>
                  </div>
                  <textarea
                    aria-label="输入问题或对话"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      entryMode === "question"
                        ? "输入面试问题，Agent 将检索并复核…"
                        : "粘贴或修正刚刚听到的发言…"
                    }
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                        void submit();
                    }}
                  />
                  <div className="entry-footer">
                    {entryMode === "question" ? (
                      <select
                        aria-label="问题类型"
                        value={category}
                        onChange={(e) =>
                          setCategory(e.target.value as Category)
                        }
                      >
                        {Object.entries(categories).map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        aria-label="发言人"
                        value={entryRole}
                        onChange={(e) => setEntryRole(e.target.value as Role)}
                      >
                        {Object.entries(roleNames).map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      aria-label="发送"
                      className="send-button"
                      disabled={busy || !text.trim()}
                      onClick={() => submit()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                    </button>
                  </div>
                  <span className="entry-shortcut">
                    ⌘ Enter 发送 · 音频导入角色：{roleNames[entryRole]}
                  </span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importAudio(f);
                    e.target.value = "";
                  }}
                />
              </section>
              <section className="insight-panel">
                <div className="panel-title">
                  <h2>
                    <Layers3 size={17} />
                    回答提示{" "}
                    <span className="count">{session.jobs.length}</span>
                  </h2>
                  <div className="quality-label">
                    <ShieldCheck size={14} />
                    检索 · 复核
                  </div>
                </div>
                {session.jobs.length > 0 && (
                  <div className="question-tabs">
                    {session.jobs.map((j, i) => (
                      <button
                        title={j.question}
                        key={j.id}
                        className={j.id === job?.id ? "selected" : ""}
                        onClick={() => {
                          setSelectedJob(j.id);
                          setAutoFollow(false);
                        }}
                      >
                        <span className={`job-dot ${j.status}`} />
                        <span>Q{String(i + 1).padStart(2, "0")}</span>
                        {j.question.slice(0, 12)}
                        {j.question.length > 12 ? "…" : ""}
                      </button>
                    ))}
                    <button
                      className={`follow-button ${autoFollow ? "active" : ""}`}
                      onClick={() => {
                        setAutoFollow(true);
                        setSelectedJob(session.jobs.at(-1)?.id || "");
                      }}
                      title="跟随最新问题"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                )}
                <div className="insight-scroll">
                  {job ? (
                    <AnswerView
                      job={job}
                      onRetry={() => jobAction(job, "retry")}
                      onCancel={() => jobAction(job, "cancel")}
                    />
                  ) : (
                    <div className="insight-empty">
                      <div className="empty-kicker">
                        <span className="dot" />
                        READY WHEN YOU ARE
                      </div>
                      <h2>
                        好回答，
                        <br />
                        从问清问题开始。
                      </h2>
                      <p>
                        捕捉问题，寻找依据，检查边界。
                        <br />
                        把复杂的问题拆成你能讲清楚的要点。
                      </p>
                      <div className="process-line">
                        <span>
                          <span>01</span>识别问题
                        </span>
                        <i />
                        <span>
                          <span>02</span>检索依据
                        </span>
                        <i />
                        <span>
                          <span>03</span>复核提示
                        </span>
                      </div>
                      <div className="example-heading">
                        从一个问题开始 <span>真实 Agent 运行</span>
                      </div>
                      <div className="example-list">
                        {examples.map((e, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setText(e.text);
                              setCategory(e.category);
                              setEntryMode("question");
                            }}
                          >
                            <span className="example-icon">
                              {i === 0 ? (
                                <Layers3 size={18} />
                              ) : i === 1 ? (
                                <Activity size={18} />
                              ) : (
                                <UserRound size={18} />
                              )}
                            </span>
                            <div>
                              <strong>{e.text}</strong>
                              <small>{e.tag}</small>
                            </div>
                            <ArrowRight size={16} />
                          </button>
                        ))}
                      </div>
                      <div className="empty-note">
                        <ShieldCheck size={14} />
                        未确认的内容会明确标注，经历只来自你的资料。
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
function Meter({ level }: { level: number }) {
  return (
    <span className="meter">
      {Array.from({ length: 10 }, (_, i) => (
        <i
          key={i}
          className={level > i / 10 ? "lit" : ""}
          style={{ height: 5 + (i % 4) * 3 }}
        />
      ))}
    </span>
  );
}
function speechInfo({
  role,
  source,
  capturedAt,
  chunkId,
}: SpeechInfo): SpeechInfo {
  return { role, source, capturedAt, chunkId };
}
function TranscriptItem({
  item,
  onSave,
}: {
  item: Transcript;
  onSave: (text: string, role: Role) => Promise<any>;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(item.text),
    [role, setRole] = useState(item.role);
  return (
    <div className={`transcript-item ${item.role}`}>
      <div className="transcript-meta">
        <span className="speaker-avatar">
          {item.role === "interviewer"
            ? "面"
            : item.role === "candidate"
              ? "我"
              : "?"}
        </span>
        <strong>{roleNames[item.role]}</strong>
        <span>{time(item.capturedAt || item.createdAt)}</span>
        <button
          onClick={() => {
            setText(item.text);
            setRole(item.role);
            setEditing((v) => !v);
          }}
        >
          {editing ? "取消" : "修正"}
        </button>
      </div>
      {editing ? (
        <div className="transcript-edit">
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
          <div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {Object.entries(roleNames).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                await onSave(text, role);
                setEditing(false);
              }}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <p>{item.text}</p>
      )}
      <small>{item.source}</small>
    </div>
  );
}

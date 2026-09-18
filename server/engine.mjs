import { randomUUID } from "node:crypto";
import {
  Extract,
  Answer,
  Review,
  normalizeQuestion,
  gateAnswer,
} from "./schemas.mjs";
import { runModel } from "./provider.mjs";
import { extractPrompt, researchPrompt, reviewPrompt } from "./prompts.mjs";
const activeStatuses = ["queued", "researching", "reviewing"];
export class Engine {
  constructor(store, publish, model = runModel) {
    this.store = store;
    this.publish = publish;
    this.model = model;
    this.queue = [];
    this.running = false;
    this.controllers = new Map();
    this.detections = new Map();
    this.timers = new Map();
    this.stopped = false;
  }
  changed(session) {
    this.store.save();
    this.publish({
      type: session.id === this.store.library?.id ? "library" : "session",
      session,
    });
  }
  addTranscript(session, data) {
    if (
      data.chunkId &&
      session.transcripts.some((t) => t.chunkId === data.chunkId)
    )
      return session;
    session.transcripts.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...data,
    });
    session.transcripts.sort((a, b) =>
      (a.capturedAt || a.createdAt).localeCompare(b.capturedAt || b.createdAt),
    );
    this.changed(session);
    if (data.role === "interviewer" && this.store.settings.autoDetect)
      this.scheduleDetection(session);
    return session;
  }
  scheduleDetection(session) {
    clearTimeout(this.timers.get(session.id));
    this.timers.set(
      session.id,
      setTimeout(() => {
        this.timers.delete(session.id);
        this.detect(session);
      }, 1800),
    );
  }
  async detect(session) {
    if (this.stopped) return;
    if (this.detections.has(session.id)) {
      this.scheduleDetection(session);
      return;
    }
    const pending = session.transcripts.filter(
      (t) => t.role === "interviewer" && !session.detectedIds.includes(t.id),
    );
    if (!pending.length) return;
    const ctl = new AbortController();
    this.detections.set(session.id, ctl);
    session.detectionError = null;
    this.publish({ type: "detecting", sessionId: session.id, active: true });
    try {
      const settings = { ...this.store.settings };
      const result = await this.model({
        settings,
        prompt: extractPrompt(
          session,
          session.transcripts.slice(-35),
          settings,
        ),
        schema: Extract,
        search: false,
        signal: ctl.signal,
      });
      if (ctl.signal.aborted) return;
      const valid = new Set(
        session.transcripts
          .filter((t) => t.role === "interviewer")
          .map((t) => t.id),
      );
      for (const q of result.value.questions.slice(0, 6))
        if (
          q.transcriptIds.length &&
          q.transcriptIds.every((id) => valid.has(id)) &&
          q.transcriptIds.some((id) => pending.some((t) => t.id === id))
        )
          this.enqueue(session, q);
      session.detectedIds = [
        ...new Set([...session.detectedIds, ...pending.map((t) => t.id)]),
      ];
      session.pendingFragment = result.value.pendingFragment;
      this.changed(session);
    } catch (error) {
      if (!ctl.signal.aborted) {
        session.detectionError = error.message;
        this.changed(session);
      }
    } finally {
      this.detections.delete(session.id);
      this.publish({ type: "detecting", sessionId: session.id, active: false });
    }
  }
  enqueue(session, { question, category = "technical", transcriptIds = [] }) {
    const normalized = normalizeQuestion(question);
    const contextKey =
      session.id === this.store.library?.id
        ? this.store.libraryKey()
        : undefined;
    const duplicate = session.jobs.find(
      (j) =>
        normalizeQuestion(j.question) === normalized &&
        (!contextKey || j.contextKey === contextKey),
    );
    if (duplicate) return duplicate;
    const job = {
      id: randomUUID(),
      ...(contextKey ? { contextKey } : {}),
      question,
      category,
      transcriptIds,
      status: "queued",
      createdAt: new Date().toISOString(),
      events: [],
      answer: null,
      error: null,
    };
    session.jobs.push(job);
    this.queue.push({ session, job, settings: { ...this.store.settings } });
    this.changed(session);
    void this.drain();
    return job;
  }
  event(session, job, stage, message) {
    job.events.push({ at: new Date().toISOString(), stage, message });
    if (job.events.length > 70) job.events.shift();
    this.changed(session);
  }
  async drain() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.queue.length && !this.stopped) {
        const { session, job, settings } = this.queue.shift();
        if (job.status !== "queued") continue;
        await this.execute(session, job, settings);
      }
    } finally {
      this.running = false;
    }
  }
  async execute(session, job, settings) {
    const ctl = new AbortController();
    this.controllers.set(job.id, ctl);
    try {
      job.status = "researching";
      job.startedAt = new Date().toISOString();
      this.event(session, job, "research", "正在分析问题并检索原始资料");
      const draft = await this.model({
        settings,
        prompt: researchPrompt(job, session, settings),
        schema: Answer,
        search: job.category !== "experience",
        signal: ctl.signal,
        onActivity: (message) => this.event(session, job, "research", message),
      });
      if (ctl.signal.aborted) return;
      job.clarifications = draft.value.assumptions;
      job.status = "reviewing";
      this.event(
        session,
        job,
        "review",
        "草稿已生成，正在独立复核边界、反例与引用",
      );
      const review = await this.model({
        settings,
        prompt: reviewPrompt(job, draft.value, settings),
        schema: Review,
        search: job.category !== "experience",
        signal: ctl.signal,
        onActivity: (message) => this.event(session, job, "review", message),
      });
      if (ctl.signal.aborted) return;
      const answer = gateAnswer(review.value.answer, {
        searched: draft.evidence.searched || review.evidence.searched,
        openedUrls: [
          ...draft.evidence.openedUrls,
          ...review.evidence.openedUrls,
        ],
        profile: settings.profile,
      });
      if (job.category === "experience") {
        answer.evidenceNotes = answer.evidenceNotes.filter(
          (x) => !x.includes("本轮没有观察到联网检索"),
        );
        if (!settings.profile.trim())
          answer.evidenceNotes.push(
            "缺少个人经历资料，请先补充真实项目、职责和结果。",
          );
      }
      job.answer = answer;
      job.reviewIssues = review.value.issues;
      job.verdict = review.value.verdict;
      job.status =
        review.value.verdict === "insufficient" || answer.evidenceNotes.length
          ? "needs_context"
          : "completed";
      job.completedAt = new Date().toISOString();
      this.event(
        session,
        job,
        "done",
        job.status === "completed"
          ? "已完成检索与复核"
          : "已给出有限提示，仍有待确认信息",
      );
    } catch (error) {
      if (!ctl.signal.aborted) {
        job.status = "failed";
        job.error = error.message;
        this.event(session, job, "error", error.message);
      }
    } finally {
      this.controllers.delete(job.id);
      this.changed(session);
    }
  }
  cancel(session, job) {
    this.controllers.get(job.id)?.abort();
    job.status = "cancelled";
    this.event(session, job, "cancel", "已取消");
  }
  retry(session, job) {
    if (activeStatuses.includes(job.status)) return;
    job.status = "queued";
    job.error = null;
    job.answer = null;
    job.events = [];
    if (session.id === this.store.library?.id)
      job.contextKey = this.store.libraryKey();
    this.queue.push({ session, job, settings: { ...this.store.settings } });
    this.changed(session);
    void this.drain();
  }
  close() {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    for (const c of [...this.controllers.values(), ...this.detections.values()])
      c.abort();
  }
}

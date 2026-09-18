import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Job } from "./types";
export const statuses: Record<Job["status"], string> = {
  queued: "排队中",
  researching: "检索资料",
  reviewing: "独立复核",
  completed: "复核完成",
  needs_context: "待确认",
  failed: "处理失败",
  cancelled: "已取消",
};
export const categories = {
  technical: "技术原理",
  scenario: "业务场景",
  experience: "个人经历",
  general: "综合问题",
};
export function AnswerView({
  job,
  compact = false,
  hideQuestion = false,
  visual,
  summary,
  onRetry,
  onCancel,
}: {
  job: Job;
  compact?: boolean;
  hideQuestion?: boolean;
  visual?: ReactNode;
  summary?: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const a = job.answer,
    working = ["queued", "researching", "reviewing"].includes(job.status);
  const [expanded, setExpanded] = useState<number | null>(null);
  useEffect(() => setExpanded(null), [job.id]);
  return (
    <article className={`answer-view ${compact ? "compact" : ""}`}>
      <div className="answer-meta">
        <span className="eyebrow">{categories[job.category]}</span>
        <span className={`badge ${job.status}`}>
          <span className="dot" />
          {statuses[job.status]}
        </span>
      </div>
      {!hideQuestion && <h2>{job.question}</h2>}
      {working && (
        <div className="working-box">
          <LoaderCircle className="spin" size={22} />
          <div>
            <strong>
              {job.status === "reviewing"
                ? "正在核对关键结论"
                : "正在查找可靠依据"}
            </strong>
            <p>{job.events.at(-1)?.message || "等待前一问题完成"}</p>
          </div>
          <button
            className="icon-button"
            aria-label="取消任务"
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {working && !!job.clarifications?.length && (
        <div className="clarify">
          <strong>等待复核时，可以先澄清</strong>
          <p>{job.clarifications.join(" · ")}</p>
        </div>
      )}
      {job.error && (
        <div className="error-box">
          <TriangleAlert size={20} />
          <div>
            <strong>这次没有生成可用提示</strong>
            <p>{job.error}</p>
            <button className="text-button" onClick={onRetry}>
              <RotateCcw size={14} />
              重新运行
            </button>
          </div>
        </div>
      )}
      {job.status === "cancelled" && (
        <button className="text-button" onClick={onRetry}>
          <RotateCcw size={14} />
          重新运行此问题
        </button>
      )}
      {a && (
        <>
          <section className="lead-answer">
            <div className="section-label">
              <span className="dot" />
              {summary ? "表达主线" : "一句话摘要"} <span>先说结论</span>
            </div>
            <h3>{summary || a.headline}</h3>
          </section>
          <div className="answer-cue-nav" aria-label="快速定位回答要点">
            {a.points.slice(0, 3).map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setExpanded(i);
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`${job.id}-point-${i}`)
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      }),
                  );
                }}
              >
                <span>{i + 1}</span>
                {p.title}
              </button>
            ))}
          </div>
          {visual ||
            (!!a.points.length && (
              <figure className="answer-speaking-flow">
                <figcaption>表达顺序</figcaption>
                <ol>
                  {a.points.slice(0, 4).map((p, i) => (
                    <li key={i}>
                      <span>{i + 1}</span>
                      {p.title}
                    </li>
                  ))}
                </ol>
              </figure>
            ))}
          <details className="spoken-answer">
            <summary>
              30–60 秒参考说法
              <ChevronDown size={15} />
            </summary>
            <p>{a.shortAnswer}</p>
          </details>
          {a.assumptions.length > 0 && (
            <div className="clarify">
              <strong>先确认边界</strong>
              <p>{a.assumptions.join(" · ")}</p>
            </div>
          )}
          <section className="answer-points">
            <h4>
              展开讲清楚 <span>{String(a.points.length).padStart(2, "0")}</span>
            </h4>
            {a.points.map((p, i) => (
              <details
                className="answer-point"
                key={i}
                id={`${job.id}-point-${i}`}
                open={expanded === i}
              >
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    setExpanded(expanded === i ? null : i);
                  }}
                >
                  <span className="point-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>
                    {p.title}
                    <small>
                      {p.kind === "fact"
                        ? "资料依据"
                        : p.kind === "design"
                          ? "设计建议"
                          : "经历依据"}
                    </small>
                  </h3>
                  <ChevronDown size={14} />
                </summary>
                <div>
                  <p>{p.detail}</p>
                  {p.sourceIds.length > 0 && (
                    <div className="source-tags">
                      {p.sourceIds.map((id) => {
                        const source = a.sources.find((s) => s.id === id);
                        return source ? (
                          <a
                            key={id}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {id}
                            <ArrowUpRight size={11} />
                          </a>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </section>
          {a.pitfalls.length > 0 && (
            <section className="pitfalls">
              <div className="section-label">
                <TriangleAlert size={15} />
                不要混淆
              </div>
              <ul>
                {a.pitfalls.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          )}
          {(a.unknowns.length > 0 || a.evidenceNotes.length > 0) && (
            <section className="unresolved">
              <div className="section-label">仍需确认</div>
              <ul>
                {[...a.unknowns, ...a.evidenceNotes].map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          )}
          {a.followUps.length > 0 && (
            <section className="followups">
              <h4>可能的追问</h4>
              {a.followUps.map((q, i) => (
                <p key={i}>
                  <span>↳</span>
                  {q}
                </p>
              ))}
            </section>
          )}
          <details className="sources">
            <summary>
              <BookOpen size={15} />
              证据来源 <span>{a.sources.length}</span>
              <ChevronDown size={15} />
            </summary>
            {!a.sources.length && <p className="muted">没有可引用的外部来源</p>}
            {a.sources.map((s) => (
              <a
                className="source-row"
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>{s.id}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.supports}</p>
                  <small>
                    {new URL(s.url).hostname} ·{" "}
                    {s.opened ? "本轮已调用来源" : "来源访问未确认"}
                  </small>
                </div>
                <ArrowUpRight size={15} />
              </a>
            ))}
          </details>
          {job.reviewIssues?.length ? (
            <details className="review-notes">
              <summary>
                <ShieldCheck size={15} />
                复核修正记录 <ChevronDown size={15} />
              </summary>
              <ul>
                {job.reviewIssues.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="answer-footer">
            <ShieldCheck size={14} />
            经过 Agent 复核 · 请结合实际约束判断
            <button title="重新检索" className="icon-button" onClick={onRetry}>
              <RotateCcw size={14} />
            </button>
          </div>
        </>
      )}
      {!compact && job.events.length > 0 && (
        <details className="agent-log" open={working}>
          <summary>
            <Clock3 size={14} />
            Agent 活动 <ChevronDown size={14} />
          </summary>
          <div>
            {job.events.slice(-12).map((e, i) => (
              <p key={i}>
                <time>
                  {new Date(e.at).toLocaleTimeString("zh-CN", {
                    hour12: false,
                  })}
                </time>
                {e.stage === "done" ? (
                  <Check size={12} />
                ) : (
                  <span className="mini-dot" />
                )}
                <span>{e.message}</span>
              </p>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

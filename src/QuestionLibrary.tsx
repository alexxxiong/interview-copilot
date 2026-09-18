import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpenText,
  ChevronDown,
  Layers3,
  LoaderCircle,
  Grid2X2,
  ExternalLink,
  PanelTop,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { Job, Session } from "./types";
import { AnswerView, statuses } from "./AnswerView";
import {
  cardJob,
  cardMatches,
  profileExcerpt,
  questionCards,
  type QuestionCard,
} from "./question-cards";

export function interviewCards(session: Session): QuestionCard[] {
  return session.jobs.map((j) => ({
    id: "live-" + j.id,
    title: j.question,
    question: j.question,
    category: j.category,
    topic: "本次面试",
    summary:
      j.answer?.headline || "本次对话中提出的问题，点开查看处理进度与提示。",
    tags: [],
    cues: [],
    diagram: { title: "表达顺序", nodes: [], note: "" },
    liveJob: j,
  }));
}

export function ConceptDiagram({
  diagram,
}: {
  diagram: QuestionCard["diagram"];
}) {
  if (!diagram.nodes.length) return null;
  return (
    <figure className="concept-diagram" aria-label={diagram.title}>
      <figcaption>
        <Layers3 size={15} />
        {diagram.title}
        <span>跟着图讲</span>
      </figcaption>
      <ol>
        {diagram.nodes.map(([title, detail], i) => (
          <li key={i}>
            <span className="diagram-index">
              {String(i + 1).padStart(2, "0")}
            </span>
            <strong>{title}</strong>
            <small>{detail}</small>
            {i < diagram.nodes.length - 1 && (
              <ArrowRight
                className="diagram-arrow"
                size={18}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
      <p>{diagram.note}</p>
    </figure>
  );
}

export function StudyCardDetail({
  card,
  job,
  profile,
  compact = false,
  preparing = false,
  onPrepare,
  onAction,
  onPin,
}: {
  card: QuestionCard;
  job?: Job;
  profile: string;
  compact?: boolean;
  preparing?: boolean;
  onPrepare: () => void;
  onAction: (job: Job, action: "retry" | "cancel") => void;
  onPin?: () => void;
}) {
  const excerpt = profileExcerpt(profile, card.profileHeading);
  return (
    <article className={`study-detail ${compact ? "study-compact" : ""}`}>
      <header className="study-detail-heading">
        <div className="study-kicker">
          <span>{card.topic}</span>
          <span>
            {job
              ? statuses[job.status]
              : card.prepared
                ? "已有口述草稿"
                : "表达提纲"}
          </span>
        </div>
        <h2>{card.title}</h2>
        <p>{card.question}</p>
        <div className="study-detail-actions">
          {onPin && (
            <button className="text-button" onClick={onPin}>
              <PanelTop size={14} />
              置顶这张卡
            </button>
          )}
          {!job && (
            <button
              className="text-button"
              onClick={onPrepare}
              disabled={preparing}
            >
              {preparing ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {card.prepared ? "结合最新资料检索复核" : "准备详细解答"}
            </button>
          )}
        </div>
      </header>
      {card.prepared && (
        <section className="prepared-answer" aria-label="预置口述草稿">
          <div className="quick-summary">
            <span>开口先说这一句</span>
            <h3>{card.prepared.opener}</h3>
          </div>
          <div className="prepared-script">
            <span>
              {card.prepared.process
                ? "30–60 秒参考说法 · 方案设计"
                : "30–60 秒参考说法"}
            </span>
            <p>{card.prepared.answer}</p>
          </div>
          <p className="prepared-provenance">
            {card.prepared.process
              ? "技术过程按最佳实践编写，可按“我会这样设计”展开；个人职责和项目成绩以真实经历为准。"
              : "通用表达练习模板；【方括号】需用本人真实经历补充。"}
          </p>
          <ConceptDiagram diagram={card.diagram} />
          {card.prepared.process && (
            <details className="prepared-process" open={!compact}>
              <summary>
                技术过程 · {card.prepared.process.length} 步
                <ChevronDown size={14} />
              </summary>
              <ol>
                {card.prepared.process.map(([title, detail]) => (
                  <li key={title}>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <div className="prepared-followups" aria-label="追问与接法">
            <h3>追问来了，怎么接</h3>
            {card.prepared.followUps.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={14} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <details className="prepared-confirm">
            <summary>
              面试前补齐 {card.prepared.confirm.length} 项事实
              <ChevronDown size={14} />
            </summary>
            <ul>
              {card.prepared.confirm.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{card.prepared.avoid}</p>
          </details>
        </section>
      )}
      {!job?.answer && !card.prepared && (
        <div className="study-outline">
          <div className="quick-summary">
            <span>先抓住这一句</span>
            <h3>{card.summary}</h3>
          </div>
          {!!card.cues.length && (
            <section className="speaking-cues" aria-label="三个表达要点">
              {card.cues.map(([title, detail], i) => (
                <div key={title}>
                  <span>{i + 1}</span>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              ))}
            </section>
          )}
          <ConceptDiagram diagram={card.diagram} />
          {!job && (
            <p className="study-pending-note">
              <Sparkles size={14} />
              这是备考提纲。详细答案由 Agent 检索并复核后显示。
            </p>
          )}
        </div>
      )}
      {job && (
        <AnswerView
          job={job}
          compact={compact}
          hideQuestion
          summary={card.liveJob ? undefined : card.summary}
          visual={
            card.diagram.nodes.length ? (
              <ConceptDiagram diagram={card.diagram} />
            ) : undefined
          }
          onRetry={() => onAction(job, "retry")}
          onCancel={() => onAction(job, "cancel")}
        />
      )}
      {excerpt && (
        <details className="study-reference">
          <summary>
            <BookOpenText size={15} />
            我的相关经历原文
            <ChevronDown size={14} />
          </summary>
          <p>{excerpt}</p>
          <small>
            来自已保存的个人经历资料；与简历、本人最新说明核对后使用。
          </small>
        </details>
      )}
      {!!card.sources?.length && (
        <details className="study-reference">
          <summary>
            <BookOpenText size={15} />
            延伸阅读
            <ChevronDown size={14} />
          </summary>
          {card.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              {s.title}
              <ArrowUpRight size={14} />
            </a>
          ))}
        </details>
      )}
    </article>
  );
}

export default function QuestionLibrary({
  session,
  library,
  profile,
  onPrepare,
  onAction,
  onPin,
  onOpen,
  onTile,
}: {
  session: Session;
  library?: Session & { contextKey: string };
  profile: string;
  onPrepare: (card: QuestionCard) => Promise<void>;
  onAction: (card: QuestionCard, job: Job, action: "retry" | "cancel") => void;
  onPin: (id: string) => void;
  onOpen: (card: QuestionCard) => void;
  onTile?: () => void;
}) {
  const cards = useMemo(
    () => [...questionCards, ...interviewCards(session)],
    [session.jobs],
  );
  const [query, setQuery] = useState(""),
    [topic, setTopic] = useState("预置解答"),
    [selected, setSelected] = useState(questionCards[0].id),
    [onlySaved, setOnlySaved] = useState(false),
    [preparing, setPreparing] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>(() => {
      try {
        const v = JSON.parse(
          localStorage.getItem("savedQuestionCards") || "[]",
        );
        return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
      } catch {
        return [];
      }
    });
  const search = useRef<HTMLInputElement>(null),
    detail = useRef<HTMLDivElement>(null);
  const jobFor = (c: QuestionCard) =>
    cardJob(c, library?.jobs || [], library?.contextKey);
  const topics = [
    "预置解答",
    "全部问题",
    ...new Set(cards.map((c) => c.topic)),
  ];
  const filtered = cards.filter(
    (c) =>
      (topic === "全部问题" ||
        (topic === "预置解答" ? !!c.prepared : c.topic === topic)) &&
      (!onlySaved || saved.includes(c.id)) &&
      cardMatches(c, query),
  );
  const card = cards.find((c) => c.id === selected) || cards[0];
  const ready = cards.filter((c) =>
    ["completed", "needs_context"].includes(jobFor(c)?.status || ""),
  ).length;
  const preparedCount = cards.filter((c) => c.prepared).length;
  useEffect(() => {
    detail.current?.scrollTo({ top: 0 });
  }, [selected]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === search.current) {
        setQuery("");
        search.current?.blur();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const prepare = async (c: QuestionCard) => {
    if (preparing.includes(c.id) || jobFor(c)) return;
    setPreparing((ids) => [...ids, c.id]);
    try {
      await onPrepare(c);
    } finally {
      setPreparing((ids) => ids.filter((id) => id !== c.id));
    }
  };
  const choose = (c: QuestionCard) => {
    setSelected(c.id);
    onOpen(c);
    if (!c.prepared) void prepare(c);
  };
  const bookmark = (id: string) => {
    const next = saved.includes(id)
      ? saved.filter((v) => v !== id)
      : [...saved, id];
    setSaved(next);
    localStorage.setItem("savedQuestionCards", JSON.stringify(next));
  };
  return (
    <section className="question-library">
      <header className="library-heading">
        <div>
          <span className="eyebrow">QUESTION FIELDNOTES</span>
          <h1>先抓主线，再展开讲。</h1>
          <p>
            先讲业务问题，再讲我的贡献和结果。预置稿点开即读，追问逐层展开。
          </p>
        </div>
        <div className="library-ready">
          <strong>{String(preparedCount).padStart(2, "0")}</strong>
          <span>
            份预置口述草稿
            <br />共 {cards.length} 张问题卡
            <br />
            {ready} 份 Agent 解答
          </span>
        </div>
      </header>
      <div className="library-body">
        <div className="library-catalog">
          <div className="card-search">
            <Search size={17} />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜问题、关键词，如：撤单 / RAG"
              aria-label="搜索问题卡片"
            />
            {query ? (
              <button aria-label="清空搜索" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>
          <div className="card-topics" aria-label="问题分类">
            {topics.map((t) => (
              <button
                key={t}
                aria-pressed={topic === t}
                className={topic === t ? "active" : ""}
                onClick={() => setTopic(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="catalog-tools">
            <span>{filtered.length} 张卡片</span>
            {onTile && (
              <button onClick={onTile}>
                <Grid2X2 size={13} />
                平铺卡片
              </button>
            )}
            <button
              aria-pressed={onlySaved}
              className={onlySaved ? "active" : ""}
              onClick={() => setOnlySaved((x) => !x)}
            >
              <Bookmark size={13} />
              只看收藏
            </button>
          </div>
          <div className="question-card-grid" aria-label="问题卡片列表">
            {filtered.map((c) => {
              const j = jobFor(c);
              return (
                <div
                  key={c.id}
                  className={`question-card ${selected === c.id ? "selected" : ""}`}
                >
                  <button
                    className="question-card-open"
                    onClick={() => choose(c)}
                    aria-pressed={selected === c.id}
                    aria-label={`打开卡片：${c.title}`}
                  >
                    <span className="card-category">
                      {c.topic}
                      <ExternalLink size={14} />
                    </span>
                    <h3>{c.title}</h3>
                    <p>{c.summary}</p>
                    <div className="card-tags">
                      {c.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <span
                      className={`card-status ${j?.status || "unprepared"}`}
                    >
                      <span className="dot" />
                      {j
                        ? statuses[j.status]
                        : preparing.includes(c.id)
                          ? "准备中"
                          : c.prepared
                            ? "点开即读 · 口述草稿"
                            : "点开准备 · 表达提纲"}
                    </span>
                  </button>
                  <button
                    className={`card-bookmark ${saved.includes(c.id) ? "active" : ""}`}
                    aria-label={`${saved.includes(c.id) ? "取消收藏" : "收藏"}：${c.title}`}
                    onClick={() => bookmark(c.id)}
                  >
                    <Bookmark
                      size={15}
                      fill={saved.includes(c.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              );
            })}
            {!filtered.length && (
              <div className="cards-empty">
                <Search size={24} />
                <h3>没有找到匹配的问题</h3>
                <p>
                  {onlySaved
                    ? "先收藏常用卡片，或关闭收藏筛选。"
                    : "换个关键词，或查看全部分类。"}
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setTopic("全部问题");
                    setOnlySaved(false);
                  }}
                >
                  显示全部问题
                </button>
              </div>
            )}
          </div>
          <p className="catalog-footnote">
            点击卡片在新窗口打开，可同时查看多张；支持各自置顶和平铺。
          </p>
        </div>
        <div
          className="library-detail-scroll"
          ref={detail}
          aria-label="问题卡片详情"
        >
          <StudyCardDetail
            key={card.id}
            card={card}
            job={jobFor(card)}
            profile={profile}
            preparing={preparing.includes(card.id)}
            onPrepare={() => void prepare(card)}
            onAction={(j, action) => onAction(card, j, action)}
            onPin={() => onPin(card.id)}
          />
        </div>
      </div>
    </section>
  );
}

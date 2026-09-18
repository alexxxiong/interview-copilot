import { useState } from "react";
import { BookOpenText, Grid2X2, Pin, PinOff } from "lucide-react";
import { StudyCardDetail } from "./QuestionLibrary";
import type { QuestionCard } from "./question-cards";
import type { Job } from "./types";

export default function CardWindow({
  card,
  job,
  profile,
  connected,
  error,
  onPrepare,
  onAction,
}: {
  card?: QuestionCard;
  job?: Job;
  profile: string;
  connected: boolean;
  error: string;
  onPrepare: () => Promise<void>;
  onAction: (job: Job, action: "retry" | "cancel") => void;
}) {
  const [pinned, setPinned] = useState(false),
    [fontSize, setFontSize] = useState(16),
    [preparing, setPreparing] = useState(false),
    [windowError, setWindowError] = useState("");
  const control = async (fn: () => Promise<unknown>) => {
    try {
      setWindowError("");
      await fn();
    } catch (e) {
      setWindowError((e as Error).message);
    }
  };
  return (
    <div className="overlay-app card-window" style={{ fontSize }}>
      <header className="overlay-title">
        <div>
          <BookOpenText size={16} />
          <strong>问题卡片</strong>
          <span className={`connection-dot ${connected ? "online" : ""}`} />
        </div>
        <div>
          {window.desktop && (
            <button
              className="icon-button"
              title={pinned ? "取消本窗口置顶" : "置顶本窗口"}
              onClick={() =>
                void control(async () =>
                  setPinned(await window.desktop!.pinCard(!pinned)),
                )
              }
            >
              {pinned ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
          )}
        </div>
      </header>
      <div className="overlay-controls">
        <span>{pinned ? "已置顶 · 独立阅读" : "独立阅读 · 可拖动并排"}</span>
        <div>
          {window.desktop && (
            <button
              onClick={() => void control(() => window.desktop!.tileCards())}
            >
              <Grid2X2 size={13} />
              平铺卡片
            </button>
          )}
          <button
            aria-label="缩小卡片文字"
            onClick={() => setFontSize((n) => Math.max(13, n - 1))}
          >
            A−
          </button>
          <button
            aria-label="放大卡片文字"
            onClick={() => setFontSize((n) => Math.min(24, n + 1))}
          >
            A+
          </button>
        </div>
      </div>
      {(error || windowError) && (
        <p className="card-window-error" role="alert">
          {error || windowError}
        </p>
      )}
      <main className="overlay-scroll">
        {card ? (
          <StudyCardDetail
            card={card}
            job={job}
            profile={profile}
            compact
            preparing={preparing}
            onPrepare={() => {
              setPreparing(true);
              void onPrepare().finally(() => setPreparing(false));
            }}
            onAction={onAction}
          />
        ) : (
          <div className="overlay-empty">
            <h2>这张卡片已不可用</h2>
            <p>请回主窗口重新打开对应会话中的卡片。</p>
          </div>
        )}
      </main>
      <footer>各窗口独立阅读 · Agent 结果自动同步</footer>
    </div>
  );
}

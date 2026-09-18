import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { Store } from "../server/store.mjs";
import { Engine } from "../server/engine.mjs";
const prepCode = ts.transpileModule(
  await readFile(new URL("../src/interview-prep.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
const prepUrl =
  "data:text/javascript;base64," + Buffer.from(prepCode).toString("base64");
const code = ts.transpileModule(
  await readFile(new URL("../src/question-cards.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
const { questionCards, cardMatches, cardJob, profileExcerpt } = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      code.replace('"./interview-prep"', JSON.stringify(prepUrl)),
    ).toString("base64")
);

test("library cache is persisted separately, deduplicates only matching profile and recovers interrupted work", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "interview-library-"));
  const store = new Store(dir),
    events = [];
  const engine = new Engine(store, (e) => events.push(e));
  // Keep the queue pending without calling a live model.
  engine.stopped = true;
  try {
    store.saveSettings({ profile: "经历 A" });
    const first = engine.enqueue(store.library, {
      question: "如何保证一致性？",
    });
    assert.equal(
      engine.enqueue(store.library, { question: "如何保证一致性" }).id,
      first.id,
    );
    assert.equal(store.sessions.length, 1);
    assert.equal(store.sessions[0].jobs.length, 0);
    assert.ok(events.every((e) => e.type === "library"));
    store.saveSettings({ profile: "经历 B" });
    const next = engine.enqueue(store.library, { question: first.question });
    assert.notEqual(next.id, first.id);
    assert.notEqual(next.contextKey, first.contextKey);
    assert.equal(next.contextKey, store.publicLibrary().contextKey);
    const reread = new Store(dir);
    assert.equal(reread.get("question-library").jobs.length, 2);
    assert.ok(
      reread.library.jobs.every(
        (j) => j.status === "failed" && j.error.includes("尚未完成"),
      ),
    );
    assert.equal(reread.sessions[0].jobs.length, 0);
  } finally {
    engine.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("card search matches keywords and multiple terms, without confusing unrelated cards", () => {
  const p99 = questionCards.find((c) => c.id === "p99");
  assert.ok(cardMatches(p99, "c++ P99"));
  assert.ok(cardMatches(p99, "  抖动  "));
  assert.equal(cardMatches(p99, "RAG"), false);
  assert.ok(questionCards.some((c) => cardMatches(c, "撤单")));
});

test("card cache never presents an old profile result as current, while live jobs retain their own context", () => {
  const card = questionCards[0];
  const old = { id: "old", question: card.question, contextKey: "A" };
  const current = { id: "new", question: card.question, contextKey: "B" };
  assert.equal(cardJob(card, [old], "B"), undefined);
  assert.equal(cardJob(card, [old, current], "B"), current);
  assert.equal(cardJob({ ...card, liveJob: old }, [current], "B"), old);
});

test("experience excerpts stop at section boundary and missing facts remain absent", () => {
  const profile = "# 我的资料\n## 项目一\n真实职责\n## 项目二\n其他经历";
  assert.equal(profileExcerpt(profile, "## 项目一"), "真实职责");
  assert.equal(profileExcerpt(profile, "## 不存在"), "");
  assert.equal(profileExcerpt(profile), "");
});

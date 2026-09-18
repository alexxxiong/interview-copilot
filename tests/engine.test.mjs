import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { Engine } from "../server/engine.mjs";
import { gateAnswer, Answer, Review, Extract } from "../server/schemas.mjs";
import { collectEvidence, safeEndpoint } from "../server/provider.mjs";
const answer = {
  headline: "边界",
  shortAnswer: "先确认一致性范围。",
  assumptions: [],
  points: [
    { title: "事务", detail: "数据库范围", kind: "fact", sourceIds: ["S1"] },
  ],
  pitfalls: [],
  followUps: [],
  unknowns: [],
  sources: [
    {
      id: "S1",
      title: "Postgres",
      url: "https://www.postgresql.org/docs/current/transaction-iso.html",
      supports: "事务隔离",
    },
  ],
  experienceUsed: [],
};
const evidence = {
  searched: true,
  openedUrls: answer.sources.map((s) => s.url),
};
async function fixture(model) {
  const dir = await mkdtemp(path.join(tmpdir(), "interview-test-"));
  const store = new Store(dir);
  store.settings.autoDetect = false;
  const engine = new Engine(store, () => {}, model);
  return {
    store,
    engine,
    session: store.sessions[0],
    cleanup: async () => {
      engine.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
async function settle(job) {
  const start = Date.now();
  while (["queued", "researching", "reviewing"].includes(job.status)) {
    if (Date.now() - start > 3000) throw Error("test timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
test("model failure persists failed and never manufactures an answer", async () => {
  const f = await fixture(async () => {
    throw Error("rate limited");
  });
  try {
    const j = f.engine.enqueue(f.session, { question: "测试问题" });
    await settle(j);
    assert.equal(j.status, "failed");
    assert.equal(j.answer, null);
    assert.equal(j.error, "rate limited");
    const reread = new Store(f.store.dir);
    assert.equal(reread.sessions[0].jobs[0].status, "failed");
  } finally {
    await f.cleanup();
  }
});
test("draft is withheld until independent review finishes", async () => {
  let finish;
  const f = await fixture(async ({ schema }) =>
    schema === Answer
      ? { value: answer, evidence }
      : new Promise((r) => {
          finish = () =>
            r({
              value: { verdict: "revise", issues: ["修正术语"], answer },
              evidence,
            });
        }),
  );
  try {
    const j = f.engine.enqueue(f.session, { question: "一致性如何保证" });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(j.status, "reviewing");
    assert.equal(j.answer, null);
    finish();
    await settle(j);
    assert.equal(j.status, "completed");
    assert.deepEqual(j.reviewIssues, ["修正术语"]);
  } finally {
    await f.cleanup();
  }
});
test("invalid provenance is visible and prevents completed status", () => {
  const out = gateAnswer(
    {
      ...answer,
      experienceUsed: ["虚构结果"],
      sources: [
        ...answer.sources,
        { id: "bad", title: "x", url: "javascript:alert(1)", supports: "x" },
      ],
    },
    { profile: "" },
  );
  assert.equal(out.sources.length, 1);
  assert.equal(out.sources[0].opened, false);
  assert.equal(out.experienceUsed.length, 0);
  assert.ok(out.evidenceNotes.length >= 3);
});
test("duplicate questions are coalesced; cancellation is terminal", async () => {
  const f = await fixture(
    ({ signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Error("cancelled"))),
      ),
  );
  try {
    const j = f.engine.enqueue(f.session, { question: "如何 保证一致性？" });
    assert.equal(
      f.engine.enqueue(f.session, { question: "如何保证一致性" }).id,
      j.id,
    );
    f.engine.cancel(f.session, j);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(j.status, "cancelled");
    assert.equal(j.answer, null);
  } finally {
    await f.cleanup();
  }
});
test("recognition admits only interviewer source ids and does not replay old questions", async () => {
  const f = await fixture(async ({ schema }) =>
    schema === Extract
      ? {
          value: {
            questions: [
              {
                question: "正常问题",
                category: "technical",
                transcriptIds: ["i"],
              },
              {
                question: "我自己的话",
                category: "technical",
                transcriptIds: ["c"],
              },
            ],
            pendingFragment: "",
          },
          evidence: {},
        }
      : schema === Answer
        ? { value: answer, evidence }
        : { value: { verdict: "pass", issues: [], answer }, evidence },
  );
  try {
    f.session.transcripts = [
      { id: "i", role: "interviewer", text: "正常问题" },
      { id: "c", role: "candidate", text: "我的回答" },
    ];
    await f.engine.detect(f.session);
    assert.equal(f.session.jobs.length, 1);
    await f.engine.detect(f.session);
    assert.equal(f.session.jobs.length, 1);
    await settle(f.session.jobs[0]);
  } finally {
    await f.cleanup();
  }
});
test("source citations alone do not count as an actual page-open action", () => {
  const e = { searched: false, openedUrls: [] };
  collectEvidence(
    {
      type: "web_search",
      query: "https://www.postgresql.org/docs/",
      action: { type: "other" },
    },
    e,
  );
  assert.equal(e.searched, true);
  assert.deepEqual(e.openedUrls, ["https://www.postgresql.org/docs/"]);
  collectEvidence(
    {
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                { type: "url_citation", url: "https://example.org" },
              ],
            },
          ],
        },
      ],
    },
    e,
  );
  assert.equal(e.openedUrls.length, 1);
});
test("remote APIs require HTTPS and URL must not embed secrets", () => {
  assert.throws(() => safeEndpoint("http://example.com/v1", "responses"));
  assert.throws(() => safeEndpoint("https://secret@example.com", "responses"));
  assert.equal(
    safeEndpoint("http://localhost:8000/v1/", "responses"),
    "http://localhost:8000/v1/responses",
  );
});

test("one opened citation cannot hide another unopened citation", () => {
  const out = gateAnswer(
    {
      ...answer,
      points: [{ ...answer.points[0], sourceIds: ["S1", "S2"] }],
      sources: [
        ...answer.sources,
        { ...answer.sources[0], id: "S2", url: "https://unopened.example/doc" },
      ],
    },
    evidence,
  );
  assert.ok(out.evidenceNotes.some((n) => n.includes("S2")));
});

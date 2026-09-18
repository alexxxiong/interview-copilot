import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../server/index.mjs";
test("HTTP boundary protects state and supports persisted transcripts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "interview-http-"));
  const s = await startServer({ port: 0, dataDir: dir });
  try {
    const state = await fetch(s.url + "/api/state").then((r) => r.json());
    const id = state.sessions[0].id;
    assert.equal(
      (
        await fetch(s.url + "/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(s.url + "/api/state", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    let r = await fetch(s.url + `/api/sessions/${id}/transcripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrfToken,
      },
      body: JSON.stringify({
        text: "这是我的项目背景",
        role: "candidate",
        chunkId: "one",
      }),
    });
    assert.equal(r.status, 200);
    r = await fetch(s.url + `/api/sessions/${id}/transcripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrfToken,
      },
      body: JSON.stringify({
        text: "这是我的项目背景",
        role: "candidate",
        chunkId: "one",
      }),
    });
    const session = await r.json();
    assert.equal(session.transcripts.length, 1);
    assert.equal("apiKey" in state.settings, false);
    assert.equal("asrKey" in state.settings, false);
  } finally {
    await s.close();
    await rm(dir, { recursive: true, force: true });
  }
});

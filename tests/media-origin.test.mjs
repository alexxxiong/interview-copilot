import test from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../electron/media-origin.mjs";

test("Electron's origin URL with a trailing slash is accepted", () => {
  assert.equal(
    sameOrigin("http://127.0.0.1:4318/", "http://127.0.0.1:4318"),
    true,
  );
});

test("another port, host, malformed or prefix-spoofed URL cannot access media", () => {
  for (const url of [
    "http://127.0.0.1:43180",
    "http://127.0.0.1:4318.evil.test",
    "http://evil.test:4318",
    undefined,
    "null",
  ])
    assert.equal(sameOrigin(url, "http://127.0.0.1:4318"), false);
});

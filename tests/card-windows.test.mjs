import test from "node:test";
import assert from "node:assert/strict";
import { createCardWindows } from "../electron/card-windows.mjs";
function fixture() {
  const made = [];
  class Window {
    constructor(options) {
      this.options = options;
      this.webContents = { id: made.length };
      this.events = {};
      this.pinned = false;
      made.push(this);
    }
    on(event, fn) {
      this.events[event] = fn;
    }
    async loadURL(url) {
      this.url = url;
    }
    isDestroyed() {
      return !!this.closed;
    }
    close() {
      this.closed = true;
      this.events.closed();
    }
    setAlwaysOnTop(value) {
      this.pinned = value;
    }
    setVisibleOnAllWorkspaces(value) {
      this.allWorkspaces = value;
    }
    isAlwaysOnTop() {
      return this.pinned;
    }
    isMinimized() {
      return !!this.minimized;
    }
    restore() {
      this.minimized = false;
    }
    setBounds(bounds) {
      this.bounds = bounds;
    }
    show() {
      this.visible = true;
    }
  }
  const screen = {
    getCursorScreenPoint: () => ({ x: 2000, y: 100 }),
    getDisplayNearestPoint: () => ({
      workArea: { x: 1920, y: 25, width: 1920, height: 1080 },
    }),
  };
  const manager = createCardWindows({
    BrowserWindow: Window,
    screen,
    baseUrl: "http://127.0.0.1:4318",
    webPreferences: { sandbox: true },
    secure: (w) => (w.secured = true),
  });
  return { manager, made };
}
test("each card click opens an independent window, including a second copy of the same card", async () => {
  const { manager, made } = fixture();
  await manager.open({
    id: "consistency",
    title: "一致性",
    sessionId: "session-A",
  });
  await manager.open({ id: "p99", title: "P99", sessionId: "session-B" });
  await manager.open({
    id: "consistency",
    title: "一致性",
    sessionId: "session-A",
  });
  assert.equal(made.length, 3);
  assert.ok(made.every((w) => w.secured && w.options.webPreferences.sandbox));
  assert.equal(new URL(made[0].url).searchParams.get("session"), "session-A");
  assert.equal(new URL(made[1].url).searchParams.get("card"), "p99");
  assert.notDeepEqual(made[0].options, made[2].options);
  manager.pin(made[0].webContents, true);
  assert.equal(made[0].pinned, true);
  assert.equal(made[1].pinned, false);
  manager.close(made[0].webContents);
  assert.equal(manager.owns(made[0].webContents), false);
  assert.equal(manager.owns(made[1].webContents), true);
  assert.equal(made[1].closed, undefined);
});
test("tiling restores independent windows on the selected display and excludes closed cards", async () => {
  const { manager, made } = fixture();
  for (let i = 0; i < 5; i++)
    await manager.open({ id: "card-" + i, title: "卡片", sessionId: "s" });
  manager.close(made[4].webContents);
  made[0].minimized = true;
  manager.tile();
  assert.equal(made[0].minimized, false);
  assert.equal(made[4].bounds, undefined);
  for (const w of made.slice(0, 4)) {
    assert.ok(w.visible);
    assert.ok(w.bounds.x >= 1920);
    assert.ok(w.bounds.y >= 25);
    assert.ok(w.bounds.x + w.bounds.width <= 3840);
    assert.ok(w.bounds.y + w.bounds.height <= 1105);
  }
  assert.equal(
    new Set(made.slice(0, 4).map((w) => w.bounds.x + "," + w.bounds.y)).size,
    4,
  );
});

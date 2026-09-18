// Package the generated master artwork at native macOS icon resolutions.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = path.join(root, "assets/icon-master.png");
const iconset = path.join(root, "assets/AppIcon.iconset");
mkdirSync(iconset, { recursive: true });
function resize(size, destination) {
  execFileSync(
    "/usr/bin/sips",
    ["-z", String(size), String(size), master, "--out", destination],
    { stdio: "ignore" },
  );
}
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    resize(
      size * scale,
      path.join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
    );
  }
}
resize(1024, path.join(root, "assets/icon.png"));
resize(256, path.join(root, "public/interview-icon.png"));
execFileSync("/usr/bin/iconutil", [
  "-c",
  "icns",
  iconset,
  "-o",
  path.join(root, "assets/icon.icns"),
]);
console.log(
  "Packaged PNG, ICNS, Retina iconset and in-app mark from assets/icon-master.png.",
);

# 面试助手图标：翡翠对话

使用内置 image_gen 工具生成，再由内置工具生成适合系统裁切的满版底色；未使用 CLI 模型或替代素材。

设计：单层浅翡翠色圆角底、象牙白对话气泡、三条深翡翠色声波。取消原图标厚重的深色外框和内嵌方框，强化小尺寸下的图形辨识度。

生成原稿为 `icon-master.png`；`npm run icons:build` 将原稿按比例转换为标准 PNG、ICNS、十档 iconset 和应用内标识。最终采用满版不透明底色，由当前 macOS 统一裁切外轮廓，避免系统把透明留白版本缩小后放进额外底板。应用内标识通过 CSS 圆角显示。转换只调整输出尺寸与格式。

## 生成提示词

Use case: logo-brand
Asset type: production macOS application Dock icon for a Chinese interview copilot, a tool for listening to conversations and preparing well-researched answers.
Primary request: Create ONE exceptionally polished, tasteful native macOS icon. Full frontal orthographic, perfectly square 1024x1024 canvas. A single smooth continuous-corner squircle tile, large and centered, surrounded by a modest 8% transparent margin on all sides. Genuine transparent alpha outside the tile, no painted backdrop.
Subject: one bold ivory-white sculpted speech bubble, centered slightly above optical center, with a short elegant tail at bottom left. Inside the bubble are exactly three thick forest-jade vertical rounded waveform bars, the middle tallest, the two outer bars shorter and subtly unequal. The speech bubble has generous but controlled negative space, a broad organic horizontal silhouette, and reads instantly as conversation at 32 pixels. The glyph should occupy approximately 60 percent of the tile width.
Style: high-end macOS desktop icon, elegant dimensional ceramic and satin glass, professionally art directed, restrained physical depth, refined beveled edges, ultra-clean geometry. NOT a flat clip-art pictogram and NOT a toy.
Color palette: the single background tile is luminous pale jade / mint green, top left light and creamy with a subtle warm highlight, lower right a richer fresh jade green; soft ivory white bubble; dark emerald waveform.
Lighting: soft upper-left studio light; tiny clean rim highlight on tile edge; subtle ambient shadow under the bubble, subtle lower-edge depth. Gradients extremely smooth. No harsh shine.
Constraints: single icon only, no presentation sheet, no text, no lettering, no watermark, no black border, no second rounded-square panel inside the tile, no circles or random sparkles, no microphone illustration, no circuit board details, no extra symbols, no grid, no perspective tilt, no huge shadow or white rectangular background. Preserve a crisp silhouette and make the glyph substantial and legible next to native Apple apps in the Dock.

## 首轮边缘整理提示词（未采用此轮原稿）

Use case: precise-object-edit
Edit target: attached newly generated macOS app icon.
Keep the jade/mint squircle, ivory speech bubble, emerald three-bar waveform, all composition and colors intact.
Make this a production-ready icon asset by cleaning ONLY its outer boundary and transparent margins: remove every disconnected colored speck, stray white fringe, fuzzy halo, rough edge or shadow outside the main squircle. The squircle must have a mathematically smooth, crisp, antialiased continuous contour, and all pixels beyond its narrow antialiased contour must be fully transparent alpha. Keep the existing modest uniform padding around it. Do not add any background, no white rectangle, no checkerboard painted into the image. Preserve the dimensional lighting inside the tile. Export one square transparent PNG.

## 最终系统适配提示词

Use case: precise-object-edit
Edit target: the jade speech-bubble application icon.
Purpose: macOS applies its own rounded-square icon mask; the source MUST be a full-bleed opaque square so it will not get wrapped in an extra white tile.
Keep exactly the central ivory speech bubble and three emerald waveform bars and their sculpted rendering. Keep their proportions and optical position.
Change ONLY the green background: turn the entire canvas into ONE continuous edge-to-edge mint-to-emerald green square gradient. EXTEND the existing green background to ALL FOUR EDGES and every corner. Remove the original rounded tile perimeter, raised outer rim, all padding, every transparent pixel, all outer shadows and speckles. There must be NO visible rounded square embedded in the background. The background is one perfectly smooth uninterrupted square field, bright mint upper-left blending to fresh rich jade lower-right, on which the ivory speech glyph casts its subtle existing shadow. Keep the glyph centered and large about 65% of canvas width. The glyph remains a speech bubble, not a square.
Production asset 1024x1024, completely opaque RGB. No transparency, no alpha, no border, no frame, no rounded canvas corners, no white external plate, no presentation background, no text. The final output is the FULL square graphic itself, NOT an icon sitting on a background.

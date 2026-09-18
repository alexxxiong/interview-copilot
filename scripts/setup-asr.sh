#!/bin/bash
set -euo pipefail
MODEL_DIR="$HOME/Library/Application Support/InterviewCopilot/models"
mkdir -p "$MODEL_DIR"
if ! command -v whisper-cli >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then echo '请先安装 Homebrew，或在设置中指定 whisper-cli。'; exit 1; fi
  HOMEBREW_NO_AUTO_UPDATE=1 brew install whisper-cpp
fi
MODEL="$MODEL_DIR/ggml-small.bin"
if [ ! -f "$MODEL" ]; then
  curl -fL --retry 3 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -o "$MODEL.part"
  HASH=$(shasum "$MODEL.part" | cut -d ' ' -f1)
  if [ "$HASH" != '55356645c2b361a969dfd0ef2c5a50d530afd8d5' ]; then echo '模型校验未通过，未启用文件。'; exit 1; fi
  mv "$MODEL.part" "$MODEL"
fi
echo "本地转写模型已准备：$MODEL"

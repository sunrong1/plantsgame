#!/usr/bin/env bash
# check-doc-consistency: 轻量文档一致性守卫
#
# 检查三件容易漂移的事：
#   1. sprint-status.yaml 里的每个 story key 都能找到对应 .md 文件
#   2. 文档里没有把已作废的东西当现行指令（如 balance-scan.py）
#   3. 文档声明的数量与真实数据源一致（词条数 / mp3 数）
#
# 用法: bash scripts/check-doc-consistency.sh
# 退出码: 0 = 一致  1 = 发现漂移
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

SPRINT="_bmad-output/implementation-artifacts/sprint-status.yaml"
IMPL_DIR="_bmad-output/implementation-artifacts"
PLAN_DIR="_bmad-output/planning-artifacts"
GDD="$PLAN_DIR/gdds/gdd-plants-game-2026-10-11/gdd.md"
ARCH="$PLAN_DIR/game-architecture.md"
EPICS="$PLAN_DIR/epics.md"
CONTENT="src/content/units/unit-01.json"
MANIFEST="public/assets/audio/voice/manifest.json"
VOICE_DIR="public/assets/audio/voice"

ERRORS=0
pass() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ❌ %s\n" "$1"; ERRORS=$((ERRORS+1)); }

echo "═══ 1. sprint-status story key ↔ 文件存在性 ═══"
if [[ -f "$SPRINT" ]]; then
  MISSING=0
  TOTAL=0
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    TOTAL=$((TOTAL+1))
    if [[ ! -f "$IMPL_DIR/$key.md" ]]; then
      # status 非 backlog/done 的必须有文件
      if grep -qE "^    $key: (ready-for-dev|in-progress|review)$" "$SPRINT"; then
        fail "$key 状态非 backlog/done 但缺少 $IMPL_DIR/$key.md"
        MISSING=$((MISSING+1))
      fi
    fi
  done < <(grep -oE '^[[:space:]]+[0-9]+-[0-9]+-[^:]+' "$SPRINT" | tr -d ' \t')
  [[ $MISSING -eq 0 ]] && pass "所有进行中的 story 都有对应文件（共 $TOTAL 个 story 条目）"
else
  fail "找不到 $SPRINT"
fi

echo ""
echo "═══ 2. 已作废脚本不得作为现行指令 ═══"
DEAD="balance-scan.py balance-sim.py voice-entries.json"
BAD=0
for f in "$GDD" "$ARCH" "CLAUDE.md"; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line; do
    ln=$(echo "$line" | sed 's/^ *//')
    # 出现已作废脚本，但同行/上下文没有「作废/历史/退役/删除/不再/勘误」等豁免词
    for dead in $DEAD; do
      if echo "$ln" | grep -q "$dead"; then
        if ! echo "$ln" | grep -qE "作废|历史|退役|删除|不再|勘误|更正|混称|改名|统一为|📸|已废弃|已删除|早期"; then
          fail "$(basename "$f"): 未标注作废 → $dead"
          echo "       $ln"
          BAD=$((BAD+1))
        fi
      fi
    done
  done < "$f"
done
[[ $BAD -eq 0 ]] && pass "文档里提到的已作废脚本都有历史标注"

echo ""
echo "═══ 3. 文档声明的词条数 ↔ 真实数据源 ═══"
if [[ -f "$CONTENT" && -f "$MANIFEST" ]]; then
  N_CONTENT=$(python3 -c "import json;print(len(json.load(open('$CONTENT'))['entries']))")
  N_MANIFEST=$(python3 -c "import json;print(len(json.load(open('$MANIFEST'))['entries']))")
  N_MP3=$(ls "$VOICE_DIR"/*.mp3 2>/dev/null | wc -l)
  if [[ "$N_CONTENT" == "$N_MANIFEST" && "$N_MANIFEST" == "$N_MP3" ]]; then
    pass "三方一致：unit-01.json=$N_CONTENT / manifest=$N_MANIFEST / mp3=$N_MP3"
    REAL=$N_CONTENT
  else
    fail "三方不一致：unit-01.json=$N_CONTENT / manifest=$N_MANIFEST / mp3=$N_MP3"
    REAL=$N_CONTENT
  fi

  # 文档「当前有效」段落里如果还写着别的数字，报出来
  STORY="$IMPL_DIR/1-6-内容数据层与单元-1-录入.md"
  if [[ -f "$STORY" ]]; then
    # 抓 File List 里标了「当前」的那一行
    CUR=$(grep -oE '\*\*[0-9]+\*\* 条词条' "$STORY" | grep -oE '[0-9]+' | head -1)
    if [[ -n "$CUR" ]]; then
      if [[ "$CUR" == "$REAL" ]]; then
        pass "Story 1.6 File List 声明 $CUR 条 ↔ 真实 $REAL 条"
      else
        fail "Story 1.6 File List 写 $CUR 条，真实是 $REAL 条"
      fi
    fi
  fi
else
  fail "内容数据源缺失（$CONTENT 或 $MANIFEST）"
fi

echo ""
echo "════════════════════════════════"
if [[ $ERRORS -eq 0 ]]; then
  echo "✅ 文档一致性检查通过"
  exit 0
else
  echo "❌ 发现 $ERRORS 处漂移"
  exit 1
fi
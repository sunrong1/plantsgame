#!/usr/bin/env python3
"""
check-execution-drift: BMAD 执行过程漂移检测

静态检查（文档当前写没写对）只能发现「已经错了」；
这里查的是「执行完之后，流程状态有没有跟上」——真正会误导下一个 session 的漂移。

四项检查：
  A. commit 动了某 story，但 sprint-status 还停在 backlog
  B. story 标记 done，但 Task 列表还有未勾选项
  C. status 里声明的 baseline_tests 与实际测试数不符
  D. commit 改了文件，但该文件不在对应 story 的 File List 里
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPL = ROOT / "_bmad-output" / "implementation-artifacts"
STATUS = IMPL / "sprint-status.yaml"
COMMIT_SCAN = 20   # 扫最近多少个 commit

errors = []
notes = []


def sh(cmd):
    try:
        return subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True,
                              text=True, timeout=60).stdout.strip()
    except Exception:
        return ""


def pass_(msg):
    print(f"  \033[32m✓\033[0m {msg}")


def fail(msg):
    print(f"  \033[31m❌\033[0m {msg}")
    errors.append(msg)


def warn(msg):
    print(f"  \033[33mℹ\033[0m {msg}")
    notes.append(msg)


# ── 解析 sprint-status ──────────────────────────────────────────
def load_status():
    """解析 development_status 段。

    实测这个项目的 yaml 是 **2 空格缩进**，且 key 的标题里可能带连字符
    （如 `1-4-战斗内核与-5-条数值断言`），所以按「缩进 + 最后一个冒号前是 key」拆，
    不用 `^\\s+(\\S+):` 这种会误吞标题里的冒号。
    """
    if not STATUS.exists():
        print(f"\033[31m找不到 {STATUS}\033[0m")
        sys.exit(2)
    lines = STATUS.read_text(encoding="utf-8").split("\n")
    data, in_dev, base_indent = {}, False, None
    for raw in lines:
        if raw.strip() == "development_status:":
            in_dev, base_indent = True, None
            continue
        if not in_dev:
            continue
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        if base_indent is None:
            base_indent = indent
        if indent < base_indent:
            break                      # 出了 development_status 段
        # key 与 status 用「最后一个冒号 + 冒号后第一个词」拆，
        # 避免标题里的冒号干扰
        head, _, tail = raw.rpartition(":")
        key = head.strip()
        st = tail.strip().split()[0] if tail.strip() else ""
        if key and st:
            data[key] = st
    return data


STATUS_DATA = load_status()
story_files = {p.stem: p for p in IMPL.glob("*.md") if re.match(r"^\d+-\d+-", p.stem)}


def find_story(alias):
    """把 1-7 / 1.7 / Story 1.7 映射到 status 里的完整 key"""
    base = re.sub(r"^(Story\s*)?1[-.](\d+).*$", r"1-\2", alias.strip())
    hits = [k for k in STATUS_DATA if k.startswith(base + "-")]
    return hits[0] if len(hits) == 1 else None


print("═══ A. commit ↔ sprint-status 状态一致性 ═══")
log = sh(f"git log --format=%s -{COMMIT_SCAN}")
aliases = sorted(set(re.findall(r"Story\s*1[-.]\d+", log)), key=lambda s: int(re.findall(r"\d+", s)[0]))
if not aliases:
    warn(f"最近 {COMMIT_SCAN} 个 commit 没有 Story 标记（不是 BMAD 提交）")
else:
    bad = 0
    for a in aliases:
        key = find_story(a)
        if not key:
            warn(f"{a} 在 sprint-status 里找不到对应条目")
            continue
        st = STATUS_DATA[key]
        if st == "backlog":
            fail(f"{a} 已被 commit 触及，但 sprint-status 仍是 backlog")
            bad += 1
    if bad == 0:
        pass_(f"{len(aliases)} 个被 commit 触及的 story 状态都已跟上")

print()
print("═══ B. done 的 story 不该留未勾选 Task ═══")
bad = 0
checked = 0
for key, st in STATUS_DATA.items():
    if st != "done":
        continue
    f = story_files.get(key)
    if not f:
        continue
    checked += 1
    body = f.read_text(encoding="utf-8")
    open_tasks = re.findall(r"^- \[ \]\s*Task[^\n]*", body, re.M)
    if open_tasks:
        fail(f"{key} 状态 done，但还有 {len(open_tasks)} 个未勾选 Task")
        for t in open_tasks[:3]:
            print(f"       {t.strip()[:80]}")
        bad += 1
if bad == 0:
    pass_(f"{checked} 个 done 的 story 全部 Task 已勾选")

print()
print("═══ C. baseline_tests 与实际测试数 ═══")
# sprint-status 只留状态机（注释已清理），基线声明在 story 文件的 YAML frontmatter 里。
# 实测写法是 `baseline_tests: 778`（YAML 风格，不是 key=value），所以两种都要匹配。
declared = set()
for pat in (r"baseline_tests[=:]\s*(\d+)",):
    declared |= {int(m) for m in re.findall(pat, STATUS.read_text(encoding="utf-8"))}
for sf in story_files.values():
    txt = sf.read_text(encoding="utf-8")
    m = re.search(r"baseline_tests\s*[=:]\s*(\d+)", txt)
    if m:
        declared.add(int(m.group(1)))
if not declared:
    warn("status 里没有 baseline_tests 声明（尚未记录基线）")
else:
    actual = None
    out2 = sh("npx vitest run 2>&1 | tail -30")
    # vitest 输出带 ANSI 颜色码，数字和文字之间会被转义序列隔开，
    # 直接正则匹配会漏掉（实测 `3 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m830 passed`）。
    clean = re.sub(r"\x1b\[[0-9;]*m", "", out2)
    clean = clean.replace("│", " ").replace("|", " ")
    # 实测格式：`  Tests   3 failed  |  830 passed (833)`
    m2 = re.search(r"Tests\s+(?:(\d+)\s+failed\s*)?(\d+)\s+passed\s*\((\d+)\)", clean)
    if m2:
        failed_n = int(m2.group(1) or 0)
        actual = int(m2.group(3))
        newest = max(declared)
        if actual < newest:
            fail(f"测试数从基线 {newest} 掉到 {actual}（掉了 {newest-actual} 条）")
        elif failed_n:
            warn(f"基线 {newest} 条，当前 {actual} 条（未回退），但有 {failed_n} 条失败")
        else:
            pass_(f"基线 {newest} 条，实际 {actual} 条，无失败")
    if actual is None:
        warn("无法自动取到测试数（vitest 输出格式不匹配）")

print()
print("═══ D. commit 改的文件是否在 story 的 File List ═══")
bad = 0
checked = 0
for a in aliases[-5:]:
    key = find_story(a)
    if not key or key not in story_files:
        continue
    sf = story_files[key]
    text = sf.read_text(encoding="utf-8")
    m = re.search(r"###\s*File List(.*?)(?=\n##|\Z)", text, re.S)
    if not m:
        continue
    declared_files = set(re.findall(r"`([^`]+\.(?:ts|tsx|js|vue|json|md|svg))`", m.group(1)))
    if not declared_files:
        continue
    checked += 1
    sha = sh(f"git log --format=%H -1 --grep='{a}'")
    if not sha:
        continue
    changed = sh(f"git show --stat --name-only --format= {sha}")
    missing = []
    for line in changed.split("\n"):
        line = line.strip()
        if not line or line.startswith("_bmad-output"):
            continue
        base = os.path.basename(line)
        if base and base not in {os.path.basename(f) for f in declared_files}:
            if not any(base in d for d in declared_files):
                missing.append(line)
    if missing:
        warn(f"{key} 的 commit 改了 {len(missing)} 个 File List 未列的文件（可能是跨 story 改动）")
        for x in missing[:3]:
            print(f"       {x}")
if bad == 0 and checked:
    pass_(f"{checked} 个 story 的 File List 与 commit 基本对齐")

print()
print("════════════════════════════════")
if errors:
    print(f"\033[31m❌ 发现 {len(errors)} 处执行漂移\033[0m")
    for e in errors:
        print(f"   · {e}")
    sys.exit(1)
elif notes:
    print(f"\033[33m✅ 无漂移（{len(notes)} 条提示）\033[0m")
    sys.exit(0)
else:
    print("\033[32m✅ 执行一致性检查全部通过\033[0m")
    sys.exit(0)
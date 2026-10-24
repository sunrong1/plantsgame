#!/usr/bin/env python3
"""
wiki-lint: .wiki/ 知识库一致性检查

知识库会过期。过期本身不是错误 —— 它是「该重新同步了」的信号。
所以本脚本分两级：

  错误（exit 1，阻塞）：
    A. path 指向的源文件不存在      —— 摘要指向了不存在的文件
    B. 双链断裂                    —— 模块引用了不存在的模块
    C. frontmatter 缺必填字段      —— 缺 hash / path / status
    D. status 取值不在允许集合内

  警告（exit 0，不阻塞）：
    E. hash 与实际源码不符          —— 摘要过期，待重新同步
    F. last_sync 缺失或格式不对

⚠️ E 类刻意不阻塞。过期是常态，阻塞它等于把知识库变成流水线的第二个闸门。
   过期条目应该排期处理，不是让 CI 变红。

用法：
    python3 scripts/wiki-lint.py            # 全量检查
    python3 scripts/wiki-lint.py --strict   # 警告也算失败（本地自查用）
"""
import hashlib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / ".wiki"
MODULES = WIKI / "modules"

ALLOWED_STATUS = {"draft", "verified"}
REQUIRED_FIELDS = ("module", "path", "status", "last_sync", "hash")

errors = []
warnings = []


def pass_(msg):
    print(f"  \033[32m✓\033[0m {msg}")


def fail(msg):
    print(f"  \033[31m❌\033[0m {msg}")
    errors.append(msg)


def warn(msg):
    print(f"  \033[33m⚠\033[0m {msg}")
    warnings.append(msg)


def parse_frontmatter(text):
    """返回 (dict, body) —— frontmatter 不合法时返回 (None, text)。"""
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        return None, text
    fm = {}
    key = None
    for line in m.group(1).split("\n"):
        if not line.strip():
            continue
        if line.startswith("  - "):          # YAML 列表项
            if key:
                fm.setdefault(key, [])
                if isinstance(fm[key], list):
                    fm[key].append(line[4:].strip().strip('"'))
            continue
        if ":" in line and not line.startswith(" "):
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip().strip('"')
            fm[key] = val if val != "" else []
    return fm, m.group(2)


def file_hash(path, length=8):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:length]


def collect_targets():
    """收集所有可被双链引用的名字。"""
    names = set()
    for p in WIKI.rglob("*.md"):
        rel = p.relative_to(WIKI).with_suffix("").as_posix()
        names.add(rel)
        names.add(p.stem)
    return names


def main():
    if not WIKI.exists():
        print(f"❌ 找不到 {WIKI}")
        return 1

    print(f"\n\033[1mwiki-lint\033[0m  {WIKI.relative_to(ROOT)}\n")

    # ---------- 收集模块文档 ----------
    module_files = sorted(MODULES.glob("*.md"))
    if not module_files:
        print("❌ .wiki/modules/ 下没有模块文档")
        return 1

    # ---------- A/C/D/E/F：逐个模块检查 ----------
    print("\033[1m[A] 逐模块检查\033[0m")
    stale = []
    for md in module_files:
        fm, _ = parse_frontmatter(md.read_text(encoding="utf-8"))
        name = md.stem

        if fm is None:
            fail(f"{name}: frontmatter 缺失或格式不对")
            continue

        # C. 必填字段
        missing = [f for f in REQUIRED_FIELDS if not fm.get(f)]
        if missing:
            fail(f"{name}: 缺必填字段 {', '.join(missing)}")
            continue

        # D. status 取值
        if fm["status"] not in ALLOWED_STATUS:
            fail(f"{name}: status='{fm['status']}' 不在允许集合 {sorted(ALLOWED_STATUS)}")

        # A. path 存在
        src = ROOT / fm["path"]
        if not src.exists():
            fail(f"{name}: path 指向的文件不存在 → {fm['path']}")
            continue

        # E. hash 一致性（警告级）
        real = file_hash(src)
        if fm["hash"] != real:
            stale.append((name, fm["path"], fm["hash"], real))

        # F. last_sync 格式（警告级）
        if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", fm["last_sync"]):
            warn(f"{name}: last_sync 格式可疑 → {fm['last_sync']}")

    if not stale:
        pass_(f"全部 {len(module_files)} 个模块 hash 与源码一致")
    else:
        warn(f"{len(stale)} 个模块摘要已过期（hash 与源码不符）")

    # ---------- B. 双链检查 ----------
    print("\n\033[1m[B] 双链检查\033[0m")
    targets = collect_targets()
    broken = []
    total_links = 0
    for md in WIKI.rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        for m in re.finditer(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", text):
            total_links += 1
            target = m.group(1).strip()
            if target not in targets and target.split("/")[-1] not in targets:
                broken.append((md.relative_to(WIKI), target))
    if broken:
        for src, tgt in broken:
            fail(f"断链: {src} → [[{tgt}]]")
    else:
        pass_(f"{total_links} 条双链全部有效")

    # ---------- 覆盖度 ----------
    print("\n\033[1m[C] 覆盖度\033[0m")
    src_files = []
    for ext in ("*.ts", "*.vue", "*.js"):
        src_files += list((ROOT / "src").rglob(ext))
    covered = set()
    for md in module_files:
        fm, _ = parse_frontmatter(md.read_text(encoding="utf-8"))
        if fm and fm.get("path"):
            covered.add(fm["path"])
    uncovered = [f for f in src_files if str(f.relative_to(ROOT)) not in covered]
    pct = 100 * len(covered) / len(src_files) if src_files else 0
    if uncovered:
        warn(f"覆盖 {len(covered)}/{len(src_files)}（{pct:.0f}%），{len(uncovered)} 个源文件未覆盖")
        for f in uncovered[:5]:
            print(f"       未覆盖: {f.relative_to(ROOT)}")
    else:
        pass_(f"覆盖 {len(covered)}/{len(src_files)}（{pct:.0f}%）")

    # ---------- 汇总 ----------
    print(f"\n\033[1m汇总\033[0m  错误 {len(errors)} · 警告 {len(warnings)}")
    if stale:
        print(f"\n过期模块（需重新同步）:")
        for name, path, old, new in stale:
            print(f"  {name:<28} {path}")
            print(f"    {'':28} hash {old} → {new}")

    strict = "--strict" in sys.argv
    if errors:
        return 1
    if strict and warnings:
        print("\n--strict：警告也算失败")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

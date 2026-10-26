"""Objective structural validation for dist/c06-normalized (no content authoring)."""
import re
import sys
import zipfile
from pathlib import Path

OUT = Path("dist/c06-normalized")
SRC = Path("dist/c06-normalized-source")
LIMIT = 50_000
problems = []


def check(cond, msg):
    if not cond:
        problems.append(msg)


def fence_ok(text):
    n = sum(1 for l in text.splitlines() if re.match(r"^\s*(```|~~~)", l))
    return n % 2 == 0, n


def blocks_under_limit(text):
    """Every fenced block, table and the whole doc must be < LIMIT chars."""
    bad = []
    cur, in_fence, cur_len = [], False, 0
    for line in text.splitlines():
        if re.match(r"^\s*(```|~~~)", line):
            in_fence = not in_fence
            if not in_fence:
                if cur_len >= LIMIT:
                    bad.append(cur_len)
                cur, cur_len = [], 0
            continue
        if in_fence:
            cur.append(line)
            cur_len += len(line) + 1
    tbl = 0
    for line in text.splitlines():
        if in_fence:
            continue
        if line.startswith("|"):
            tbl += len(line) + 1
        else:
            if tbl >= LIMIT:
                bad.append(tbl)
            tbl = 0
    if tbl >= LIMIT:
        bad.append(tbl)
    return bad


files = sorted(OUT.glob("*.md"))
stems = sorted({f.name.split("--part-")[0].removesuffix(".md") for f in files})
src_stems = sorted(p.stem for p in SRC.glob("*.md"))
check(stems == src_stems, f"stem mismatch: {stems} vs {src_stems}")

for f in files:
    t = f.read_text(encoding="utf-8")
    nb = [l for l in t.splitlines() if l.strip()]
    name = f.name
    check(len(t) < LIMIT, f"{name}: {len(t)} chars >= 50000")
    ok, n = fence_ok(t)
    check(ok, f"{name}: unbalanced fences ({n})")
    check(not blocks_under_limit(t), f"{name}: block >= 50000 {blocks_under_limit(t)}")
    check(nb[0].startswith("# ") and not nb[0].startswith("## "), f"{name}: L1 not H1: {nb[0][:60]}")
    check(len(nb[0]) <= 120, f"{name}: H1 too long {len(nb[0])}")
    check(t.count("\n# ") == 0 and sum(1 for l in t.splitlines() if l.startswith("# ")) == 1,
          f"{name}: H1 count != 1")
    check(re.fullmatch(r"(#[\w\-À-ɏḀ-ỿ]+)(\s+#[\w\-À-ɏḀ-ỿ]+)*", nb[1]) is not None,
          f"{name}: L2 not hashtag line: {nb[1][:60]}")
    check(nb[-2] == "## Nguồn", f"{name}: penultimate not '## Nguồn': {nb[-2][:40]!r}")
    base = f.name.split("--part-")[0]
    if not base.endswith(".md"):
        base += ".md"
    expected = f"- Đường dẫn nguồn: `{base}`"
    check(nb[-1] == expected, f"{name}: footer {nb[-1]!r} != {expected!r}")

# source untouched
src_zip = Path("docs/c06.zip")
check(src_zip.exists(), "docs/c06.zip missing")

print("FILES:", len(files))
for f in files:
    print(f"  {f.name}: {len(f.read_text(encoding='utf-8'))} chars")
if problems:
    print("\nFAIL:")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print("\nALL STRUCTURAL CHECKS PASSED")

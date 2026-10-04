"""キャッシュ対策: 公開ファイルの内容から「更新番号」を作り、読み込みの URL に ?v=<番号> を付ける。

    python tools/stamp_version.py          # docs/ を書き換える（内容が同じなら、何も変わらない）
    python tools/stamp_version.py --check  # 番号が最新かだけ調べる（古ければ終了コード1）

付ける場所:
  - docs/index.html の styles.css と app.js
  - docs/assets/ の JavaScript が読み込む、相対パスの .js（import 文・import() の両方）
  - データ（docs/data/）の読み込み。data.js が、自分の URL の ?v= を、データの URL に付ける
番号は、docs/assets/（vendor を除く）と docs/data/ の内容のハッシュ。内容が変われば番号が変わり、
読者のブラウザが古い CSS・JS・データを使い続けることを防ぐ。ビルドは不要（このスクリプトだけ）。
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parents[1] / "docs"
VER_RE = re.compile(r"\?v=[0-9a-f]{10}")
# import 文・動的 import の、相対パスの .js
IMPORT_RE = re.compile(r"""((?:\bfrom\s+|\bimport\()\s*['"]\.{1,2}/[^'"?]+\.js)(?:\?v=[0-9a-f]{10})?(['"])""")
INDEX_RE = re.compile(r"""(assets/(?:styles\.css|app\.js))(?:\?v=[0-9a-f]{10})?(['"])""")


def source_files() -> list[Path]:
    files = [DOCS / "index.html"]
    files += sorted(p for p in (DOCS / "assets").rglob("*") if p.is_file() and "vendor" not in p.parts)
    files += sorted(p for p in (DOCS / "data").rglob("*") if p.is_file())
    return files


def compute_version() -> str:
    h = hashlib.sha1()
    for p in source_files():
        data = p.read_bytes()
        if p.suffix in (".js", ".html", ".css"):
            data = VER_RE.sub("", data.decode("utf-8")).encode("utf-8")   # 番号そのものは、ハッシュに入れない
        h.update(p.relative_to(DOCS).as_posix().encode() + b"\0" + data + b"\0")
    return h.hexdigest()[:10]


def stamp(version: str, write: bool) -> list[Path]:
    changed = []
    for p in [DOCS / "index.html", *sorted((DOCS / "assets").rglob("*.js"))]:
        if "vendor" in p.parts:
            continue
        text = p.read_text(encoding="utf-8")
        rx = INDEX_RE if p.name == "index.html" else IMPORT_RE
        new = rx.sub(lambda m: f"{m.group(1)}?v={version}{m.group(2)}", text)
        if new != text:
            changed.append(p)
            if write:
                p.write_text(new, encoding="utf-8", newline="")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    # 番号は、番号を除いた内容から決まる。書き換えても変わらない
    version = compute_version()
    changed = stamp(version, write=not args.check)
    if args.check:
        if changed:
            sys.exit(f"[古い] 更新番号が最新ではありません（{len(changed)}ファイル）。python tools/stamp_version.py を実行してください")
        print(f"最新です: v={version}")
        return
    print(f"v={version}: {len(changed)}ファイルを更新")


if __name__ == "__main__":
    main()

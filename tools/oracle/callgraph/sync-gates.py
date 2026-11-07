#!/usr/bin/env python3
"""Sole writer of the derived call-graph gate files (K1 conflict-free batch pipeline).

Derived files (never hand-edit them):
  * tools/oracle/callgraph/manifest-113c.json            (full regeneration via extract-callgraph.py)
  * docs/oracle/function-map.md, exactly two regions:
      (a) the "Manifest Status Accounting" summary span
          **`<dv>` `diff-verified` (`<p>%`) + `<ported>` `ported` (`<p>%`) = ... `readyInternalComposite`)
      (b) the single Phase-0 table row whose 4th cell starts with **ported** (
          (regenerated 1:1 from the manifest's ported functions, sorted by (module, va))

Modes:
  sync-gates.py                      regenerate and write both files
  sync-gates.py --check              regenerate in memory; exit 1 if either file would change
  sync-gates.py --ratchet <git-ref> [--allow FILE]
                                     exit 1 if, relative to <git-ref>, any function's status went down
                                     (diff-verified -> ported/unported, ported -> unported, which is also
                                     every binding removal), any function left the closure, or any
                                     bindings/*.json file present at <git-ref> was deleted. The only bypass
                                     is an explicit allowlist JSON file (see load_allowlist) in which every
                                     entry names one violation and carries a written justification; unused
                                     allowlist entries are themselves an error.

Inputs are the reviewed bindings (KERN_BINDINGS_113C + tools/oracle/callgraph/bindings/*.json), so the
derived files are a pure function of the repository state. See tools/oracle/callgraph/bindings/README.md.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))
FN_MAP_PATH = os.path.join(REPO_ROOT, "docs", "oracle", "function-map.md")
MANIFEST_REL = "tools/oracle/callgraph/manifest-113c.json"
BINDINGS_REL = "tools/oracle/callgraph/bindings"

STATUS_RANK = {"unported": 0, "ported": 1, "diff-verified": 2}
MIN_JUSTIFICATION = 40


def load_extractor():
    """Imports extract-callgraph.py in-process (it re-execs into the d2oracle venv if capstone is missing)."""
    path = os.path.join(SCRIPT_DIR, "extract-callgraph.py")
    spec = importlib.util.spec_from_file_location("extract_callgraph_113c", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------- function-map.md rendering

_NUM = r"`[0-9][0-9,]*`"
_PCT = r"\(`[0-9]+\.[0-9]{2}%`\)"
_BRK = r"[ \t]*\n>[ \t]*|[ \t]+"  # the span is wrapped inside a '> ' blockquote paragraph
SUMMARY_RE = re.compile(
    rf"\*\*{_NUM} `diff-verified` {_PCT} \+ {_NUM} `ported` {_PCT} =(?:{_BRK})"
    rf"{_NUM} implemented closure functions\*\*(?:{_BRK})\({_NUM} `unported`,(?:{_BRK})"
    rf"\*\*{_NUM} unblocked `ready`\*\*(?:{_BRK})=(?:{_BRK}){_NUM}(?:{_BRK})"
    rf"`readyPureLeaf`(?:{_BRK})\+(?:{_BRK}){_NUM}(?:{_BRK})`readyHostImport`(?:{_BRK})\+(?:{_BRK})"
    rf"{_NUM}(?:{_BRK})`readyInternalComposite`\)"
)
PORTED_ROW_RE = re.compile(r"^\|[^\n]*\| \*\*ported\*\* \([^\n]*\|$", re.MULTILINE)


def _fmt(n: int) -> str:
    return f"`{n:,}`"


def _pct(n: int, total: int) -> str:
    return f"(`{100 * n / total:.2f}%`)"


def render_summary(manifest: dict) -> str:
    s = manifest["summary"]
    total = s["totalReachable"]
    sb = s["statusBreakdown"]
    rs = s["readySummary"]
    dv, ported, unported = sb["diff-verified"], sb["ported"], sb["unported"]
    return (
        f"**{_fmt(dv)} `diff-verified` {_pct(dv, total)} + {_fmt(ported)} `ported` {_pct(ported, total)} =\n"
        f"> {_fmt(dv + ported)} implemented closure functions** ({_fmt(unported)} `unported`, "
        f"**{_fmt(rs['ready'])} unblocked `ready`** = {_fmt(rs['readyPureLeaf'])}\n"
        f"> `readyPureLeaf` + {_fmt(rs['readyHostImport'])} `readyHostImport` + "
        f"{_fmt(rs['readyInternalComposite'])} `readyInternalComposite`)"
    )


def _cell(text: str) -> str:
    return text.replace("|", "\\|")


def render_ported_row(manifest: dict) -> str:
    ported = sorted(
        (f for f in manifest["functions"] if f["status"] == "ported"),
        key=lambda f: (f["module"], int(f["va"], 16)),
    )
    if not ported:
        raise ValueError("manifest has no ported functions; the ported row cannot be rendered")
    vas = []
    cur_mod = None
    for f in ported:
        tok = f"`{f['va']}`"
        if f["module"] != cur_mod:
            tok = f"{f['module']} {tok}"
            cur_mod = f["module"]
        vas.append(tok)
    names = [f"`{f['name']}`" for f in ported]
    by_file = {}
    for f in ported:
        by_file.setdefault(f["kernFile"], []).append(f"`{f['tsSymbol']}`")
    ts_groups = [f"{', '.join(syms)} `{kf}`" for kf, syms in by_file.items()]
    status = (
        f"**ported** (`{len(ported)}` closure functions implemented in `src/d2kern-113c/`, not yet "
        f"function-level diff-verified against the real DLL; per-function evidence in `manifest-113c.json`)"
    )
    cells = [", ".join(vas), ", ".join(names), ", ".join(ts_groups), status]
    return "| " + " | ".join(_cell(c) if i < 3 else c for i, c in enumerate(cells)) + " |"


def rewrite_function_map(text: str, manifest: dict) -> str:
    sums = list(SUMMARY_RE.finditer(text))
    if len(sums) != 1:
        raise ValueError(f"function-map.md: expected exactly 1 status summary span, found {len(sums)}")
    rows = list(PORTED_ROW_RE.finditer(text))
    if len(rows) != 1:
        raise ValueError(f"function-map.md: expected exactly 1 '| **ported** (' table row, found {len(rows)}")
    row = render_ported_row(manifest)
    if "src/d2kern-113c/" not in row.split(" | ")[2]:
        raise ValueError("ported row TS cell must reference src/d2kern-113c/ (legacy-ref parser skip rule)")
    spans = sorted(
        [(sums[0].start(), sums[0].end(), render_summary(manifest)), (rows[0].start(), rows[0].end(), row)],
        key=lambda t: t[0],
    )
    out = []
    pos = 0
    for start, end, repl in spans:
        out.append(text[pos:start])
        out.append(repl)
        pos = end
    out.append(text[pos:])
    return "".join(out)


def _legacy_refs_of_text(ex, text: str) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as tf:
        tf.write(text)
        tmp = tf.name
    try:
        return ex.parse_legacy_refs_from_function_map(tmp)
    finally:
        os.unlink(tmp)


def regenerate(ex):
    """Returns (manifest_text, fnmap_old, fnmap_new) computed purely in memory."""
    manifest = ex.build_manifest()
    manifest_text = ex.serialize_manifest(manifest)
    with open(FN_MAP_PATH, "r", encoding="utf-8") as f:
        fnmap_old = f.read()
    fnmap_new = rewrite_function_map(fnmap_old, manifest)
    # The rewritten regions must be invisible to the manifest's legacy-ref input parser, otherwise the
    # derived files would not be a fixed point.
    if _legacy_refs_of_text(ex, fnmap_old) != _legacy_refs_of_text(ex, fnmap_new):
        raise ValueError("function-map.md rewrite changed legacy-ref parser input (not a fixed point)")
    return manifest_text, fnmap_old, fnmap_new


# ---------------------------------------------------------------- ratchet


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", REPO_ROOT, *args], check=True, capture_output=True, text=True
    ).stdout


def load_allowlist(path):
    """Allowlist JSON: [{"item": "<D2Common:0x6FD87F80 | bindings/<file>.json>", "justification": "..."}].

    Every entry must name exactly one ratchet violation and carry a justification of at least
    MIN_JUSTIFICATION characters (paste the same text into the merge commit message)."""
    if path is None:
        return {}
    with open(path, "r", encoding="utf-8") as f:
        arr = json.load(f)
    if not isinstance(arr, list):
        raise ValueError(f"{path}: allowlist must be a JSON array")
    out = {}
    for i, e in enumerate(arr):
        if not isinstance(e, dict) or set(e) != {"item", "justification"}:
            raise ValueError(f"{path}[{i}]: entries need exactly the keys 'item' and 'justification'")
        if not isinstance(e["justification"], str) or len(e["justification"].strip()) < MIN_JUSTIFICATION:
            raise ValueError(f"{path}[{i}]: justification must be >= {MIN_JUSTIFICATION} characters")
        if e["item"] in out:
            raise ValueError(f"{path}[{i}]: duplicate item {e['item']}")
        out[e["item"]] = e["justification"].strip()
    return out


def ratchet_violations(old_manifest: dict, new_manifest: dict, old_binding_files, new_binding_files) -> dict:
    """Returns {item: description} of every monotonicity violation from old -> new."""
    viol = {}
    old_fns = {f"{f['module']}:{f['va']}": f for f in old_manifest["functions"]}
    new_fns = {f"{f['module']}:{f['va']}": f for f in new_manifest["functions"]}
    for key in sorted(old_fns):
        a = old_fns[key]
        b = new_fns.get(key)
        if b is None:
            viol[key] = f"{key} ({a['name']}) left the closure (was {a['status']})"
            continue
        if STATUS_RANK[b["status"]] < STATUS_RANK[a["status"]]:
            viol[key] = f"{key} ({a['name']}) status downgrade {a['status']} -> {b['status']}"
    for fname in sorted(set(old_binding_files) - set(new_binding_files)):
        item = f"bindings/{fname}"
        viol[item] = f"{item} was deleted"
    return viol


def run_ratchet(ref: str, allow_path) -> int:
    old_manifest = json.loads(_git("show", f"{ref}:{MANIFEST_REL}"))
    with open(os.path.join(REPO_ROOT, MANIFEST_REL), "r", encoding="utf-8") as f:
        new_manifest = json.load(f)
    old_files = [
        os.path.basename(p) for p in _git("ls-tree", "--name-only", f"{ref}", f"{BINDINGS_REL}/").split("\n") if p
    ]
    bdir = os.path.join(REPO_ROOT, BINDINGS_REL)
    new_files = os.listdir(bdir) if os.path.isdir(bdir) else []
    viol = ratchet_violations(old_manifest, new_manifest, old_files, new_files)
    allow = load_allowlist(allow_path)
    failed = False
    for item, desc in viol.items():
        if item in allow:
            print(f"[ratchet] ALLOWED: {desc} -- justification: {allow[item]}")
        else:
            print(f"[ratchet] VIOLATION: {desc}")
            failed = True
    for item in sorted(set(allow) - set(viol)):
        print(f"[ratchet] UNUSED allowlist entry (not a violation vs {ref}): {item}")
        failed = True
    if failed:
        print(f"[ratchet] FAILED against {ref}")
        return 1
    print(f"[ratchet] OK against {ref}: {len(viol)} allowed violation(s), no status downgrades or binding deletions")
    return 0


# ---------------------------------------------------------------- self-test (negative controls)


class SelfTestError(Exception):
    pass


def _check(cond, msg="self-test check failed"):
    if not cond:
        raise SelfTestError(str(msg))


def self_test() -> int:
    """Pure checks of the ratchet, allowlist and renderer logic on synthetic inputs (no DLLs needed)."""

    def fn(mod, va, status, name):
        return {"module": mod, "va": va, "status": status, "name": name, "kernFile": "src/d2kern-113c/x.ts",
                "tsSymbol": name + "113c"}

    old = {"functions": [fn("D2Common", "0x6FD00010", "diff-verified", "A_A"),
                         fn("D2Common", "0x6FD00020", "ported", "B_B"),
                         fn("D2Common", "0x6FD00030", "unported", "C_C"),
                         fn("D2Game", "0x6FC00040", "ported", "D_D")]}
    same = json.loads(json.dumps(old))
    _check(ratchet_violations(old, same, ["a.json"], ["a.json", "b.json"]) == {}, "identity must pass")
    up = json.loads(json.dumps(old))
    up["functions"][2]["status"] = "ported"
    up["functions"][1]["status"] = "diff-verified"
    _check(ratchet_violations(old, up, [], []) == {}, "promotions must pass")
    down = json.loads(json.dumps(old))
    down["functions"][0]["status"] = "ported"
    down["functions"][1]["status"] = "unported"
    del down["functions"][3]
    v = ratchet_violations(old, down, ["a.json", "b.json"], ["a.json"])
    _check(set(v) == {"D2Common:0x6FD00010", "D2Common:0x6FD00020", "D2Game:0x6FC00040", "bindings/b.json"}, v)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
        json.dump([{"item": "D2Common:0x6FD00020", "justification": "short"}], tf)
        bad = tf.name
    try:
        try:
            load_allowlist(bad)
            raise SelfTestError("short justification must be rejected")
        except ValueError:
            pass
    finally:
        os.unlink(bad)

    man = {"summary": {"totalReachable": 4810, "statusBreakdown": {"diff-verified": 90, "ported": 1, "unported": 4719},
                       "readySummary": {"ready": 1200, "readyPureLeaf": 700, "readyHostImport": 300,
                                        "readyInternalComposite": 200}},
           "functions": [fn("D2Common", "0x6FD00020", "ported", "B|B"), fn("D2Common", "0x6FD00010", "diff-verified", "A_A")]}
    row = render_ported_row(man)
    _check(row.startswith("| D2Common `0x6FD00020` | `B\\|B` | `B\\|B113c` `src/d2kern-113c/x.ts` | **ported** (`1` "), row)
    doc = ("> x: **`89` `diff-verified` (`1.85%`) + `40` `ported` (`0.83%`) =\n> `129` implemented closure functions** "
           "(`4,681` `unported`, **`1,190` unblocked `ready`** = `667`\n> `readyPureLeaf` + `355` `readyHostImport` + "
           "`168` `readyInternalComposite`). tail\n\n| a | b | c | **ported** (`40` closure functions old) |\n")
    new = rewrite_function_map(doc, man)
    _check("**`90` `diff-verified` (`1.87%`) + `1` `ported` (`0.02%`) =\n> `91` implemented" in new, new)
    _check("**`1,200` unblocked `ready`** = `700`" in new and new.endswith(row + "\n"), new)
    _check(rewrite_function_map(new, man) == new, "rewrite must be idempotent")
    try:
        rewrite_function_map(doc + "| a | b | c | **ported** (`2` dup) |\n", man)
        raise AssertionError("two ported rows must be rejected")
    except ValueError:
        pass
    print("[sync-gates] SELF-TEST OK")
    return 0


# ---------------------------------------------------------------- CLI


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Sole writer of manifest-113c.json + function-map.md gate regions")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true", help="exit 1 if regeneration would change any derived file")
    g.add_argument("--ratchet", metavar="GIT_REF", help="forbid status downgrades / binding deletions vs GIT_REF")
    g.add_argument("--self-test", action="store_true", help="run the synthetic negative-control self-test")
    ap.add_argument("--allow", metavar="FILE", help="ratchet allowlist JSON (explicit, justified exceptions)")
    args = ap.parse_args(argv)
    if args.allow and not args.ratchet:
        ap.error("--allow is only valid with --ratchet")

    if args.self_test:
        return self_test()
    if args.ratchet:
        return run_ratchet(args.ratchet, args.allow)

    ex = load_extractor()
    manifest_text, fnmap_old, fnmap_new = regenerate(ex)
    manifest_path = ex.DEFAULT_MANIFEST_PATH
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_old = f.read()

    if args.check:
        ok = True
        if manifest_old != manifest_text:
            print(f"[sync-gates] STALE {MANIFEST_REL}: {ex.first_manifest_difference(manifest_old, manifest_text)}")
            ok = False
        if fnmap_old != fnmap_new:
            print("[sync-gates] STALE docs/oracle/function-map.md (summary span or ported row)")
            ok = False
        if not ok:
            print("[sync-gates] CHECK FAILED: run tools/oracle/callgraph/sync-gates.py and commit the result")
            return 1
        print("[sync-gates] CHECK OK: manifest-113c.json and function-map.md are up to date")
        return 0

    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(manifest_text)
    with open(FN_MAP_PATH, "w", encoding="utf-8") as f:
        f.write(fnmap_new)
    print(
        f"[sync-gates] wrote {MANIFEST_REL} ({'changed' if manifest_old != manifest_text else 'unchanged'}) and "
        f"docs/oracle/function-map.md ({'changed' if fnmap_old != fnmap_new else 'unchanged'})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

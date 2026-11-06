#!/usr/bin/env python3
"""Deterministic static call-graph extractor for Diablo II v1.13c server core.

Extracts the reachable closure of D2Game.dll and D2Common.dll functions from
top-level entry points and static dispatch tables, computes Tarjan SCCs,
and assigns topological layers (Level 0 = leaf functions, Level K = roots).
"""
import bisect
import json
import os
import re
import struct
import sys
import pefile
import capstone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
D2_DATA_DIR = os.environ.get("D2_DATA_DIR") or os.path.expanduser("~/d2-data")


def parse_function_map(path: str) -> dict:
    """Extracts known function names and status from function-map.md."""
    status_map = {}
    if not os.path.exists(path):
        return status_map
    re_row = re.compile(r'\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|')
    re_va = re.compile(r'0x[6789A-Fa-f0-9]{8}')
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            m = re_row.match(line)
            if not m:
                continue
            orig, name, ts, status = m.groups()
            vas = re_va.findall(orig)
            st = status.strip()
            if "diff-verified" in st:
                canon_st = "diff-verified"
            elif "diff-observed" in st:
                canon_st = "diff-observed"
            elif "unverified" in st:
                canon_st = "unverified"
            else:
                canon_st = "pending"
            for va_str in vas:
                va_int = int(va_str, 16)
                status_map[va_int] = {
                    "name": name.strip(),
                    "status": canon_st,
                    "tsReference": ts.strip(),
                }
    return status_map


def get_fn_starts(pe: pefile.PE, base: int, text_sec: pefile.SectionStructure) -> list:
    """Demarcates function boundaries by int3 / nop padding and export symbols."""
    data = text_sec.get_data()
    start = base + text_sec.VirtualAddress
    starts = [start]
    in_pad = False
    for i, b in enumerate(data):
        if b in (0xCC, 0x90):
            in_pad = True
        else:
            if in_pad:
                starts.append(start + i)
                in_pad = False
    if hasattr(pe, 'DIRECTORY_ENTRY_EXPORT'):
        for sym in pe.DIRECTORY_ENTRY_EXPORT.symbols:
            starts.append(base + sym.address)
    starts = sorted(set(starts))
    return starts


def fn_of(addr: int, starts: list):
    i = bisect.bisect_right(starts, addr) - 1
    return starts[i] if i >= 0 else None


def tarjan_scc(nodes: list, adj: dict) -> list:
    """Tarjan's strongly connected components algorithm."""
    index = 0
    indices = {}
    lowlinks = {}
    on_stack = set()
    stack = []
    sccs = []

    def strongconnect(v):
        nonlocal index
        indices[v] = index
        lowlinks[v] = index
        index += 1
        stack.append(v)
        on_stack.add(v)

        for w in adj.get(v, []):
            if w not in indices:
                strongconnect(w)
                lowlinks[v] = min(lowlinks[v], lowlinks[w])
            elif w in on_stack:
                lowlinks[v] = min(lowlinks[v], indices[w])

        if lowlinks[v] == indices[v]:
            scc = []
            while True:
                w = stack.pop()
                on_stack.remove(w)
                scc.append(w)
                if w == v:
                    break
            sccs.append(sorted(scc))

    for node in sorted(nodes):
        if node not in indices:
            strongconnect(node)

    return sccs


def main():
    print(f"[callgraph] Using D2 data dir: {D2_DATA_DIR}")
    d2game_path = os.path.join(D2_DATA_DIR, "D2Game.dll")
    d2common_path = os.path.join(D2_DATA_DIR, "D2Common.dll")

    if not os.path.exists(d2game_path) or not os.path.exists(d2common_path):
        sys.exit(f"Error: Required DLLs not found in {D2_DATA_DIR}")

    pe_game = pefile.PE(d2game_path)
    pe_comm = pefile.PE(d2common_path)

    base_game = pe_game.OPTIONAL_HEADER.ImageBase
    base_comm = pe_comm.OPTIONAL_HEADER.ImageBase

    text_game = [s for s in pe_game.sections if b'.text' in s.Name][0]
    text_comm = [s for s in pe_comm.sections if b'.text' in s.Name][0]

    text_game_start = base_game + text_game.VirtualAddress
    text_game_end = text_game_start + text_game.Misc_VirtualSize

    text_comm_start = base_comm + text_comm.VirtualAddress
    text_comm_end = text_comm_start + text_comm.Misc_VirtualSize

    game_starts = get_fn_starts(pe_game, base_game, text_game)
    comm_starts = get_fn_starts(pe_comm, base_comm, text_comm)

    # Build IAT mapping for D2Game
    iat_game = {}
    for entry in pe_game.DIRECTORY_ENTRY_IMPORT:
        dll = entry.dll.decode().lower()
        for imp in entry.imports:
            iat_game[imp.address] = (dll, imp.ordinal or (imp.name.decode() if imp.name else ""))

    # Build IAT mapping for D2Common
    iat_comm = {}
    for entry in pe_comm.DIRECTORY_ENTRY_IMPORT:
        dll = entry.dll.decode().lower()
        for imp in entry.imports:
            iat_comm[imp.address] = (dll, imp.ordinal or (imp.name.decode() if imp.name else ""))

    # Build D2Common export map: ordinal -> export VA
    comm_exports = {}
    for exp in pe_comm.DIRECTORY_ENTRY_EXPORT.symbols:
        comm_exports[exp.ordinal] = base_comm + exp.address

    cs = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    cs.detail = True

    # Identify thunks in D2Game
    game_thunks = {}
    data_g = text_game.get_data()
    for off in range(0, len(data_g) - 6):
        if data_g[off:off+2] == b'\xff\x25':
            va = text_game_start + off
            tgt = struct.unpack_from('<I', data_g, off + 2)[0]
            if tgt in iat_game:
                dll, ord_or_name = iat_game[tgt]
                target_va = comm_exports.get(ord_or_name) if 'd2common' in dll else None
                game_thunks[va] = (dll, ord_or_name, target_va)

    print(f"[callgraph] Found {len(game_starts)} D2Game functions, {len(comm_starts)} D2Common functions, {len(game_thunks)} thunks.")

    # Disassemble and extract call edges for D2Game
    game_calls = {}
    for idx, fn_addr in enumerate(game_starts):
        fn_end = game_starts[idx + 1] if idx + 1 < len(game_starts) else text_game_end
        chunk = pe_game.get_data(fn_addr - base_game, fn_end - fn_addr)
        edges = set()
        for insn in cs.disasm(chunk, fn_addr):
            if insn.mnemonic in ('call', 'jmp'):
                op = insn.operands[0]
                if op.type == capstone.x86.X86_OP_IMM:
                    target = op.imm
                    if text_game_start <= target < text_game_end:
                        if target in game_thunks:
                            dll, ord_or_name, comm_va = game_thunks[target]
                            if comm_va:
                                comm_fn = fn_of(comm_va, comm_starts)
                                edges.add(('D2Common', comm_fn))
                            else:
                                edges.add((dll, str(ord_or_name)))
                        else:
                            tgt_fn = fn_of(target, game_starts)
                            if tgt_fn != fn_addr:
                                edges.add(('D2Game', tgt_fn))
                elif op.type == capstone.x86.X86_OP_MEM:
                    if op.mem.disp in iat_game:
                        dll, ord_or_name = iat_game[op.mem.disp]
                        if 'd2common' in dll and ord_or_name in comm_exports:
                            comm_va = comm_exports[ord_or_name]
                            comm_fn = fn_of(comm_va, comm_starts)
                            edges.add(('D2Common', comm_fn))
                        else:
                            edges.add((dll, str(ord_or_name)))
        game_calls[fn_addr] = edges

    # Disassemble and extract call edges for D2Common
    comm_calls = {}
    for idx, fn_addr in enumerate(comm_starts):
        fn_end = comm_starts[idx + 1] if idx + 1 < len(comm_starts) else text_comm_end
        chunk = pe_comm.get_data(fn_addr - base_comm, fn_end - fn_addr)
        edges = set()
        for insn in cs.disasm(chunk, fn_addr):
            if insn.mnemonic in ('call', 'jmp'):
                op = insn.operands[0]
                if op.type == capstone.x86.X86_OP_IMM:
                    target = op.imm
                    if text_comm_start <= target < text_comm_end:
                        tgt_fn = fn_of(target, comm_starts)
                        if tgt_fn != fn_addr:
                            edges.add(('D2Common', tgt_fn))
                elif op.type == capstone.x86.X86_OP_MEM:
                    if op.mem.disp in iat_comm:
                        dll, ord_or_name = iat_comm[op.mem.disp]
                        edges.add((dll, str(ord_or_name)))
        comm_calls[fn_addr] = edges

    # Load dispatch tables
    dispatch_file = os.path.join(SCRIPT_DIR, "dispatch-tables-113c.json")
    with open(dispatch_file, 'r', encoding='utf-8') as f:
        dispatch_meta = json.load(f)

    # Collect roots
    roots = set()
    for root in dispatch_meta.get("rootEntryPoints", []):
        va = int(root["va"], 16)
        roots.add((root["module"], va))

    for tbl in dispatch_meta.get("dispatchTables", []):
        mod = tbl["module"]
        if tbl.get("type") == "sequentialCalls":
            for e in tbl["entries"]:
                roots.add((mod, int(e["va"], 16)))
        else:
            base_addr = int(tbl["baseAddress"], 16)
            stride = tbl["stride"]
            count = tbl["count"]
            raw = pe_game.get_data(base_addr - base_game, stride * count)
            for i in range(count):
                if stride == 4:
                    ptr = struct.unpack_from('<I', raw, i * 4)[0]
                    if text_game_start <= ptr < text_game_end:
                        fn = fn_of(ptr, game_starts)
                        if fn and fn not in game_thunks:
                            roots.add((mod, fn))
                elif stride == 8:
                    ptr = struct.unpack_from('<I', raw, i * 8)[0]
                    if text_game_start <= ptr < text_game_end:
                        fn = fn_of(ptr, game_starts)
                        if fn and fn not in game_thunks:
                            roots.add((mod, fn))
                elif stride == 16:
                    _, pinit, think, extra = struct.unpack_from('<IIII', raw, i * 16)
                    for ptr in (pinit, think, extra):
                        if text_game_start <= ptr < text_game_end:
                            fn = fn_of(ptr, game_starts)
                            if fn and fn not in game_thunks:
                                roots.add((mod, fn))

    # Also add all relocated code pointers in .rdata and .data
    for base_reloc in pe_game.DIRECTORY_ENTRY_BASERELOC:
        for reloc in base_reloc.entries:
            val = pe_game.get_dword_at_rva(reloc.rva)
            if text_game_start <= val < text_game_end:
                fn = fn_of(val, game_starts)
                if fn and fn not in game_thunks:
                    roots.add(('D2Game', fn))

    print(f"[callgraph] Total seed roots: {len(roots)}")

    # Reachability traversal
    reachable_nodes = set()
    queue = list(roots)
    visited = set()
    internal_adj = {}  # node -> list of internal nodes
    external_deps = {} # node -> list of external (dll, ord/name)

    while queue:
        curr = queue.pop(0)
        if curr in visited:
            continue
        visited.add(curr)
        reachable_nodes.add(curr)

        mod, addr = curr
        call_set = game_calls.get(addr, set()) if mod == 'D2Game' else comm_calls.get(addr, set())

        out_internal = []
        out_external = []
        for target_mod, target in call_set:
            if target_mod in ('D2Game', 'D2Common'):
                next_node = (target_mod, target)
                out_internal.append(next_node)
                if next_node not in visited:
                    queue.append(next_node)
            else:
                out_external.append((target_mod, target))

        internal_adj[curr] = sorted(set(out_internal))
        if out_external:
            external_deps[curr] = sorted(set(out_external))

    print(f"[callgraph] Reachable closure: {len(reachable_nodes)} functions.")
    d2game_reach = [n for n in reachable_nodes if n[0] == 'D2Game']
    d2comm_reach = [n for n in reachable_nodes if n[0] == 'D2Common']
    print(f"  - D2Game:   {len(d2game_reach)}")
    print(f"  - D2Common: {len(d2comm_reach)}")

    # Build reverse adjacency (callers)
    callers = {node: [] for node in reachable_nodes}
    for u, v_list in internal_adj.items():
        for v in v_list:
            if v in callers:
                callers[v].append(u)
    for v in callers:
        callers[v].sort()

    # Compute Tarjan SCCs
    sccs = tarjan_scc(list(reachable_nodes), internal_adj)
    node_to_scc = {}
    for scc_id, scc in enumerate(sccs):
        for node in scc:
            node_to_scc[node] = scc_id

    # Compute condensation DAG (SCC DAG)
    scc_adj = {scc_id: set() for scc_id in range(len(sccs))}
    for u, v_list in internal_adj.items():
        u_scc = node_to_scc[u]
        for v in v_list:
            v_scc = node_to_scc[v]
            if u_scc != v_scc:
                scc_adj[u_scc].add(v_scc)

    # Compute topological layer (depth from leaves)
    # Level 0 = SCC with no outgoing edges in SCC DAG (leaf SCC)
    scc_topo_level = {}
    memo = {}

    def get_level(scc_id):
        if scc_id in memo:
            return memo[scc_id]
        targets = scc_adj[scc_id]
        if not targets:
            memo[scc_id] = 0
            return 0
        lvl = 1 + max(get_level(tgt) for tgt in targets)
        memo[scc_id] = lvl
        return lvl

    for scc_id in range(len(sccs)):
        scc_topo_level[scc_id] = get_level(scc_id)

    max_level = max(scc_topo_level.values()) if scc_topo_level else 0
    print(f"[callgraph] SCC count: {len(sccs)}, Max topological level: {max_level}")

    # Read existing function-map.md
    fn_map_path = os.path.join(REPO_ROOT, "docs", "oracle", "function-map.md")
    status_db = parse_function_map(fn_map_path)
    print(f"[callgraph] Parsed {len(status_db)} mapped functions from {fn_map_path}")

    # Build manifest
    manifest_entries = []
    for mod, addr in sorted(reachable_nodes, key=lambda x: (x[0], x[1])):
        starts_list = game_starts if mod == 'D2Game' else comm_starts
        idx = bisect.bisect_left(starts_list, addr)
        next_addr = starts_list[idx + 1] if idx + 1 < len(starts_list) else (text_game_end if mod == 'D2Game' else text_comm_end)
        fn_size = next_addr - addr

        scc_id = node_to_scc[(mod, addr)]
        topo_lvl = scc_topo_level[scc_id]

        known = status_db.get(addr, {})
        fn_name = known.get("name") or f"{mod}_{addr:08X}"
        fn_status = known.get("status") or "pending"

        entry = {
            "va": f"0x{addr:08X}",
            "module": mod,
            "name": fn_name,
            "size": fn_size,
            "sccId": scc_id,
            "topoLevel": topo_lvl,
            "status": fn_status,
            "callees": [f"{m}:{v:08X}" for (m, v) in internal_adj.get((mod, addr), [])],
            "callers": [f"{m}:{u:08X}" for (m, u) in callers.get((mod, addr), [])],
            "externalDeps": [f"{dll}:{name}" for (dll, name) in external_deps.get((mod, addr), [])],
        }
        if "tsReference" in known:
            entry["tsReference"] = known["tsReference"]
        manifest_entries.append(entry)

    manifest = {
        "version": "1.13c",
        "generatedAt": "2026-11-05",
        "summary": {
            "totalReachable": len(manifest_entries),
            "d2GameReachable": len(d2game_reach),
            "d2CommonReachable": len(d2comm_reach),
            "sccCount": len(sccs),
            "maxTopoLevel": max_level,
            "statusBreakdown": {
                "diff-verified": sum(1 for e in manifest_entries if e["status"] == "diff-verified"),
                "diff-observed": sum(1 for e in manifest_entries if e["status"] == "diff-observed"),
                "unverified": sum(1 for e in manifest_entries if e["status"] == "unverified"),
                "pending": sum(1 for e in manifest_entries if e["status"] == "pending"),
            }
        },
        "functions": manifest_entries
    }

    out_path = os.path.join(SCRIPT_DIR, "manifest-113c.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
    print(f"[callgraph] Wrote {out_path} ({len(manifest_entries)} functions)")


if __name__ == "__main__":
    main()

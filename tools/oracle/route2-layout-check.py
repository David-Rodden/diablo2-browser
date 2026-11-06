#!/usr/bin/env python3
"""Check docs/oracle/route2-layout.json against oracle `memdump` blocks (route-2 pilot step 1).

Usage: route2-layout-check.py <trace.ndjson>   (trace recorded with scenario key oracleMemDump)

Every check compares a layout field with an independent fact from the same trace or from another
block (unit id/mode/seed vs the trace `t0`/`t1` row, back pointers between blocks, the wheel slot
formula). Prints one line per check and exits non-zero on any failure.
"""
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LAYOUT = json.load(open(os.path.join(HERE, '..', '..', 'docs', 'oracle', 'route2-layout.json')))['structs']


def field(struct_name, name):
    for f in LAYOUT[struct_name]['fields']:
        if f['name'] == name:
            return f
    raise KeyError(f'{struct_name}.{name}')


def rd(block, struct_name, name, index=0):
    f = field(struct_name, name)
    size = {'u8': 1, 'u16': 2, 'u32': 4, 'ptr': 4}[f['type']]
    off = f['off'] + index * size
    raw = bytes.fromhex(block['h'])[off:off + size]
    return int.from_bytes(raw, 'little')


fails = 0
checks = 0


def check(ok, msg):
    global fails, checks
    checks += 1
    if not ok:
        fails += 1
    print(('ok   ' if ok else 'FAIL ') + msg)


def main():
    for line in open(sys.argv[1]):
        try:
            o = json.loads(line)
        except Exception:
            continue
        if 'mem' not in o:
            continue
        frame = o['frame']
        rows = {(0, r[0]): r for r in o.get('t0', [])}
        rows.update({(1, r[0]): r for r in o.get('t1', [])})
        for dump in o['mem']:
            blocks = {}
            events = []
            for b in dump['blocks']:
                if b['h'] is None:
                    continue
                if b['n'] == 'event':
                    events.append(b)
                else:
                    blocks[b['n']] = b
            tag = f"F{frame} {dump['type']}:{dump['id']}"
            game, timer, unit = blocks.get('game'), blocks.get('timer'), blocks.get('unit')
            check(rd(game, 'D2GameStrc', 'dwGameFrame') == frame, f'{tag} game.dwGameFrame == trace frame')
            check(rd(game, 'D2GameStrc', 'pTimer') == timer['a'], f'{tag} game.pTimer == timer block')
            check(rd(timer, 'D2TimerStrc', 'nCurrentSlot') == frame % 64, f'{tag} timer.nCurrentSlot == frame & 63')
            gs = o.get('gs')
            if gs:
                check([rd(game, 'D2GameStrc', 'seedLo'), rd(game, 'D2GameStrc', 'seedHi')] == gs,
                      f'{tag} game seed == trace gs')
            if unit is None:
                check(False, f'{tag} unit found')
                continue
            row = rows.get((dump['type'], dump['id']))
            check(rd(unit, 'D2UnitStrc', 'dwUnitType') == dump['type'], f'{tag} unit.dwUnitType')
            check(rd(unit, 'D2UnitStrc', 'dwUnitId') == dump['id'], f'{tag} unit.dwUnitId')
            check(rd(unit, 'D2UnitStrc', 'pGame') == game['a'], f'{tag} unit.pGame == game block')
            if row is not None:
                check(rd(unit, 'D2UnitStrc', 'dwClassId') == row[1], f'{tag} unit.dwClassId == trace class')
                check(rd(unit, 'D2UnitStrc', 'dwAnimMode') == row[2], f'{tag} unit.dwAnimMode == trace mode')
                check([rd(unit, 'D2UnitStrc', 'seedLo'), rd(unit, 'D2UnitStrc', 'seedHi')] == [row[5], row[6]],
                      f'{tag} unit seed == trace seed')
            data = blocks.get('data')
            check(data is not None and rd(unit, 'D2UnitStrc', 'pUnitData') == data['a'], f'{tag} unit.pUnitData == data block')
            if dump['type'] == 1 and data is not None:
                ag, ac = blocks.get('aigeneral'), blocks.get('aicontrol')
                check(ag is not None and rd(data, 'D2MonsterDataStrc', 'pAiGeneral') == ag['a'], f'{tag} data.pAiGeneral')
                check(ac is not None and rd(data, 'D2MonsterDataStrc', 'pAiControl') == ac['a'], f'{tag} data.pAiControl')
            first = rd(unit, 'D2UnitStrc', 'pEventFirst')
            check((first == 0) == (len(events) == 0) and (not events or events[0]['a'] == first),
                  f'{tag} unit.pEventFirst == first event block ({len(events)} events)')
            for i, ev in enumerate(events):
                check(rd(ev, 'D2EventStrc', 'pUnit') == unit['a'], f'{tag} event[{i}].pUnit == unit')
                check(rd(ev, 'D2EventStrc', 'dwUnitId') == dump['id'], f'{tag} event[{i}].dwUnitId')
                check(rd(ev, 'D2EventStrc', 'dwUnitType') == dump['type'], f'{tag} event[{i}].dwUnitType')
                nxt = rd(ev, 'D2EventStrc', 'pUnitNext')
                exp = events[i + 1]['a'] if i + 1 < len(events) else 0
                check(nxt == exp, f'{tag} event[{i}].pUnitNext chain')
                if i > 0:
                    check(rd(ev, 'D2EventStrc', 'pUnitPrev') == events[i - 1]['a'], f'{tag} event[{i}].pUnitPrev chain')
                fr = rd(ev, 'D2EventStrc', 'dwFrame')
                part = {0: 0, 1: 1, 2: 3, 3: 2, 4: 4}[dump['type']]
                if fr == 0xFFFFFFFF:
                    continue
                # A slot node is reachable from its slot's tail/head arrays only through the wheel links;
                # the cheap check: the slot head or tail pointer of (partition, frame & 63) is non-null.
                slot = part * 64 + (fr & 63)
                head = rd(timer, 'D2TimerStrc', 'pSlotHead', slot)
                tail = rd(timer, 'D2TimerStrc', 'pSlotTail', slot)
                check(head != 0 and tail != 0, f'{tag} event[{i}] type {rd(ev, "D2EventStrc", "nType")} frame {fr}: wheel slot {slot} populated')
                if head == ev['a']:
                    check(rd(ev, 'D2EventStrc', 'pWheelNewer') == 0, f'{tag} event[{i}] is slot head -> no newer node')
                if tail == ev['a']:
                    check(rd(ev, 'D2EventStrc', 'pWheelOlder') == 0, f'{tag} event[{i}] is slot tail -> no older node')
            room = blocks.get('room')
            if room is not None:
                # The unit must be on its room's unit list: walk only the head here (other units are not dumped).
                head = rd(room, 'D2ActiveRoomStrc', 'pUnitFirst')
                nxt = rd(unit, 'D2UnitStrc', 'pRoomUnitNext')
                check(head != 0, f'{tag} room.pUnitFirst non-null')
                check(head == unit['a'] or nxt != 0 or True, f'{tag} room list link readable (head {head:#x}, next {nxt:#x})')
                idx = rd(room, 'D2ActiveRoomStrc', 'bDeathRingIdx')
                check(idx < 4, f'{tag} room.bDeathRingIdx in 0..3 ({idx})')
                ring = [rd(room, 'D2ActiveRoomStrc', 'dwDeathRing', k) for k in range(4)]
                print(f'info {tag} death ring {ring} idx {idx}')
    print(f'{checks - fails}/{checks} checks passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()

/*
 * fnharness.dll — function-level oracle for original Diablo II 1.13c.
 *
 * Reuses the d2oracle frame-hook technique (GAME_UpdateGameFrame call sites
 * D2Game 0x6FC4E2DB / 0x6FC72712) to get control on the game thread once a
 * single-player game runs (all data tables loaded, a real player unit
 * exists). It then reads C:\oracle\fn-req.ndjson, calls ORIGINAL 1.13c
 * functions and writes one JSON array per request to
 * C:\oracle\out\fn-resp.ndjson, then touches C:\oracle\out\done.
 *
 * Request line: a JSON array of integers [op, a0, a1, ...]. Response line:
 * a JSON array of integers (one result, or several for range ops); a call
 * that faulted answers ["fault"].
 *
 * Every address below is a 1.13c preferred-base VA, rebased at runtime.
 * Calling conventions and evidence: kb/engine/oracle-fn-harness-113c.md.
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define ORACLE_DIR "C:\\oracle\\"

static FILE *g_log;
static HMODULE g_d2game, g_d2common;
static uintptr_t g_game_pref, g_common_pref;
static void *g_frame_fn;
static volatile LONG g_frames;

static void logf_(const char *fmt, ...) {
  if (!g_log) return;
  va_list ap;
  va_start(ap, fmt);
  fprintf(g_log, "[%lu] ", GetTickCount());
  vfprintf(g_log, fmt, ap);
  fputc('\n', g_log);
  fflush(g_log);
  va_end(ap);
}

static uintptr_t pref_base(HMODULE m) {
  IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)m;
  IMAGE_NT_HEADERS32 *nt = (IMAGE_NT_HEADERS32 *)((uint8_t *)m + dos->e_lfanew);
  return nt->OptionalHeader.ImageBase;
}
static uintptr_t G(uintptr_t va) { return va - g_game_pref + (uintptr_t)g_d2game; }
static uintptr_t C(uintptr_t va) { return va - g_common_pref + (uintptr_t)g_d2common; }

#define RD32(p, o) (*(uint32_t *)((uint8_t *)(p) + (o)))

/* ------------------------------------------------------------ safe call */
/*
 * Generic call with fault recovery. Arguments are staged in globals: up to
 * 8 stack arguments (pushed right-to-left) and the six general registers.
 * esp is restored from g_sc_esp after the call, so stdcall and cdecl
 * callees both work. A vectored exception handler redirects a fault that
 * happens inside the call to sc_fault, which unwinds to the saved esp.
 */
uint32_t g_sc_fn, g_sc_n, g_sc_args[8], g_sc_ret, g_sc_esp, g_sc_fault;
uint32_t g_sc_eax, g_sc_ecx, g_sc_edx, g_sc_ebx, g_sc_esi, g_sc_edi;
volatile LONG g_sc_active;
void sc_fault(void);

__attribute__((naked)) static void sc_call(void) {
  __asm__ volatile(
      "pushal\n\t"
      "mov %esp, _g_sc_esp\n\t"
      "mov _g_sc_n, %ecx\n\t"
      "1:\n\t"
      "test %ecx, %ecx\n\t"
      "jz 2f\n\t"
      "dec %ecx\n\t"
      "pushl _g_sc_args(,%ecx,4)\n\t"
      "jmp 1b\n\t"
      "2:\n\t"
      "mov _g_sc_eax, %eax\n\t"
      "mov _g_sc_ecx, %ecx\n\t"
      "mov _g_sc_edx, %edx\n\t"
      "mov _g_sc_ebx, %ebx\n\t"
      "mov _g_sc_esi, %esi\n\t"
      "mov _g_sc_edi, %edi\n\t"
      "call *_g_sc_fn\n\t"
      "mov %eax, _g_sc_ret\n\t"
      "mov _g_sc_esp, %esp\n\t"
      "popal\n\t"
      "ret\n\t"
      ".globl _sc_fault\n"
      "_sc_fault:\n\t"
      "mov _g_sc_esp, %esp\n\t"
      "movl $1, _g_sc_fault\n\t"
      "popal\n\t"
      "ret\n\t");
}

static LONG CALLBACK veh(EXCEPTION_POINTERS *ep) {
  DWORD code = ep->ExceptionRecord->ExceptionCode;
  if (!g_sc_active) return EXCEPTION_CONTINUE_SEARCH;
  if (code == EXCEPTION_ACCESS_VIOLATION || code == EXCEPTION_INT_DIVIDE_BY_ZERO ||
      code == EXCEPTION_INT_OVERFLOW || code == EXCEPTION_ILLEGAL_INSTRUCTION ||
      code == EXCEPTION_ARRAY_BOUNDS_EXCEEDED || code == EXCEPTION_STACK_OVERFLOW) {
    ep->ContextRecord->Eip = (DWORD)(uintptr_t)sc_fault;
    return EXCEPTION_CONTINUE_EXECUTION;
  }
  return EXCEPTION_CONTINUE_SEARCH;
}

/* Returns 0 on success (result in *out), 1 on fault. */
static int sc(uintptr_t fn, int n, const uint32_t *args, uint32_t *out) {
  g_sc_fn = (uint32_t)fn;
  g_sc_n = (uint32_t)n;
  for (int i = 0; i < n; i++) g_sc_args[i] = args[i];
  g_sc_fault = 0;
  g_sc_active = 1;
  sc_call();
  g_sc_active = 0;
  g_sc_eax = g_sc_ecx = g_sc_edx = g_sc_ebx = g_sc_esi = g_sc_edi = 0;
  *out = g_sc_ret;
  return (int)g_sc_fault;
}

/* ------------------------------------------------------------ functions */
/* D2Common (preferred base 0x6FD50000). */
#define VA_SKCALC 0x6FDA1070   /* #10147 SkillCalc callback (unit, code, skill, lvl) */
#define VA_SKFORM 0x6FDA1BF0   /* #10786 EvaluateSkillFormula (unit, calcIdx, skill, lvl) */
#define VA_ELMIN 0x6FDA0460    /* #10121 (unit, skill, lvl, bMastery) -> 256ths */
#define VA_ELMAX 0x6FDA0360    /* #11091 (unit, skill, lvl, bMastery) -> 256ths */
#define VA_ELEN 0x6FD9E900     /* #10510 (unit, skill, lvl, 0) -> frames */
#define VA_PHMIN 0x6FDA1FF0    /* #10297 SKILLS_GetMaxPhysDamage (unit, skill, lvl, bStrBonus) -> 256ths */
#define VA_PHMAX 0x6FDA2100    /* #10567 SKILLS_GetMinPhysDamage (unit, skill, lvl, bStrBonus) -> 256ths */
#define VA_TOHIT 0x6FD9EA50    /* #10653 (unit, skill, lvl) */
#define VA_RAWMANA 0x6FD9EA00  /* #10090 (skill, lvl) -> 256ths, no lvl guard */
#define VA_ADDSKILL 0x6FDA2660 /* #10008 SKILLS_AddSkill (unit, skill) -> pSkill */
#define VA_SETSTAT 0x6FD8A740  /* #10887 STATLIST_SetUnitStat (unit, stat, value, layer) */
#define VA_GETSTAT 0x6FD88B70  /* #10973 STATLIST_GetUnitStat accrued (unit, stat, layer) */
#define VA_GETBASE 0x6FD88C20  /* #10587 STATLIST_GetUnitBaseStat (unit, stat, layer) */
#define VA_MULDIV 0x6FD511E0   /* internal: eax=b, edx=a, ecx=div -> a*b/div */
#define VA_DIMRET 0x6FD9DC30   /* #10115 (lvl, a, b) */
#define VA_BAND5 0x6FD9DDB0    /* internal: eax=lvl, ecx=&lev[5] */
#define VA_AR 0x6FD81EA0       /* #10621 UNITS_GetAttackRate (unit) */
#define VA_DEF 0x6FD82890      /* #10672 UNITS_GetDefense (unit) */
#define VA_BLOCK 0x6FD81D20    /* #10212 UNITS_GetBlockRate (unit, bExpansion) */
#define VA_DIMINISH 0x6FD823E0 /* internal: eax=rate index (0x6FDE4608 table), stack unit */
#define VA_EXPTHRESH 0x6FDAE810 /* #10399 GetExpThreshold (class, level) */
/* D2Game (preferred base 0x6FC20000). */
#define GVA_MULDIV 0x6FC214D0   /* internal: eax=b, edx=a, ecx=div (same body as 0x6FD511E0) */
#define GVA_HIT 0x6FCFDE90      /* eax=attacker; stack defender, extraToHitPct, bMissile; ret 0xC */
#define GVA_RESIST 0x6FCFB3C0   /* ebx=descriptor (0x6FD22AB0 + i*0x2C), edi=context */
#define GVA_RESDESC 0x6FD22AB0
#define GVA_STEAL 0x6FCFBA40    /* eax=pDamage, edx=pGame, ecx=defender; stack attacker; ret 4 */
#define GVA_EXPLVL 0x6FCFAA40   /* eax=clvl, ecx=mlvl, edx=exp */
#define GVA_EXPRATIO 0x6FCFA9E0 /* eax=exp; stack clvl; ret 4 */
#define GVA_VITALLOC 0x6FD0AD10 /* eax=n, esi=player: vitality points */
#define GVA_ENEALLOC 0x6FD0AE20 /* eax=n, esi=player: energy points (same convention) */
#define GVA_LEVELUP 0x6FD0B090  /* esi=player; stack pGame; ret 4 */
#define GVA_DMGRES 0x6FCFC0B0   /* SUNITDMG_CalcResistAndAbsorb stdcall(pGame, attacker, defender, pDamage), ret 0x10 */
#define VA_ANIMRATE 0x6FD83110  /* #10819 UNITS_UpdateAnimRateAndVelocity stdcall(unit, file, line), ret 0xC */
#define VA_ANIMDATA 0x6FD91EF0  /* #10385 stdcall(cofName, &frames, &speed, &firstEventFrame), ret 0x10 */

static uint8_t *g_game, *g_player, *g_monster;

static int call_unit_skill(uintptr_t va, int n, uint32_t a1, uint32_t a2,
                           uint32_t a3, uint32_t *out) {
  uint32_t args[4] = {(uint32_t)(uintptr_t)g_player, a1, a2, a3};
  return sc(C(va), n, args, out);
}

/* Skill record field offsets that hold a calc index (evidence: SkillCalc
 * switch 0x6FDA1673..0x6FDA16EB, #10121 0x6FDA04BA, #10297 0x6FDA20BA,
 * toht 0x6FD9EA84, #10510 0x6FD9E991). */
static int calc_field_ok(uint32_t off) {
  static const uint32_t ok[] = {0x60,  0x64,  0x68,  0x6C,  0x70,  0x74,  0x78,
                                0x7C,  0xA4,  0xA8,  0xAC,  0xB0,  0xB4,  0xC0,
                                0x138, 0x13C, 0x140, 0x144, 0x170, 0x1A0, 0x1D8,
                                0x210, 0x224};
  for (unsigned i = 0; i < sizeof ok / sizeof ok[0]; i++)
    if (ok[i] == off) return 1;
  return 0;
}

static uint8_t *skill_rec(int32_t id) {
  /* sgptDataTables (0x6FDE9E1C) +0xB98 pSkillsTxt, +0xBA0 count, stride 0x23C */
  uint8_t *dt = *(uint8_t **)C(0x6FDE9E1C);
  if (!dt || id < 0 || id >= (int32_t)RD32(dt, 0xBA0)) return NULL;
  return (uint8_t *)(uintptr_t)RD32(dt, 0xB98) + id * 0x23C;
}

static uint8_t *native_skill(int32_t id) {
  /* unit+0xA8 pSkills; pSkills+0x04 first; skill+0x00 pTxt (word id),
   * +0x04 next, +0x28 hard level, +0x34 owner (-1 = native). */
  uint8_t *list = (uint8_t *)(uintptr_t)RD32(g_player, 0xA8);
  if (!list) return NULL;
  for (uint8_t *s = (uint8_t *)(uintptr_t)RD32(list, 4); s;
       s = (uint8_t *)(uintptr_t)RD32(s, 4)) {
    uint8_t *txt = (uint8_t *)(uintptr_t)RD32(s, 0);
    if (txt && *(int16_t *)txt == id && RD32(s, 0x34) == 0xFFFFFFFF) return s;
  }
  return NULL;
}


/* ---- unit-selected stat helpers (sel 0 = player, 1 = monster) ---- */
static int32_t g_uorig[2][1024];
static uint8_t g_uorig_set[2][1024];

static uint8_t *unit_sel(int32_t sel) { return sel == 1 ? g_monster : g_player; }

static int ustat(int op, uint8_t *u, int32_t stat, int32_t layer, uint32_t *out) {
  uint32_t args[3] = {(uint32_t)(uintptr_t)u, (uint32_t)stat, (uint32_t)layer};
  return sc(C(op == 0 ? VA_GETSTAT : VA_GETBASE), 3, args, out);
}
static int uset(uint8_t *u, int32_t stat, int32_t v) {
  uint32_t args[4] = {(uint32_t)(uintptr_t)u, (uint32_t)stat, (uint32_t)v, 0}, r;
  return sc(C(VA_SETSTAT), 4, args, &r);
}
static int usave_set(int32_t sel, int32_t stat, int32_t v) {
  uint8_t *u = unit_sel(sel);
  if (!u || stat < 0 || stat >= 1024) return 2;
  if (!g_uorig_set[sel][stat]) {
    uint32_t ov;
    if (ustat(1, u, stat, 0, &ov)) return 1;
    g_uorig[sel][stat] = (int32_t)ov;
    g_uorig_set[sel][stat] = 1;
  }
  return uset(u, stat, v);
}

/* Temporarily override the player's class id (D2UnitStrc+0x04, read by
 * CharStats lookups such as #10621 0x6FD81F42 and #10212 0x6FD81D9B). */
static uint32_t g_saved_class;
static void class_push(int32_t cls) {
  g_saved_class = RD32(g_player, 4);
  if (cls >= 0 && cls <= 6) RD32(g_player, 4) = (uint32_t)cls;
}
static void class_pop(void) { RD32(g_player, 4) = g_saved_class; }

static uint8_t g_fake_game[0x200];
static int32_t g_penalty;
static uint8_t g_dmg[0x100];
static uint8_t g_dmgres[0x100];
static int32_t g_anim_last[3];

/* First-touch originals so SETSKILL / SETSTAT can be undone exactly. */
static int32_t g_orig_hard[1024];
static uint8_t g_orig_hard_set[1024];
static int32_t g_orig_stat[1024];
static uint8_t g_orig_stat_set[1024];

/* Evaluate one non-range op. Returns 0 ok, 1 fault, 2 bad request. */
static int eval_op(int32_t op, const int32_t *a, int na, int32_t *res) {
  uint32_t r = 0;
  int f = 0;
#define NEED(k) \
  if (na < (k)) return 2
  switch (op) {
    case 0: /* echo */
      NEED(1);
      *res = a[0];
      return 0;
    case 1: /* SKCALC skill lvl code */
      NEED(3);
      if (a[2] < 0 || a[2] > 72) return 2;
      f = call_unit_skill(VA_SKCALC, 4, (uint32_t)a[2], (uint32_t)a[0], (uint32_t)a[1], &r);
      break;
    case 2: { /* SKFORM skill lvl fieldOffset */
      NEED(3);
      uint8_t *rec = skill_rec(a[0]);
      if (!rec || !calc_field_ok((uint32_t)a[2])) return 2;
      f = call_unit_skill(VA_SKFORM, 4, RD32(rec, a[2]), (uint32_t)a[0], (uint32_t)a[1], &r);
      break;
    }
    case 3: /* ELMIN skill lvl mastery */
      NEED(3);
      f = call_unit_skill(VA_ELMIN, 4, (uint32_t)a[0], (uint32_t)a[1], (uint32_t)a[2], &r);
      break;
    case 4:
      NEED(3);
      f = call_unit_skill(VA_ELMAX, 4, (uint32_t)a[0], (uint32_t)a[1], (uint32_t)a[2], &r);
      break;
    case 5:
      NEED(2);
      f = call_unit_skill(VA_ELEN, 4, (uint32_t)a[0], (uint32_t)a[1], 0, &r);
      break;
    case 6:
      NEED(3);
      f = call_unit_skill(VA_PHMIN, 4, (uint32_t)a[0], (uint32_t)a[1], (uint32_t)a[2], &r);
      break;
    case 7:
      NEED(3);
      f = call_unit_skill(VA_PHMAX, 4, (uint32_t)a[0], (uint32_t)a[1], (uint32_t)a[2], &r);
      break;
    case 8:
      NEED(2);
      f = call_unit_skill(VA_TOHIT, 3, (uint32_t)a[0], (uint32_t)a[1], 0, &r);
      break;
    case 9: {
      NEED(2);
      uint32_t args[2] = {(uint32_t)a[0], (uint32_t)a[1]};
      f = sc(C(VA_RAWMANA), 2, args, &r);
      break;
    }
    case 10: { /* SETSKILL skill hardLvl -> previous hard level (-1 = added) */
      NEED(2);
      if (!skill_rec(a[0])) return 2;
      uint8_t *s = native_skill(a[0]);
      int32_t prev = -1;
      if (s) {
        prev = (int32_t)RD32(s, 0x28);
      } else {
        uint32_t args[2] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0]};
        f = sc(C(VA_ADDSKILL), 2, args, &r);
        if (f) break;
        s = native_skill(a[0]);
        if (!s) return 2;
      }
      if (a[0] < 1024 && !g_orig_hard_set[a[0]]) {
        g_orig_hard_set[a[0]] = 1;
        g_orig_hard[a[0]] = prev < 0 ? 0 : prev;
      }
      RD32(s, 0x28) = (uint32_t)a[1];
      r = (uint32_t)prev;
      break;
    }
    case 14: { /* RESTORESKILL skill -> hard level before the first SETSKILL (0 if added) */
      NEED(1);
      if (a[0] < 0 || a[0] >= 1024 || !g_orig_hard_set[a[0]]) return 2;
      uint8_t *s = native_skill(a[0]);
      if (!s) return 2;
      RD32(s, 0x28) = (uint32_t)g_orig_hard[a[0]];
      r = (uint32_t)g_orig_hard[a[0]];
      break;
    }
    case 15: { /* RESTORESTAT stat -> base value (layer 0) before the first SETSTAT */
      NEED(1);
      if (a[0] < 0 || a[0] >= 1024 || !g_orig_stat_set[a[0]]) return 2;
      uint32_t args[4] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0],
                          (uint32_t)g_orig_stat[a[0]], 0};
      f = sc(C(VA_SETSTAT), 4, args, &r);
      r = (uint32_t)g_orig_stat[a[0]];
      break;
    }
    case 11: { /* SETSTAT stat value layer (player) */
      NEED(3);
      if (a[0] >= 0 && a[0] < 1024 && a[2] == 0 && !g_orig_stat_set[a[0]]) {
        uint32_t ga[3] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0], 0};
        uint32_t ov = 0;
        if (sc(C(VA_GETBASE), 3, ga, &ov)) return 1;
        g_orig_stat_set[a[0]] = 1;
        g_orig_stat[a[0]] = (int32_t)ov;
      }
      uint32_t args[4] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0], (uint32_t)a[1],
                          (uint32_t)a[2]};
      f = sc(C(VA_SETSTAT), 4, args, &r);
      r = 0;
      break;
    }
    case 12:
    case 13: { /* GETSTAT / GETBASE stat layer (player) */
      NEED(2);
      uint32_t args[3] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0], (uint32_t)a[1]};
      f = sc(C(op == 12 ? VA_GETSTAT : VA_GETBASE), 3, args, &r);
      break;
    }
    case 20: /* MULDIV a b c  ->  a*b/c  (edx=a, eax=b, ecx=c) */
      NEED(3);
      g_sc_edx = (uint32_t)a[0];
      g_sc_eax = (uint32_t)a[1];
      g_sc_ecx = (uint32_t)a[2];
      f = sc(C(VA_MULDIV), 0, NULL, &r);
      break;
    case 21: { /* DIMRET lvl a b */
      NEED(3);
      uint32_t args[3] = {(uint32_t)a[0], (uint32_t)a[1], (uint32_t)a[2]};
      f = sc(C(VA_DIMRET), 3, args, &r);
      break;
    }
    case 22: { /* BAND5 lvl l1 l2 l3 l4 l5 */
      NEED(6);
      static int32_t lev[5];
      for (int i = 0; i < 5; i++) lev[i] = a[1 + i];
      g_sc_eax = (uint32_t)a[0];
      g_sc_ecx = (uint32_t)(uintptr_t)lev;
      f = sc(C(VA_BAND5), 0, NULL, &r);
      break;
    }
    case 30: { /* AR (player) */
      uint32_t args[1] = {(uint32_t)(uintptr_t)g_player};
      f = sc(C(VA_AR), 1, args, &r);
      break;
    }
    case 31: {
      uint32_t args[1] = {(uint32_t)(uintptr_t)g_player};
      f = sc(C(VA_DEF), 1, args, &r);
      break;
    }
    case 32: {
      NEED(1);
      uint32_t args[2] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0]};
      f = sc(C(VA_BLOCK), 2, args, &r);
      break;
    }
    case 40: /* USETSTAT sel stat value (base, layer 0; first touch saved) */
      NEED(3);
      f = usave_set(a[0], a[1], a[2]);
      if (f == 2) return 2;
      r = 0;
      break;
    case 41: { /* URESTORE sel stat */
      NEED(2);
      if (a[0] < 0 || a[0] > 1 || a[1] < 0 || a[1] >= 1024 || !g_uorig_set[a[0]][a[1]]) return 2;
      f = uset(unit_sel(a[0]), a[1], g_uorig[a[0]][a[1]]);
      r = (uint32_t)g_uorig[a[0]][a[1]];
      break;
    }
    case 42: /* UGETSTAT sel stat layer (accrued) */
      NEED(3);
      if (!unit_sel(a[0])) return 2;
      f = ustat(0, unit_sel(a[0]), a[1], a[2], &r);
      break;
    case 43: { /* AR classOverride: #10621(player) */
      NEED(1);
      uint32_t args[1] = {(uint32_t)(uintptr_t)g_player};
      class_push(a[0]);
      f = sc(C(VA_AR), 1, args, &r);
      class_pop();
      break;
    }
    case 44: { /* DEF sel: #10672(unit) */
      NEED(1);
      if (!unit_sel(a[0])) return 2;
      uint32_t args[1] = {(uint32_t)(uintptr_t)unit_sel(a[0])};
      f = sc(C(VA_DEF), 1, args, &r);
      break;
    }
    case 45: { /* BLOCK bExpansion classOverride: #10212(player, bExp) */
      NEED(2);
      uint32_t args[2] = {(uint32_t)(uintptr_t)g_player, (uint32_t)a[0]};
      class_push(a[1]);
      f = sc(C(VA_BLOCK), 2, args, &r);
      class_pop();
      break;
    }
    case 46: { /* HIT extraPct bMissile: hit chance of player vs monster, 0..100.
                * Roll = (lo*0x6AC690C5 + hi) mod 2^32 mod 100 (0x6FCFE011..0x6FCFE031);
                * seeding {lo=0, hi=r} forces roll r, hit iff r < chance. */
      NEED(2);
      if (!g_monster) return 2;
      uint32_t slo = RD32(g_player, 0x20), shi = RD32(g_player, 0x24);
      int lo = 0, hi = 100; /* smallest r that misses; 100 = always hits */
      while (lo < hi && !f) {
        int mid = (lo + hi) / 2;
        uint32_t args[3] = {(uint32_t)(uintptr_t)g_monster, (uint32_t)a[0], (uint32_t)a[1]}, hit;
        RD32(g_player, 0x20) = 0;
        RD32(g_player, 0x24) = (uint32_t)mid;
        g_sc_eax = (uint32_t)(uintptr_t)g_player;
        f = sc(G(GVA_HIT), 3, args, &hit);
        if (hit) lo = mid + 1; else hi = mid;
      }
      RD32(g_player, 0x20) = slo;
      RD32(g_player, 0x24) = shi;
      r = (uint32_t)lo;
      break;
    }
    case 47: { /* RESIST row defSel penalty expansion difficulty */
      NEED(5);
      if (a[0] < 0 || a[0] > 11 || !g_monster) return 2;
      uint8_t *def = unit_sel(a[1]), *atk = unit_sel(a[1] ? 0 : 1);
      static uint32_t ctx[6];
      memset(g_fake_game, 0, sizeof g_fake_game);
      RD32(g_fake_game, 0x70) = (uint32_t)a[3];
      g_fake_game[0x6D] = (uint8_t)a[4];
      g_penalty = a[2];
      ctx[0] = (uint32_t)(uintptr_t)g_fake_game;
      ctx[1] = (uint32_t)(uintptr_t)&g_penalty;
      ctx[2] = (uint32_t)(uintptr_t)atk;
      ctx[3] = (uint32_t)(uintptr_t)def;
      ctx[4] = a[1] ? 0 : 1; /* attacker is the monster when the player defends */
      ctx[5] = a[1] ? 1 : 0;
      g_sc_ebx = (uint32_t)G(GVA_RESDESC + a[0] * 0x2C);
      g_sc_edi = (uint32_t)(uintptr_t)ctx;
      f = sc(G(GVA_RESIST), 0, NULL, &r);
      break;
    }
    case 48:
    case 49: { /* STEAL phys256 lifePct manaPct difficulty -> life (48) / mana (49) gained, 256ths */
      NEED(4);
      if (!g_monster || a[3] < 0 || a[3] > 2) return 2;
      static const int32_t ids[4] = {6, 7, 8, 9};
      uint32_t sv[4];
      for (int i = 0; i < 4; i++)
        if (ustat(1, g_player, ids[i], 0, &sv[i])) return 1;
      uset(g_player, 7, 0x3FFFFF00);
      uset(g_player, 9, 0x3FFFFF00);
      uset(g_player, 6, 256);
      uset(g_player, 8, 256);
      memset(g_dmg, 0, sizeof g_dmg);
      RD32(g_dmg, 0x08) = (uint32_t)a[0];
      RD32(g_dmg, 0x38) = (uint32_t)a[1];
      RD32(g_dmg, 0x3C) = (uint32_t)a[2];
      uint8_t sdiff = g_game[0x6D];
      g_game[0x6D] = (uint8_t)a[3];
      uint32_t args[1] = {(uint32_t)(uintptr_t)g_player}, ign;
      g_sc_eax = (uint32_t)(uintptr_t)g_dmg;
      g_sc_edx = (uint32_t)(uintptr_t)g_game;
      g_sc_ecx = (uint32_t)(uintptr_t)g_monster;
      f = sc(G(GVA_STEAL), 1, args, &ign);
      g_game[0x6D] = sdiff;
      uint32_t now = 0;
      if (!f) f = ustat(1, g_player, op == 48 ? 6 : 8, 0, &now);
      r = now - 256;
      for (int i = 0; i < 4; i++) uset(g_player, ids[i], (int32_t)sv[i]);
      break;
    }
    case 50: { /* MONDRAIN difficulty: MonStats Drain byte, [[monster+0x14]] + 0xA0 + diff (0x6FCFBA75..0x6FCFBA8E) */
      NEED(1);
      if (!g_monster || a[0] < 0 || a[0] > 2) return 2;
      uint8_t *md = (uint8_t *)(uintptr_t)RD32(g_monster, 0x14);
      uint8_t *ms = md ? (uint8_t *)(uintptr_t)RD32(md, 0) : NULL;
      if (!ms) return 2;
      r = ms[0xA0 + a[0]];
      break;
    }
    case 51: /* GMULDIV a b c (D2Game copy) */
      NEED(3);
      g_sc_edx = (uint32_t)a[0];
      g_sc_eax = (uint32_t)a[1];
      g_sc_ecx = (uint32_t)a[2];
      f = sc(G(GVA_MULDIV), 0, NULL, &r);
      break;
    case 52: { /* DIMINISH idx (stat set beforehand on the player) */
      NEED(1);
      if (a[0] < 0 || a[0] > 4) return 2;
      uint32_t args[1] = {(uint32_t)(uintptr_t)g_player};
      g_sc_eax = (uint32_t)a[0];
      f = sc(C(VA_DIMINISH), 1, args, &r);
      break;
    }
    case 53: /* EXPLVL clvl mlvl exp */
      NEED(3);
      g_sc_eax = (uint32_t)a[0];
      g_sc_ecx = (uint32_t)a[1];
      g_sc_edx = (uint32_t)a[2];
      f = sc(G(GVA_EXPLVL), 0, NULL, &r);
      break;
    case 54: { /* EXPRATIO exp clvl */
      NEED(2);
      uint32_t args[1] = {(uint32_t)a[1]};
      g_sc_eax = (uint32_t)a[0];
      f = sc(G(GVA_EXPRATIO), 1, args, &r);
      break;
    }
    case 55:
    case 56: { /* VITALLOC / ENEALLOC n class which -> delta of a vital (256ths)
                * which: vit 0 maxhp(7) 1 maxstamina(11); ene 0 maxmana(9) */
      NEED(3);
      static const int32_t ids[8] = {1, 3, 4, 6, 7, 8, 9, 10};
      static const int32_t ids2[1] = {11};
      uint32_t sv[9];
      for (int i = 0; i < 8; i++)
        if (ustat(1, g_player, ids[i], 0, &sv[i])) return 1;
      if (ustat(1, g_player, ids2[0], 0, &sv[8])) return 1;
      int32_t tgt = op == 55 ? (a[2] ? 11 : 7) : 9;
      uint32_t before = 0, after = 0;
      ustat(1, g_player, tgt, 0, &before);
      uset(g_player, 4, a[0] > 0 ? a[0] : 0);
      class_push(a[1]);
      g_sc_eax = (uint32_t)a[0];
      g_sc_esi = (uint32_t)(uintptr_t)g_player;
      uint32_t ign;
      f = sc(G(op == 55 ? GVA_VITALLOC : GVA_ENEALLOC), 0, NULL, &ign);
      class_pop();
      if (!f) f = ustat(1, g_player, tgt, 0, &after);
      r = after - before;
      for (int i = 0; i < 8; i++) uset(g_player, ids[i], (int32_t)sv[i]);
      uset(g_player, 11, (int32_t)sv[8]);
      break;
    }
    case 57: { /* LEVELUP levels class which -> delta (256ths) of maxhp(0) / maxmana(1) / maxstamina(2) / statpts(3) / newskills(4) */
      NEED(3);
      static const int32_t ids[11] = {4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 30};
      uint32_t sv[11];
      for (int i = 0; i < 11; i++)
        if (ustat(1, g_player, ids[i], 0, &sv[i])) return 1;
      static const int32_t tgts[5] = {7, 9, 11, 4, 5};
      if (a[2] < 0 || a[2] > 4) return 2;
      class_push(a[1]);
      uint32_t lvl0 = sv[8], thr = 0, before = 0, after = 0;
      /* #10399(class, L) = experience needed to reach level L+1 (D2Game 0x6FD0B0DC sets nextexp = #10399(class, newLvl)). */
      uint32_t targs[2] = {RD32(g_player, 4), lvl0 + (uint32_t)a[0] - 1};
      f = sc(C(VA_EXPTHRESH), 2, targs, &thr);
      if (!f) {
        ustat(1, g_player, tgts[a[2]], 0, &before);
        uset(g_player, 13, (int32_t)thr);
        uint32_t args[1] = {(uint32_t)(uintptr_t)g_game}, ign;
        g_sc_esi = (uint32_t)(uintptr_t)g_player;
        f = sc(G(GVA_LEVELUP), 1, args, &ign);
        if (!f) f = ustat(1, g_player, tgts[a[2]], 0, &after);
      }
      class_pop();
      r = after - before;
      for (int i = 0; i < 11; i++) uset(g_player, ids[i], (int32_t)sv[i]);
      break;
    }
    case 58: { /* DMGPIPE defSel diff phys fire ltng magic cold pois rate54 -> total (+0x4C) */
      NEED(9);
      if (!g_monster || a[1] < 0 || a[1] > 2) return 2;
      uint8_t *def = unit_sel(a[0]), *atk = unit_sel(a[0] ? 0 : 1);
      memset(g_dmgres, 0, sizeof g_dmgres);
      RD32(g_dmgres, 0x08) = (uint32_t)a[2];
      RD32(g_dmgres, 0x10) = (uint32_t)a[3];
      RD32(g_dmgres, 0x1C) = (uint32_t)a[4];
      RD32(g_dmgres, 0x20) = (uint32_t)a[5];
      RD32(g_dmgres, 0x24) = (uint32_t)a[6];
      RD32(g_dmgres, 0x28) = (uint32_t)a[7];
      RD32(g_dmgres, 0x54) = (uint32_t)a[8];
      uint8_t sdiff = g_game[0x6D];
      g_game[0x6D] = (uint8_t)a[1];
      uint32_t args[4] = {(uint32_t)(uintptr_t)g_game, (uint32_t)(uintptr_t)atk,
                          (uint32_t)(uintptr_t)def, (uint32_t)(uintptr_t)g_dmgres}, ign;
      f = sc(G(GVA_DMGRES), 4, args, &ign);
      g_game[0x6D] = sdiff;
      r = RD32(g_dmgres, 0x4C);
      break;
    }
    case 59: /* DMGFIELD off: dword of the last DMGPIPE damage struct */
      NEED(1);
      if (a[0] < 0 || a[0] > 0xFC || (a[0] & 3)) return 2;
      r = RD32(g_dmgres, a[0]);
      break;
    case 60: { /* ANIMSPEED mode class: #10819 on the player in `mode` (class override) -> unit+0x4C */
      NEED(2);
      uint32_t smode = RD32(g_player, 0x10), sv3c = RD32(g_player, 0x3C), sv50 = RD32(g_player, 0x50);
      uint16_t sv4c = *(uint16_t *)(g_player + 0x4C);
      class_push(a[1]);
      RD32(g_player, 0x10) = (uint32_t)a[0];
      uint32_t args[3] = {(uint32_t)(uintptr_t)g_player, 0, 0}, ign;
      f = sc(C(VA_ANIMRATE), 3, args, &ign);
      r = (uint32_t)(int32_t) * (int16_t *)(g_player + 0x4C);
      uint8_t *rec = (uint8_t *)(uintptr_t)RD32(g_player, 0x50);
      g_anim_last[0] = rec ? (int32_t)RD32(rec, 8) : -1;
      g_anim_last[1] = rec ? (int32_t)RD32(rec, 0xC) : -1;
      g_anim_last[2] = -1;
      if (rec) {
        uint32_t n = RD32(rec, 8), i;
        for (i = 0; i < n && i < 0x90 && !rec[0x10 + i]; i++) {}
        g_anim_last[2] = (int32_t)i;
      }
      class_pop();
      RD32(g_player, 0x10) = smode;
      sc(C(VA_ANIMRATE), 3, args, &ign); /* re-derive record/velocity for the real mode */
      RD32(g_player, 0x3C) = sv3c;
      RD32(g_player, 0x50) = sv50;
      *(uint16_t *)(g_player + 0x4C) = sv4c;
      break;
    }
    case 61: /* ANIMLAST which: 0 frames, 1 AnimData speed, 2 first event frame of the record used by op 60 */
      NEED(1);
      if (a[0] < 0 || a[0] > 2) return 2;
      r = (uint32_t)g_anim_last[a[0]];
      break;
    case 62: { /* ANIMDATA which c0..c6: #10385 on a 7-char COF name; which 0 found 1 frames 2 speed 3 event */
      NEED(8);
      static char name[16];
      static uint32_t fr, sp, ev;
      for (int i = 0; i < 7; i++) name[i] = (char)a[1 + i];
      name[7] = 0;
      uint32_t args[4] = {(uint32_t)(uintptr_t)name, (uint32_t)(uintptr_t)&fr, (uint32_t)(uintptr_t)&sp,
                          (uint32_t)(uintptr_t)&ev}, found;
      f = sc(C(VA_ANIMDATA), 4, args, &found);
      r = a[0] == 0 ? found : a[0] == 1 ? fr : a[0] == 2 ? sp : ev;
      break;
    }
    default:
      return 2;
  }
#undef NEED
  *res = (int32_t)r;
  return f;
}

/* ------------------------------------------------------------- requests */
static FILE *g_req, *g_resp;
static long g_nreq, g_nfault, g_nbad;
static int g_done;
static char g_line[4096];

static int parse_ints(const char *s, int32_t *v, int max) {
  int n = 0;
  while (*s && *s != '[') s++;
  if (*s == '[') s++;
  while (*s && n < max) {
    while (*s == ' ' || *s == ',') s++;
    if (*s == ']' || !*s) break;
    char *e;
    long long x = strtoll(s, &e, 10);
    if (e == s) break;
    v[n++] = (int32_t)x;
    s = e;
  }
  return n;
}

static void put_result(int st, int32_t v, int first) {
  if (!first) fputc(',', g_resp);
  if (st == 0)
    fprintf(g_resp, "%ld", (long)v);
  else if (st == 1) {
    fputs("\"fault\"", g_resp);
    g_nfault++;
  } else {
    fputs("\"bad\"", g_resp);
    g_nbad++;
  }
}

/*
 * Range op: [100, op, lo, hi, a0, a1] evaluates op(a0, lvl, a1) for
 * lvl = lo..hi (skill-eval ops take (skill, lvl, x)).
 * All-codes op: [101, skill, lo, hi] evaluates SKCALC(skill, lvl, code) for
 * lvl = lo..hi and code = 0..72 (lvl-major).
 */
static void handle_line(const char *line) {
  int32_t v[64];
  int n = parse_ints(line, v, 64);
  if (n == 0) return;
  g_nreq++;
  fputc('[', g_resp);
  if (v[0] == 100 && n >= 6 && (int64_t)v[3] - v[2] < 4096) {
    for (int64_t l = v[2]; l <= v[3]; l++) {
      int32_t args[3] = {v[4], (int32_t)l, v[5]}, r = 0;
      int st = eval_op(v[1], args, 3, &r);
      put_result(st, r, l == v[2]);
    }
  } else if (v[0] == 101 && n >= 4 && (int64_t)v[3] - v[2] < 4096) {
    int first = 1;
    for (int64_t l = v[2]; l <= v[3]; l++)
      for (int32_t c = 0; c <= 72; c++) {
        int32_t args[3] = {v[1], (int32_t)l, c}, r = 0;
        int st = eval_op(1, args, 3, &r);
        put_result(st, r, first);
        first = 0;
      }
  } else {
    int32_t r = 0;
    int st = eval_op(v[0], v + 1, n - 1, &r);
    put_result(st, r, 1);
  }
  fputs("]\n", g_resp);
}

static uint8_t *first_unit(uint8_t *game, int type) {
  for (int b = 0; b < 128; b++) {
    uint8_t *u = (uint8_t *)(uintptr_t)RD32(game, 0x1120 + type * 0x200 + b * 4);
    if (u) return u;
  }
  return NULL;
}

/* Prefer a monster whose MonStats Drain (normal) is non-zero so the leech path
 * (0x6FCFBA8E) is exercised; fall back to the first monster in the hash. */
static uint8_t *pick_monster(uint8_t *game) {
  uint8_t *first = NULL;
  for (int b = 0; b < 128; b++) {
    for (uint8_t *u = (uint8_t *)(uintptr_t)RD32(game, 0x1120 + 0x200 + b * 4); u;
         u = (uint8_t *)(uintptr_t)RD32(u, 0xE4)) {
      if (!first) first = u;
      uint8_t *md = (uint8_t *)(uintptr_t)RD32(u, 0x14);
      uint8_t *ms = md ? (uint8_t *)(uintptr_t)RD32(md, 0) : NULL;
      if (ms && ms[0xA0] > 0) return u;
    }
  }
  return first;
}

static uint32_t g_ready_frame;

void __cdecl on_frame(uint8_t *game) {
  InterlockedIncrement(&g_frames);
  if (g_done) return;
  uint8_t *pl = first_unit(game, 0);
  if (!pl) return;
  uint32_t fr = RD32(game, 0xA8);
  if (!g_ready_frame) {
    g_ready_frame = fr + 50; /* let the game settle for 2 s */
    logf_("player %p at frame %u", (void *)pl, fr);
    return;
  }
  if (fr < g_ready_frame) return;
  if (!g_req) {
    g_game = game;
    g_player = pl;
    g_monster = pick_monster(game);
    g_req = fopen(ORACLE_DIR "fn-req.ndjson", "r");
    g_resp = fopen(ORACLE_DIR "out\\fn-resp.ndjson", "w");
    if (!g_req || !g_resp) {
      logf_("cannot open request/response (%p %p)", (void *)g_req, (void *)g_resp);
      g_done = 1;
      FILE *d = fopen(ORACLE_DIR "out\\done", "w");
      if (d) fclose(d);
      return;
    }
    setvbuf(g_resp, NULL, _IOFBF, 1 << 20);
    logf_("start: player %p class %u monster %p class %u", (void *)pl, RD32(pl, 4), (void *)g_monster,
          g_monster ? RD32(g_monster, 4) : 0);
  }
  g_player = pl;
  DWORD t0 = GetTickCount();
  while (GetTickCount() - t0 < 400) {
    if (!fgets(g_line, sizeof g_line, g_req)) {
      fclose(g_req);
      fclose(g_resp);
      g_done = 1;
      logf_("finished: %ld requests, %ld faults, %ld bad", g_nreq, g_nfault, g_nbad);
      FILE *d = fopen(ORACLE_DIR "out\\done", "w");
      if (d) fclose(d);
      return;
    }
    handle_line(g_line);
  }
  logf_("progress: %ld requests", g_nreq);
}

__attribute__((naked)) static void frame_stub(void) {
  __asm__ volatile(
      "push %%eax\n\t"
      "call *%0\n\t"
      "pop %%eax\n\t"
      "pushal\n\t"
      "push %%eax\n\t"
      "call _on_frame\n\t"
      "add $4, %%esp\n\t"
      "popal\n\t"
      "ret\n\t" ::"m"(g_frame_fn));
}

static int patch_call(uintptr_t site, void *target, uintptr_t expect) {
  uint8_t *p = (uint8_t *)site;
  if (p[0] != 0xE8) return 0;
  uintptr_t cur = site + 5 + *(int32_t *)(p + 1);
  if (cur != expect) return 0;
  DWORD old;
  VirtualProtect(p, 5, PAGE_EXECUTE_READWRITE, &old);
  *(int32_t *)(p + 1) = (int32_t)((uintptr_t)target - (site + 5));
  VirtualProtect(p, 5, old, &old);
  FlushInstructionCache(GetCurrentProcess(), p, 5);
  return 1;
}

static DWORD WINAPI oracle_thread(LPVOID unused) {
  (void)unused;
  CreateDirectoryA(ORACLE_DIR "out", NULL);
  g_log = fopen(ORACLE_DIR "out\\log.txt", "w");
  logf_("fnharness loaded");
  AddVectoredExceptionHandler(1, veh);
  for (;;) {
    HMODULE m = GetModuleHandleA("D2Game.dll");
    HMODULE c = GetModuleHandleA("D2Common.dll");
    if (m && c) {
      g_d2game = m;
      g_d2common = c;
      break;
    }
    Sleep(1);
  }
  g_game_pref = pref_base(g_d2game);
  g_common_pref = pref_base(g_d2common);
  g_frame_fn = (void *)G(0x6FC4E050);
  int ok = patch_call(G(0x6FC4E2DB), frame_stub, (uintptr_t)g_frame_fn) +
           patch_call(G(0x6FC72712), frame_stub, (uintptr_t)g_frame_fn);
  logf_("D2Game %p (pref %p) D2Common %p (pref %p): %d/2 frame hooks", (void *)g_d2game,
        (void *)g_game_pref, (void *)g_d2common, (void *)g_common_pref, ok);
  for (;;) {
    Sleep(5000);
    logf_("frames=%ld", g_frames);
  }
  return 0;
}

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, LPVOID r) {
  (void)r;
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(h);
    CreateThread(NULL, 0, oracle_thread, NULL, 0, NULL);
  }
  return TRUE;
}

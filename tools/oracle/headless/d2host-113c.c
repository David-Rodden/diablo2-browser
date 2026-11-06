/*
 * d2host-113c.c — Headless Original Diablo II 1.13c Server Host.
 *
 * Implements Plan §3.6.1 and Gitea Milestone 31 [K0]:
 *   1. Loads ONLY core server DLLs: Storm.dll, Fog.dll, D2Lang.dll,
 *      D2Common.dll, D2Net.dll, D2Game.dll (zero D2Win / D2Gfx / D2Client /
 *      D2Sound / D2CMP / GUI window).
 *   2. Initializes Fog, mounts MPQ archives in canonical priority order
 *      (d2data/d2sfx/d2speech/d2char=1000, d2exp=3000, patch_d2=5000),
 *      initializes D2Lang (ENG) and D2Common.#10943 data tables.
 *   3. Constructs the Storm TSHashTable<D2GameStrc> container passed to
 *      D2Game.#10037 (0x6FC4A370 -> [0x6FD31C24]), initializes D2Net in
 *      in-memory local loopback mode (protocol=1, zero TCP sockets), calls
 *      D2Game.#10038 (0x6FC4D4B0) and D2Game.#10017(seed) (0x6FC4A210).
 *   4. Optionally loads d2oracle.dll in synchronous headless mode
 *      (ORACLE_HEADLESS=1 -> d2oracle_headless_init), reusing 100% of
 *      trace.ndjson / fnrec / orderlog / memdump / setexp / equip / inputs.
 *   5. Drives exact SP handshake over D2Net.#10024:
 *        - C2S 0x67 (CS_CREATEGAME, 46 bytes) -> D2Game.#10040()
 *        - Frame 1 via D2Game.#10002 (single-step -> 0x6FC4E050, pre-join)
 *        - C2S 0x6B (CS_ENTER_GAME, 1 byte)  -> D2Game.#10040() (spawns player)
 *        - Frames 2..N via D2Game.#10040() + D2Game.#10002 at full CPU speed
 *          with zero 25 fps Sleep throttle.
 *
 * Usage:
 *   d2host-113c.exe --seed <N> --frames <N> [--difficulty 0|1|2]
 *                   [--char <Name>] [--save <path.d2s>] [--oracle-dll <dll>]
 */

#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ------------------------------- Fog / Storm / D2Lang / D2Common typedefs */

typedef void(__fastcall *Fog_InitLogPrefix_t)(const char *szPrefix);
typedef void(__fastcall *Fog_InitSystemInfo_t)(const char *szApp,
                                               void *pHandler,
                                               const char *szVer,
                                               int bLog);
typedef void(__fastcall *Fog_InitFileSystem_t)(int bDirectTxt, void *pCallback);
typedef void(__fastcall *Fog_InitSystem_t)(int bEnable, void *pUnused);
typedef void(__stdcall *Fog_VoidStd_t)(void);
typedef int(__stdcall *Fog_IsExpansion_t)(void);
typedef int(__fastcall *Fog_OpenFile_t)(const char *szPath, HANDLE *phFile);
typedef void(__fastcall *Fog_CloseFile_t)(HANDLE hFile);

typedef BOOL(__stdcall *Storm_SFileOpenArchive_t)(const char *szMpqName,
                                                  DWORD dwPriority,
                                                  DWORD dwFlags,
                                                  HANDLE *phMpq);
typedef void *(__stdcall *Storm_SMemAlloc_t)(DWORD dwAmount,
                                             const char *szFilename,
                                             int nLine,
                                             DWORD dwFlags);
typedef BOOL(__stdcall *Storm_SMemFree_t)(void *pPtr,
                                          const char *szFilename,
                                          int nLine,
                                          DWORD dwFlags);

typedef int(__fastcall *D2Lang_Init_t)(int bUnusedEcx,
                                       const char *szLocaleEdx,
                                       int bUnusedStack);
typedef int(__stdcall *D2Common_InitDataTables_t)(int nUnused,
                                                  int bUnused2,
                                                  int bCompileTxt);

/* ----------------------------------------------------- D2Net / D2Game APIs */

typedef int(__stdcall *D2Net_InitServer_t)(int nProtocol, int nMaxClients);
typedef int(__stdcall *D2Net_ConnectClient_t)(int nProtocol, const char *szAddr);
typedef int(__stdcall *D2Net_GetConnStatus_t)(void);
typedef int(__stdcall *D2Net_SetAccept_t)(int bAccept);
typedef int(__stdcall *D2Net_SendToServer_t)(int nLen, int nQueue, const void *pBuf);
typedef int(__stdcall *D2Net_RecvFromServer_t)(void *pBuf, int nMaxLen);
typedef void(__stdcall *D2Net_Shutdown_t)(void);

typedef void(__stdcall *D2Game_SetGameHash_t)(void *pHashTable, void *pCallbackDummy);
typedef int(__stdcall *D2Game_InitGameData_t)(void);
typedef void(__stdcall *D2Game_SetInitSeed_t)(uint32_t dwSeed);
typedef void(__stdcall *D2Game_ReceivePackets_t)(void);
typedef int(__stdcall *D2Game_UpdateGames_t)(int bFlag);
typedef int(__stdcall *D2Game_SendUpdates_t)(int bForce, int bUnused);

typedef void(__cdecl *OracleHeadlessInit_t)(void);
typedef int(__cdecl *OracleIsDone_t)(void);

/* ------------------------ Storm TSHashTable<D2GameStrc> (0x68 bytes exact) */

typedef struct {
  int32_t linkOffset;
  uint32_t prev;
  uint32_t next;
} TSExplicitList;

typedef struct {
  void **vtable;               /* +0x00 */
  TSExplicitList fullList;     /* +0x04 (linkOffset = 0x0C) */
  uint32_t collisionCount;     /* +0x10 */
  uint32_t bucketCap;          /* +0x14 */
  uint32_t bucketCount;        /* +0x18 */
  TSExplicitList *buckets;     /* +0x1C */
  uint32_t bucketGrow;         /* +0x20 */
  uint32_t hashMask;           /* +0x24 (0x3FF -> 1024 buckets, never rehashes) */
  TSExplicitList freeList;     /* +0x28 (linkOffset = 0x04) */
  uint32_t growStep;           /* +0x34 */
  TSExplicitList chunkList;    /* +0x38 (linkOffset = 0x10) */
  uint32_t pad44;              /* +0x44 */
  uint32_t nextHashKey;        /* +0x48 */
  uint32_t keyWrapped;         /* +0x4C */
  CRITICAL_SECTION csLock;     /* +0x50..0x67 */
} D2GameHashTable;

static Storm_SMemAlloc_t p_SMemAlloc = NULL;
static Storm_SMemFree_t p_SMemFree = NULL;

static void init_explicit_list(TSExplicitList *lst, int32_t linkOffset) {
  uintptr_t headAddr = (uintptr_t)&lst->prev;
  lst->linkOffset = linkOffset;
  lst->prev = (uint32_t)headAddr;
  lst->next = ~(uint32_t)headAddr;
}

static void __stdcall game_hash_dtor_stub(void *arg) { (void)arg; }

/*
 * Matches D2Client 0x6FAB1F90 -> 0x6FAB24B0 -> 0x6FAB2400:
 * Called via [vtable + 0x04] at D2Game 0x6FC220CA as __thiscall:
 *   ecx = D2GameHashTable *this
 *   stack: (TSExplicitList *pBucket, uint32_t extraBytes, uint32_t flags)
 * Allocates sizeof(D2GameStrc) == 0x1DF4 + extraBytes via Storm.#401, zeros
 * the two TSLink headers (+0x04..+0x13), and links node+0x04 into pBucket.
 */
static void *__fastcall game_hash_alloc_node(D2GameHashTable *self,
                                             void *unusedEdx,
                                             TSExplicitList *pBucket,
                                             uint32_t extraBytes,
                                             uint32_t flags) {
  (void)self;
  (void)unusedEdx;
  uint32_t totalSize = 0x1DF4u + extraBytes;
  uint8_t *node = (uint8_t *)p_SMemAlloc(totalSize, "d2host-113c.c", 120, flags | 8u);
  if (!node) return NULL;
  memset(node, 0, totalSize);

  /* Link node into pBucket at linkOffset (+0x04), matching 0x6FAB2459. */
  uintptr_t headAddr = (uintptr_t)&pBucket->prev;
  uint32_t prevPtr = pBucket->prev;
  uint32_t *prevNextField = (prevPtr == (uint32_t)headAddr)
                                ? &pBucket->next
                                : (uint32_t *)(uintptr_t)(prevPtr + (uint32_t)pBucket->linkOffset + 4u);
  *(uint32_t *)(node + 0x04) = prevPtr;
  *(uint32_t *)(node + 0x08) = *prevNextField;
  *prevNextField = (uint32_t)(uintptr_t)node;
  pBucket->prev = (uint32_t)(uintptr_t)node;
  return node;
}

static void __fastcall game_hash_scalar_dtor(D2GameHashTable *self,
                                             void *unusedEdx,
                                             uint32_t flags) {
  (void)self;
  (void)unusedEdx;
  (void)flags;
}

static void __fastcall game_hash_unlink_all(D2GameHashTable *self, void *unusedEdx) {
  (void)self;
  (void)unusedEdx;
}

static void *g_game_hash_vtable[4] = {
    (void *)game_hash_dtor_stub,
    (void *)game_hash_alloc_node,
    (void *)game_hash_scalar_dtor,
    (void *)game_hash_unlink_all,
};

static TSExplicitList g_game_hash_buckets[1024];
static D2GameHashTable g_game_hash;
static uint32_t g_client_callback_dummy[16] = {1};

static void init_game_hash_table(D2GameHashTable *tbl) {
  memset(tbl, 0, sizeof(*tbl));
  tbl->vtable = g_game_hash_vtable;
  init_explicit_list(&tbl->fullList, 0x0C);
  tbl->collisionCount = 0;
  tbl->bucketCap = 1024;
  tbl->bucketCount = 1024;
  tbl->buckets = g_game_hash_buckets;
  tbl->bucketGrow = 4;
  tbl->hashMask = 0x3FF;
  for (int i = 0; i < 1024; i++) {
    init_explicit_list(&g_game_hash_buckets[i], 0x04);
  }
  init_explicit_list(&tbl->freeList, 0x04);
  tbl->growStep = 0x10;
  init_explicit_list(&tbl->chunkList, 0x10);
  tbl->nextHashKey = (~(uint32_t)(uintptr_t)tbl) & 0x0FFFFFFFu;
  tbl->keyWrapped = 0;
  InitializeCriticalSection(&tbl->csLock);
}

/* ----------------------------------------------------------- MPQ & .d2s I/O */

static int open_mpq_if_exists(Storm_SFileOpenArchive_t fnOpen,
                              const char *exeDir,
                              const char *name,
                              DWORD priority,
                              int required) {
  char fullPath[MAX_PATH];
  snprintf(fullPath, sizeof(fullPath), "%s%s", exeDir, name);
  const char *target = fullPath;
  if (GetFileAttributesA(target) == INVALID_FILE_ATTRIBUTES) {
    target = name;
    if (GetFileAttributesA(target) == INVALID_FILE_ATTRIBUTES) {
      if (required) {
        fprintf(stderr, "[d2host-113c] missing required MPQ: %s\n", fullPath);
        return 0;
      }
      return 1;
    }
  }
  HANDLE hMpq = NULL;
  BOOL ok = fnOpen(target, priority, 0, &hMpq);
  if (!ok || !hMpq) {
    ok = fnOpen(target, priority, 2, &hMpq);
    if ((!ok || !hMpq) && required) {
      fprintf(stderr, "[d2host-113c] failed to open MPQ: %s (err=%lu)\n",
              target, (unsigned long)GetLastError());
      return 0;
    }
  }
  return 1;
}

static int read_d2s_meta(const char *path,
                         char outName[16],
                         uint8_t *outClassId,
                         uint8_t *outStatus) {
  FILE *f = fopen(path, "rb");
  if (!f) return 0;
  uint8_t hdr[48];
  size_t n = fread(hdr, 1, sizeof(hdr), f);
  fclose(f);
  if (n < 44) return 0;
  uint32_t magic = *(uint32_t *)(hdr + 0);
  if (magic != 0xAA55AA55u) return 0;
  memcpy(outName, hdr + 20, 16);
  outName[15] = '\0';
  *outStatus = hdr[0x24];
  *outClassId = hdr[0x28];
  return 1;
}

static uintptr_t pref_base(HMODULE m) {
  IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)m;
  IMAGE_NT_HEADERS32 *nt = (IMAGE_NT_HEADERS32 *)((uint8_t *)m + dos->e_lfanew);
  return nt->OptionalHeader.ImageBase;
}

static uint32_t img_size(HMODULE m) {
  IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)m;
  IMAGE_NT_HEADERS32 *nt = (IMAGE_NT_HEADERS32 *)((uint8_t *)m + dos->e_lfanew);
  return nt->OptionalHeader.SizeOfImage;
}

static HMODULE g_loaded_mods[8];
static const char *g_loaded_names[8];
static int g_loaded_count = 0;

static void record_mod(const char *name, HMODULE m) {
  if (m && g_loaded_count < 8) {
    g_loaded_names[g_loaded_count] = name;
    g_loaded_mods[g_loaded_count] = m;
    g_loaded_count++;
  }
}

static LONG WINAPI crash_filter(EXCEPTION_POINTERS *ep) {
  uintptr_t eip = (uintptr_t)ep->ExceptionRecord->ExceptionAddress;
  const char *modName = "unknown";
  uintptr_t canonVa = eip;
  for (int i = 0; i < g_loaded_count; i++) {
    uintptr_t base = (uintptr_t)g_loaded_mods[i];
    if (eip >= base && eip < base + img_size(g_loaded_mods[i])) {
      modName = g_loaded_names[i];
      canonVa = pref_base(g_loaded_mods[i]) + (eip - base);
      break;
    }
  }
  CONTEXT *c = ep->ContextRecord;
  fprintf(stderr,
          "[d2host-113c] EXCEPTION 0x%08lx at %p (%s VA 0x%08lx) "
          "EAX=%08lx ECX=%08lx EDX=%08lx EBX=%08lx ESI=%08lx EDI=%08lx ESP=%08lx EBP=%08lx\n",
          (unsigned long)ep->ExceptionRecord->ExceptionCode,
          (void *)eip, modName, (unsigned long)canonVa,
          (unsigned long)c->Eax, (unsigned long)c->Ecx, (unsigned long)c->Edx,
          (unsigned long)c->Ebx, (unsigned long)c->Esi, (unsigned long)c->Edi,
          (unsigned long)c->Esp, (unsigned long)c->Ebp);
  fflush(stderr);
  TerminateProcess(GetCurrentProcess(), 99);
  return EXCEPTION_EXECUTE_HANDLER;
}

/* --------------------------------------------------------------------- main */

int main(int argc, char **argv) {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
  SetUnhandledExceptionFilter(crash_filter);
  uint32_t seed = 12345;
  uint32_t maxFrames = 0;
  uint8_t difficulty = 0;
  char charName[16] = "Oracle";
  const char *savePathArg = NULL;
  const char *oracleDllPath = NULL;

  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--seed") && i + 1 < argc) {
      seed = (uint32_t)strtoul(argv[++i], NULL, 0);
    } else if (!strcmp(argv[i], "--frames") && i + 1 < argc) {
      maxFrames = (uint32_t)strtoul(argv[++i], NULL, 0);
    } else if (!strcmp(argv[i], "--difficulty") && i + 1 < argc) {
      difficulty = (uint8_t)strtoul(argv[++i], NULL, 0);
    } else if (!strcmp(argv[i], "--char") && i + 1 < argc) {
      strncpy(charName, argv[++i], 15);
      charName[15] = '\0';
    } else if (!strcmp(argv[i], "--save") && i + 1 < argc) {
      savePathArg = argv[++i];
    } else if (!strcmp(argv[i], "--oracle-dll") && i + 1 < argc) {
      oracleDllPath = argv[++i];
    }
  }

  LARGE_INTEGER qpf, t0, tInit, tEnd;
  QueryPerformanceFrequency(&qpf);
  QueryPerformanceCounter(&t0);

  /* 1. Load ONLY core server DLLs (no D2Win / D2Gfx / D2Client / D2Sound). */
  HMODULE hStorm = LoadLibraryA("Storm.dll");
  HMODULE hFog = LoadLibraryA("Fog.dll");
  HMODULE hD2Lang = LoadLibraryA("D2Lang.dll");
  HMODULE hD2Common = LoadLibraryA("D2Common.dll");
  HMODULE hD2Net = LoadLibraryA("D2Net.dll");
  HMODULE hD2Game = LoadLibraryA("D2Game.dll");

  if (!hStorm || !hFog || !hD2Lang || !hD2Common || !hD2Net || !hD2Game) {
    fprintf(stderr,
            "[d2host-113c] Failed to load server DLLs "
            "(Storm=%p Fog=%p Lang=%p Common=%p Net=%p Game=%p)\n",
            (void *)hStorm, (void *)hFog, (void *)hD2Lang,
            (void *)hD2Common, (void *)hD2Net, (void *)hD2Game);
    return 1;
  }
  record_mod("Storm.dll", hStorm);
  record_mod("Fog.dll", hFog);
  record_mod("D2Lang.dll", hD2Lang);
  record_mod("D2Common.dll", hD2Common);
  record_mod("D2Net.dll", hD2Net);
  record_mod("D2Game.dll", hD2Game);

  p_SMemAlloc = (Storm_SMemAlloc_t)(void (*)(void))GetProcAddress(
      hStorm, MAKEINTRESOURCEA(401));
  p_SMemFree = (Storm_SMemFree_t)(void (*)(void))GetProcAddress(
      hStorm, MAKEINTRESOURCEA(403));
  Storm_SFileOpenArchive_t p_SFileOpenArchive =
      (Storm_SFileOpenArchive_t)(void (*)(void))GetProcAddress(
          hStorm, MAKEINTRESOURCEA(266));

  /*
   * Storm.dll DllMain (0x6FC15CD6..0x6FC15CE3) checks lpvReserved ([esp+0xC]):
   * when Storm.dll is loaded dynamically via LoadLibraryA (lpvReserved == NULL),
   * DllMain intentionally initializes the MPQ crypt table ([0x6FC43120]) with
   * poison seed 0x10000100 instead of 0x00100001 (0x6FC1A117). Clear [0x6FC43120]
   * so SFileOpenArchive (0x6FC1A10E..0x6FC1A11C) initializes it with 0x00100001.
   */
  {
    uintptr_t stormRebase = (uintptr_t)hStorm - pref_base(hStorm);
    void **ppCryptTable = (void **)(0x6FC43120u + stormRebase);
    if (*ppCryptTable) {
      if (p_SMemFree) p_SMemFree(*ppCryptTable, "d2host-113c.c", 380, 0);
      *ppCryptTable = NULL;
    }
  }

  /* 2. Initialize Fog (matching Game.exe 0x00408291 + 0x0040761B..0x00407631). */
  Fog_InitLogPrefix_t p_FogInitLog =
      (Fog_InitLogPrefix_t)(void (*)(void))GetProcAddress(hFog, MAKEINTRESOURCEA(10021));
  Fog_InitFileSystem_t p_FogInitFS =
      (Fog_InitFileSystem_t)(void (*)(void))GetProcAddress(hFog, MAKEINTRESOURCEA(10101));
  Fog_InitSystem_t p_FogInitSystem =
      (Fog_InitSystem_t)(void (*)(void))GetProcAddress(hFog, MAKEINTRESOURCEA(10089));
  Fog_VoidStd_t p_FogInitAsync =
      (Fog_VoidStd_t)(void (*)(void))GetProcAddress(hFog, MAKEINTRESOURCEA(10082));
  Fog_VoidStd_t p_FogInitMasks =
      (Fog_VoidStd_t)(void (*)(void))GetProcAddress(hFog, MAKEINTRESOURCEA(10218));
  Fog_IsExpansion_t p_FogIsExpansion =
      (Fog_IsExpansion_t)(void (*)(void))GetProcAddress(hFog, MAKEINTRESOURCEA(10227));

  if (p_FogInitLog) p_FogInitLog("D2");
  if (p_FogInitFS) p_FogInitFS(0, NULL);
  if (p_FogInitSystem) p_FogInitSystem(1, NULL);
  if (p_FogInitAsync) p_FogInitAsync();
  if (p_FogInitMasks) p_FogInitMasks();
  SetUnhandledExceptionFilter(crash_filter);

  /* 3. Mount MPQ archives in exact priority order (D2Win.#10086 + #10005). */
  char exeDir[MAX_PATH] = {0};
  if (GetModuleFileNameA(NULL, exeDir, sizeof(exeDir))) {
    char *slash = strrchr(exeDir, '\\');
    if (slash) slash[1] = '\0';
    else exeDir[0] = '\0';
  }
  if (!open_mpq_if_exists(p_SFileOpenArchive, exeDir, "d2data.mpq", 1000, 1) ||
      !open_mpq_if_exists(p_SFileOpenArchive, exeDir, "d2char.mpq", 1000, 0) ||
      !open_mpq_if_exists(p_SFileOpenArchive, exeDir, "d2sfx.mpq", 1000, 0) ||
      !open_mpq_if_exists(p_SFileOpenArchive, exeDir, "d2speech.mpq", 1000, 0) ||
      !open_mpq_if_exists(p_SFileOpenArchive, exeDir, "d2exp.mpq", 3000, 1) ||
      !open_mpq_if_exists(p_SFileOpenArchive, exeDir, "Patch_D2.mpq", 5000, 1)) {
    return 2;
  }
  int isExp = p_FogIsExpansion ? p_FogIsExpansion() : 1;

  /* 4. Initialize D2Lang (matching D2Client 0x6FAC0CE4: ecx=0, edx=NULL, bExp) and D2Common.#10943. */
  D2Lang_Init_t p_D2LangInit =
      (D2Lang_Init_t)(void (*)(void))GetProcAddress(hD2Lang, MAKEINTRESOURCEA(10008));
  D2Common_InitDataTables_t p_InitDataTables =
      (D2Common_InitDataTables_t)(void (*)(void))GetProcAddress(
          hD2Common, MAKEINTRESOURCEA(10943));
  if (p_D2LangInit) p_D2LangInit(0, NULL, isExp);
  if (!p_InitDataTables || !p_InitDataTables(0, 0, 0)) {
    fprintf(stderr, "[d2host-113c] D2Common.#10943 failed\n");
    return 3;
  }

  /* 5. Initialize D2Net in local memory queue mode (protocol=1, maxClients=1),
   *    matching D2Client 0x6FB5FE24..0x6FB5FEF6. */
  D2Net_InitServer_t p_NetInitServer =
      (D2Net_InitServer_t)(void (*)(void))GetProcAddress(hD2Net, MAKEINTRESOURCEA(10005));
  D2Net_ConnectClient_t p_NetConnect =
      (D2Net_ConnectClient_t)(void (*)(void))GetProcAddress(hD2Net, MAKEINTRESOURCEA(10034));
  D2Net_GetConnStatus_t p_NetGetStatus =
      (D2Net_GetConnStatus_t)(void (*)(void))GetProcAddress(hD2Net, MAKEINTRESOURCEA(10019));
  D2Net_SetAccept_t p_NetSetAccept =
      (D2Net_SetAccept_t)(void (*)(void))GetProcAddress(hD2Net, MAKEINTRESOURCEA(10012));
  D2Net_SendToServer_t p_NetSend =
      (D2Net_SendToServer_t)(void (*)(void))GetProcAddress(hD2Net, MAKEINTRESOURCEA(10024));
  D2Net_RecvFromServer_t p_NetRecv =
      (D2Net_RecvFromServer_t)(void (*)(void))GetProcAddress(hD2Net, MAKEINTRESOURCEA(10020));

  p_NetInitServer(1, 1);
  p_NetConnect(1, NULL);
  if (p_NetGetStatus) {
    for (int i = 0; i < 2000 && p_NetGetStatus() != 2; i++) {
      Sleep(1);
    }
  }
  p_NetSetAccept(0);

  /* 6. Initialize D2Game hash table, game tables, and fixed seed override. */
  init_game_hash_table(&g_game_hash);
  D2Game_SetGameHash_t p_SetGameHash =
      (D2Game_SetGameHash_t)(void (*)(void))GetProcAddress(hD2Game, MAKEINTRESOURCEA(10037));
  D2Game_InitGameData_t p_InitGameData =
      (D2Game_InitGameData_t)(void (*)(void))GetProcAddress(hD2Game, MAKEINTRESOURCEA(10038));
  D2Game_SetInitSeed_t p_SetInitSeed =
      (D2Game_SetInitSeed_t)(void (*)(void))GetProcAddress(hD2Game, MAKEINTRESOURCEA(10017));
  D2Game_ReceivePackets_t p_RecvPackets =
      (D2Game_ReceivePackets_t)(void (*)(void))GetProcAddress(hD2Game, MAKEINTRESOURCEA(10040));
  D2Game_UpdateGames_t p_UpdateGames =
      (D2Game_UpdateGames_t)(void (*)(void))GetProcAddress(hD2Game, MAKEINTRESOURCEA(10008));
  D2Game_SendUpdates_t p_SendUpdates =
      (D2Game_SendUpdates_t)(void (*)(void))GetProcAddress(hD2Game, MAKEINTRESOURCEA(10024));

  p_SetGameHash(&g_game_hash, g_client_callback_dummy);
  p_InitGameData();
  p_SetInitSeed(seed);

  uintptr_t d2gameRebase = (uintptr_t)hD2Game - pref_base(hD2Game);
  /* Force deterministic 0x400 (1.0x 40ms) frame delta in D2Game.#10008 (0x6FC4E26F). */
  *(uint32_t *)(0x6FD2E35Cu + d2gameRebase) = 1u;
  volatile uint32_t *pLastTickMs = (volatile uint32_t *)(0x6FD31C44u + d2gameRebase);

  /* Accept client 1 into D2Game (0x6FC4E4AF) and drain S2C 0xAF BEFORE sending 0x67! */
  uint8_t s2cDrain[1024];
  for (int i = 0; i < 200; i++) {
    p_RecvPackets();
    int gotAf = 0;
    int nRead;
    while ((nRead = p_NetRecv(s2cDrain, sizeof(s2cDrain))) > 0) {
      if (s2cDrain[0] == 0xAF) gotAf = 1;
    }
    if (gotAf) break;
    Sleep(1);
  }

  /* 7. Optionally attach d2oracle.dll in synchronous headless mode. */
  OracleIsDone_t p_OracleIsDone = NULL;
  if (oracleDllPath && oracleDllPath[0]) {
    SetEnvironmentVariableA("ORACLE_HEADLESS", "1");
    HMODULE hOracle = LoadLibraryA(oracleDllPath);
    if (!hOracle) {
      fprintf(stderr, "[d2host-113c] Failed to load oracle DLL: %s (err=%lu)\n",
              oracleDllPath, GetLastError());
      return 4;
    }
    OracleHeadlessInit_t p_HeadlessInit =
        (OracleHeadlessInit_t)(void (*)(void))GetProcAddress(
            hOracle, "d2oracle_headless_init");
    p_OracleIsDone =
        (OracleIsDone_t)(void (*)(void))GetProcAddress(hOracle, "d2oracle_is_done");
    if (!p_HeadlessInit) {
      fprintf(stderr, "[d2host-113c] d2oracle_headless_init missing in %s\n",
              oracleDllPath);
      return 5;
    }
    p_HeadlessInit();
  }

  /* 8. Inspect Save\<charName>.d2s for classId & expansion/hardcore flags. */
  char saveFilePath[260];
  if (savePathArg && savePathArg[0]) {
    snprintf(saveFilePath, sizeof(saveFilePath), "%s", savePathArg);
  } else {
    snprintf(saveFilePath, sizeof(saveFilePath), "Save\\%s.d2s", charName);
  }
  uint8_t charClassId = 4;
  uint8_t charStatus = 0x20;
  char parsedName[16] = {0};
  if (read_d2s_meta(saveFilePath, parsedName, &charClassId, &charStatus)) {
    if (parsedName[0]) {
      memcpy(charName, parsedName, 16);
    }
  }

  QueryPerformanceCounter(&tInit);

  /* 9. Send C2S 0x67 (CS_CREATEGAME, 0x2E bytes, matching D2Client 0x6FAC4C20). */
  uint8_t pkt67[0x2E];
  memset(pkt67, 0, sizeof(pkt67));
  pkt67[0x00] = 0x67;
  memcpy(pkt67 + 0x01, charName, 15); /* szGameName (pkt67[0x10] stays 0) */
  pkt67[0x11] = 0x03;                 /* Single Player gameType=3 */
  pkt67[0x12] = charClassId;
  pkt67[0x13] = (charStatus & 0x04) ? 0x04 : 0x00;
  pkt67[0x14] = difficulty;
  memcpy(pkt67 + 0x15, charName, 15); /* szCharName (pkt67[0x24] stays 0) */
  uint32_t arenaFlags = ((charStatus & 0x20) && isExp) ? 0x00100004u : 0x00000004u;
  if (charStatus & 0x04) arenaFlags |= 0x00000800u;
  *(uint32_t *)(pkt67 + 0x27) = arenaFlags;
  pkt67[0x2D] = 0x00; /* locale ENG */

  p_NetSend((int)sizeof(pkt67), 0, pkt67);
  for (int i = 0; i < 200; i++) {
    p_RecvPackets();
    if (p_SendUpdates) p_SendUpdates(1, 0);
    while (p_NetRecv(s2cDrain, sizeof(s2cDrain)) > 0) {
    }
    uint32_t slotKey = *(uint32_t *)(0x6FD30C08u + d2gameRebase);
    if (slotKey && slotKey != 0xFFFFFFFFu) break;
    Sleep(1);
  }
  uint32_t gameHashKey = *(uint32_t *)(0x6FD30C08u + d2gameRebase);
  if (!gameHashKey || gameHashKey == 0xFFFFFFFFu) {
    fprintf(stderr, "[d2host-113c] ERROR: C2S 0x67 did not create game (slotKey=0x%08x)\n",
            gameHashKey);
    return 6;
  }

  /* 10. Execute Frame 1 BEFORE C2S 0x6B (matches Game.exe SP logon order!). */
  *pLastTickMs = ((GetTickCount() & 0x7FFFFFFFu) - 40u);
  p_UpdateGames(1);
  if (p_SendUpdates) p_SendUpdates(1, 0);
  while (p_NetRecv(s2cDrain, sizeof(s2cDrain)) > 0) {
  }

  /* 11. Send C2S 0x6B (CS_ENTER_GAME, 1 byte) and process immediately so
   *     player #1 and Rogue Encampment rooms spawn before Frame 2. */
  uint8_t pkt6B[1] = {0x6B};
  p_NetSend(1, 0, pkt6B);
  for (int i = 0; i < 50; i++) {
    p_RecvPackets();
    if (p_SendUpdates) p_SendUpdates(1, 0);
    int any = 0;
    while (p_NetRecv(s2cDrain, sizeof(s2cDrain)) > 0) {
      any = 1;
    }
    if (any) break;
    Sleep(1);
  }

  /* 12. Run unthrottled server frame loop (Frames 2..N). */
  uint32_t executedFrames = 1;
  for (;;) {
    if (p_OracleIsDone && p_OracleIsDone()) break;
    if (maxFrames > 0 && executedFrames >= maxFrames) break;
    p_RecvPackets();
    *pLastTickMs = ((GetTickCount() & 0x7FFFFFFFu) - 40u);
    if (p_UpdateGames(1)) {
      executedFrames++;
    }
    if (p_SendUpdates) p_SendUpdates(1, 0);
    while (p_NetRecv(s2cDrain, sizeof(s2cDrain)) > 0) {
    }
  }

  QueryPerformanceCounter(&tEnd);
  double initMs = (double)(tInit.QuadPart - t0.QuadPart) * 1000.0 / (double)qpf.QuadPart;
  double simMs = (double)(tEnd.QuadPart - tInit.QuadPart) * 1000.0 / (double)qpf.QuadPart;
  double totalMs = (double)(tEnd.QuadPart - t0.QuadPart) * 1000.0 / (double)qpf.QuadPart;
  double fps = simMs > 0.0 ? ((double)executedFrames * 1000.0 / simMs) : 0.0;

  printf("[d2host-113c] done: frames=%u seed=%u diff=%u init_ms=%.2f sim_ms=%.2f total_ms=%.2f effective_fps=%.1f\n",
         executedFrames, seed, (unsigned)difficulty, initMs, simMs, totalMs, fps);
  fflush(stdout);

  /* Terminate cleanly without waiting for background D2Net worker threads. */
  ExitProcess(0);
  return 0;
}

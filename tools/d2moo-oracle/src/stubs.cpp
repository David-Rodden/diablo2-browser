// Runtime environment for D2MOO's D2Common DRLG code inside the oracle.
//
// Policy: anything the DRLG generation path genuinely needs is implemented with real data
// (compiled 1.13c .bin tables, DS1 files). Anything it should never reach FAILS FAST, so a
// stub can never silently change the reference output again (the previous ad-hoc runner
// returned dummy records, empty buffers for missing files and a constant 0 direction).

#include "oracle.h"

#include "Windows.h"
#include "D2DataTbls.h"
#include "Drlg/D2DrlgDrlg.h"
#include "Drlg/D2DrlgPreset.h"
#include "D2Dungeon.h"
#include "D2Seed.h"
#include <D2Unicode.h>
#include <D2CMP.h>

#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <malloc.h>
#include <map>
#include <string>
#include <vector>

#ifndef D2ORACLE_TRACED_SEED
#error "The oracle must be compiled against tools/d2moo-oracle/include/D2Seed.h"
#endif

static_assert(sizeof(void*) == 4, "Build the oracle with -m32: D2MOO structs must match the 1.13c 32-bit .bin layout");

std::string gsD2OracleDataDir;

static D2DataTablesStrc gDataTables = {};
D2DataTablesStrc* sgptDataTables = &gDataTables;

void D2ORACLE_Fail(const char* szFormat, ...)
{
	va_list args;
	va_start(args, szFormat);
	fprintf(stderr, "[d2moo-oracle] FATAL: ");
	vfprintf(stderr, szFormat, args);
	fprintf(stderr, "\n");
	va_end(args);
	exit(2);
}

static std::string Lower(std::string s)
{
	for (char& c : s)
	{
		c = (char)std::tolower((unsigned char)c);
	}
	return s;
}

static std::vector<uint8_t> ReadWholeFile(const std::string& path)
{
	FILE* f = fopen(path.c_str(), "rb");
	if (!f)
	{
		D2ORACLE_Fail("missing data file %s", path.c_str());
	}
	fseek(f, 0, SEEK_END);
	const long len = ftell(f);
	fseek(f, 0, SEEK_SET);
	std::vector<uint8_t> bytes((size_t)len);
	if (len > 0 && fread(bytes.data(), 1, (size_t)len, f) != (size_t)len)
	{
		D2ORACLE_Fail("short read on %s", path.c_str());
	}
	fclose(f);
	return bytes;
}

// Loads <data>/tables/<name>.bin: int32 record count followed by packed 32-bit records.
static void* LoadBinTable(const char* szName, int* pRecordCount, size_t dwSize)
{
	const std::string path = gsD2OracleDataDir + "/tables/" + Lower(szName) + ".bin";
	std::vector<uint8_t> bytes = ReadWholeFile(path);
	if (bytes.size() < 4)
	{
		D2ORACLE_Fail("%s is truncated", path.c_str());
	}
	int32_t nCount = 0;
	memcpy(&nCount, bytes.data(), 4);
	const size_t nBody = bytes.size() - 4;
	if (nCount <= 0 || nBody != (size_t)nCount * dwSize)
	{
		D2ORACLE_Fail("%s: %d records x %zu bytes != %zu body bytes (struct layout mismatch)", path.c_str(), nCount, dwSize, nBody);
	}
	void* pRecords = calloc((size_t)nCount, dwSize);
	memcpy(pRecords, bytes.data() + 4, nBody);
	if (pRecordCount)
	{
		*pRecordCount = nCount;
	}
	return pRecords;
}

// ---- Unicode / D2Lang (level names only) ----
Unicode::Unicode(unsigned short v) : ch(v) {}
Unicode& Unicode::operator=(const Unicode& other) { ch = other.ch; return *this; }
Unicode* Unicode::strncpy(Unicode* dst, const Unicode* src, int count)
{
	if (!dst) return nullptr;
	for (int i = 0; i < count; ++i)
	{
		dst[i].ch = src ? src[i].ch : 0;
		if (!src || src[i].ch == 0) break;
	}
	return dst;
}
static Unicode gEmptyUnicode[64] = {};
const Unicode* __fastcall D2LANG_GetStringByReferenceString(char*)
{
	return gEmptyUnicode;
}

// ---- Fog ----
void* __fastcall FOG_AllocPool(void*, int nSize, const char*, int, int)
{
	return calloc(1, nSize > 0 ? nSize : 1);
}
void __fastcall FOG_FreePool(void*, void* pFree, const char*, int, int)
{
	free(pFree);
}
// D2_REALLOC_POOL leaves the grown bytes uninitialised in the game. The only caller on the DRLG path,
// DRLGROOMTILE_ReallocRoofTileGrid, never initialises unk0x10 / nIntensity / unk0x2C of the appended
// roof tiles, so the oracle zero-fills everything past the old block (the TypeScript port appends
// zeroed elements). FOG_AllocPool is calloc, which clears the whole usable size, so by induction every
// byte past the requested size is zero.
void* __fastcall FOG_ReallocPool(void*, void* pMem, int nSize, const char*, int, int)
{
	const size_t nOldUsable = pMem ? malloc_usable_size(pMem) : 0;
	void* pNew = realloc(pMem, nSize > 0 ? nSize : 1);
	if (!pNew)
	{
		D2ORACLE_Fail("FOG_ReallocPool(%d) failed", nSize);
	}
	const size_t nNewUsable = malloc_usable_size(pNew);
	if (nNewUsable > nOldUsable)
	{
		memset((char*)pNew + nOldUsable, 0, nNewUsable - nOldUsable);
	}
	return pNew;
}
void* __fastcall FOG_Alloc(int nSize, const char*, int, int)
{
	return calloc(1, nSize > 0 ? nSize : 1);
}
void __fastcall FOG_Free(void* pFree, const char*, int, int)
{
	free(pFree);
}
void __fastcall FOG_10050_EnterCriticalSection(CRITICAL_SECTION*, int) {}
void FOG_DisplayAssert(const char* msg, const char* file, int line)
{
	D2ORACLE_Fail("D2MOO assertion failed: %s (%s:%d)", msg, file, line);
}
void FOG_DisplayHalt(const char* msg, const char* file, int line)
{
	D2ORACLE_Fail("D2MOO halt: %s (%s:%d)", msg, file, line);
}
void FOG_DisplayWarning(const char* msg, const char* file, int line)
{
	D2ORACLE_Fail("D2MOO verify failed: %s (%s:%d)", msg, file, line);
}
void FOG_Trace(const char* fmt, ...)
{
	(void)fmt;
}
const char* FOG_csprintf(char* dst, const char* fmt, ...)
{
	va_list args;
	va_start(args, fmt);
	vsprintf(dst, fmt, args);
	va_end(args);
	return dst;
}
BOOL __stdcall FOG_IsExpansion()
{
	return TRUE;
}

// ---- Archive: DS1 files from <data>/mpq ----
void* __fastcall ARCHIVE_AllocateBufferAndReadFile(HD2ARCHIVE, const char* szFile, size_t* pSize, const char*, int)
{
	std::string rel = szFile ? szFile : "";
	for (char& c : rel)
	{
		c = (c == '\\') ? '/' : (char)std::tolower((unsigned char)c);
	}
	std::vector<uint8_t> bytes = ReadWholeFile(gsD2OracleDataDir + "/mpq/" + rel);
	void* pBuffer = calloc(1, bytes.size() + 16);
	memcpy(pBuffer, bytes.data(), bytes.size());
	if (pSize)
	{
		*pSize = bytes.size();
	}
	return pBuffer;
}

// ---- Data tables ----
void* __stdcall DATATBLS_CompileTxt(HD2ARCHIVE, const char* szName, D2BinFieldStrc*, int* pRecordCount, size_t dwSize)
{
	void* pRecords = LoadBinTable(szName, pRecordCount, dwSize);
	if (Lower(szName) == "lvlsub")
	{
		// DATATBLS_CompileTxt builds LvlSub records from text, so the runtime-only members start
		// zeroed; DRLGTILESUB_InitializeDrlgFile relies on pDrlgFile == NULL to load the DS1.
		D2LvlSubTxt* pLvlSub = (D2LvlSubTxt*)pRecords;
		for (int i = 0; i < *pRecordCount; ++i)
		{
			pLvlSub[i].pDrlgFile = nullptr;
			memset(pLvlSub[i].pTileTypeGrid, 0, sizeof(pLvlSub[i].pTileTypeGrid));
			memset(pLvlSub[i].pWallGrid, 0, sizeof(pLvlSub[i].pWallGrid));
			memset(&pLvlSub[i].pFloorGrid, 0, sizeof(pLvlSub[i].pFloorGrid));
			memset(&pLvlSub[i].pShadowGrid, 0, sizeof(pLvlSub[i].pShadowGrid));
		}
	}
	return pRecords;
}

void __stdcall DATATBLS_UnloadBin(void* pBin)
{
	free(pBin);
}

static D2ObjectsTxt* gpObjectsTxt = nullptr;
static int gnObjectsTxtRecordCount = 0;
static int gnSuperUniquesTxtRecordCount = 0;

// Loads the monster tables DRLGPRESET_LoadDrlgFile needs. Only the SuperUniques/MonStats record
// counts are consumed (monster preset id translation, DrlgPreset.cpp:250-275).
static void D2ORACLE_LoadMonsterTables()
{
	int nCount = 0;
	free(LoadBinTable("monstats", &nCount, sizeof(D2MonStatsTxt)));
	sgptDataTables->nMonStatsTxtRecordCount = nCount;
	free(LoadBinTable("superuniques", &gnSuperUniquesTxtRecordCount, sizeof(D2SuperUniquesTxt)));

	// Same sectioning as DATATBLS_LoadMonPresetTxt (MonsterTbls.cpp:2524-2557).
	int nRecordCount = 0;
	D2MonPresetTxt* pMonPresetTxt = (D2MonPresetTxt*)LoadBinTable("monpreset", &nRecordCount, sizeof(D2MonPresetTxt));
	sgptDataTables->pMonPresetTxt = pMonPresetTxt;
	sgptDataTables->pMonPresetTxtActSections[0] = pMonPresetTxt;
	int nActRecords = 0;
	int nAct = 0;
	for (int i = 0; i < nRecordCount; ++i)
	{
		for (int j = nAct + 1; j < pMonPresetTxt[i].nAct; ++j)
		{
			sgptDataTables->nMonPresetTxtActRecordCounts[nAct] = nActRecords;
			++nAct;
			nActRecords = 0;
			sgptDataTables->pMonPresetTxtActSections[nAct] = &pMonPresetTxt[i];
		}
		++nActRecords;
	}
	sgptDataTables->nMonPresetTxtActRecordCounts[nAct] = nActRecords;
}

// Same relative order as DATATBLS_LoadAllTxts (DataTbls.cpp:856-870): the monster tables are
// loaded by DATATBLS_LoadSomeMonsterTxts (MonsterTbls.cpp:2741-2744) BEFORE the level tables,
// because DATATBLS_LoadLvlSubTxt loads the LvlSub DS1s and translates their monster preset units
// through MonPreset. Objects.txt is loaded after LvlSub.
void D2ORACLE_LoadDataTables()
{
	D2ORACLE_LoadMonsterTables();

	DATATBLS_LoadLevelsTxt(nullptr);
	DATATBLS_LoadLevelDefsBin(nullptr);
	DATATBLS_LoadLevelTypesTxt(nullptr);
	DATATBLS_LoadLvlPrestTxt(nullptr, 1);
	DATATBLS_LoadLvlWarpTxt(nullptr);
	DATATBLS_LoadLvlMazeTxt(nullptr);
	DATATBLS_LoadLvlSubTxt(nullptr, 1, 0);

	gpObjectsTxt = (D2ObjectsTxt*)LoadBinTable("objects", &gnObjectsTxtRecordCount, sizeof(D2ObjectsTxt));
}

D2ObjectsTxt* __stdcall DATATBLS_GetObjectsTxtRecord(int nObjectId)
{
	if (nObjectId < 0 || nObjectId >= gnObjectsTxtRecordCount)
	{
		D2ORACLE_Fail("DATATBLS_GetObjectsTxtRecord(%d) out of range", nObjectId);
	}
	return &gpObjectsTxt[nObjectId];
}

//D2Common.0x6FD6EF30 (#11256), same body as MonsterTbls.cpp:2560
D2MonPresetTxt* __fastcall DATATBLS_GetMonPresetTxtActSection(int nAct, int* pRecordCount)
{
	if (pRecordCount)
	{
		if (nAct >= 0 && nAct < 5 && sgptDataTables->pMonPresetTxt)
		{
			*pRecordCount = sgptDataTables->nMonPresetTxtActRecordCounts[nAct];
			return sgptDataTables->pMonPresetTxtActSections[nAct];
		}
		*pRecordCount = 0;
	}
	return NULL;
}

int __fastcall DATATBLS_GetSuperUniquesTxtRecordCount()
{
	return gnSuperUniquesTxtRecordCount;
}

D2ItemsTxt* __stdcall DATATBLS_GetItemRecordFromItemCode(uint32_t, int*)
{
	D2ORACLE_Fail("unexpected DATATBLS_GetItemRecordFromItemCode (item preset unit in a DS1)");
}
uint32_t __fastcall DATATBLS_StringToCode(char*)
{
	D2ORACLE_Fail("unexpected DATATBLS_StringToCode");
}
D2FieldStrc* __stdcall DATATBLS_AllocField()
{
	D2ORACLE_Fail("unexpected DATATBLS_AllocField");
}
void __stdcall DATATBLS_FreeField(D2FieldStrc*)
{
	D2ORACLE_Fail("unexpected DATATBLS_FreeField");
}
void __stdcall DATATBLS_SetFieldCoordinates(D2FieldStrc*, int, int)
{
	D2ORACLE_Fail("unexpected DATATBLS_SetFieldCoordinates");
}
BOOL __stdcall D2Common_11099(D2FieldStrc*, D2ActiveRoomStrc*, int, int, uint16_t)
{
	D2ORACLE_Fail("unexpected D2Common_11099");
}
BOOL __fastcall MONSTERS_ValidateMonsterId(int nMonsterId)
{
	return nMonsterId >= 0 && nMonsterId < sgptDataTables->nMonStatsTxtRecordCount ? nMonsterId : -1;
}

// ---- D2CMP: DT1 tile libraries ----
// D2CMP.dll is not reimplemented by D2MOO (its D2CMP sources are placeholders importing the DLL), so
// the tile library functions are implemented here from the DT1 files. They are NOT optional:
// DRLGROOMTILE_GetTileCache (DrlgRoomTile.cpp:45-92) rolls the room seed iff the rarity sum of the
// tiles returned by D2CMP_10088_GetTiles is > 0, and it runs inside the LvlSub stamping of
// InitOutdoorRoomGrids (sub_6FD8ACE0 -> DRLGROOMTILE_InitTileShadow), so the tile data advances the
// substitution RNG stream. Since schema 3 the chosen entry itself is dumped (D2DrlgTileDataStrc::pTile
// as [library path, tile index in that DT1]), so the ORDER of the returned entries (slot order, then DT1
// file order) decides dumped output: which variant DRLGROOMTILE_GetTileCache picks for a given roll.
// That order is NOT verified against the real D2CMP.dll (open question; the returned count and rarity
// sum do not depend on it).
namespace
{
constexpr size_t kDt1HeaderSize = 0x114;
constexpr size_t kDt1TileHeaderSize = 96;
constexpr int kTileSlots = 32; // D2DrlgRoomStrc::pTiles / D2DrlgStrc::pTiles

struct OracleTileLibrary;

// POD: allocated with new + memset(0). pLibrary / nIndex are the oracle's identity of the entry
// (not D2CMP fields), used only by D2ORACLE_DescribeTile.
struct OracleTile
{
	D2TileLibraryEntryStrc tEntry;
	uint8_t nSubtileFlags[25];
	const OracleTileLibrary* pLibrary;
	int nIndex;
};

struct OracleTileLibrary
{
	D2TileLibraryHashStrc tHash; // identity stored in the pTiles slots
	std::string szPath;
	std::vector<OracleTile*> tiles;
};

std::map<std::string, OracleTileLibrary*> gTileLibrariesByPath;
std::map<const D2TileLibraryHashStrc*, OracleTileLibrary*> gTileLibrariesByHash;
std::map<const D2TileLibraryEntryStrc*, OracleTile*> gTilesByEntry;

template <typename T>
T ReadLE(const std::vector<uint8_t>& bytes, size_t nOffset)
{
	T value;
	memcpy(&value, bytes.data() + nOffset, sizeof(T));
	return value;
}

OracleTileLibrary* LoadTileLibrary(const char* szFileName)
{
	std::string rel = szFileName ? szFileName : "";
	for (char& c : rel)
	{
		c = (c == '\\') ? '/' : (char)std::tolower((unsigned char)c);
	}
	auto it = gTileLibrariesByPath.find(rel);
	if (it != gTileLibrariesByPath.end())
	{
		return it->second;
	}

	const std::string path = gsD2OracleDataDir + "/mpq/" + rel;
	const std::vector<uint8_t> bytes = ReadWholeFile(path);
	if (bytes.size() < kDt1HeaderSize)
	{
		D2ORACLE_Fail("%s: truncated DT1 header", path.c_str());
	}
	const int32_t nVersion1 = ReadLE<int32_t>(bytes, 0x00);
	const int32_t nVersion2 = ReadLE<int32_t>(bytes, 0x04);
	const int32_t nTiles = ReadLE<int32_t>(bytes, 0x10C);
	const int32_t nTileStart = ReadLE<int32_t>(bytes, 0x110);
	if (nVersion1 != 7 || nVersion2 != 6)
	{
		D2ORACLE_Fail("%s: unsupported DT1 version %d.%d", path.c_str(), nVersion1, nVersion2);
	}
	if (nTiles < 0 || nTileStart < 0 || (size_t)nTileStart + (size_t)nTiles * kDt1TileHeaderSize > bytes.size())
	{
		D2ORACLE_Fail("%s: %d tile headers at 0x%X exceed the file", path.c_str(), nTiles, nTileStart);
	}

	OracleTileLibrary* pLibrary = new OracleTileLibrary();
	memset(&pLibrary->tHash, 0, sizeof(pLibrary->tHash));
	pLibrary->szPath = rel;
	for (int i = 0; i < nTiles; ++i)
	{
		const size_t nBase = (size_t)nTileStart + (size_t)i * kDt1TileHeaderSize;
		OracleTile* pTile = new OracleTile();
		memset(pTile, 0, sizeof(*pTile));
		pTile->tEntry.nLightDirection = ReadLE<int32_t>(bytes, nBase + 0x00);
		pTile->tEntry.nRoofHeight = ReadLE<uint16_t>(bytes, nBase + 0x04);
		pTile->tEntry.nFlags = ReadLE<uint16_t>(bytes, nBase + 0x06);
		pTile->tEntry.nTotalHeight = ReadLE<int32_t>(bytes, nBase + 0x08);
		pTile->tEntry.nWidth = ReadLE<int32_t>(bytes, nBase + 0x0C);
		pTile->tEntry.nHeightToBottom = ReadLE<int32_t>(bytes, nBase + 0x10);
		pTile->tEntry.nType = ReadLE<int32_t>(bytes, nBase + 0x14);
		pTile->tEntry.nStyle = ReadLE<int32_t>(bytes, nBase + 0x18);
		pTile->tEntry.nSequence = ReadLE<int32_t>(bytes, nBase + 0x1C);
		pTile->tEntry.nRarity_Frame = ReadLE<int32_t>(bytes, nBase + 0x20);
		memcpy(pTile->nSubtileFlags, bytes.data() + nBase + 0x28, sizeof(pTile->nSubtileFlags));
		pTile->pLibrary = pLibrary;
		pTile->nIndex = i;
		pLibrary->tiles.push_back(pTile);
		gTilesByEntry[&pTile->tEntry] = pTile;
	}
	gTileLibrariesByPath[rel] = pLibrary;
	gTileLibrariesByHash[&pLibrary->tHash] = pLibrary;
	return pLibrary;
}

OracleTile* TileOf(const D2TileLibraryEntryStrc* pEntry)
{
	auto it = gTilesByEntry.find(pEntry);
	if (it == gTilesByEntry.end())
	{
		D2ORACLE_Fail("D2CMP accessor called with a tile the oracle did not load");
	}
	return it->second;
}
}  // namespace

void D2ORACLE_DescribeTile(const D2TileLibraryEntryStrc* pTileLibraryEntry, std::string* pszLibrary, int* pnIndex)
{
	const OracleTile* pTile = TileOf(pTileLibraryEntry);
	*pszLibrary = pTile->pLibrary->szPath;
	*pnIndex = pTile->nIndex;
}

//D2Cmp.#10087 (1.13c D2CMP.dll 0x6fe25480): stores the library in the first free slot of the 32-slot
// array without deduplicating (e.g. LvlTypes.txt row 21 Act 3 Jungle lists Bridge.dt1 in slots 0 and 8).
void __stdcall D2CMP_10087_LoadTileLibrarySlot(D2TileLibraryHashStrc** ppTileLibraryHash, const char* szFileName)
{
	OracleTileLibrary* pLibrary = LoadTileLibrary(szFileName);
	for (int i = 0; i < kTileSlots; ++i)
	{
		if (!ppTileLibraryHash[i])
		{
			ppTileLibraryHash[i] = &pLibrary->tHash;
			return;
		}
	}
	D2ORACLE_Fail("no free tile library slot for %s", pLibrary->szPath.c_str());
}

//D2Cmp.#10088
int __stdcall D2CMP_10088_GetTiles(D2TileLibraryHashStrc** ppTileLibraryHash, int nType, int nStyle, int nSequence, D2TileLibraryEntryStrc** pTileList, int nTileListSize)
{
	int nCount = 0;
	int nRaritySum = 0;
	for (int i = 0; i < kTileSlots && ppTileLibraryHash[i]; ++i)
	{
		auto it = gTileLibrariesByHash.find(ppTileLibraryHash[i]);
		if (it == gTileLibrariesByHash.end())
		{
			D2ORACLE_Fail("D2CMP_10088_GetTiles: slot %d holds a library the oracle did not load", i);
		}
		for (OracleTile* pTile : it->second->tiles)
		{
			if (pTile->tEntry.nType != nType || pTile->tEntry.nStyle != nStyle || pTile->tEntry.nSequence != nSequence)
			{
				continue;
			}
			if (nCount >= nTileListSize)
			{
				// Which entries D2CMP keeps when truncating depends on its internal order.
				D2ORACLE_Fail("D2CMP_10088_GetTiles(%d,%d,%d): more than %d matching tiles", nType, nStyle, nSequence, nTileListSize);
			}
			pTileList[nCount++] = &pTile->tEntry;
			nRaritySum += pTile->tEntry.nRarity_Frame;
		}
	}
	D2ORACLE_TraceLine("T %d %d %d %d %d", nType, nStyle, nSequence, nCount, nRaritySum);
	return nCount;
}

//D2Cmp.#10078
int __stdcall D2CMP_10078_GetTileStyle(D2TileLibraryEntryStrc* pTileLibraryEntry)
{
	return TileOf(pTileLibraryEntry)->tEntry.nStyle;
}
//D2Cmp.#10079
int __stdcall D2CMP_10079_GetTileFlags(D2TileLibraryEntryStrc* pTileLibraryEntry)
{
	return TileOf(pTileLibraryEntry)->tEntry.nFlags;
}
//D2Cmp.#10081
int __stdcall D2CMP_10081_GetTileRarity(D2TileLibraryEntryStrc* pTileLibraryEntry)
{
	return TileOf(pTileLibraryEntry)->tEntry.nRarity_Frame;
}
//D2Cmp.#10082
int __stdcall D2CMP_10082_GetTileSequence(D2TileLibraryEntryStrc* pTileLibraryEntry)
{
	return TileOf(pTileLibraryEntry)->tEntry.nSequence;
}
//D2Cmp.#10085: the 25 sub-tile collision flags.
uint8_t* __stdcall D2CMP_10085_GetTileFlagArray(D2TileLibraryEntryStrc* pTileLibraryEntry)
{
	return TileOf(pTileLibraryEntry)->nSubtileFlags;
}

// ---- D2Dungeon ----
//D2Common.0x6FD8D6F0, same body as D2Dungeon.cpp:1323
void __stdcall DUNGEON_GameTileToSubtileCoords(int* pX, int* pY)
{
	*pX *= 5;
	*pY *= 5;
}
//Same body as D2Dungeon.cpp:1293
void __stdcall DUNGEON_GameTileToClientCoords(int* pX, int* pY)
{
	int nX = *pX;
	int nY = *pY;
	*pX = 80 * (nX - nY);
	*pY = (80 * (nX + nY)) / 2;
}
D2ActiveRoomStrc* __fastcall DUNGEON_AllocRoom(D2DrlgActStrc*, D2DrlgRoomStrc*, D2DrlgCoordsStrc*, D2DrlgRoomTilesStrc*, int, uint32_t)
{
	D2ORACLE_Fail("unexpected DUNGEON_AllocRoom");
}
BOOL __stdcall DUNGEON_AreSubtileCoordinatesInsideRoom(D2DrlgCoordsStrc*, int, int)
{
	D2ORACLE_Fail("unexpected DUNGEON_AreSubtileCoordinatesInsideRoom");
}
void __stdcall DUNGEON_GetAdjacentRoomsListFromRoom(D2ActiveRoomStrc*, D2ActiveRoomStrc***, int*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetAdjacentRoomsListFromRoom");
}
D2RoomCollisionGridStrc* __stdcall DUNGEON_GetCollisionGridFromRoom(D2ActiveRoomStrc*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetCollisionGridFromRoom");
}
void __stdcall DUNGEON_SetCollisionGridInRoom(D2ActiveRoomStrc*, D2RoomCollisionGridStrc*)
{
	D2ORACLE_Fail("unexpected DUNGEON_SetCollisionGridInRoom");
}
D2DrlgTileDataStrc* __stdcall DUNGEON_GetFloorTilesFromRoom(D2ActiveRoomStrc*, int*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetFloorTilesFromRoom");
}
D2DrlgTileDataStrc* __stdcall DUNGEON_GetWallTilesFromRoom(D2ActiveRoomStrc*, int*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetWallTilesFromRoom");
}
D2DrlgTileDataStrc* __stdcall DUNGEON_GetRoofTilesFromRoom(D2ActiveRoomStrc*, int*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetRoofTilesFromRoom");
}
void __stdcall DUNGEON_GetRoomCoordinates(D2ActiveRoomStrc*, D2DrlgCoordsStrc*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetRoomCoordinates");
}
D2DrlgRoomStrc* __stdcall DUNGEON_GetRoomExFromRoom(D2ActiveRoomStrc*)
{
	D2ORACLE_Fail("unexpected DUNGEON_GetRoomExFromRoom");
}
void __fastcall DUNGEON_RemoveRoomFromAct(D2DrlgActStrc*, D2ActiveRoomStrc*)
{
	D2ORACLE_Fail("unexpected DUNGEON_RemoveRoomFromAct");
}

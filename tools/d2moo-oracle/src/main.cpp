// D2MOO DRLG oracle driver: generates Act I levels with the native D2MOO code and dumps every
// stage the TypeScript port is diffed against (schema v3). See ../README.md.
//
// Usage:
//   d2moo-oracle --data <dir> --seed <n> --levels 2,3,4 [--difficulty 0] [--isolated]
//                [--trace <file>] --out <file.json>

#include "oracle.h"

#include "Windows.h"
#include "D2DataTbls.h"
#include "Drlg/D2DrlgDrlg.h"
#include "Drlg/D2DrlgDrlgGrid.h"
#include "Drlg/D2DrlgDrlgLogic.h"
#include "Drlg/D2DrlgDrlgRoom.h"
#include "Drlg/D2DrlgDrlgVer.h"
#include "Drlg/D2DrlgOutdoors.h"
#include "Drlg/D2DrlgOutRoom.h"
#include "Drlg/D2DrlgPreset.h"
#include "Drlg/D2DrlgRoomTile.h"
#include "D2Seed.h"
#include <DataTbls/LevelsIds.h>

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <malloc.h>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#ifndef D2ORACLE_D2MOO_COMMIT
#error "build.sh must define D2ORACLE_D2MOO_COMMIT"
#endif

namespace
{
std::string Seed(const D2SeedStrc& s)
{
	return "[" + std::to_string(s.nLowSeed) + "," + std::to_string(s.nHighSeed) + "]";
}

std::string Coord(const D2DrlgCoordStrc& c)
{
	std::ostringstream o;
	o << "[" << c.nPosX << "," << c.nPosY << "," << c.nWidth << "," << c.nHeight << "]";
	return o.str();
}

// {"w":W,"h":H,"cells":[row-major int32]} or null when the grid was never allocated.
std::string Grid(const D2DrlgGridStrc& grid)
{
	if (!grid.pCellsFlags || !grid.pCellsRowOffsets)
	{
		return "null";
	}
	std::ostringstream o;
	o << "{\"w\":" << grid.nWidth << ",\"h\":" << grid.nHeight << ",\"cells\":[";
	for (int y = 0; y < grid.nHeight; ++y)
	{
		for (int x = 0; x < grid.nWidth; ++x)
		{
			if (x || y) o << ",";
			o << grid.pCellsFlags[x + grid.pCellsRowOffsets[y]];
		}
	}
	o << "]}";
	return o.str();
}

std::string PresetUnits(const D2PresetUnitStrc* pUnit)
{
	std::ostringstream o;
	o << "[";
	for (bool first = true; pUnit; pUnit = pUnit->pNext, first = false)
	{
		if (!first) o << ",";
		o << "[" << pUnit->nUnitType << "," << pUnit->nIndex << "," << pUnit->nMode << "," << pUnit->nXpos << "," << pUnit->nYpos << "," << pUnit->bSpawned << "]";
	}
	o << "]";
	return o.str();
}

std::string Orths(const D2DrlgOrthStrc* pOrth)
{
	std::ostringstream o;
	o << "[";
	for (bool first = true; pOrth; pOrth = pOrth->pNext, first = false)
	{
		if (!first) o << ",";
		// Level-to-level orths store the neighbour level in the union.
		o << "{\"level\":" << (pOrth->pLevel ? pOrth->pLevel->nLevelId : -1) << ",\"dir\":" << (int)pOrth->nDirection
		  << ",\"preset\":" << pOrth->bPreset << ",\"init\":" << pOrth->bInit
		  << ",\"box\":" << (pOrth->pBox ? Coord(*pOrth->pBox) : std::string("null")) << "}";
	}
	o << "]";
	return o.str();
}

const char* PrestFile(const D2DrlgMapStrc* pMap)
{
	D2LvlPrestTxt* pPrest = DATATBLS_GetLvlPrestTxtRecord(pMap->nLevelPrest);
	if (!pPrest || pMap->nPickedFile < 0 || pMap->nPickedFile >= 6)
	{
		return "";
	}
	return pPrest->szFile[pMap->nPickedFile];
}

std::string Map(const D2DrlgMapStrc* pMap)
{
	std::ostringstream o;
	o << "{\"prest\":" << pMap->nLevelPrest << ",\"picked\":" << pMap->nPickedFile << ",\"coord\":" << Coord(pMap->pDrlgCoord)
	  << ",\"file\":\"";
	for (const char* p = PrestFile(pMap); *p; ++p)
	{
		o << (*p == '\\' ? '/' : *p);
	}
	o << "\",\"hasInfo\":" << pMap->bHasInfo << ",\"units\":" << PresetUnits(pMap->pPresetUnit) << "}";
	return o.str();
}

// ---- act stage ----
std::string ActLevel(D2DrlgLevelStrc* pLevel)
{
	std::ostringstream o;
	o << "{\"id\":" << pLevel->nLevelId << ",\"drlgType\":" << pLevel->nDrlgType << ",\"levelType\":" << pLevel->nLevelType
	  << ",\"coord\":" << Coord(pLevel->pLevelCoords) << ",\"flags\":" << pLevel->dwFlags << ",\"seed\":" << Seed(pLevel->pSeed);
	if (pLevel->nDrlgType == DRLGTYPE_OUTDOOR && pLevel->pOutdoors)
	{
		o << ",\"outdoor\":{\"flags\":" << pLevel->pOutdoors->dwFlags << ",\"roomData\":" << Orths(pLevel->pOutdoors->pRoomData) << "}";
	}
	if (pLevel->nDrlgType == DRLGTYPE_PRESET && pLevel->pPreset)
	{
		o << ",\"preset\":{\"direction\":" << pLevel->pPreset->nDirection << ",\"map\":"
		  << (pLevel->pPreset->pDrlgMap ? Map(pLevel->pPreset->pDrlgMap) : std::string("null")) << "}";
	}
	o << "}";
	return o.str();
}

std::string Act(D2DrlgStrc* pDrlg)
{
	std::map<int, D2DrlgLevelStrc*> levels;
	for (D2DrlgLevelStrc* pLevel = pDrlg->pLevel; pLevel; pLevel = pLevel->pNextLevel)
	{
		levels[pLevel->nLevelId] = pLevel;
	}
	std::ostringstream o;
	o << "[";
	bool first = true;
	for (auto& [id, pLevel] : levels)
	{
		if (!first) o << ",";
		first = false;
		o << ActLevel(pLevel);
	}
	o << "]";
	return o.str();
}

// ---- levelGrid stage (after DRLGOUTWILD_InitAct1OutdoorLevel, before any room exists) ----
// Vertex references: -1 = null, 0..23 = pOutdoors->pVertices[i], 100+k = k-th vertex of the pVertex ring.
std::map<int, std::string> gLevelGridJson;

std::string LevelGrid(D2DrlgLevelStrc* pLevel)
{
	D2DrlgOutdoorInfoStrc* pOut = pLevel->pOutdoors;
	std::vector<D2DrlgVertexStrc*> ring;
	if (D2DrlgVertexStrc* pStart = pOut->pVertex)
	{
		D2DrlgVertexStrc* p = pStart;
		do
		{
			ring.push_back(p);
			p = p->pNext;
		} while (p && p != pStart && ring.size() < 4096);
	}
	auto ref = [&](const D2DrlgVertexStrc* p) -> int {
		if (!p) return -1;
		if (p >= &pOut->pVertices[0] && p < &pOut->pVertices[24]) return (int)(p - &pOut->pVertices[0]);
		for (size_t k = 0; k < ring.size(); ++k)
		{
			if (ring[k] == p) return 100 + (int)k;
		}
		D2ORACLE_Fail("level %d: vertex pointer outside pVertices and the ring", pLevel->nLevelId);
	};
	auto vertex = [&](const D2DrlgVertexStrc& v) {
		std::ostringstream o;
		o << "[" << v.nPosX << "," << v.nPosY << "," << (int)v.nDirection << "," << v.dwFlags << "," << ref(v.pNext) << "]";
		return o.str();
	};

	std::ostringstream o;
	o << "{\"flags\":" << pOut->dwFlags << ",\"coord\":" << Coord(pOut->pCoord) << ",\"grids\":[";
	for (int i = 0; i < 4; ++i)
	{
		if (i) o << ",";
		o << Grid(pOut->pGrid[i]);
	}
	o << "],\"ring\":[";
	for (size_t k = 0; k < ring.size(); ++k)
	{
		if (k) o << ",";
		o << vertex(*ring[k]);
	}
	o << "],\"nVertices\":" << pOut->nVertices << ",\"vertices\":[";
	for (int i = 0; i < 24; ++i)
	{
		if (i) o << ",";
		o << vertex(pOut->pVertices[i]);
	}
	o << "],\"pathStarts\":[";
	// sub_6FD80750 (DrlgOutPlace.cpp:470-505) builds each path as a null-terminated chain of
	// pool-allocated vertices, so the chains are dumped by value.
	for (int i = 0; i < 6; ++i)
	{
		if (i) o << ",";
		if (!pOut->pPathStarts[i])
		{
			o << "null";
			continue;
		}
		o << "[";
		int n = 0;
		for (const D2DrlgVertexStrc* p = pOut->pPathStarts[i]; p; p = p->pNext, ++n)
		{
			if (n >= 4096) D2ORACLE_Fail("level %d: path %d does not terminate", pLevel->nLevelId, i);
			o << (n ? "," : "") << "[" << p->nPosX << "," << p->nPosY << "," << (int)p->nDirection << "," << p->dwFlags << "]";
		}
		o << "]";
	}
	o << "],\"roomData\":" << Orths(pOut->pRoomData) << ",\"seed\":" << Seed(pLevel->pSeed) << "}";
	return o.str();
}
}  // namespace

extern "C" void __real__Z32DRLGOUTWILD_InitAct1OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel);
extern "C" void __real__Z32DRLGOUTDESR_InitAct2OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel);
extern "C" void __real__Z33DRLGOUTPLACE_InitAct3OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel);
extern "C" void __real__Z33DRLGOUTSIEGE_InitAct5OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel);
extern "C" D2DrlgMapStrc* __real__Z23DRLGPRESET_AllocDrlgMapP15D2DrlgLevelStrciP15D2DrlgCoordStrcP10D2SeedStrc(
	D2DrlgLevelStrc* pLevel, int nLvlPrestId, D2DrlgCoordStrc* pDrlgCoord, D2SeedStrc* pSeed);
extern "C" BOOL __real__Z32DRLGOUTPLACE_CreateOutdoorRoomExP15D2DrlgLevelStrciiiiiiii(
	D2DrlgLevelStrc* pLevel, int nX, int nY, int nWidth, int nHeight, int dwRoomFlags, int dwOutdoorFlags, int dwOutdoorFlagsEx, int dwDT1Mask);

// Linked with -Wl,--wrap: DRLGOUTDOORS_GenerateLevel's call to InitAct{1,2,3,5}OutdoorLevel (and
// for Act 4, where DRLGOUTDOORS_InitAct4OutdoorLevel is in the same TU, the first room creation
// immediately after it) lands here so the level grids are captured between InitAct*OutdoorLevel
// and room creation.
extern "C" void __wrap__Z32DRLGOUTWILD_InitAct1OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel)
{
	__real__Z32DRLGOUTWILD_InitAct1OutdoorLevelP15D2DrlgLevelStrc(pLevel);
	gLevelGridJson[pLevel->nLevelId] = LevelGrid(pLevel);
}
extern "C" void __wrap__Z32DRLGOUTDESR_InitAct2OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel)
{
	__real__Z32DRLGOUTDESR_InitAct2OutdoorLevelP15D2DrlgLevelStrc(pLevel);
	gLevelGridJson[pLevel->nLevelId] = LevelGrid(pLevel);
}
extern "C" void __wrap__Z33DRLGOUTPLACE_InitAct3OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel)
{
	__real__Z33DRLGOUTPLACE_InitAct3OutdoorLevelP15D2DrlgLevelStrc(pLevel);
	gLevelGridJson[pLevel->nLevelId] = LevelGrid(pLevel);
}
extern "C" void __wrap__Z33DRLGOUTSIEGE_InitAct5OutdoorLevelP15D2DrlgLevelStrc(D2DrlgLevelStrc* pLevel)
{
	__real__Z33DRLGOUTSIEGE_InitAct5OutdoorLevelP15D2DrlgLevelStrc(pLevel);
	gLevelGridJson[pLevel->nLevelId] = LevelGrid(pLevel);
}
extern "C" D2DrlgMapStrc* __wrap__Z23DRLGPRESET_AllocDrlgMapP15D2DrlgLevelStrciP15D2DrlgCoordStrcP10D2SeedStrc(
	D2DrlgLevelStrc* pLevel, int nLvlPrestId, D2DrlgCoordStrc* pDrlgCoord, D2SeedStrc* pSeed)
{
	if (pLevel->nDrlgType == DRLGTYPE_OUTDOOR && gLevelGridJson.find(pLevel->nLevelId) == gLevelGridJson.end())
	{
		gLevelGridJson[pLevel->nLevelId] = LevelGrid(pLevel);
	}
	return __real__Z23DRLGPRESET_AllocDrlgMapP15D2DrlgLevelStrciP15D2DrlgCoordStrcP10D2SeedStrc(pLevel, nLvlPrestId, pDrlgCoord, pSeed);
}
extern "C" BOOL __wrap__Z32DRLGOUTPLACE_CreateOutdoorRoomExP15D2DrlgLevelStrciiiiiiii(
	D2DrlgLevelStrc* pLevel, int nX, int nY, int nWidth, int nHeight, int dwRoomFlags, int dwOutdoorFlags, int dwOutdoorFlagsEx, int dwDT1Mask)
{
	if (pLevel->nDrlgType == DRLGTYPE_OUTDOOR && gLevelGridJson.find(pLevel->nLevelId) == gLevelGridJson.end())
	{
		gLevelGridJson[pLevel->nLevelId] = LevelGrid(pLevel);
	}
	return __real__Z32DRLGOUTPLACE_CreateOutdoorRoomExP15D2DrlgLevelStrciiiiiiii(
		pLevel, nX, nY, nWidth, nHeight, dwRoomFlags, dwOutdoorFlags, dwOutdoorFlagsEx, dwDT1Mask);
}

namespace
{
std::string Rooms(D2DrlgLevelStrc* pLevel, std::vector<D2DrlgMapStrc*>& maps)
{
	auto mapIndex = [&](D2DrlgMapStrc* pMap) -> int {
		for (size_t i = 0; i < maps.size(); ++i)
		{
			if (maps[i] == pMap) return (int)i;
		}
		maps.push_back(pMap);
		return (int)maps.size() - 1;
	};
	std::ostringstream o;
	o << "[";
	int i = 0;
	for (D2DrlgRoomStrc* pRoom = pLevel->pFirstRoomEx; pRoom; pRoom = pRoom->pDrlgRoomNext, ++i)
	{
		if (i) o << ",";
		o << "{\"type\":" << pRoom->nType << ",\"coord\":" << Coord(pRoom->pDrlgCoord) << ",\"flags\":" << pRoom->dwFlags
		  << ",\"otherFlags\":" << pRoom->dwOtherFlags << ",\"dt1Mask\":" << pRoom->dwDT1Mask << ",\"initSeed\":" << pRoom->dwInitSeed
		  << ",\"seed\":" << Seed(pRoom->pSeed);
		if (pRoom->nType == DRLGTYPE_MAZE)
		{
			if (!pRoom->pOutdoor) D2ORACLE_Fail("level %d room %d: maze room without pOutdoor", pLevel->nLevelId, i);
			const D2DrlgOutdoorRoomStrc* p = pRoom->pOutdoor;
			o << ",\"outdoor\":{\"flags\":" << p->dwFlags << ",\"flagsEx\":" << p->dwFlagsEx << ",\"subType\":" << p->nSubType
			  << ",\"subTheme\":" << p->nSubTheme << ",\"subThemePicked\":" << p->nSubThemePicked << "}";
		}
		else if (pRoom->nType == DRLGTYPE_PRESET)
		{
			if (!pRoom->pMaze || !pRoom->pMaze->pMap) D2ORACLE_Fail("level %d room %d: preset room without map", pLevel->nLevelId, i);
			const D2DrlgPresetRoomStrc* p = pRoom->pMaze;
			o << ",\"preset\":{\"prest\":" << p->nLevelPrest << ",\"picked\":" << p->nPickedFile << ",\"flags\":" << p->dwFlags
			  << ",\"map\":" << mapIndex(p->pMap) << "}";
		}
		else
		{
			D2ORACLE_Fail("level %d room %d: unexpected room type %d", pLevel->nLevelId, i, pRoom->nType);
		}
		o << "}";
	}
	o << "]";
	return o.str();
}

// ---- activation stage ----
struct RoomActivation
{
	D2DrlgRoomStrc* pRoom;
	// Schema-2 fields, captured right after DRLGROOMTILE_InitRoomGrids (JSON object without the closing brace).
	std::string szHead;
	// Room seed right after the room's own DRLGROOMTILE_AddRoomMapTiles.
	std::string szSeedAfterTiles;
};

// Mirrors DRLGACTIVATE_InitializeRoomEx (DrlgActivate.cpp:317-331) followed by
// DRLGACTIVATE_RoomEx_EnsureHasRoom (DrlgActivate.cpp:95-115) up to DRLGROOMTILE_AddRoomMapTiles.
// DRLG_CreateRoomForRoomEx (the D2ActiveRoomStrc, built by D2Game) is not run, so pRoom stays NULL for
// every room and D2Common_COLLISION_FirstFn_6FD41000 is a no-op (D2Collision.cpp: returns when pRoom is
// NULL). In the game a room activated earlier already has its active room, so the linked-tile merge of
// a later room also updates that room's collision grid (no effect on the DRLG tile data or the RNG).
// Rooms are activated in pFirstRoomEx order; a preset map spanning several rooms loads its DS1 with
// the seed of the first activated room, which only matters for the randomly skipped preset units
// of DRLGPRESET_AddPresetUnitToDrlgMap (none of them occur in Act I outdoor DS1s). The activation
// order also decides the room-seam merge of DRLGROOMTILE_GetCreateLinkedTileData: the room activated
// later edits the tiles of the near rooms activated before it.
std::vector<RoomActivation> Activate(D2DrlgLevelStrc* pLevel)
{
	std::vector<RoomActivation> out;
	int i = 0;
	char szContext[64];
	for (D2DrlgRoomStrc* pRoom = pLevel->pFirstRoomEx; pRoom; pRoom = pRoom->pDrlgRoomNext, ++i)
	{
		snprintf(szContext, sizeof(szContext), "L%d/a%d", pLevel->nLevelId, i);
		D2ORACLE_SetTraceContext(szContext);
		if (!(pRoom->dwFlags & DRLGROOMFLAG_TILELIB_LOADED))
		{
			DRLGROOMTILE_LoadDT1FilesForRoom(pRoom);
		}
		if (!(pRoom->dwFlags & DRLGROOMFLAG_PRESET_UNITS_ADDED) && pRoom->nType == DRLGTYPE_PRESET)
		{
			DRLGPRESET_SpawnHardcodedPresetUnits(pRoom);
		}
		if (pRoom->pRoom || (pRoom->dwFlags & DRLGROOMFLAG_HAS_ROOM))
		{
			D2ORACLE_Fail("level %d room %d: already has an active room", pLevel->nLevelId, i);
		}
		if (!pRoom->nRoomsNear)
		{
			sub_6FD77BB0(pLevel->pDrlg->pMempool, pRoom);
		}
		DRLGROOMTILE_InitRoomGrids(pRoom);

		std::ostringstream o;
		o << "{\"seed\":" << Seed(pRoom->pSeed);
		if (pRoom->nType == DRLGTYPE_MAZE)
		{
			const D2DrlgOutdoorRoomStrc* p = pRoom->pOutdoor;
			o << ",\"tile\":" << Grid(p->pTileTypeGrid) << ",\"wall\":" << Grid(p->pWallGrid) << ",\"floor\":" << Grid(p->pFloorGrid)
			  << ",\"dirt\":" << Grid(p->pDirtPathGrid);
		}
		else
		{
			const D2DrlgPresetRoomStrc* p = pRoom->pMaze;
			const D2DrlgFileStrc* pFile = p->pMap->pFile;
			o << ",\"walls\":[";
			for (int l = 0; l < pFile->nWallLayers; ++l) o << (l ? "," : "") << Grid(p->pWallGrid[l]);
			o << "],\"tiles\":[";
			for (int l = 0; l < pFile->nWallLayers; ++l) o << (l ? "," : "") << Grid(p->pTileTypeGrid[l]);
			o << "],\"floors\":[";
			for (int l = 0; l < pFile->nFloorLayers; ++l) o << (l ? "," : "") << Grid(p->pFloorGrid[l]);
			o << "],\"shadow\":" << Grid(p->pCellGrid);
		}
		o << ",\"units\":" << PresetUnits(pRoom->pPresetUnits);

		DRLGROOMTILE_AddRoomMapTiles(pRoom);
		out.push_back({pRoom, o.str(), Seed(pRoom->pSeed)});
	}
	return out;
}

// ---- mapTiles (schema 3): the room's D2DrlgTileGridStrc after every requested room is activated ----
// Pointers are dumped as references, resolved over every room of the act (pDrlg->pLevel chain, rooms
// numbered in pFirstRoomEx order), because warps and linked tiles cross level seams:
//   D2DrlgTileDataStrc*  -> [levelId, room, "w"|"f"|"r", index] into that room's pTileGrid->pTiles
//                           pWallTiles / pFloorTiles / pRoofTiles (the pool block, not only [0, count))
//   D2RoomCoordListStrc* -> [levelId, room, "c", index in that room's pLogicalRoomInfo->pCoordList chain]
//   D2DrlgRoomStrc*      -> [levelId, room]
struct TileBlock
{
	int nLevelId;
	int nRoom;
	char cArray;
	size_t nBytes;
};

struct RefIndex
{
	std::map<uintptr_t, TileBlock> tileBlocks;
	std::map<const D2RoomCoordListStrc*, std::string> coordLists;
	std::map<const D2DrlgRoomStrc*, std::string> rooms;
};

constexpr int kMaxChain = 1 << 20;

void AddTileBlock(RefIndex& index, const D2DrlgTileDataStrc* pTiles, int nLevelId, int nRoom, char cArray)
{
	if (!pTiles)
	{
		return;
	}
	// FOG_AllocPool / FOG_ReallocPool are calloc / realloc, so a pool block is a malloc block.
	const TileBlock block = {nLevelId, nRoom, cArray, malloc_usable_size((void*)pTiles)};
	if (!index.tileBlocks.emplace((uintptr_t)pTiles, block).second)
	{
		D2ORACLE_Fail("level %d room %d: tile array %c starts at another array's address", nLevelId, nRoom, cArray);
	}
}

RefIndex BuildRefIndex(D2DrlgStrc* pDrlg)
{
	RefIndex index;
	for (D2DrlgLevelStrc* pLevel = pDrlg->pLevel; pLevel; pLevel = pLevel->pNextLevel)
	{
		int nRoom = 0;
		for (D2DrlgRoomStrc* pRoom = pLevel->pFirstRoomEx; pRoom; pRoom = pRoom->pDrlgRoomNext, ++nRoom)
		{
			const std::string szRoom = std::to_string(pLevel->nLevelId) + "," + std::to_string(nRoom);
			index.rooms[pRoom] = "[" + szRoom + "]";
			if (const D2DrlgTileGridStrc* pTileGrid = pRoom->pTileGrid)
			{
				AddTileBlock(index, pTileGrid->pTiles.pWallTiles, pLevel->nLevelId, nRoom, 'w');
				AddTileBlock(index, pTileGrid->pTiles.pFloorTiles, pLevel->nLevelId, nRoom, 'f');
				AddTileBlock(index, pTileGrid->pTiles.pRoofTiles, pLevel->nLevelId, nRoom, 'r');
			}
			if (const D2DrlgLogicalRoomInfoStrc* pInfo = pRoom->pLogicalRoomInfo)
			{
				int k = 0;
				for (const D2RoomCoordListStrc* p = pInfo->pCoordList; p; p = p->pNext, ++k)
				{
					if (k >= kMaxChain) D2ORACLE_Fail("level %d room %d: pCoordList chain does not terminate", pLevel->nLevelId, nRoom);
					index.coordLists[p] = "[" + szRoom + ",\"c\"," + std::to_string(k) + "]";
				}
			}
		}
	}
	return index;
}

std::string TileRef(const RefIndex& index, const D2DrlgTileDataStrc* p)
{
	if (!p)
	{
		return "null";
	}
	auto it = index.tileBlocks.upper_bound((uintptr_t)p);
	if (it != index.tileBlocks.begin())
	{
		--it;
		const uintptr_t nOffset = (uintptr_t)p - it->first;
		if (nOffset < it->second.nBytes)
		{
			if (nOffset % sizeof(D2DrlgTileDataStrc))
			{
				D2ORACLE_Fail("tile pointer %p is not an element of level %d room %d array %c", (const void*)p, it->second.nLevelId, it->second.nRoom, it->second.cArray);
			}
			return "[" + std::to_string(it->second.nLevelId) + "," + std::to_string(it->second.nRoom) + ",\"" + it->second.cArray + "\","
				+ std::to_string(nOffset / sizeof(D2DrlgTileDataStrc)) + "]";
		}
	}
	D2ORACLE_Fail("tile pointer %p is outside every tile array of the act (dangling?)", (const void*)p);
}

// D2DrlgTileDataStrc::unk0x10 holds (int)D2RoomCoordListStrc* when DRLGLOGIC set it (-m32), else an int.
std::string TileUnk10(const RefIndex& index, int32_t nValue)
{
	if (nValue)
	{
		auto it = index.coordLists.find((const D2RoomCoordListStrc*)(uintptr_t)(uint32_t)nValue);
		if (it != index.coordLists.end())
		{
			return it->second;
		}
	}
	return std::to_string(nValue);
}

std::string TileEntry(const D2TileLibraryEntryStrc* pTile)
{
	if (!pTile)
	{
		return "null";
	}
	std::string szLibrary;
	int nIndex = -1;
	D2ORACLE_DescribeTile(pTile, &szLibrary, &nIndex);
	if (szLibrary.find_first_of("\"\\") != std::string::npos)
	{
		D2ORACLE_Fail("tile library path %s needs JSON escaping", szLibrary.c_str());
	}
	return "[\"" + szLibrary + "\"," + std::to_string(nIndex) + "]";
}

// Every D2DrlgTileDataStrc field in struct order (D2DrlgDrlg.h:333).
std::string TileData(const RefIndex& index, const D2DrlgTileDataStrc& t)
{
	std::ostringstream o;
	o << "[" << t.nWidth << "," << t.nHeight << "," << t.nPosX << "," << t.nPosY << "," << TileUnk10(index, t.unk0x10) << "," << t.dwFlags
	  << "," << TileEntry(t.pTile) << "," << t.nTileType << "," << TileRef(index, t.unk0x20) << "," << t.unk0x24 << "," << (int)t.nRed
	  << "," << (int)t.nGreen << "," << (int)t.nBlue << "," << (int)t.nIntensity << "," << t.unk0x2C << "]";
	return o.str();
}

std::string TileDataArray(const RefIndex& index, const D2DrlgTileDataStrc* pTiles, int nTiles, const char* szArray, int nLevelId, int nRoom)
{
	if (nTiles < 0 || (nTiles > 0 && !pTiles))
	{
		D2ORACLE_Fail("level %d room %d: %d %s without an array", nLevelId, nRoom, nTiles, szArray);
	}
	if (nTiles > 0 && (size_t)nTiles * sizeof(D2DrlgTileDataStrc) > malloc_usable_size((void*)pTiles))
	{
		D2ORACLE_Fail("level %d room %d: %d %s exceed their pool block", nLevelId, nRoom, nTiles, szArray);
	}
	std::string s = "[";
	for (int i = 0; i < nTiles; ++i)
	{
		if (i) s += ",";
		s += TileData(index, pTiles[i]);
	}
	return s + "]";
}

std::string CoordList(const D2RoomCoordListStrc& c)
{
	std::ostringstream o;
	o << "[" << c.nIndex << "," << c.bNode << "," << c.bRoomActive << "," << Coord(c.pBox[0]) << "," << Coord(c.pBox[1]) << "]";
	return o.str();
}

// {flags, nLists, indexX, indexY, lists} or null. pIndexY cells hold (int)D2RoomCoordListStrc*
// (DRLGLOGIC_AssignCoordListsForGrids): dumped as 1 + the index of that list in the room's own
// pCoordList chain, 0 for NULL.
std::string LogicalRoomInfo(const D2DrlgRoomStrc* pRoom, int nLevelId, int nRoom)
{
	const D2DrlgLogicalRoomInfoStrc* pInfo = pRoom->pLogicalRoomInfo;
	if (!pInfo)
	{
		return "null";
	}
	std::map<uint32_t, int> chain;
	std::string lists = "[";
	int k = 0;
	for (const D2RoomCoordListStrc* p = pInfo->pCoordList; p; p = p->pNext, ++k)
	{
		if (k >= kMaxChain) D2ORACLE_Fail("level %d room %d: pCoordList chain does not terminate", nLevelId, nRoom);
		chain[(uint32_t)(uintptr_t)p] = k;
		lists += (k ? "," : "") + CoordList(*p);
	}
	lists += "]";

	std::ostringstream o;
	o << "{\"flags\":" << pInfo->dwFlags << ",\"nLists\":" << pInfo->nLists << ",\"indexX\":" << Grid(pInfo->pIndexX) << ",\"indexY\":";
	const D2DrlgGridStrc& grid = pInfo->pIndexY;
	if (!grid.pCellsFlags || !grid.pCellsRowOffsets)
	{
		o << "null";
	}
	else
	{
		o << "{\"w\":" << grid.nWidth << ",\"h\":" << grid.nHeight << ",\"cells\":[";
		for (int y = 0; y < grid.nHeight; ++y)
		{
			for (int x = 0; x < grid.nWidth; ++x)
			{
				const uint32_t nCell = (uint32_t)grid.pCellsFlags[x + grid.pCellsRowOffsets[y]];
				int nValue = 0;
				if (nCell)
				{
					auto it = chain.find(nCell);
					if (it == chain.end()) D2ORACLE_Fail("level %d room %d: pIndexY cell (%d, %d) is not a list of the room's chain", nLevelId, nRoom, x, y);
					nValue = it->second + 1;
				}
				o << ((x || y) ? "," : "") << nValue;
			}
		}
		o << "]}";
	}
	o << ",\"lists\":" << lists << "}";
	return o.str();
}

// pRoomTiles chain: [[levelId, room] of pDrlgRoom, pLvlWarpTxtRecord index (-1 for NULL), bEnabled,
// unk0x0C, unk0x10].
std::string RoomTiles(const RefIndex& index, const D2DrlgRoomStrc* pRoom, int nLevelId, int nRoom)
{
	std::string s = "[";
	int k = 0;
	for (const D2RoomTileStrc* p = pRoom->pRoomTiles; p; p = p->pNext, ++k)
	{
		if (k >= kMaxChain) D2ORACLE_Fail("level %d room %d: pRoomTiles chain does not terminate", nLevelId, nRoom);
		std::string szRoom = "null";
		if (p->pDrlgRoom)
		{
			auto it = index.rooms.find(p->pDrlgRoom);
			if (it == index.rooms.end()) D2ORACLE_Fail("level %d room %d: warp %d leads to a room outside the act", nLevelId, nRoom, k);
			szRoom = it->second;
		}
		int nWarp = -1;
		if (p->pLvlWarpTxtRecord)
		{
			const ptrdiff_t n = p->pLvlWarpTxtRecord - sgptDataTables->pLvlWarpTxt;
			if (n < 0 || n >= sgptDataTables->nLvlWarpTxtRecordCount) D2ORACLE_Fail("level %d room %d: warp %d has a record outside LvlWarp.txt", nLevelId, nRoom, k);
			nWarp = (int)n;
		}
		s += (k ? "," : "");
		s += "[" + szRoom + "," + std::to_string(nWarp) + "," + std::to_string(p->bEnabled) + "," + TileRef(index, p->unk0x0C) + "," + TileRef(index, p->unk0x10) + "]";
	}
	return s + "]";
}

std::string MapTiles(const RefIndex& index, const D2DrlgRoomStrc* pRoom, int nLevelId, int nRoom)
{
	const D2DrlgTileGridStrc* pTileGrid = pRoom->pTileGrid;
	if (!pTileGrid)
	{
		D2ORACLE_Fail("level %d room %d: no pTileGrid after DRLGROOMTILE_AddRoomMapTiles", nLevelId, nRoom);
	}
	const D2DrlgRoomTilesStrc& t = pTileGrid->pTiles;
	std::ostringstream o;
	o << "{\"nWalls\":" << pTileGrid->nWalls << ",\"nFloors\":" << pTileGrid->nFloors << ",\"nShadows\":" << pTileGrid->nShadows
	  << ",\"pTiles\":{\"nWalls\":" << t.nWalls << ",\"nFloors\":" << t.nFloors << ",\"nRoofs\":" << t.nRoofs << "}"
	  << ",\"walls\":" << TileDataArray(index, t.pWallTiles, t.nWalls, "walls", nLevelId, nRoom)
	  << ",\"floors\":" << TileDataArray(index, t.pFloorTiles, t.nFloors, "floors", nLevelId, nRoom)
	  << ",\"roofs\":" << TileDataArray(index, t.pRoofTiles, t.nRoofs, "roofs", nLevelId, nRoom) << ",\"links\":[";
	int k = 0;
	for (const D2DrlgTileLinkStrc* p = pTileGrid->pMapLinks; p; p = p->pNext, ++k)
	{
		if (k >= kMaxChain) D2ORACLE_Fail("level %d room %d: pMapLinks chain does not terminate", nLevelId, nRoom);
		o << (k ? "," : "") << "[" << p->bFloor << "," << TileRef(index, p->pMapTile) << "]";
	}
	o << "],\"warps\":" << RoomTiles(index, pRoom, nLevelId, nRoom) << ",\"units\":" << PresetUnits(pRoom->pPresetUnits)
	  << ",\"logical\":" << LogicalRoomInfo(pRoom, nLevelId, nRoom) << "}";
	return o.str();
}

// Generation stage of one level: DRLG_InitLevel and everything that exists before any room is
// activated. Returns the level's JSON object without the closing brace.
std::string InitLevelStage(D2DrlgStrc* pDrlg, int nLevelId, D2DrlgLevelStrc** ppLevel)
{
	char szContext[64];
	snprintf(szContext, sizeof(szContext), "L%d", nLevelId);
	D2ORACLE_SetTraceContext(szContext);

	D2DrlgLevelStrc* pLevel = DRLG_GetLevel(pDrlg, nLevelId);
	if (pLevel->nDrlgType != DRLGTYPE_OUTDOOR)
	{
		D2ORACLE_Fail("level %d is not an outdoor level", nLevelId);
	}
	if (pLevel->pFirstRoomEx)
	{
		D2ORACLE_Fail("level %d was already generated before its own generation stage", nLevelId);
	}
	gLevelGridJson.erase(nLevelId);
	DRLG_InitLevel(pLevel);
	auto it = gLevelGridJson.find(nLevelId);
	if (it == gLevelGridJson.end())
	{
		D2ORACLE_Fail("level %d: outdoor levelGrid hook did not fire", nLevelId);
	}

	std::vector<D2DrlgMapStrc*> maps;
	const std::string rooms = Rooms(pLevel, maps);
	std::ostringstream o;
	o << "{\"id\":" << nLevelId << ",\"levelGrid\":" << it->second << ",\"nRooms\":" << pLevel->nRooms << ",\"rooms\":" << rooms
	  << ",\"maps\":[";
	for (size_t i = 0; i < maps.size(); ++i)
	{
		o << (i ? "," : "") << Map(maps[i]);
	}
	o << "],\"levelSeedAfterRooms\":" << Seed(pLevel->pSeed) << ",\"warp\":{\"n\":" << pLevel->nRoomCoords << ",\"xy\":[";
	for (int i = 0; i < pLevel->nRoomCoords; ++i)
	{
		o << (i ? "," : "") << "[" << pLevel->nRoom_Center_Warp_X[i] << "," << pLevel->nRoom_Center_Warp_Y[i] << "]";
	}
	o << "]}";
	*ppLevel = pLevel;
	return o.str();
}

D2DrlgStrc* AllocAct(D2DrlgActStrc* pAct, uint8_t nAct, uint32_t nSeed, uint8_t nDifficulty)
{
	static const int kTownLevelIds[5] = {
		LEVEL_ROGUEENCAMPMENT, LEVEL_LUTGHOLEIN, LEVEL_KURASTDOCKTOWN, LEVEL_THEPANDEMONIUMFORTRESS, LEVEL_HARROGATH,
	};
	memset(pAct, 0, sizeof(*pAct));
	pAct->nAct = nAct;
	D2ORACLE_SetTraceContext("drlg");
	// D2Game allocates the act with the town level id; DRLG_AllocDrlg lays out the whole act
	// (DRLGOUTPLACE_CreateLevelConnections) and generates the town.
	return DRLG_AllocDrlg(pAct, nAct, nullptr, nSeed, kTownLevelIds[nAct], 0, nullptr, nDifficulty, nullptr, nullptr);
}

std::vector<int> ParseLevels(const char* sz)
{
	std::vector<int> levels;
	std::stringstream ss(sz);
	std::string item;
	while (std::getline(ss, item, ','))
	{
		if (item.empty()) continue;
		levels.push_back(atoi(item.c_str()));
	}
	return levels;
}
}  // namespace

int main(int argc, char** argv)
{
	const char* szOut = nullptr;
	const char* szTrace = nullptr;
	bool bHaveSeed = false;
	uint32_t nSeed = 0;
	int nDifficulty = 0;
	int nExplicitAct = -1;
	bool bIsolated = false;
	std::vector<int> levels;
	for (int i = 1; i < argc; ++i)
	{
		const std::string arg = argv[i];
		auto next = [&]() -> const char* {
			if (i + 1 >= argc) D2ORACLE_Fail("missing value for %s", arg.c_str());
			return argv[++i];
		};
		if (arg == "--data") gsD2OracleDataDir = next();
		else if (arg == "--seed") { nSeed = (uint32_t)strtoul(next(), nullptr, 0); bHaveSeed = true; }
		else if (arg == "--levels") levels = ParseLevels(next());
		else if (arg == "--act") nExplicitAct = atoi(next());
		else if (arg == "--difficulty") nDifficulty = atoi(next());
		else if (arg == "--isolated") bIsolated = true;
		else if (arg == "--trace") szTrace = next();
		else if (arg == "--out") szOut = next();
		else D2ORACLE_Fail("unknown argument %s", arg.c_str());
	}
	// Without --levels only the act stage (layout, links, town) is generated and dumped.
	if (gsD2OracleDataDir.empty() || !bHaveSeed || !szOut)
	{
		D2ORACLE_Fail("usage: d2moo-oracle --data <dir> --seed <n> [--levels 2,3] [--act 0..4] --out <file> [--difficulty n] [--isolated] [--trace file]");
	}
	if (nDifficulty < 0 || nDifficulty > 2)
	{
		D2ORACLE_Fail("difficulty must be 0..2");
	}

	D2ORACLE_LoadDataTables();
	if (szTrace)
	{
		D2ORACLE_OpenTrace(szTrace);
	}

	uint8_t nAct = ACT_I;
	if (nExplicitAct != -1)
	{
		if (nExplicitAct < 0 || nExplicitAct > 4) D2ORACLE_Fail("act must be 0..4");
		nAct = (uint8_t)nExplicitAct;
	}
	else if (!levels.empty())
	{
		nAct = DRLG_GetActNoFromLevelId(levels[0]);
	}
	for (int id : levels)
	{
		if (DRLG_GetActNoFromLevelId(id) != nAct)
		{
			D2ORACLE_Fail("level %d belongs to act %d, not act %d", id, (int)DRLG_GetActNoFromLevelId(id), (int)nAct);
		}
	}

	D2DrlgActStrc act = {};
	std::ostringstream o;
	o << "{\"schema\":3,\"oracle\":{\"d2moo\":\"" << D2ORACLE_D2MOO_COMMIT << "\",\"arch\":\"i386\"},\"gameSeed\":" << nSeed
	  << ",\"difficulty\":" << nDifficulty << ",\"isolated\":" << (bIsolated ? "true" : "false");

	D2DrlgStrc* pDrlg = AllocAct(&act, nAct, nSeed, (uint8_t)nDifficulty);
	o << ",\"drlg\":{\"startSeed\":" << pDrlg->dwStartSeed << ",\"seed\":" << Seed(pDrlg->pSeed) << "},\"act\":" << Act(pDrlg) << ",\"levels\":[";
	std::vector<std::string> heads(levels.size());
	std::vector<D2DrlgLevelStrc*> generated(levels.size(), nullptr);
	std::vector<std::vector<RoomActivation>> activations(levels.size());
	if (bIsolated)
	{
		// A fresh act per level proves level generation does not depend on other levels.
		for (size_t i = 0; i < levels.size(); ++i)
		{
			if (i > 0)
			{
				pDrlg = AllocAct(&act, nAct, nSeed, (uint8_t)nDifficulty);
			}
			heads[i] = InitLevelStage(pDrlg, levels[i], &generated[i]);
			activations[i] = Activate(generated[i]);
		}
	}
	else
	{
		// Activating a room initialises the levels behind its warps/vis links (sub_6FD77BB0 ->
		// DRLG_InitLevel), so every requested level is generated before any room is activated.
		for (size_t i = 0; i < levels.size(); ++i)
		{
			heads[i] = InitLevelStage(pDrlg, levels[i], &generated[i]);
		}
		for (size_t i = 0; i < levels.size(); ++i)
		{
			activations[i] = Activate(generated[i]);
		}
	}
	// "mapTiles" is serialised only now: a room activated later rewrites tiles of the near rooms
	// activated before it and rolls their seeds (DRLGROOMTILE_GetCreateLinkedTileData ->
	// DRLGROOMTILE_LinkedTileDataManager), also across level seams, so the tile data are the final state.
	std::map<D2DrlgStrc*, RefIndex> refIndices;
	for (size_t i = 0; i < levels.size(); ++i)
	{
		D2DrlgStrc* pLevelDrlg = generated[i]->pDrlg;
		auto it = refIndices.find(pLevelDrlg);
		if (it == refIndices.end())
		{
			it = refIndices.emplace(pLevelDrlg, BuildRefIndex(pLevelDrlg)).first;
		}
		o << (i ? "," : "") << heads[i] << ",\"activation\":[";
		for (size_t k = 0; k < activations[i].size(); ++k)
		{
			const RoomActivation& a = activations[i][k];
			o << (k ? "," : "") << a.szHead << ",\"seedAfterTiles\":" << a.szSeedAfterTiles << ",\"mapTiles\":"
			  << MapTiles(it->second, a.pRoom, generated[i]->nLevelId, (int)k) << "}";
		}
		o << "]}";
	}
	o << "]}\n";

	D2ORACLE_CloseTrace();
	FILE* f = fopen(szOut, "wb");
	if (!f)
	{
		D2ORACLE_Fail("cannot write %s", szOut);
	}
	const std::string json = o.str();
	fwrite(json.data(), 1, json.size(), f);
	fclose(f);
	return 0;
}

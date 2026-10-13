#pragma once

// Oracle override of D2MOO `source/D2Common/include/D2Seed.h` (commit 5596f5c,
// MIT License, Copyright (c) 2020-2025 The Phrozen Keep community).
//
// The arithmetic is byte-for-byte the same as the original header. The only
// addition is an RNG trace hook: every roll reports (kind, argument, result)
// so the TypeScript port can be diffed against D2MOO call by call.
// `build.sh` verifies with `nm` that every D2MOO object file was compiled
// against this header (each one must reference D2ORACLE_TraceRoll).

#include <D2BasicTypes.h>
#include <D2Common.h>

#define D2ORACLE_TRACED_SEED 1

#pragma pack(1)
struct D2SeedStrc
{
	union
	{
		struct
		{
			uint32_t nLowSeed;					//0x00
			uint32_t nHighSeed;					//0x04
		};
		uint64_t lSeed;		//0x00
	};
};
#pragma pack()

//D2Common.0x6FDA5260 (#10916)
D2COMMON_DLL_DECL void __stdcall SEED_Return();
//D2Common.0x6FDAEA80 (#10920)
D2COMMON_DLL_DECL int __fastcall SEED_GetRandomValue(int nValue);
//D2Common.0x6FDAEAB0 (#10912)
D2COMMON_DLL_DECL void __fastcall SEED_InitSeed(D2SeedStrc* pSeed);
//D2Common.0x6FDAEAC0 (#10913)
D2COMMON_DLL_DECL void __fastcall SEED_InitLowSeed(D2SeedStrc* pSeed, int nLowSeed);
//D2Common.0x6FDAEAD0 (#10914)
D2COMMON_DLL_DECL uint32_t  __fastcall SEED_GetLowSeed(D2SeedStrc* pSeed);
//D2Common.0x6FDAEAE0 (#10921)
D2COMMON_DLL_DECL void __fastcall SEED_SetSeeds(D2SeedStrc* pSeed, uint32_t  nLowSeed, uint32_t  nHighSeed);
//D2Common.0x6FDAEAF0 (#10922)
D2COMMON_DLL_DECL void __fastcall SEED_GetSeeds(D2SeedStrc* pSeed, uint32_t* pLowSeed, uint32_t* pHighSeed);
//D2Common.0x6FDAEB00 (#10915)
D2COMMON_DLL_DECL uint32_t  __fastcall SEED_GetHighSeed(D2SeedStrc* pSeed);

// ---- Oracle trace hook (not part of D2MOO) ----
extern int gnD2OracleTrace;
void D2ORACLE_TraceRoll(const D2SeedStrc* pSeed, char nKind, int nArg, uint64_t nResult);

inline uint64_t D2ORACLE_AdvanceSeed(D2SeedStrc* pSeed)
{
	// Same expression as D2MOO: nHighSeed + 0x6AC690C5 * nLowSeed, evaluated in 64 bits.
	uint64_t lSeed = pSeed->nHighSeed + 0x6AC690C5ull * pSeed->nLowSeed;
	pSeed->lSeed = lSeed;
	return lSeed;
}

//D2Common.0x6FD78E30 + Inlined at many places
inline uint64_t __fastcall SEED_RollRandomNumber(D2SeedStrc* pSeed)
{
	const uint64_t lSeed = D2ORACLE_AdvanceSeed(pSeed);
	if (gnD2OracleTrace)
	{
		D2ORACLE_TraceRoll(pSeed, 'R', 0, lSeed);
	}
	return lSeed;
}

//D2Common.0x6FD7D3E0
inline uint32_t __fastcall SEED_RollLimitedRandomNumber(D2SeedStrc* pSeed, int nMax)
{
	uint32_t nResult = 0;
	if (nMax > 0)
	{
		if ((nMax - 1) & nMax)
		{
			nResult = (unsigned int)D2ORACLE_AdvanceSeed(pSeed) % nMax;
		}
		else
		{
			nResult = D2ORACLE_AdvanceSeed(pSeed) & (nMax - 1);
		}
	}
	if (gnD2OracleTrace)
	{
		D2ORACLE_TraceRoll(pSeed, 'L', nMax, nResult);
	}
	return nResult;
}

inline uint32_t SEED_RollPercentage(D2SeedStrc* pSeed)
{
	const uint32_t nResult = (uint32_t)(D2ORACLE_AdvanceSeed(pSeed) % 100);
	if (gnD2OracleTrace)
	{
		D2ORACLE_TraceRoll(pSeed, 'P', 100, nResult);
	}
	return nResult;
}

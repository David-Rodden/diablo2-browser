// Non-inline D2Seed functions (same bodies as D2MOO source/D2Common/src/D2Seed.cpp, commit 5596f5c,
// MIT License, Copyright (c) 2020-2025 The Phrozen Keep community) plus the oracle's RNG trace sink.
//
// Trace line format (one event per line, shared with the TypeScript port's trace writer):
//   I <label> <low>            SEED_InitLowSeed (high seed is always 666)
//   S <label> <low> <high>     SEED_SetSeeds
//   R <label> 0 <low>:<high>   SEED_RollRandomNumber (full 64-bit state after the roll, hex)
//   L <label> <max> <result>   SEED_RollLimitedRandomNumber (max <= 0 returns 0 without rolling)
//   P <label> 100 <result>     SEED_RollPercentage
//   T <type> <style> <seq> <n> <raritySum>   D2CMP_10088_GetTiles lookup (n tiles returned)
//   # <text>                   context marker written by the driver
// Labels are assigned at initialisation time as "<context>#<n>"; unknown seeds print as "?".

#include "oracle.h"

#include <D2Seed.h>

#include <cinttypes>
#include <cstdarg>
#include <cstdio>
#include <map>
#include <string>

int gnD2OracleTrace = 0;

namespace
{
FILE* gpTraceFile = nullptr;
std::string gsContext = "init";
std::map<std::string, int> gContextCounters;
std::map<const D2SeedStrc*, std::string> gLabels;

const std::string& LabelOf(const D2SeedStrc* pSeed)
{
	static const std::string kUnknown = "?";
	auto it = gLabels.find(pSeed);
	return it == gLabels.end() ? kUnknown : it->second;
}

void AssignLabel(const D2SeedStrc* pSeed)
{
	const int n = gContextCounters[gsContext]++;
	gLabels[pSeed] = gsContext + "#" + std::to_string(n);
}
}  // namespace

void D2ORACLE_OpenTrace(const char* szPath)
{
	gpTraceFile = fopen(szPath, "wb");
	if (!gpTraceFile)
	{
		D2ORACLE_Fail("cannot open trace file %s", szPath);
	}
	gnD2OracleTrace = 1;
}

void D2ORACLE_CloseTrace()
{
	if (gpTraceFile)
	{
		fclose(gpTraceFile);
		gpTraceFile = nullptr;
	}
	gnD2OracleTrace = 0;
}

void D2ORACLE_SetTraceContext(const char* szContext)
{
	gsContext = szContext;
	if (gpTraceFile)
	{
		fprintf(gpTraceFile, "# %s\n", szContext);
	}
}

void D2ORACLE_TraceRoll(const D2SeedStrc* pSeed, char nKind, int nArg, uint64_t nResult)
{
	if (!gpTraceFile)
	{
		return;
	}
	if (nKind == 'R')
	{
		fprintf(gpTraceFile, "R %s 0 %08" PRIx32 ":%08" PRIx32 "\n", LabelOf(pSeed).c_str(), (uint32_t)nResult, (uint32_t)(nResult >> 32));
	}
	else
	{
		fprintf(gpTraceFile, "%c %s %d %" PRIu32 "\n", nKind, LabelOf(pSeed).c_str(), nArg, (uint32_t)nResult);
	}
}

void D2ORACLE_TraceLine(const char* szFormat, ...)
{
	if (!gpTraceFile)
	{
		return;
	}
	va_list args;
	va_start(args, szFormat);
	vfprintf(gpTraceFile, szFormat, args);
	va_end(args);
	fputc('\n', gpTraceFile);
}

//D2Common.0x6FDA5260 (#10916)
void __stdcall SEED_Return()
{
}

//D2Common.0x6FDAEA80 (#10920)
int __fastcall SEED_GetRandomValue(int nValue)
{
	// Wall-clock seeding has no place in a deterministic oracle.
	D2ORACLE_Fail("SEED_GetRandomValue(%d) called", nValue);
}

//D2Common.0x6FDAEAB0 (#10912)
void __fastcall SEED_InitSeed(D2SeedStrc* pSeed)
{
	pSeed->nLowSeed = 1;
	pSeed->nHighSeed = 666;
	if (gnD2OracleTrace)
	{
		AssignLabel(pSeed);
		fprintf(gpTraceFile, "I %s 1\n", LabelOf(pSeed).c_str());
	}
}

//D2Common.0x6FDAEAC0 (#10913)
void __fastcall SEED_InitLowSeed(D2SeedStrc* pSeed, int nLowSeed)
{
	pSeed->nLowSeed = nLowSeed;
	pSeed->nHighSeed = 666;
	if (gnD2OracleTrace)
	{
		AssignLabel(pSeed);
		fprintf(gpTraceFile, "I %s %" PRIu32 "\n", LabelOf(pSeed).c_str(), (uint32_t)nLowSeed);
	}
}

//D2Common.0x6FDAEAD0 (#10914)
uint32_t __fastcall SEED_GetLowSeed(D2SeedStrc* pSeed)
{
	return pSeed->nLowSeed;
}

//D2Common.0x6FDAEAE0 (#10921)
void __fastcall SEED_SetSeeds(D2SeedStrc* pSeed, uint32_t nLowSeed, uint32_t nHighSeed)
{
	pSeed->nLowSeed = nLowSeed;
	pSeed->nHighSeed = nHighSeed;
	if (gnD2OracleTrace)
	{
		AssignLabel(pSeed);
		fprintf(gpTraceFile, "S %s %" PRIu32 " %" PRIu32 "\n", LabelOf(pSeed).c_str(), nLowSeed, nHighSeed);
	}
}

//D2Common.0x6FDAEAF0 (#10922)
void __fastcall SEED_GetSeeds(D2SeedStrc* pSeed, uint32_t* pLowSeed, uint32_t* pHighSeed)
{
	*pLowSeed = pSeed->nLowSeed;
	*pHighSeed = pSeed->nHighSeed;
}

//D2Common.0x6FDAEB00 (#10915)
uint32_t __fastcall SEED_GetHighSeed(D2SeedStrc* pSeed)
{
	return pSeed->nHighSeed;
}

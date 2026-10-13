#pragma once

// Shared declarations for the D2MOO DRLG oracle driver (not part of D2MOO).

#include <cstdint>
#include <string>

[[noreturn]] void D2ORACLE_Fail(const char* szFormat, ...) __attribute__((format(printf, 1, 2)));

// Root of the extracted game data (see scripts/extract-d2moo-tables.ts):
//   <root>/tables/<name>.bin     compiled 1.13c data tables
//   <root>/mpq/data/global/...   DS1 and DT1 files, lower-case paths
extern std::string gsD2OracleDataDir;

void D2ORACLE_LoadDataTables();

void D2ORACLE_OpenTrace(const char* szPath);
void D2ORACLE_CloseTrace();
void D2ORACLE_SetTraceContext(const char* szContext);
// Writes one free-form event line to the trace (no-op when tracing is off).
void D2ORACLE_TraceLine(const char* szFormat, ...) __attribute__((format(printf, 1, 2)));

struct D2TileLibraryEntryStrc;
// Identity of a tile returned by the D2CMP shims: the owning DT1 (lower-case, '/'-separated path
// relative to the data root, e.g. "data/global/tiles/act1/outdoors/blank.dt1") and the tile's index in
// that DT1's tile header table. Fails for pointers the shims did not hand out.
void D2ORACLE_DescribeTile(const D2TileLibraryEntryStrc* pTileLibraryEntry, std::string* pszLibrary, int* pnIndex);

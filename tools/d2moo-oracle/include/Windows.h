// Minimal Win32 shim so D2MOO (MSVC code) compiles with GCC on Linux for the DRLG oracle.
// Only declarations reached by source/D2Common/src/Drlg/*.cpp, D2Collision.cpp and
// DataTbls/LevelsTbls.cpp are provided.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdarg>
#include <cctype>

#pragma GCC diagnostic ignored "-Wliteral-suffix"
constexpr uint64_t operator"" i64(unsigned long long v) { return static_cast<uint64_t>(v); }
constexpr uint64_t operator"" ui64(unsigned long long v) { return static_cast<uint64_t>(v); }

#define __int64 long long
#define __int32 int32_t
#define __int16 int16_t
#define __int8 int8_t

#ifndef __fastcall
#define __fastcall
#endif
#ifndef __stdcall
#define __stdcall
#endif
#ifndef __cdecl
#define __cdecl
#endif
#ifndef __thiscall
#define __thiscall
#endif
#ifndef __declspec
#define __declspec(x)
#endif

#define _Acquires_lock_(x)
#define _Releases_lock_(x)
#define _In_
#define _Out_
#define _Inout_
#define _In_opt_
#define _Out_opt_

#define D2Common_DLL_DECL
#define D2COMMON_DLL_DECL
#define FOG_DLL_DECL
#define STORM_DLL_DECL
#define D2CMP_DLL_DECL
#define D2LANG_DLL_DECL
#define D2HELL_DLL_DECL
#define D2GAME_DLL_DECL
#define D2CLIENT_DLL_DECL
#define D2WIN_DLL_DECL
#define D2GFX_DLL_DECL
#define D2NET_DLL_DECL
#define D2SOUND_DLL_DECL
#define D2MCPCLIENT_DLL_DECL

inline void __debugbreak() { abort(); }
#define _Analysis_assume_(expr) ((void)0)
inline void OutputDebugStringA(const char* s) { (void)s; }

typedef uint32_t DWORD;
typedef uint16_t WORD;
typedef uint8_t BYTE;
typedef int32_t LONG;
typedef uint32_t ULONG;
typedef uint32_t UINT;
typedef int32_t INT;
typedef int32_t BOOL;
typedef char CHAR;
typedef const char* LPCSTR;
typedef char* LPSTR;
typedef void* LPVOID;
typedef const void* LPCVOID;
typedef void* HANDLE;
typedef void* HMODULE;
typedef void* HWND;
typedef void* HDC;
typedef void* LPSECURITY_ATTRIBUTES;
typedef uintptr_t ULONG_PTR;
typedef uintptr_t DWORD_PTR;
typedef int64_t LONGLONG;
typedef uint64_t ULONGLONG;

#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif
#ifndef MAX_PATH
#define MAX_PATH 260
#endif

struct PALETTEENTRY {
    BYTE peRed;
    BYTE peGreen;
    BYTE peBlue;
    BYTE peFlags;
};

inline DWORD GetTickCount() { return 0; }

struct POINT {
    LONG x;
    LONG y;
};

struct RECT {
    LONG left;
    LONG top;
    LONG right;
    LONG bottom;
};

struct CRITICAL_SECTION {
    void* dummy;
};
typedef CRITICAL_SECTION* LPCRITICAL_SECTION;

struct OVERLAPPED {
    uintptr_t Internal;
    uintptr_t InternalHigh;
    DWORD Offset;
    DWORD OffsetHigh;
    HANDLE hEvent;
};

inline void InitializeCriticalSection(CRITICAL_SECTION*) {}
inline void EnterCriticalSection(CRITICAL_SECTION*) {}
inline void LeaveCriticalSection(CRITICAL_SECTION*) {}
inline void DeleteCriticalSection(CRITICAL_SECTION*) {}

template <typename T>
inline T InterlockedIncrement(T* p) { return ++(*p); }
template <typename T>
inline T InterlockedDecrement(T* p) { return --(*p); }

inline int wsprintfA(char* buf, const char* fmt, ...) {
    va_list args;
    va_start(args, fmt);
    int res = vsprintf(buf, fmt, args);
    va_end(args);
    return res;
}

inline int _stricmp(const char* a, const char* b) {
    return strcasecmp(a, b);
}
inline int _strnicmp(const char* a, const char* b, size_t n) {
    return strncasecmp(a, b, n);
}
inline char* _strdup(const char* s) {
    return strdup(s);
}

inline void strcpy_s(char* dst, size_t sz, const char* src) {
    strncpy(dst, src, sz);
    if (sz > 0) dst[sz - 1] = '\0';
}
template <size_t N>
inline void strcpy_s(char (&dst)[N], const char* src) {
    strncpy(dst, src, N);
    dst[N - 1] = '\0';
}
inline void strncpy_s(char* dst, const char* src, size_t count) {
    strncpy(dst, src, count);
}
template <size_t N>
inline void strncpy_s(char (&dst)[N], const char* src, size_t count) {
    strncpy(dst, src, count < N ? count : N);
    dst[N - 1] = '\0';
}
inline void strcat_s(char* dst, size_t sz, const char* src) {
    strncat(dst, src, sz);
}
template <size_t N>
inline void strcat_s(char (&dst)[N], const char* src) {
    strncat(dst, src, N - strlen(dst) - 1);
}
#define sprintf_s snprintf

struct D2DrlgLevelLinkDataStrc;
BOOL __fastcall DRLGOUTPLACE_LinkAct5Ubers(D2DrlgLevelLinkDataStrc* pLevelLinkData, int nIteration);

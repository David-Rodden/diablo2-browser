# `src/netproto` — 1.13c Authoritative Wire Protocol & Transport Engine

`src/netproto` is the self-contained network protocol stack for **Diablo II: Lord of Destruction (v1.13c)**, implementing a 1:1 port of the binary packet framing, cryptographic hashing, Huffman compression, and state machines from `D2Net.dll`, `Bnclient.dll`, `D2MCPClient.dll`, and `Fog.dll`.

### 1. Module Responsibilities & Architectural Boundaries

- **Original DLL Counterparts**:
  - `Bnclient.dll`: BNCS (Battle.net Chat Server, default TCP `6112`) handshake, CheckRevision verification, CD-Key hashing, XSHA-1 password authentication, account creation (`Create New Account`), 180s `SID_NULL (0x00)` keepalive, and lobby chat channels.
  - `D2MCPClient.dll`: MCP (Realm Server / `d2cs`, default TCP `6113`) realm logon, character list retrieval (with 11-byte `statstring` paperdoll decoding), character creation/deletion, and game creation (`0x03`) / join (`0x04`).
  - `D2Net.dll` + `Fog.dll`: D2GS (Game Server, default TCP `4000`) frame header parsing, dynamic Huffman decompression, 167 S2C server-to-client opcode decoders, C2S client-to-server command encoders, and `0x9C`/`0x9D` item bitstream decoding.
- **Strict Isolation Constraints (`tsconfig.netproto.json`)**:
  - **Zero External Module Dependencies**: `src/netproto` has **no dependencies** on `src/common`, `src/client`, `src/server`, or `src/baker` (enforced by `tests/arch/boundaries.test.ts` Rule 2).
  - **Single Public Facade**: External modules (`src/client`, `src/server`, `plugins/`, `tools/`) **must** import exclusively from [`src/netproto/index.ts`](./index.ts); deep imports into subdirectories are forbidden (enforced by `tests/arch/boundaries.test.ts` Rules 6 & 9).

---

### 2. Directory Structure

```text
src/netproto/
├── index.ts         # Sole public barrel export (Public Facade)
├── core/            # Little-Endian BinaryReader / BinaryWriter / BitReader and primitive wire types
├── transport/       # ByteStream abstraction, WebSocket bridge stream (WsStream), in-memory loopback stream & endpoint resolvers
├── crypto/          # Broken SHA-1 (XSHA-1), CheckRevision, CD-Key hash/shuffle & 1.13c cryptographic routines
├── bncs/            # BNCS (port 6112) framing, state machine, logon/register/realm-switch/chat/SID_NULL keepalive protocol
├── mcp/             # MCP (port 6113) framing, character list (0x19), character creation (0x02), create/join game protocol
├── d2gs/            # D2GS (port 4000) Huffman decompression, 167 S2C opcode registry, C2S encoders & item bitstreams
├── flow/            # D2OnlineFlow: end-to-end BNCS -> MCP -> D2GS token handoff and reconnection orchestrator
├── domain/          # Protocol-agnostic domain contract: GameServerAdapter, ServerEvent, ClientCommand
└── ts/              # Reserved TypeScript server protocol adapter (TsServerAdapter)
```

---

### 3. Core Subsystems

#### 3.1 Transport Layer & WebSocket/TCP Bridging (`transport/`)
Because browsers cannot open raw TCP sockets while native PvPGN + D2GS packets embed internal IP addresses and raw TCP ports (e.g., MCP returning the D2GS IP and port `4000`), `transport/endpoint.ts` provides a pluggable `EndpointResolver`:
- **`createWsBridgeResolver(bridgeBaseUrl)`**: Dynamically maps target TCP ports to Nginx + `websockify` reverse-proxy sub-paths:
  - Port `6112` (BNCS) $\rightarrow$ `<bridgeBaseUrl>/bnet` (e.g., `wss://host/d2net/bnet`)
  - Port `6113` (MCP) $\rightarrow$ `<bridgeBaseUrl>/realm` (e.g., `wss://host/d2net/realm`)
  - Port `4000` (D2GS) $\rightarrow$ `<bridgeBaseUrl>/game` (e.g., `wss://host/d2net/game`)
- **`createTcpResolver()`**: Used by the Node.js headless bot (`tools/d2-bot.ts`) to connect directly to raw TCP sockets.
- **`MemoryStream`**: Zero-copy in-memory full-duplex byte stream for unit testing and local loopback verification.

#### 3.2 BNCS & MCP Pre-Game Protocols (`crypto/`, `bncs/`, `mcp/`)
- **Cryptography (`crypto/`)**: Exact implementation of Blizzard's unrotated Broken SHA-1 (`xsha1.ts`), MPQ version-signature `CheckRevision` (`check-revision.ts`), and 16/26-character D2/LoD CD-Key hashing.
- **End-to-End Online Flow (`flow/online-flow.ts`)**:
  1. `BncsClient` executes `SID_AUTH_INFO (0x50)` $\rightarrow$ `SID_AUTH_CHECK (0x51)` $\rightarrow$ `SID_LOGONRESPONSE2 (0x3A)` (or `SID_CREATEACCOUNT2 0x3D`) $\rightarrow$ `SID_LOGONREALMEX (0x3E)` to obtain the 64-byte MCP cookie while sending 180s `SID_NULL (0x00)` heartbeats.
  2. `McpClient` connects to `d2cs` with the cookie and runs `MCP_STARTUP (0x01)` $\rightarrow$ `MCP_CHARLIST2 (0x19)` $\rightarrow$ `MCP_CHARLOGON (0x07)` $\rightarrow$ `MCP_CREATEGAME (0x03)` / `MCP_JOINGAME (0x04)` to obtain the D2GS `GameHash` and `GameToken`.
  3. Automatically hands off to `D2gsClient` (`0x68 D2GS_GAMELOGON`) to enter the game world.

#### 3.3 D2GS Game Server Protocol & Huffman Decompression (`d2gs/`)
- **Framing & Decompression (`framer.ts`, `huffman.ts`)**:
  - Handles the initial `0xAF` compression negotiation handshake.
  - Decodes `Fog.dll`'s static Huffman tree bitstream and splits coalesced decompressed payloads into individual packet frames using `packet-sizes.ts` (covering all 167 S2C opcodes).
- **S2C Decoding & Domain Mapping (`s2c-registry.ts`, `adapter.ts`)**:
  - Translates raw binary packets (`0x03 LoadAct`, `0x07/0x08 MapAdd/Remove`, `0x0E SetObjectState`, `0x0F/0x10 PlayerMove`, `0x11 UnitOverlay`, `0x15 ReassignPlayer`, `0x3F UseStackableItem`, `0x51 AssignObject`, `0x58 OpenImbueUi`, `0x67..0x6D NPC Move/State` with 1.13c `s[7]` drift-check coordinates, `0x9C/0x9D ItemAction`, `0xA3 DelayedState`, `0xAC AssignNPC`, `0x18..0x1F Attribute/Orb Update`, etc.) into strongly typed `ServerEvent` streams.
- **C2S Command Encoding & Item Bitstream Decoding (`c2s.ts`, `item-bitstream.ts`)**:
  - Encodes walk/run (`0x01`/`0x03`), skill casts (`0x0C`/`0x0D`), weapon switch (`0x17`), item pickup/equip/container moves, right-click scroll/tome/potion usage (`0x20 ItemUse`), item identification (`0x27 IdentifyItem`), gamble identification (`0x37 NpcIdentifyGamble`), NPC entity action / Charsi Imbue (`0x38 EntityAction`), position updates (`0x5F UpdatePlayerPos`), and more.
  - Bit-by-bit parser for `0x9C` (ground/container/shop items) and `0x9D` (equipped/mercenary/cursor items) variable-length stat streams (including `IFLAG_DELETED`, `Save Bits`, and `Save Add`).

---

### 4. Common Verification Commands

```bash
# Run strict typecheck on src/netproto
npx tsc -p tsconfig.netproto.json --noEmit

# Run protocol codec, Huffman decompression, and boundary unit tests
npx vitest run tests/netproto/

# Replay and inspect a recorded .d2cap packet capture
npx tsx tools/netproto-replay.ts <path-to-capture.d2cap>
```

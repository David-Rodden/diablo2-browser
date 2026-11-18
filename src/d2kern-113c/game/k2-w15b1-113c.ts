import {
  COLLISION_FindFreePositionBasic113c,
} from '../common/collision';
import {
  UNITS_GetObjectPortalFlags113c,
  UNITS_GetPlayerData113c,
  UNITS_SetObjectPortalFlags113c,
  UNITS_SetPlayerName113c,
} from '../common/composit';
import {
  DRLG_GetActNoFromLevelId113c,
} from '../common/drlg/drlg';
import {
  DUNGEON_GetAdjacentRoomsListFromRoom113c,
  DUNGEON_GetLevelIdFromRoom113c,
  DUNGEON_ToggleHasPortalFlag113c,
} from '../common/dungeon';
import {
  INVENTORY_AllocCorpse113c,
  INVENTORY_AppendItemGuidNode113c,
  INVENTORY_AutoPlaceItemInGrid113c,
  INVENTORY_GetCorpseCount113c,
  INVENTORY_GetCursorItem113c,
  INVENTORY_PlaceItemInBodyLoc113c,
  INVENTORY_PlaceItemInSocket113c,
  INVENTORY_SetLeftItemGuid113c,
  UNITS_GetInventoryRecordId113c,
} from '../common/inventory';
import {
  DRLGWARP_TestRoomTileBit113c,
  ITEMS_GetBaseCode113c,
  ITEMS_SetBodyLocation113c,
  ITEMS_SetInvPage113c,
  ITEMS_SetItemFlag113c,
} from '../common/items';
import {
  DATATBLS_GetItemsTxtRecordMemPort113c,
  DUNGEON_CheckRoomIsTownMemPort113c,
  INVENTORY_GetCompositWeaponMemPort113c,
  INVENTORY_GetItemFromBodyLocMemPort113c,
} from '../common/k0-d2common-memports';
import {
  PATH_ComputeDirection113c,
  PATH_ForceDirection113c,
  PATH_GetPosX113c,
  PATH_GetPosY113c,
  PATH_GetTargetTypeAndPosition113c,
  PATH_RemoveUnitCollisionFootprint113c,
  PATH_SetCollisionMask113c,
  PATH_SetUnitCollisionPattern113c,
} from '../common/path';
import {
  QUESTRECORD_ClearQuestState113c,
  QUESTRECORD_ClearQuestStateBits2To11_113c,
  QUESTRECORD_SetQuestState113c,
} from '../common/quest-record';
import {
  STATES_UpdateOrClearState98Transform113c,
} from '../common/skills';
import {
  STATES_ToggleGfxStateFlag113c,
  STATLIST_GetUnitStat113c,
  STATLIST_SetUnitStat113c,
} from '../common/statlist';
import {
  DATATBLS_GetObjectsTxtRecord113c,
  UNITS_GetRoom113c,
  UNIT_Alloc113c,
} from '../common/unit';
import {
  WAYPOINT_ActivateWaypoint113c,
  WAYPOINT_GetWaypointNoFromLevelId113c,
} from '../common/waypoint';
import type { Memory113c as D2Memory113c, SparseMemory113c } from '../mem/sparse-memory';
import {
  DATATBLS_GetItemsTxtRecordByCode113c,
} from '../tables/datatbls-113c';
import {
  AIGENERAL_LinkMinionToLeader113c,
  SUNIT_SetUnitEventSound113c,
} from './ai-fallen-113c';
import {
  D2GAME_ARENA_FindPlayerSlotByUnit113c,
  D2GAME_PARTY_GetPartyIdForUnit113c,
  D2GAME_PLRMODES_BroadcastPlayerJoinNotification113c,
  D2GAME_SUNIT_IterateAllLivingPlayers113c,
} from './boot-init-gap-b-113c';
import {
  ACT1Q6_Callback03_LevelChanged113c,
} from './a1c-post150-f150-f276-113c';
import {
  SUNITDMG_GetPlayerClientClassId113c,
} from './combat-a1c-113c';
import {
  AIGENERAL_CopyAiCommandParams113c,
} from './replay-kernel-113c';
import {
  ITEMS_BuildItemDropParamsFromItem113c,
  PLRTRADE_IsInteractingWithValidPlayer113c,
} from './k2-combat-core-w1-113c';
import {
  QUESTS_GuidListAdd113c,
  QUESTS_SendNpcMessagePacket27_113c,
  QUESTS_SendPlayerQuestLogPacket28_113c,
} from './k2-items-tc-w1-113c';
import {
  PLAYER_GetQuestRecordForDifficulty_6FC21020_113c,
} from './k2-laneH-0x6fc2-w1-113c';
import {
  ITEMS_FindQuestItemByBaseCode_6FC2E660_113c,
} from './k2-laneI-0x6fc3-w1-113c';
import {
  QUESTS_AppendQuestTimer_6FC53AF0_113c,
  QUESTS_SetGlobalQuestState_6FC53920_113c,
  QUESTS_TriggerItemDropped_6FC545A0_113c,
} from './k2-laneJ-0x6fc4-w1-113c';
import {
  CLIENTS_GetClientNamePtr_6FC69A20_113c,
} from './k2-laneL-0x6fc6-w1-113c';
import {
  ACT3Q6_SetGidbinnState0ECallback113c,
  ACT3Q6_SyncGidbinnState02Callback113c,
} from './k2-sunit-spawn-w1-113c';
import {
  ACT5Q3_SyncPlayerQuest25State0EAlert21_6FC79120_113c,
  QUESTS_SyncPlayerQuestLogAndPacket89_6FC559C0_113c,
} from './k2-w2b1-113c';
import {
  ACT1Q4_SetCainRescuedByPartyCallback_6FC816F0_113c,
} from './k2-w2b2-113c';
import {
  NET_SendPacket61_ByteParam_6FCAAAC0_113c,
  NET_SendPacketBuffer6B_6FCAACD0_113c,
} from './k2-w2b3-113c';
import {
  S2C_Send10BytePacketToPlayerUnit_6FCAC530_113c,
  SUNITPROXY_FindOrCreateNodeInList18_6FCAF6C0_113c,
} from './k2-w2b4-113c';
import {
  SKILLS_ResolveSummonMonsterId_6FCBEE50_113c,
} from './k2-w2b5-113c';
import {
  ACT2Q6_UnitIterateSetCompletionState_6FCE4BD0_113c,
} from './k2-w2b7-113c';
import {
  ACT3Q4_GrantPlayerStatPointsReward_6FD06470_113c,
  AI_StartModeAtCoordsKeepSteps_6FD121E0_113c,
  SUNIT_SetPlayerClientPtr_6FD00040_113c,
} from './k2-w2b8-113c';
import {
  ITEMS_PlaceItemOnGroundInRoom_6FC2E990_113c,
} from './k2-w3b1-113c';
import {
  QUESTS_ApplyActNpcIntroFlags_6FC55C20_113c,
  QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c,
} from './k2-w3b3-113c';
import {
  PLAYER_ClearCursorItemAndNotify42_6FC97D90_113c,
} from './k2-w3b7-113c';
import {
  PLAYER_PruneAndCountLiveCorpses_6FC97F00_113c,
} from './k2-w3b8-113c';
import {
  ACT1Q4_SendAlert04IfQuest04Active_6FC82A80_113c,
  ACT5Q3_SendAlert21IfQuest25Active_6FC791D0_113c,
} from './k2-w4b2-113c';
import {
  ITEMS_DropGoldPileWithOwnerAtUnit_6FC98C50_113c,
} from './k2-w4b4-113c';
import {
  PARTY_ForEachSubPartyPlayerUnit_6FCBC160_113c,
} from './k2-w4b5-113c';
import {
  SKILLS_GetUnitTargetOrFirstPathCoords_6FCBFA30_113c,
} from './k2-w4b6-113c';
import {
  ACT5Q3_PropagateQuestStateToPartyCallback_6FC7B120_113c,
} from './k2-w5b2-113c';
import {
  SKILLS_CreateProjectileAtTargetWithin100_6FCC0000_113c,
} from './k2-w5b3-113c';
import {
  NPC_InitHirelingVendorRoster_6FCDCED0_113c,
} from './k2-w5b4-113c';
import {
  ACT2Q6_SendAlert0DIfQuest14Active_6FCE4D30_113c,
} from './k2-w5b5-113c';
import {
  A5Q4_OpenTemplePortalObject_6FCE94E0_113c,
  C2S_ValidateCursorItem_6FCECF70_113c,
} from './k2-w5b6-113c';
import {
  ACT3Q2_SetGidbinnState0ECallback_6FD04280_113c,
  ACT3Q2_SetGidbinnTurnInPartyCallback_6FD041D0_113c,
  ACT3Q4_CompleteLamEsensTomePartyCallback_6FD064C0_113c,
  ACT3Q4_PropagateTomeQuestStateToSubParty_6FD06B90_113c,
  ACT3Q4_SendLamEsensTomeQuestAlertCallback_6FD06550_113c,
} from './k2-w5b8-113c';
import {
  ACT3Q6_FireHellgateOpenerProjectile_6FD0AB60_113c,
} from './k2-w5b9-113c';
import {
  ACT1Q4_RandomizeCairnStonesOrder_6FC833C0_113c,
} from './k2-w6b1-113c';
import {
  ACT2Q6_UnitIterate_CompleteInTalRashaChamber_6FCE59A0_113c,
} from './k2-w6b3-113c';
import {
  QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c,
} from './k2-w6b4-113c';
import {
  PORTAL_CreateLinkedDestinationPortal_6FCC22E0_113c,
} from './k2-w6b5-113c';
import {
  ITEMS_ConsumeGridItemAndNotify9D_6FCF39B0_113c,
  ITEMS_ResetAndRecountInventoryScrollAndTomeCharges_6FCF4570_113c,
} from './k2-w6b6-113c';
import {
  ITEMS_DuplicateItemWithSocketFillers_6FC307E0_113c,
  QUESTS_Act2RadamentSetStateAndDebugPrint_6FC55EB0_113c,
} from './k2-w7b1-113c';
import {
  ACT1Q4_BroadcastDebugQuestNotice_6FC835B0_113c,
} from './k2-w7b2-113c';
import {
  ACT2Q6_PropagatePartyCompletionCallback_6FCE65A0_113c,
} from './k2-w7b3-113c';
import {
  ACT1Q4_OnPlayerEnterTristramWithCainUnrescued_6FC883C0_113c,
} from './k2-w8b2-113c';
import {
  D2GAME_CreateItemEx_6FC31490_113c,
  ITEMS_FindFreeGroundDropCoords_6FC2E930_113c,
} from './k2-real-itemdrop-113c';
import {
  ACT5Q4_AdvanceObjectToMonsterSpawn_6FC7C480_113c,
} from './k2-w4b3-113c';
import {
  DUNGEON_TeleportUnitToRoomAndCoords_6FD019C0_113c,
} from './k2-w10b1-113c';
import {
  PLAYER_InitPlayerUnitSubsystems_6FC58620_113c,
} from './k2-w11b1-113c';
import {
  ITEMS_PlaceItemInUnitInventoryGrid_6FCF76A0_113c,
  PLAYER_ChangeLevelOrActTransition_6FCBE170_113c,
} from './k2-w12b1-113c';
import {
  D2Game_6FC56470_113c,
  D2Game_6FC565E0_113c,
  D2Game_6FC98D00_113c,
  D2Game_6FCE1030_113c,
} from './k2-w13b1-113c';
import {
  ACT2Q2_CleanupHoradricStaffItemsOnEnterAct1_6FCE7D00_113c,
  ACT3Q3_CleanupKhalimItemsOnEnterAct2OrComplete_6FD087E0_113c,
  ACT3Q7_OnMephistoPortalWarpToAct4_6FC566C0_113c,
  CLIENTS_RemoveClientFromGameAndFree_6FC6B7F0_113c,
  CUBE_TransmuteHoradricCubeItems_6FC92FC0_113c,
  ITEMS_DuplicateAndDropCursorItem_6FCF8310_113c,
  NPCTRADE_EnsureVendorInventoryGenerated_6FCDF1C0_113c,
  NPCTRADE_InteractBuyItem_6FCDF200_113c,
  NPCTRADE_InteractRepairItem_6FCE1890_113c,
  NPCTRADE_PopulateVendorItemsFromTable_6FCDF2E0_113c,
  PLRDEATH_DropPlayerEquippedItemsAndGoldToCorpseOrGround_6FC98FA0_113c,
  QUESTS_FindAndDeletePlayerQuestItemByCode_6FC566A0_113c,
  SKILLS_SpawnBoneWallSegment_6FC70E60_113c,
  SKILLS_SummonMonsterFromSkillOrMissile_6FCB5D50_113c,
} from './k2-w14b1-113c';
import {
  UNITS_ChangeAnimMode113c,
} from './monster-events';
import {
  D2GAME_IAT_SGPT_DATATABLES_VA_113C,
  ROOM_FindRoomContainingSubtile113c,
  SEED_RollLimitedFast113c,
  SUNIT_AllocUnitData113c,
  SUNIT_InitUnitSeed113c,
  SUNIT_PlaceServerUnitInRoom113c,
  UNIT_GetPosX113c,
  UNIT_GetPosY113c,
} from './regpop-spawn-113c';
import {
  EVENT_DeleteEventByType113c,
  EVENT_SetEventFull113c,
} from './timer-wheel';
import { hitD2GameVa113c } from '../va-trace-113c';

export const D2GAME_SCRATCH_W15B1_113C = 0x7ff500;

function allocHeapW15B1_113c(m: D2Memory113c, nBytes: number): number {
  const aligned = (nBytes + 3) & ~3;
  return m.alloc(aligned > 0 ? aligned : 4);
}

function findQuestByIdInGame113c(m: D2Memory113c, pGame: number, nQuestId: number): number {
  if (pGame === 0) return 0;
  const pCtrl = m.u32(pGame + 0x10f4);
  if (pCtrl === 0) return 0;
  let pQuest = m.u32(pCtrl);
  while (pQuest !== 0) {
    if ((m.u32(pQuest) | 0) === (nQuestId | 0)) {
      return pQuest;
    }
    pQuest = m.u32(pQuest + 0xf4);
  }
  return 0;
}

function getPlayerClient113c(m: D2Memory113c, pPlayer: number): number {
  if (pPlayer === 0 || m.u32(pPlayer) !== 0) {
    return 0;
  }
  const pPlayerData = UNITS_GetPlayerData113c(m, pPlayer);
  if (pPlayerData === 0) {
    return 0;
  }
  return m.u32(pPlayerData + 0x9c);
}

function removePlayerQuestItemByCode113c(
  m: D2Memory113c,
  pPlayer: number,
  dwBaseCode: number,
  pGame: number,
  hooks?: W15B1Hooks113c,
): void {
  if (hooks && hooks.deletePlayerQuestItem) {
    hooks.deletePlayerQuestItem(m, pPlayer, dwBaseCode, pGame);
  } else {
    QUESTS_FindAndDeletePlayerQuestItemByCode_6FC566A0_113c(
      m as SparseMemory113c,
      pGame,
      pPlayer,
      dwBaseCode,
    );
  }
}

function deleteMatchingQuestItemByBaseCode113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  dwBaseCode: number,
): number {
  const pItem = ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, dwBaseCode);
  if (pItem === 0) {
    return 0;
  }
  const pInv = pPlayer !== 0 ? m.u32((pPlayer + 0x60) >>> 0) : 0;
  D2Game_6FC565E0_113c(m as SparseMemory113c, pItem, pPlayer, pGame, pInv);
  return 1;
}

export interface W15B1Hooks113c {
  d2netSendPacket?: (nQueue: number, dwClientId: number, pPacket: number, nLen: number) => void;
  d2netCloseConnection?: (dwClientId: number) => void;
  unlinkClientFromGame?: (m: D2Memory113c, dwClientId: number, pGame: number, bReasonFlag: number) => void;
  deletePlayerQuestItem?: (m: D2Memory113c, pPlayer: number, dwBaseCode: number, pGame: number) => void;
  deleteAllPlayerQuestItems?: (m: D2Memory113c, pGame: number, pPlayer: number, dwBaseCode: number) => number;
  spawnRadialMinion?: (
    m: D2Memory113c,
    nSkillId: number,
    pGame: number,
    pUnit: number,
    nX: number,
    nY: number,
    nSkillLevel: number,
  ) => number;
  operateStairsWarp?: (m: D2Memory113c, pGame: number, pPlayer: number, nLevelId: number, pObject: number) => number;
  broadcastWaypointUpdate?: (m: D2Memory113c, pPlayer: number, pGame: number, nLevelId: number, nArg: number) => void;
  handleTradeSubAction18?: (m: D2Memory113c, pGame: number, pPlayer: number) => void;
  dropAllPlayerEquipmentAndGold?: (m: D2Memory113c, pPlayer: number, pGame: number) => void;
  initCorpsePlayerData?: (m: D2Memory113c, pGame: number, pCorpseUnit: number) => void;
  spawnSkillMonsterFromParams?: (m: D2Memory113c, pUnit: number, pGame: number, pSummonParams: number) => number;
  linkSummonOwner?: (m: D2Memory113c, pGame: number, pOwner: number, pPet: number) => void;
  openGambleInventory?: (m: D2Memory113c, pGame: number, pPlayer: number, pNpc: number, pSlot: number) => void;
  openVendorInventory?: (m: D2Memory113c, pPlayer: number, pNpc: number, pGame: number, pSlot: number) => void;
  partyHoradricStaffCallback?: (m: D2Memory113c, pGame: number, pUnit: number, pArg: number) => void;
  npcBuyItemImpl?: (
    m: D2Memory113c,
    pPlayer: number,
    pGame: number,
    dwNpcGuid: number,
    dwItemGuid: number,
    dwTab: number,
    wCost: number,
    bFlag: number,
  ) => void;
  dropItemAtPlayer?: (
    m: D2Memory113c,
    pGame: number,
    pPlayer: number,
    pItem: number,
    pRoom: number,
    nX: number,
    nY: number,
  ) => number;
  hireMercenaryImpl?: (m: D2Memory113c, pGame: number, pPlayer: number, wMercId: number) => void;
  autoPlaceCreatedItemInPlayerGrid?: (
    m: D2Memory113c,
    pGame: number,
    pPlayer: number,
    dwItemGuid: number,
    nX: number,
    nY: number,
    nPage: number,
    bNotify: number,
    pOutResult: number,
  ) => number;
  createQuestRewardItem?: (
    m: D2Memory113c,
    pGame: number,
    pPlayer: number,
    dwBaseCode: number,
    nItemLevel: number,
    nQuality: number,
    bDropOnGroundOnly: number,
  ) => number;
  hireAct3FreeMercenary?: (m: D2Memory113c, pGame: number, pPlayer: number, nAct: number) => void;
  compellingOrbPartyCallback?: (m: D2Memory113c, pGame: number, pUnit: number, pArg: number) => void;
}

/**
 * Broadcasts a 40-byte `0x5A` client leave/disconnect notification to all players in the game,
 * unlinks the client from the game client list, sends `0xB0` to the client, and closes its socket.
 *
 * @dll D2Game.dll
 * @va 0x6FC4D090
 * @ordinalOrName D2Game_6FC4D090
 */
export function CLIENT_NotifyAndDisconnectClient_6FC4D090_113c(
  m: D2Memory113c,
  pClient: number,
  pGame: number,
  bReasonByte: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FC4D090);
  if (pClient === 0) {
    return;
  }
  const dwClientId = m.u32(pClient);
  const pPacket5A = D2GAME_SCRATCH_W15B1_113C;
  for (let i = 0; i < 40; i++) {
    m.setU8(pPacket5A + i, 0);
  }
  m.setU8(pPacket5A, 0x5a);
  m.setU8(pPacket5A + 1, bReasonByte & 0xff);
  m.setU8(pPacket5A + 2, 0x04);
  m.setU32(pPacket5A + 3, 0);

  let foundEndName = false;
  for (let i = 0; i < 16; i++) {
    const ch = foundEndName ? 0 : m.u8(pClient + 0x0d + i);
    if (ch === 0) foundEndName = true;
    m.setU8(pPacket5A + 7 + i, ch);
  }

  let foundEndAcct = false;
  for (let i = 0; i < 16; i++) {
    const ch = foundEndAcct ? 0 : m.u8(pClient + 0x1d + i);
    if (ch === 0) foundEndAcct = true;
    m.setU8(pPacket5A + 0x17 + i, ch);
  }
  m.setU8(pPacket5A + 0x27, 0);

  D2GAME_PLRMODES_BroadcastPlayerJoinNotification113c(m, pPacket5A, pGame);

  const dwRemoveClientId = m.u32(pClient);
  if (hooks && hooks.unlinkClientFromGame) {
    hooks.unlinkClientFromGame(m, dwRemoveClientId, pGame, 1);
  } else {
    CLIENTS_RemoveClientFromGameAndFree_6FC6B7F0_113c(
      m as SparseMemory113c,
      dwRemoveClientId,
      pGame,
      1,
    );
  }

  const pPacketB0 = D2GAME_SCRATCH_W15B1_113C + 0x30;
  m.setU8(pPacketB0, 0xb0);
  if (hooks && hooks.d2netSendPacket) {
    hooks.d2netSendPacket(0, dwClientId, pPacketB0, 1);
  }
  if (hooks && hooks.d2netCloseConnection) {
    hooks.d2netCloseConnection(dwClientId);
  }
}

/**
 * Handles boss act-transition quest progression for Andariel (`0x9B`), Duriel (`0xD2`), and Baal (`0x16F`),
 * setting act completion quest bits, cleaning up quest items, and sending act progression packets.
 *
 * @dll D2Game.dll
 * @va 0x6FC56890
 * @ordinalOrName D2Game_6FC56890
 */
export function QUESTS_OnBossActChangeOrBossKill_6FC56890_113c(
  m: D2Memory113c,
  pMonster: number,
  pPlayer: number,
  pGame: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FC56890);
  const pPlayerData = UNITS_GetPlayerData113c(m, pPlayer);
  if (pPlayerData === 0 || pGame === 0) {
    return;
  }
  const bDiff = m.u8(pGame + 0x6d);
  const pQuestFlags = m.u32(pPlayerData + bDiff * 4 + 0x10);
  if (pMonster === 0 || m.u32(pMonster) !== 1) {
    return;
  }

  const dwClassId = m.u32(pMonster + 0x04);
  if (dwClassId === 0x9b) {
    if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 7, 0) === 0) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 7, 0);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 7, 0x0d);
      QUESTS_SendPlayerQuestLogPacket28_113c(m, pPlayer, pGame);
      const pClient = getPlayerClient113c(m, pPlayer);
      if (m.u32(pPlayerData + 0x4c) !== 1) {
        m.setU32(pPlayerData + 0x4c, 1);
        NET_SendPacket61_ByteParam_6FCAAAC0_113c(m, 2, pClient);
      }
      QUESTS_ApplyActNpcIntroFlags_6FC55C20_113c(m, pPlayer, 0, pGame);
    }

    if (
      DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 6, 0x0d) === 1 &&
      DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 6, 0) === 1
    ) {
      const pQuest6 = findQuestByIdInGame113c(m, pGame, 6);
      if (pQuest6 !== 0 && m.u8(pQuest6 + 0x09) !== 0) {
        const pfnCallback = m.u32(pQuest6 + 0xac);
        if (pfnCallback !== 0) {
          const pArg = D2GAME_SCRATCH_W15B1_113C;
          for (let i = 0; i < 0x20; i += 4) {
            m.setU32(pArg + i, 0);
          }
          m.setU32(pArg, pGame);
          m.setU32(pArg + 0x04, 3);
          m.setU32(pArg + 0x0c, pPlayer);
          m.setU32(pArg + 0x14, 1);
          m.setU32(pArg + 0x18, 0x28);
          if (pfnCallback === 0x6fc85040) {
            ACT1Q6_Callback03_LevelChanged113c(m, pQuest6, pArg);
          }
        }
      }
    }
    ACT1Q4_OnPlayerEnterTristramWithCainUnrescued_6FC883C0_113c(m as SparseMemory113c, pPlayer, pGame);
    return;
  }

  if (dwClassId === 0xd2) {
    if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x0f, 0) === 0) {
      if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x0a, 0) === 0) {
        QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 0);
        QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 0x0d);
        removePlayerQuestItemByCode113c(m, pPlayer, 0x2066736d, pGame, hooks);
        removePlayerQuestItemByCode113c(m, pPlayer, 0x20706976, pGame, hooks);
      }
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0f, 0);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0f, 0x0d);
      QUESTS_ApplyActNpcIntroFlags_6FC55C20_113c(m, pPlayer, 1, pGame);
      QUESTS_SendPlayerQuestLogPacket28_113c(m, pPlayer, pGame);
      const pClient = getPlayerClient113c(m, pPlayer);
      if (m.u32(pPlayerData + 0x4c) !== 1) {
        m.setU32(pPlayerData + 0x4c, 1);
        NET_SendPacket61_ByteParam_6FCAAAC0_113c(m, 3, pClient);
      }
    }
    return;
  }

  if (dwClassId === 0x16f) {
    if (
      DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x1c, 0) === 0 &&
      m.u32(pGame + 0x70) !== 0
    ) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x1c, 0);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x1c, 0x0d);
      QUESTS_ApplyActNpcIntroFlags_6FC55C20_113c(m, pPlayer, 1, pGame);
      QUESTS_SendPlayerQuestLogPacket28_113c(m, pPlayer, pGame);
      const pClient = getPlayerClient113c(m, pPlayer);
      if (m.u32(pPlayerData + 0x4c) !== 1) {
        m.setU32(pPlayerData + 0x4c, 1);
        const pPkt5D = D2GAME_SCRATCH_W15B1_113C;
        m.setU8(pPkt5D, 0x5d);
        m.setU8(pPkt5D + 1, 0x17);
        m.setU16(pPkt5D + 2, 0x0002);
        m.setU16(pPkt5D + 4, 0x0000);
        NET_SendPacketBuffer6B_6FCAACD0_113c(m, pPkt5D, pClient);
        NET_SendPacket61_ByteParam_6FCAAAC0_113c(m, 5, pClient);
      }
    }
  }
}

const RADIAL_RING_12_DX_113C = [-2, 0, 2, 4, 4, 4, 2, 0, -2, -4, -4, -4];
const RADIAL_RING_12_DY_113C = [-4, -4, -4, -2, 0, 2, 4, 4, 4, 2, 0, -2];

/**
 * Spawns up to 12 radial minion units in a ring around the caster's target coordinates,
 * linking the first spawned minion as pack leader and orienting each unit toward the center.
 *
 * @dll D2Game.dll
 * @va 0x6FC71E70
 * @ordinalOrName D2Game_6FC71E70
 */
export function SKILLS_SrvDo_SpawnRadialMinionRing12_6FC71E70_113c(
  m: D2Memory113c,
  pGame: number,
  pUnit: number,
  nSkillId: number,
  nSkillLevel: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FC71E70);
  const pOutX = D2GAME_SCRATCH_W15B1_113C;
  const pOutY = D2GAME_SCRATCH_W15B1_113C + 4;
  m.setU32(pOutX, 0);
  m.setU32(pOutY, 0);

  if (SKILLS_GetUnitTargetOrFirstPathCoords_6FCBFA30_113c(m, pUnit, pGame, pOutX, pOutY) === 0) {
    return 0;
  }

  if (pUnit !== 0) {
    m.setU32(pUnit + 0xc4, (m.u32(pUnit + 0xc4) | 0x40) >>> 0);
  }

  const nCenterX = (m.u32(pOutX) | 0);
  const nCenterY = (m.u32(pOutY) | 0);
  let pLeader = 0;

  for (let i = 0; i < 12; i++) {
    const nX = nCenterX + RADIAL_RING_12_DX_113C[i];
    const nY = nCenterY + RADIAL_RING_12_DY_113C[i];
    const pSpawned =
      hooks && hooks.spawnRadialMinion
        ? hooks.spawnRadialMinion(m, nSkillId, pGame, pUnit, nX, nY, nSkillLevel)
        : SKILLS_SpawnBoneWallSegment_6FC70E60_113c(
            m as SparseMemory113c,
            nSkillId,
            pGame,
            pUnit,
            nX,
            nY,
            nSkillLevel,
          );
    if (pSpawned !== 0) {
      if (pLeader === 0) {
        pLeader = pSpawned;
        if (m.u32(pSpawned) === 1) {
          const pMonData = m.u32(pSpawned + 0x14);
          const pAiGen = pMonData !== 0 ? m.u32(pMonData + 0x28) : 0;
          if (pAiGen !== 0) {
            m.setU32(pAiGen + 0x08, (m.u32(pAiGen + 0x08) | 0x02) >>> 0);
            const dwOwnerGuid = pUnit !== 0 ? m.u32(pUnit + 0x0c) : 0xffffffff;
            const dwOwnerType = pUnit !== 0 ? m.u32(pUnit) : 0x06;
            m.setU32(pAiGen + 0x2c, dwOwnerGuid);
            m.setU32(pAiGen + 0x30, dwOwnerType);
            m.setU32(pAiGen + 0x28, pGame);
          }
        }
      } else {
        if (m.u32(pSpawned) === 1) {
          const pMonData = m.u32(pSpawned + 0x14);
          const pAiGen = pMonData !== 0 ? m.u32(pMonData + 0x28) : 0;
          if (pAiGen !== 0) {
            m.setU32(pAiGen + 0x2c, m.u32(pLeader + 0x0c));
            m.setU32(pAiGen + 0x30, m.u32(pLeader));
            m.setU32(pAiGen + 0x28, pGame);
          }
        }
        AIGENERAL_LinkMinionToLeader113c(m, pLeader, pSpawned, pGame);
      }

      STATES_UpdateOrClearState98Transform113c(m, pSpawned, pUnit);

      let nSpawnX = 0;
      let nSpawnY = 0;
      const eType = m.u32(pSpawned);
      const pPath = m.u32(pSpawned + 0x2c);
      if (eType === 0 || eType === 1 || eType === 3) {
        if (pPath !== 0) {
          nSpawnX = PATH_GetPosX113c(m, pPath);
          nSpawnY = PATH_GetPosY113c(m, pPath);
        }
      } else if (pPath !== 0) {
        nSpawnX = (m.u32(pPath + 0x0c) | 0);
        nSpawnY = (m.u32(pPath + 0x10) | 0);
      }
      const nDir = PATH_ComputeDirection113c(m, nSpawnX, nSpawnY, nCenterX, nCenterY);
      PATH_ForceDirection113c(m, m.u32(pSpawned + 0x2c), nDir & 0xff);
    }
  }

  return 1;
}

/**
 * Initializes the Act 5 Quest 2 (Rescue on Mount Arreat) quest descriptor and allocates its `0x160`-byte state.
 *
 * @dll D2Game.dll
 * @va 0x6FC7CC70
 * @ordinalOrName D2Game_6FC7CC70
 */
export function ACT5Q2_InitQuestData_6FC7CC70_113c(
  m: D2Memory113c,
  pQuest: number,
): void {
  hitD2GameVa113c(0x6FC7CC70);
  if (pQuest === 0) return;
  for (let i = 0; i < 15; i++) {
    m.setU32(pQuest + 0xa0 + i * 4, 0);
  }
  m.setU8(pQuest + 0x0c, 0);
  m.setU32(pQuest + 0xa0, 0x6fc783c0);
  m.setU32(pQuest + 0xc8, 0x6fc782a0);
  m.setU32(pQuest + 0xac, 0x6fc7b1e0);
  m.setU32(pQuest + 0xc0, 0x6fc7a310);
  m.setU32(pQuest + 0xa8, 0x6fc7a530);
  m.setU32(pQuest + 0xcc, 0x6fc7c9e0);
  m.setU32(pQuest + 0xd4, 0x6fc781a0);
  m.setU32(pQuest + 0xd8, 0x6fc78240);
  m.setU32(pQuest + 0xdc, 0x6fd2b2f0);
  m.setU8(pQuest + 0x0a, 1);

  let pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    pState = allocHeapW15B1_113c(m, 0x160);
    m.setU32(pQuest + 0x18, pState);
  } else {
    for (let i = 0; i < 88; i++) {
      m.setU32(pState + i * 4, 0);
    }
  }
  m.setU32(pQuest + 0xe0, 0x24);
  m.setU32(pQuest + 0xe8, 0);
  m.setU8(pQuest + 0x0d, 4);
  m.setU32(pQuest + 0xec, 0x6fc76c40);
  m.setU32(pQuest + 0xf0, 0x6fc76bd0);
  m.setU32(pQuest + 0x10, 0x21);
  m.setU8(pState + 0x80, 0);
}

/**
 * Handles Act 5 Quest 3 Frozen Anya object interaction (`0x6FC7CD50`), checking for Malah's Potion (`'ice '`),
 * thawing Anya, updating quest `0x25` flags, and scheduling the Anya thaw timer.
 *
 * @dll D2Game.dll
 * @va 0x6FC7CD50
 * @ordinalOrName D2Game_6FC7CD50
 */
export function ACT5Q3_Callback02_OnFrozenAnyaObjectActivate_6FC7CD50_113c(
  m: D2Memory113c,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FC7CD50);
  void ACT5Q4_AdvanceObjectToMonsterSpawn_6FC7C480_113c;
  if (pQuestArg === 0) return;
  const pGame = m.u32(pQuestArg);
  const pQuest = findQuestByIdInGame113c(m, pGame, 0x21);
  if (pQuest === 0) return;
  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) return;

  const pPlayer = m.u32(pQuestArg + 0x08);
  const pObject = m.u32(pQuestArg + 0x04);

  if (ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, 0x20656369) === 0) {
    QUESTS_SendNpcMessagePacket27_113c(m, pPlayer, pObject, 0x4ea3);
    if (m.u8(pQuest + 0x0b) === 1) {
      m.setU8(pQuest + 0x14, 0);
      m.setU8(pQuest + 0x0b, 3);
      D2GAME_SUNIT_IterateAllLivingPlayers113c(
        m,
        pGame,
        ACT5Q3_SendAlert21IfQuest25Active_6FC791D0_113c,
        pQuest,
      );
    }
    return;
  }

  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  const nQuestId = m.u32(pQuest + 0xe0);
  if (
    DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, nQuestId, 0) !== 0 ||
    DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, nQuestId, 1) !== 0
  ) {
    return;
  }

  m.setU32(pState + 0xd8, (m.u32(pState + 0xd8) - 1) >>> 0);
  removePlayerQuestItemByCode113c(m, pPlayer, 0x20656369, pGame, hooks);

  QUESTS_Act2RadamentSetStateAndDebugPrint_6FC55EB0_113c(m, pQuest, 5);
  m.setU32(pState + 0x84, 1);

  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x25, 0x0d);
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x25, 1);

  m.setU8(pQuest + 0x14, 0);
  m.setU8(pQuest + 0x0b, 5);

  D2GAME_SUNIT_IterateAllLivingPlayers113c(
    m,
    pGame,
    ACT5Q3_SendAlert21IfQuest25Active_6FC791D0_113c,
    pQuest,
  );
  D2GAME_SUNIT_IterateAllLivingPlayers113c(
    m,
    pGame,
    ACT5Q3_PropagateQuestStateToPartyCallback_6FC7B120_113c,
    pPlayer,
  );
  D2GAME_SUNIT_IterateAllLivingPlayers113c(
    m,
    pGame,
    ACT5Q3_SyncPlayerQuest25State0EAlert21_6FC79120_113c,
    pQuest,
  );

  QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 0x10);

  if (m.u32(pState + 0x100) === 0) {
    m.setU32(pState + 0x100, 1);
    let nObjX = 0;
    let nObjY = 0;
    if (pObject !== 0) {
      const eType = m.u32(pObject);
      const pPath = m.u32(pObject + 0x2c);
      if (eType === 0 || eType === 1 || eType === 3) {
        if (pPath !== 0) {
          nObjX = PATH_GetPosX113c(m, pPath);
          nObjY = PATH_GetPosY113c(m, pPath);
        }
      } else if (pPath !== 0) {
        nObjX = (m.u32(pPath + 0x0c) | 0);
        nObjY = (m.u32(pPath + 0x10) | 0);
      }
      m.setU32(pState + 0xf0, nObjX >>> 0);
      m.setU32(pState + 0xf4, nObjY >>> 0);
      QUESTS_AppendQuestTimer_6FC53AF0_113c(m, 1, pQuest, 0x6fc7c480);
      const pRoom = UNITS_GetRoom113c(m, pObject);
      DUNGEON_ToggleHasPortalFlag113c(m, pRoom, 0);
    }
  }
}

/**
 * Initializes the Act 5 Quest 3 (Prison of Ice) quest descriptor and allocates its `0x114`-byte state.
 *
 * @dll D2Game.dll
 * @va 0x6FC7FC20
 * @ordinalOrName D2Game_6FC7FC20
 */
export function ACT5Q3_InitQuestData_6FC7FC20_113c(
  m: D2Memory113c,
  pQuest: number,
): void {
  hitD2GameVa113c(0x6FC7FC20);
  if (pQuest === 0) return;
  for (let i = 0; i < 15; i++) {
    m.setU32(pQuest + 0xa0 + i * 4, 0);
  }
  m.setU32(pQuest + 0xa0, 0x6fc7da70);
  m.setU32(pQuest + 0xc8, 0x6fc78040);
  m.setU32(pQuest + 0xac, 0x6fc7f3f0);
  m.setU32(pQuest + 0xa8, 0x6fc7a0a0);
  m.setU32(pQuest + 0xcc, 0x6fc7f5e0);
  m.setU32(pQuest + 0xd4, 0x6fc77e80);
  m.setU32(pQuest + 0xd8, 0x6fc77dd0);
  m.setU32(pQuest + 0xdc, 0x6fd2bcc0);
  m.setU8(pQuest + 0x0a, 1);
  m.setU8(pQuest + 0x0c, 0);

  let pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    pState = allocHeapW15B1_113c(m, 0x114);
    m.setU32(pQuest + 0x18, pState);
  } else {
    for (let i = 0; i < 69; i++) {
      m.setU32(pState + i * 4, 0);
    }
  }
  m.setU32(pQuest + 0xe0, 0x25);
  m.setU32(pQuest + 0xe8, 0x6fc7b8c0);
  m.setU8(pQuest + 0x0d, 5);
  m.setU32(pQuest + 0xec, 0x6fc77f50);
  m.setU32(pQuest + 0xf0, 0x6fc76b10);
  m.setU32(pQuest + 0x10, 0x22);
}

/**
 * Handles Act 1 Quest 4 Cairn Stone object activation (`0x6FC864F0`), validating the Scroll of Inifuss (`'bkd '`)
 * and the 5-stone activation sequence before opening the portal to Tristram.
 *
 * @dll D2Game.dll
 * @va 0x6FC864F0
 * @ordinalOrName D2Game_6FC864F0
 */
export function ACT1Q4_Callback02_OnCairnStoneActivate_6FC864F0_113c(
  m: D2Memory113c,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FC864F0);
  if (pQuestArg === 0) return;
  const pGame = m.u32(pQuestArg);
  const pQuest = findQuestByIdInGame113c(m, pGame, 4);
  if (pQuest === 0) return;
  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) return;

  if (m.u8(pState + 0x4a) === 0) {
    m.setU8(pState + 0x4a, 1);
    ACT1Q4_RandomizeCairnStonesOrder_6FC833C0_113c(m, pQuest);
  }

  const pPlayer = m.u32(pQuestArg + 0x08);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);

  if (
    DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 4, 0) === 1 ||
    DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 4, 1) === 1
  ) {
    SUNIT_SetUnitEventSound113c(m, pPlayer, 0x13, pPlayer);
    return;
  }

  if (ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, 0x20646b62) === 0) {
    const nClickCount = (m.u32(pState + 0x2c) | 0);
    m.setU32(pState + 0x2c, (nClickCount + 1) >>> 0);
    if ((nClickCount & 0x3f) === 0) {
      SUNIT_SetUnitEventSound113c(m, pPlayer, 0x27, pPlayer);
    }
    return;
  }

  const pStoneObj = m.u32(pQuestArg + 0x04);
  if (pStoneObj === 0) return;
  const wStoneClassId = m.u16(pQuestArg + 0x10);
  const nStep = m.u16(pState + 0x0c);

  if (wStoneClassId !== m.u16(pState + nStep * 2)) {
    return;
  }
  if (m.u32(pStoneObj + 0x10) !== 0) {
    return;
  }

  const dwStoneGuid = m.u32(pStoneObj + 0x0c);
  m.setU32(pState + 0x10 + nStep * 4, dwStoneGuid);
  const nNextStep = (nStep + 1) & 0xffff;
  m.setU16(pState + 0x0c, nNextStep);

  const dwStone3DGuid = m.u32(pState + 0x28);
  let pStone3DObj = 0;
  if (pGame !== 0) {
    const pBucketHead = m.u32(pGame + 0x1520 + ((dwStone3DGuid & 0x7f) << 2));
    let pCur = pBucketHead;
    while (pCur !== 0) {
      if (m.u32(pCur + 0x0c) === dwStone3DGuid) {
        pStone3DObj = pCur;
        break;
      }
      pCur = m.u32(pCur + 0xe4);
    }
  }

  if (nNextStep >= 1 && nNextStep <= 4) {
    UNITS_ChangeAnimMode113c(m, pStoneObj, 1);
    UNITS_ChangeAnimMode113c(m, pStone3DObj, nNextStep + 1);
    return;
  }

  if (nNextStep !== 5) {
    return;
  }

  UNITS_ChangeAnimMode113c(m, pStoneObj, 1);
  UNITS_ChangeAnimMode113c(m, pStone3DObj, 6);
  m.setU8(pState + 0x4f, 1);

  removePlayerQuestItemByCode113c(m, pPlayer, 0x20646b62, pGame, hooks);
  m.setU32(pState + 0x7c, (m.u32(pState + 0x7c) - 1) >>> 0);

  const pRoom = UNITS_GetRoom113c(m, pStoneObj);
  if (pRoom !== 0) {
    let pUnitIter = m.u32(pRoom + 0x74);
    while (pUnitIter !== 0) {
      if (m.u32(pUnitIter) === 2 && m.u32(pUnitIter + 0x04) === 0x15) {
        break;
      }
      pUnitIter = m.u32(pUnitIter + 0xe8);
    }
    if (pUnitIter !== 0) {
      const pPath = m.u32(pUnitIter + 0x2c);
      if (pPath !== 0) {
        m.setU32(pState + 0x38, m.u32(pPath + 0x0c));
        m.setU32(pState + 0x3c, m.u32(pPath + 0x10));
      }
    } else {
      const pStonePath = m.u32(pStoneObj + 0x2c);
      const nFallbackX = pStonePath !== 0 ? (m.u32(pStonePath + 0x0c) | 0) + 3 : 3;
      const nFallbackY = pStonePath !== 0 ? (m.u32(pStonePath + 0x10) | 0) + 3 : 3;
      m.setU32(pState + 0x38, nFallbackX >>> 0);
      m.setU32(pState + 0x3c, nFallbackY >>> 0);
    }
  }

  SKILLS_CreateProjectileAtTargetWithin100_6FCC0000_113c(
    m,
    pPlayer,
    pGame,
    0,
    1,
    0x120,
    (m.u32(pState + 0x38) | 0),
    (m.u32(pState + 0x3c) | 0),
  );

  if (m.u8(pQuest + 0x0b) < 4) {
    m.setU8(pQuest + 0x14, 0);
    m.setU8(pQuest + 0x0b, 4);
    D2GAME_SUNIT_IterateAllLivingPlayers113c(
      m,
      pGame,
      ACT1Q4_SendAlert04IfQuest04Active_6FC82A80_113c,
      pQuest,
    );
  }

  ACT1Q4_BroadcastDebugQuestNotice_6FC835B0_113c(m, pQuest);
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 4, 4);
  QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 1);
}

/**
 * Initializes the Act 1 Quest 5 (Tools of the Trade / Forgotten Tower) quest descriptor and allocates its `0xA4`-byte state.
 *
 * @dll D2Game.dll
 * @va 0x6FC87210
 * @ordinalOrName D2Game_6FC87210
 */
export function ACT1Q5_InitQuestData_6FC87210_113c(
  m: D2Memory113c,
  pQuest: number,
): void {
  hitD2GameVa113c(0x6FC87210);
  if (pQuest === 0) return;
  for (let i = 0; i < 15; i++) {
    m.setU32(pQuest + 0xa0 + i * 4, 0);
  }
  m.setU32(pQuest + 0xa0, 0x6fc81c60);
  m.setU32(pQuest + 0xac, 0x6fc84d30);
  m.setU32(pQuest + 0xc8, 0x6fc81be0);
  m.setU32(pQuest + 0xc4, 0x6fc836c0);
  m.setU32(pQuest + 0xd8, 0x6fc81c00);
  m.setU32(pQuest + 0xb0, 0x6fc83730);
  m.setU32(pQuest + 0xb8, 0x6fc855f0);
  m.setU32(pQuest + 0xcc, 0x6fc87000);
  m.setU32(pQuest + 0xa8, 0x6fc83870);
  m.setU32(pQuest + 0xd4, 0x6fc81a80);
  m.setU32(pQuest + 0xf0, 0x6fc84aa0);
  m.setU32(pQuest + 0xdc, 0x6fd28ef8);
  m.setU8(pQuest + 0x0a, 1);
  m.setU32(pQuest + 0xe0, 3);
  m.setU32(pQuest + 0xe8, 0x6fc85500);
  m.setU8(pQuest + 0x0c, 0);
  m.setU8(pQuest + 0x0d, 5);
  m.setU32(pQuest + 0xec, 0x6fc81b70);
  m.setU32(pQuest + 0x10, 6);

  let pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    pState = allocHeapW15B1_113c(m, 0xa4);
    m.setU32(pQuest + 0x18, pState);
  } else {
    for (let i = 0; i < 41; i++) {
      m.setU32(pState + i * 4, 0);
    }
  }
}

/**
 * Initializes the Act 1 Quest 4 (The Search for Cain) quest descriptor and allocates its `0x1BC`-byte state.
 *
 * @dll D2Game.dll
 * @va 0x6FC887D0
 * @ordinalOrName D2Game_6FC887D0
 */
export function ACT1Q4_InitQuestData_6FC887D0_113c(
  m: D2Memory113c,
  pQuest: number,
): void {
  hitD2GameVa113c(0x6FC887D0);
  if (pQuest === 0) return;
  for (let i = 0; i < 15; i++) {
    m.setU32(pQuest + 0xa0 + i * 4, 0);
  }
  m.setU32(pQuest + 0xa0, 0x6fc86960);
  m.setU32(pQuest + 0xac, 0x6fc884b0);
  m.setU32(pQuest + 0xb0, 0x6fc83570);
  m.setU32(pQuest + 0xb8, 0x6fc85440);
  m.setU32(pQuest + 0xd8, 0x6fc818d0);
  m.setU32(pQuest + 0xc4, 0x6fc854a0);
  m.setU32(pQuest + 0xc0, 0x6fc85a70);
  m.setU32(pQuest + 0xdc, 0x6fd293c8);
  m.setU32(pQuest + 0xe0, 4);
  m.setU8(pQuest + 0x0b, 0);
  m.setU32(pQuest + 0xec, 0x6fc81750);
  m.setU32(pQuest + 0xcc, 0x6fc86ce0);
  m.setU32(pQuest + 0xc8, 0x6fc81880);
  m.setU32(pQuest + 0xa8, 0x6fc835d0);
  m.setU32(pQuest + 0xd4, 0x6fc81540);
  m.setU8(pQuest + 0x0a, 1);
  m.setU32(pQuest + 0xe8, 0);
  m.setU8(pQuest + 0x0d, 6);
  m.setU32(pQuest + 0xf0, 0x6fc846d0);
  m.setU32(pQuest + 0x10, 3);

  let pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    pState = allocHeapW15B1_113c(m, 0x1bc);
    m.setU32(pQuest + 0x18, pState);
  } else {
    for (let i = 0; i < 111; i++) {
      m.setU32(pState + i * 4, 0);
    }
  }
}

/**
 * Initializes the Act 1 Quest 2 (Sisters' Burial Grounds) quest descriptor and allocates its `0x0C`-byte state.
 *
 * @dll D2Game.dll
 * @va 0x6FC89130
 * @ordinalOrName D2Game_6FC89130
 */
export function ACT1Q2_InitQuestData_6FC89130_113c(
  m: D2Memory113c,
  pQuest: number,
): void {
  hitD2GameVa113c(0x6FC89130);
  if (pQuest === 0) return;
  for (let i = 0; i < 15; i++) {
    m.setU32(pQuest + 0xa0 + i * 4, 0);
  }
  m.setU32(pQuest + 0xa0, 0x6fc81f50);
  m.setU32(pQuest + 0xac, 0x6fc84ed0);
  m.setU32(pQuest + 0xc0, 0x6fc85620);
  m.setU32(pQuest + 0xcc, 0x6fc88920);
  m.setU32(pQuest + 0xc8, 0x6fc81f30);
  m.setU32(pQuest + 0xa8, 0x6fc83ad0);
  m.setU32(pQuest + 0xd4, 0x6fc81e30);
  m.setU32(pQuest + 0xf0, 0x6fc84e10);
  m.setU32(pQuest + 0xdc, 0x6fd28a48);
  m.setU32(pQuest + 0xe0, 2);
  m.setU8(pQuest + 0x0a, 1);
  m.setU32(pQuest + 0xe8, 0);
  m.setU8(pQuest + 0x0d, 4);
  m.setU32(pQuest + 0xec, 0x6fc80660);
  m.setU32(pQuest + 0x10, 4);
  m.setU8(pQuest + 0x0c, 0);

  let pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    pState = allocHeapW15B1_113c(m, 0x0c);
    m.setU32(pQuest + 0x18, pState);
  } else {
    m.setU32(pState, 0);
    m.setU32(pState + 4, 0);
    m.setU32(pState + 8, 0);
  }
}

/**
 * Operates the Durance of Hate stairs object (`0x6FC8CD40`), checking quest `0x16` completion
 * and activating the Pandemonium Fortress (`0x67`) waypoint when transitioning from Durance Level 3 (`0x66`).
 *
 * @dll D2Game.dll
 * @va 0x6FC8CD40
 * @ordinalOrName D2Game_6FC8CD40
 */
export function OBJ_OperateDuranceStairs_6FC8CD40_113c(
  m: D2Memory113c,
  pOpArg: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FC8CD40);
  if (pOpArg === 0) return 0;
  const pObject = m.u32(pOpArg + 0x04);
  const pPlayer = m.u32(pOpArg + 0x08);
  const pRoom = UNITS_GetRoom113c(m, pObject);
  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom);

  if (pObject !== 0 && m.u32(pObject + 0x10) !== 0) {
    const pGame = m.u32(pOpArg);
    const pPlayerData = UNITS_GetPlayerData113c(m, pPlayer);
    if (pPlayerData !== 0 && pGame !== 0) {
      const bDiff = m.u8(pGame + 0x6d);
      const pQuestFlags = m.u32(pPlayerData + bDiff * 4 + 0x10);
      if (
        DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x16, 0x0d) !== 0 ||
        DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x16, 0) !== 0
      ) {
        let bWarped = 1;
        if (hooks && hooks.operateStairsWarp) {
          bWarped = hooks.operateStairsWarp(m, pGame, pPlayer, nLevelId, pObject);
        } else {
          ACT3Q7_OnMephistoPortalWarpToAct4_6FC566C0_113c(
            m as SparseMemory113c,
            pGame,
            pPlayer,
            nLevelId,
            pObject,
          );
        }
        if (bWarped !== 0 && nLevelId === 0x66) {
          const pWpNoOut = D2GAME_SCRATCH_W15B1_113C;
          m.setU16(pWpNoOut, 0);
          if (WAYPOINT_GetWaypointNoFromLevelId113c(m, 0x67, pWpNoOut) !== 0) {
            const pWaypointData = m.u32(pPlayerData + bDiff * 4 + 0x1c);
            WAYPOINT_ActivateWaypoint113c(m, pWaypointData, m.u16(pWpNoOut));
          }
          if (hooks && hooks.broadcastWaypointUpdate) {
            hooks.broadcastWaypointUpdate(m, pPlayer, pGame, 0x67, 0);
          } else {
            PLAYER_ChangeLevelOrActTransition_6FCBE170_113c(
              m as SparseMemory113c,
              pPlayer,
              0x67,
              pGame,
              0,
            );
          }
        }
      }
    }
  }
  return 0;
}

/**
 * Dispatches player trade/scroll sub-actions `0x17` (reset trade interaction state and recount scrolls/tomes)
 * and `0x18` (delegate to Horadric Cube transmute handler `0x6FC92FC0`).
 *
 * @dll D2Game.dll
 * @va 0x6FC934E0
 * @ordinalOrName D2Game_6FC934E0
 */
export function PLRTRADE_DispatchSubAction17Or18_6FC934E0_113c(
  m: D2Memory113c,
  pPlayer: number,
  wSubAction: number,
  pGame: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FC934E0);
  if (pPlayer === 0) return;
  const wCode = wSubAction & 0xffff;
  if (wCode === 0x17) {
    if (m.u8(pPlayer + 0x6c) !== 0 && m.u32(pPlayer + 0x68) === 4) {
      m.setU32(pPlayer + 0x64, 0xffffffff);
      m.setU32(pPlayer + 0x68, 6);
      m.setU8(pPlayer + 0x6c, 0);
    }
    ITEMS_ResetAndRecountInventoryScrollAndTomeCharges_6FCF4570_113c(m, pPlayer);
  } else if (wCode === 0x18) {
    if (hooks && hooks.handleTradeSubAction18) {
      hooks.handleTradeSubAction18(m, pGame, pPlayer);
    } else {
      CUBE_TransmuteHoradricCubeItems_6FC92FC0_113c(m as SparseMemory113c, pGame, pPlayer);
    }
  }
}

/**
 * Creates a player corpse unit upon death (`0x6FC99210`), applying the gold bank death penalty,
 * cloning equipped items onto the corpse unit, dropping excess gold, and broadcasting `0x8E`.
 *
 * @dll D2Game.dll
 * @va 0x6FC99210
 * @ordinalOrName D2Game_6FC99210
 */
export function PLAYER_CreateCorpseOnDeath_6FC99210_113c(
  m: D2Memory113c,
  pPlayer: number,
  pGame: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FC99210);
  if (pPlayer === 0 || pGame === 0) return 0;
  const pPlayerInv = m.u32(pPlayer + 0x60);
  PLAYER_PruneAndCountLiveCorpses_6FC97F00_113c(m, pPlayer, pGame);

  if (INVENTORY_GetCorpseCount113c(m, pPlayerInv) > 0x0f) {
    if (hooks && hooks.dropAllPlayerEquipmentAndGold) {
      hooks.dropAllPlayerEquipmentAndGold(m, pPlayer, pGame);
    } else {
      PLRDEATH_DropPlayerEquippedItemsAndGoldToCorpseOrGround_6FC98FA0_113c(
        m as SparseMemory113c,
        pPlayer,
        pGame,
      );
    }
    return 0;
  }

  let nX = 0;
  let nY = 0;
  const eType = m.u32(pPlayer);
  const pPath = m.u32(pPlayer + 0x2c);
  if (eType === 0 || eType === 1 || eType === 3) {
    if (pPath !== 0) {
      nX = PATH_GetPosX113c(m, pPath);
      nY = PATH_GetPosY113c(m, pPath);
    }
  } else if (pPath !== 0) {
    nX = (m.u32(pPath + 0x0c) | 0);
    nY = (m.u32(pPath + 0x10) | 0);
  }

  const pOrigRoom = UNITS_GetRoom113c(m, pPlayer);
  let pTargetRoom = ROOM_FindRoomContainingSubtile113c(m, pOrigRoom, nX, nY);
  let nCorpseX = nX;
  let nCorpseY = nY;

  if (pTargetRoom === 0) {
    const pppRoomsNear = D2GAME_SCRATCH_W15B1_113C;
    const pnRoomsNear = D2GAME_SCRATCH_W15B1_113C + 4;
    m.setU32(pppRoomsNear, 0);
    m.setU32(pnRoomsNear, 0);
    DUNGEON_GetAdjacentRoomsListFromRoom113c(m, pOrigRoom, pppRoomsNear, pnRoomsNear);
    const nRooms = (m.u32(pnRoomsNear) | 0);
    const ppList = m.u32(pppRoomsNear);
    for (let i = 0; i < nRooms; i++) {
      const pCand = m.u32(ppList + i * 4);
      if (pCand !== 0 && DUNGEON_CheckRoomIsTownMemPort113c(m, pCand) === 0) {
        pTargetRoom = pCand;
        break;
      }
    }
    if (pTargetRoom === 0) {
      if (hooks && hooks.dropAllPlayerEquipmentAndGold) {
        hooks.dropAllPlayerEquipmentAndGold(m, pPlayer, pGame);
      } else {
        PLRDEATH_DropPlayerEquippedItemsAndGoldToCorpseOrGround_6FC98FA0_113c(
          m as SparseMemory113c,
          pPlayer,
          pGame,
        );
      }
      return 0;
    }
    const pRoomCoords = m.u32(pTargetRoom + 0x0c);
    if (pRoomCoords !== 0) {
      const nSubX = (m.u32(pRoomCoords) | 0);
      const nSubW = (m.u32(pRoomCoords + 0x08) | 0);
      const nSubY = (m.u32(pRoomCoords + 0x04) | 0);
      const nSubH = (m.u32(pRoomCoords + 0x0c) | 0);
      nCorpseX = nSubX + Math.trunc(nSubW / 2);
      nCorpseY = nSubY + Math.trunc(nSubH / 2);
    }
  }

  const pOutCoords = D2GAME_SCRATCH_W15B1_113C + 0x10;
  m.setU32(pOutCoords, nCorpseX >>> 0);
  m.setU32(pOutCoords + 4, nCorpseY >>> 0);
  COLLISION_FindFreePositionBasic113c(m, pTargetRoom, pOutCoords, 2, 0x3e01, 0x1c09, 0, 0);
  nCorpseX = (m.u32(pOutCoords) | 0);
  nCorpseY = (m.u32(pOutCoords + 4) | 0);

  const pCorpseUnit = UNIT_Alloc113c(m, 0);
  if (pCorpseUnit === 0) {
    if (hooks && hooks.dropAllPlayerEquipmentAndGold) {
      hooks.dropAllPlayerEquipmentAndGold(m, pPlayer, pGame);
    } else {
      PLRDEATH_DropPlayerEquippedItemsAndGoldToCorpseOrGround_6FC98FA0_113c(
        m as SparseMemory113c,
        pPlayer,
        pGame,
      );
    }
    return 0;
  }

  let dwCorpseGuid = (m.u32(pGame + 0x90) + 1) >>> 0;
  if (dwCorpseGuid === 0xffffffff) {
    dwCorpseGuid = 1;
  }
  m.setU32(pGame + 0x90, dwCorpseGuid);
  m.setU32(pCorpseUnit + 0x04, m.u32(pPlayer + 0x04));
  m.setU32(pCorpseUnit + 0x08, m.u32(pGame + 0x1c));
  m.setU32(pCorpseUnit + 0x0c, dwCorpseGuid);
  m.setU32(pCorpseUnit + 0xc4, 4);
  SUNIT_InitUnitSeed113c(m, pCorpseUnit, pGame + 0xd0);

  if (hooks && hooks.initCorpsePlayerData) {
    hooks.initCorpsePlayerData(m, pGame, pCorpseUnit);
  } else {
    PLAYER_InitPlayerUnitSubsystems_6FC58620_113c(
      m as SparseMemory113c,
      pGame,
      pCorpseUnit,
      dwCorpseGuid,
    );
  }

  SUNIT_PlaceServerUnitInRoom113c(m, pTargetRoom, nCorpseY, pCorpseUnit, nCorpseX, pGame, 0);
  if (UNITS_GetRoom113c(m, pCorpseUnit) === 0) {
    if (hooks && hooks.dropAllPlayerEquipmentAndGold) {
      hooks.dropAllPlayerEquipmentAndGold(m, pPlayer, pGame);
    } else {
      PLRDEATH_DropPlayerEquippedItemsAndGoldToCorpseOrGround_6FC98FA0_113c(
        m as SparseMemory113c,
        pPlayer,
        pGame,
      );
    }
    return 0;
  }

  PATH_RemoveUnitCollisionFootprint113c(m, pCorpseUnit, 1);
  PATH_SetCollisionMask113c(m, m.u32(pCorpseUnit + 0x2c), 0x80);
  PATH_SetUnitCollisionPattern113c(m, pCorpseUnit, 0);
  UNITS_ChangeAnimMode113c(m, pCorpseUnit, 0x10);
  m.setU32(pCorpseUnit + 0xc4, (m.u32(pCorpseUnit + 0xc4) | 0x20000) >>> 0);
  STATES_ToggleGfxStateFlag113c(m, pCorpseUnit, 0x1a, 1);

  const pCorpseInv = m.u32(pCorpseUnit + 0x60);
  const pClient = getPlayerClient113c(m, pPlayer);
  const pSzName = CLIENTS_GetClientNamePtr_6FC69A20_113c(m, pClient);
  UNITS_SetPlayerName113c(m, pCorpseUnit, pSzName);
  SUNIT_SetPlayerClientPtr_6FD00040_113c(m, pCorpseUnit, pClient);

  const nPenalty = pClient !== 0 ? (m.u32(pClient + 0x508) | 0) : 0;
  const nBankGold = STATLIST_GetUnitStat113c(m, pPlayer, 0x0f, 0);
  if (nPenalty > nBankGold) {
    const nRemainder = nPenalty - nBankGold;
    if (pClient !== 0) {
      m.setU32(pClient + 0x508, nRemainder >>> 0);
    }
    STATLIST_SetUnitStat113c(m, pPlayer, 0x0f, 0, 0);
  } else {
    STATLIST_SetUnitStat113c(m, pPlayer, 0x0f, nBankGold - nPenalty, 0);
    if (pClient !== 0) {
      m.setU32(pClient + 0x508, 0);
    }
  }

  if (pClient !== 0) {
    m.setU32(pClient + 0x508, Math.trunc((m.u32(pClient + 0x508) | 0) * 3 / 4) >>> 0);
  }

  const nMaxExp = STATLIST_GetUnitStat113c(m, pPlayer, 0x1e, 0);
  const nCurExp = STATLIST_GetUnitStat113c(m, pPlayer, 0x0d, 0);
  if (nCurExp > nMaxExp && pClient !== 0) {
    const nDiffExp = nCurExp - nMaxExp;
    const nHalfLost = Math.trunc((nDiffExp - (m.u32(pClient + 0x504) | 0)) / 2);
    STATLIST_SetUnitStat113c(m, pCorpseUnit, 0x0d, nHalfLost, 0);
  }

  INVENTORY_AllocCorpse113c(m, pPlayerInv, m.u32(pCorpseUnit + 0x0c), SUNITDMG_GetPlayerClientClassId113c(m, pPlayer), 1);

  let pLeftItem = INVENTORY_GetCompositWeaponMemPort113c(m, pPlayerInv);
  if (pLeftItem !== 0 && m.u32(pLeftItem) === 4) {
    const pLeftData = m.u32(pLeftItem + 0x14);
    const bLoc = pLeftData !== 0 ? m.u8(pLeftData + 0x44) : 0;
    if (bLoc === 4 || bLoc === 5 || bLoc === 0x0b || bLoc === 0x0c) {
      INVENTORY_SetLeftItemGuid113c(m, pCorpseInv, m.u32(pLeftItem + 0x0c));
    }
  }

  for (let nLoc = -1; nLoc < 13; nLoc++) {
    const pSrcItem =
      nLoc === -1
        ? INVENTORY_GetCursorItem113c(m, pPlayerInv)
        : INVENTORY_GetItemFromBodyLocMemPort113c(m, pPlayerInv, nLoc);
    if (pSrcItem === 0 || m.u32(pSrcItem) !== 4) {
      continue;
    }
    const pItemRec = DATATBLS_GetItemsTxtRecordMemPort113c(m, m.u32(pSrcItem + 0x04));
    if (pItemRec !== 0 && m.u8(pItemRec + 0x127) !== 0 && m.u8(pItemRec + 0x128) === 0) {
      QUESTS_TriggerItemDropped_6FC545A0_113c(m, pGame, pSrcItem, pPlayer);
    } else {
      const pCloned = ITEMS_DuplicateItemWithSocketFillers_6FC307E0_113c(m, pGame, pSrcItem, 1);
      if (pCloned !== 0) {
        ITEMS_SetItemFlag113c(m, pCloned, 0x400, 1);
        let bEquippedOnCorpse = 0;
        if (nLoc === -1) {
          PLAYER_ClearCursorItemAndNotify42_6FC97D90_113c(m, pPlayer, pSrcItem);
          const bLoD = m.u32(pGame + 0x70);
          const nInvRecId = UNITS_GetInventoryRecordId113c(m, pCorpseUnit, 0, bLoD);
          ITEMS_SetInvPage113c(m, pCloned, 0);
          if (
            INVENTORY_AutoPlaceItemInGrid113c(m, pCorpseInv, pCloned, nInvRecId, 0, 0, 0, 0) !== 0 &&
            INVENTORY_PlaceItemInSocket113c(m, pCorpseInv, pCloned, 1) !== 0
          ) {
            INVENTORY_AppendItemGuidNode113c(m, pCorpseInv, pCloned);
            bEquippedOnCorpse = 1;
          }
        } else {
          D2Game_6FC98D00_113c(m as SparseMemory113c, pPlayer, pSrcItem, pGame, nLoc);
          if (INVENTORY_PlaceItemInBodyLoc113c(m, pCorpseInv, pCloned, nLoc) !== 0) {
            const nSocketType = nLoc === 0x0b || nLoc === 0x0c ? 4 : 3;
            if (INVENTORY_PlaceItemInSocket113c(m, pCorpseInv, pCloned, nSocketType) !== 0) {
              ITEMS_SetBodyLocation113c(m, pCloned, nLoc & 0xff);
              INVENTORY_AppendItemGuidNode113c(m, pCorpseInv, pCloned);
              bEquippedOnCorpse = 1;
            }
          }
        }
        if (bEquippedOnCorpse === 0) {
          const pCenter = D2GAME_SCRATCH_W15B1_113C + 0x20;
          const pDropOut = D2GAME_SCRATCH_W15B1_113C + 0x30;
          PATH_GetTargetTypeAndPosition113c(m, pPlayer, pCenter);
          const pDropRoom = ITEMS_FindFreeGroundDropCoords_6FC2E930_113c(
            m,
            UNITS_GetRoom113c(m, pPlayer),
            pCenter,
            pDropOut,
            1,
          );
          ITEMS_PlaceItemOnGroundInRoom_6FC2E990_113c(
            m,
            m.u32(pDropOut + 4) | 0,
            pCloned,
            pDropRoom,
            pGame,
            pPlayer,
            m.u32(pDropOut) | 0,
          );
        }
      }
    }
  }

  let nGoldToDrop = STATLIST_GetUnitStat113c(m, pPlayer, 0x0e, 0);
  STATLIST_SetUnitStat113c(m, pPlayer, 0x0e, 0, 0);
  if (pClient !== 0) {
    const nPen = (m.u32(pClient + 0x508) | 0);
    if (nGoldToDrop <= nPen) {
      nGoldToDrop = 0;
    } else {
      nGoldToDrop -= nPen;
    }
    m.setU32(pClient + 0x508, 0);
  }
  if (nGoldToDrop > 0) {
    ITEMS_DropGoldPileWithOwnerAtUnit_6FC98C50_113c(m, pPlayer, nGoldToDrop, pCorpseUnit, pGame);
  }

  const pPkt8E = D2GAME_SCRATCH_W15B1_113C + 0x40;
  m.setU8(pPkt8E, 0x8e);
  m.setU8(pPkt8E + 1, 0x01);
  m.setU32(pPkt8E + 2, m.u32(pPlayer + 0x0c));
  m.setU32(pPkt8E + 6, m.u32(pCorpseUnit + 0x0c));
  D2GAME_SUNIT_IterateAllLivingPlayers113c(m, pGame, S2C_Send10BytePacketToPlayerUnit_6FCAC530_113c, pPkt8E);

  return pCorpseUnit;
}

/**
 * Spawns a skill-summoned monster at the caster's target coordinates using the skill's `Skills.txt` summon fields.
 *
 * @dll D2Game.dll
 * @va 0x6FCB6280
 * @ordinalOrName D2Game_6FCB6280
 */
export function SKILLS_SpawnSkillSummonMonsterAtTarget_6FCB6280_113c(
  m: D2Memory113c,
  nSkillId: number,
  pUnit: number,
  pGame: number,
  nSkillLevelOrHooks?: number | W15B1Hooks113c,
  maybeHooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FCB6280);
  const nSkillLevel = typeof nSkillLevelOrHooks === 'number' ? nSkillLevelOrHooks : 1;
  const hooks = typeof nSkillLevelOrHooks === 'object' ? nSkillLevelOrHooks : maybeHooks;
  const pIat = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C);
  const pDataTables = pIat !== 0 ? m.u32(pIat) : 0;
  if (pDataTables === 0 || nSkillId < 0 || nSkillId >= (m.u32(pDataTables + 0xba0) | 0)) {
    return 0;
  }
  const pSkillsBase = m.u32(pDataTables + 0xb98);
  if (pSkillsBase === 0) {
    return 0;
  }
  const pSkillRec = (pSkillsBase + nSkillId * 0x23c) >>> 0;

  if (pUnit !== 0) {
    m.setU32(pUnit + 0xc4, (m.u32(pUnit + 0xc4) | 0x40) >>> 0);
  }

  const pSummonParams = D2GAME_SCRATCH_W15B1_113C;
  for (let i = 0; i < 17; i++) {
    m.setU32(pSummonParams + i * 4, 0);
  }
  m.setU32(pSummonParams + 0x04, ((m.u16(pSkillRec + 0x3c) << 16) >> 16) >>> 0);
  m.setU32(pSummonParams + 0x08, ((m.u16(pSkillRec + 0x3e) << 16) >> 16) >>> 0);
  m.setU32(pSummonParams + 0x0c, m.u8(pSkillRec + 0x46));
  m.setU32(pSummonParams + 0x10, m.u8(pSkillRec + 0x47));
  m.setU32(pSummonParams + 0x30, 8);

  if (
    SKILLS_GetUnitTargetOrFirstPathCoords_6FCBFA30_113c(
      m,
      pUnit,
      pGame,
      pSummonParams + 0x18,
      pSummonParams + 0x1c,
    ) === 0
  ) {
    return 0;
  }

  const pSpawned =
    hooks && hooks.spawnSkillMonsterFromParams
      ? hooks.spawnSkillMonsterFromParams(m, pUnit, pGame, pSummonParams)
      : SKILLS_SummonMonsterFromSkillOrMissile_6FCB5D50_113c(
          m as SparseMemory113c,
          pUnit,
          pGame,
          m.u32(pSummonParams + 0x18) | 0,
          m.u32(pSummonParams + 0x1c) | 0,
          pSkillRec,
          nSkillId,
          nSkillLevel,
        );
  return pSpawned !== 0 ? 1 : 0;
}

/**
 * Spawns a skill-summoned pet/minion at the caster's target coordinates, copies the caster's level stat (`0x0C`),
 * teleports the pet to the caster's room/coords, initializes AI command parameters, and schedules AI think event `2`.
 *
 * @dll D2Game.dll
 * @va 0x6FCB6310
 * @ordinalOrName D2Game_6FCB6310
 */
export function SKILLS_SrvDo_SummonPetWithAiInit_6FCB6310_113c(
  m: D2Memory113c,
  pGame: number,
  pUnit: number,
  nSkillId: number,
  nSkillLevel: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FCB6310);
  const pIat = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C);
  const pDataTables = pIat !== 0 ? m.u32(pIat) : 0;
  if (pDataTables === 0 || nSkillId < 0 || nSkillId >= (m.u32(pDataTables + 0xba0) | 0)) {
    return 0;
  }
  const pSkillsBase = m.u32(pDataTables + 0xb98);
  if (pSkillsBase === 0) {
    return 0;
  }
  const pSkillRec = (pSkillsBase + nSkillId * 0x23c) >>> 0;

  const pSummonParams = D2GAME_SCRATCH_W15B1_113C;
  for (let i = 0; i < 17; i++) {
    m.setU32(pSummonParams + i * 4, 0);
  }
  const pOutX = D2GAME_SCRATCH_W15B1_113C + 0x50;
  const pOutY = D2GAME_SCRATCH_W15B1_113C + 0x54;
  m.setU32(pOutX, 0);
  m.setU32(pOutY, 0);

  const nHcIdx = SKILLS_ResolveSummonMonsterId_6FCBEE50_113c(
    m,
    pOutY,
    pOutX,
    pSummonParams + 0x0c,
    pUnit,
    0,
    nSkillId,
    nSkillLevel,
  );
  m.setU32(pSummonParams + 0x04, nHcIdx >>> 0);
  if (nHcIdx < 0) {
    return 0;
  }

  m.setU32(pSummonParams + 0x08, ((m.u16(pSkillRec + 0x3e) << 16) >> 16) >>> 0);
  m.setU32(pSummonParams + 0x10, m.u8(pSkillRec + 0x47));
  m.setU32(pSummonParams + 0x30, 8);

  if (pUnit !== 0) {
    m.setU32(pUnit + 0xc4, (m.u32(pUnit + 0xc4) | 0x40) >>> 0);
  }

  if (
    SKILLS_GetUnitTargetOrFirstPathCoords_6FCBFA30_113c(
      m,
      pUnit,
      pGame,
      pSummonParams + 0x18,
      pSummonParams + 0x1c,
    ) === 0
  ) {
    return 0;
  }

  const pPet =
    hooks && hooks.spawnSkillMonsterFromParams
      ? hooks.spawnSkillMonsterFromParams(m, pUnit, pGame, pSummonParams)
      : SKILLS_SummonMonsterFromSkillOrMissile_6FCB5D50_113c(
          m as SparseMemory113c,
          pUnit,
          pGame,
          0,
          0,
          pSkillRec,
          nSkillId,
          nSkillLevel,
        );
  if (pPet === 0) {
    return 0;
  }

  const nOwnerLevel = STATLIST_GetUnitStat113c(m, pUnit, 0x0c, 0);
  STATLIST_SetUnitStat113c(m, pPet, 0x0c, nOwnerLevel, 0);

  if (hooks && hooks.linkSummonOwner) {
    hooks.linkSummonOwner(m, pGame, pUnit, pPet);
  } else if (m.u32((pPet + 0x2c) >>> 0) !== 0) {
    DUNGEON_TeleportUnitToRoomAndCoords_6FD019C0_113c(
      m as SparseMemory113c,
      UNIT_GetPosX113c(m, pUnit),
      UNITS_GetRoom113c(m, pUnit),
      UNIT_GetPosY113c(m, pUnit),
      pGame,
      pPet,
      0,
      0,
    );
  }

  AIGENERAL_CopyAiCommandParams113c(
    m,
    pPet,
    ((m.u16(pSkillRec + 0x32) << 16) >> 16),
    (m.u32(pOutX) | 0),
    (m.u32(pOutY) | 0),
    nSkillId,
    nSkillLevel,
  );

  if (pGame !== 0 && m.u32(pGame + 0xb8) !== 0) {
    EVENT_DeleteEventByType113c(m, pGame, pPet, 2);
    const dwNextFrame = (m.u32(pGame + 0xa8) + 1) >>> 0;
    EVENT_SetEventFull113c(m, pGame, pPet, 2, dwNextFrame, 0, 0, 0);
  }

  m.setU32(pPet + 0xc4, (m.u32(pPet + 0xc4) & ~0x08) >>> 0);
  return 1;
}

/**
 * Initializes the Act 4 Quest 2 (Hell's Forge) quest descriptor and allocates its `0x20`-byte state.
 *
 * @dll D2Game.dll
 * @va 0x6FCDAD40
 * @ordinalOrName D2Game_6FCDAD40
 */
export function ACT4Q2_InitQuestData_6FCDAD40_113c(
  m: D2Memory113c,
  pQuest: number,
): void {
  hitD2GameVa113c(0x6FCDAD40);
  if (pQuest === 0) return;
  for (let i = 0; i < 15; i++) {
    m.setU32(pQuest + 0xa0 + i * 4, 0);
  }
  m.setU32(pQuest + 0xa0, 0x6fcd8ce0);
  m.setU32(pQuest + 0xec, 0x6fcd8810);
  m.setU32(pQuest + 0xdc, 0x6fd26b38);
  m.setU32(pQuest + 0xf0, 0x6fcda270);
  m.setU32(pQuest + 0xc8, 0x6fcd8e60);
  m.setU32(pQuest + 0xac, 0x6fcda1e0);
  m.setU32(pQuest + 0xa8, 0x6fcd9de0);
  m.setU32(pQuest + 0xcc, 0x6fcdaa50);
  m.setU32(pQuest + 0xd4, 0x6fcd9830);
  m.setU32(pQuest + 0xd8, 0x6fcd8cc0);
  m.setU32(pQuest + 0xc4, 0x6fcd87f0);
  m.setU32(pQuest + 0xc0, 0x6fcda810);
  m.setU32(pQuest + 0xb0, 0x6fcda330);
  m.setU8(pQuest + 0x0a, 1);
  m.setU32(pQuest + 0x10, 0x17);
  m.setU32(pQuest + 0xe0, 0x1b);
  m.setU8(pQuest + 0x0d, 4);

  let pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    pState = allocHeapW15B1_113c(m, 0x20);
    m.setU32(pQuest + 0x18, pState);
  } else {
    for (let i = 0; i < 8; i++) {
      m.setU32(pState + i * 4, 0);
    }
  }
}

/**
 * Completes Act 4 Quest 2 (`0x1B`) for a player in Act 4 (`actNo === 3`), deleting the Hellforge Hammer (`'hfh '`)
 * and Mephisto's Soulstone (`'mss '`), setting completion state bits, and incrementing the forge quest counter.
 *
 * @dll D2Game.dll
 * @va 0x6FCDAF20
 * @ordinalOrName D2Game_6FCDAF20
 */
export function ACT4Q2_CompleteQuestForPlayerOnActChange_6FCDAF20_113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FCDAF20);
  if (pGame === 0 || pPlayer === 0) return;
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  if (
    DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x1b, 0) !== 0 ||
    DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x1b, 1) !== 0
  ) {
    return;
  }

  const pRoom = UNITS_GetRoom113c(m, pPlayer);
  const nLevelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom);
  if (DRLG_GetActNoFromLevelId113c(m, nLevelId) !== 3) {
    return;
  }

  removePlayerQuestItemByCode113c(m, pPlayer, 0x20686668, pGame, hooks);
  removePlayerQuestItemByCode113c(m, pPlayer, 0x2073736d, pGame, hooks);

  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x1b, 0x0d);
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x1b, 1);
  QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x1b);

  const pQuest18 = findQuestByIdInGame113c(m, pGame, 0x18);
  if (pQuest18 !== 0) {
    const pState18 = m.u32(pQuest18 + 0x18);
    if (pState18 !== 0) {
      m.setU32(pState18 + 0x14, (m.u32(pState18 + 0x14) + 1) >>> 0);
    }
  }
}

/**
 * Initiates an NPC vendor trade or gamble session (`0x6FCDF730`), linking the player unit into the NPC slot's
 * proxy list and initializing hireling vendor rosters for Kashya, Greiz, Asheara, and Qual-Kehk.
 *
 * @dll D2Game.dll
 * @va 0x6FCDF730
 * @ordinalOrName D2Game_6FCDF730
 */
export function NPCS_BeginVendorOrGambleInteract_6FCDF730_113c(
  m: D2Memory113c,
  pPlayer: number,
  pNpc: number,
  pGame: number,
  bGamble: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FCDF730);
  if (pPlayer === 0 || pNpc === 0 || pGame === 0) return;
  if (m.u32(pGame + 0x1d24) === 0) return;

  const pOutSlotIdx = D2GAME_SCRATCH_W15B1_113C;
  m.setU32(pOutSlotIdx, 0);
  const nNpcClassId = m.u32(pNpc + 0x04);
  const pSlot = D2GAME_ARENA_FindPlayerSlotByUnit113c(m, pOutSlotIdx, pGame, nNpcClassId);
  if (pSlot === 0) {
    return;
  }

  if (bGamble !== 0) {
    if (m.u32(pSlot + 0x0c) === 0) {
      return;
    }
    const pProxy = SUNITPROXY_FindOrCreateNodeInList18_6FCAF6C0_113c(m, pPlayer, pSlot, pGame);
    if (pProxy !== 0) {
      m.setU8(pProxy + 0x04, 1);
    }
    if (hooks && hooks.openGambleInventory) {
      hooks.openGambleInventory(m, pGame, pPlayer, pNpc, pSlot);
    } else {
      NPCTRADE_EnsureVendorInventoryGenerated_6FCDF1C0_113c(
        m as SparseMemory113c,
        pSlot,
        pPlayer,
        pGame,
        pNpc,
      );
    }
    return;
  }

  const pVendorState = pSlot + 0x20;
  if (m.u8(pVendorState + 0x03) === 0) {
    return;
  }
  const pProxy = SUNITPROXY_FindOrCreateNodeInList18_6FCAF6C0_113c(m, pPlayer, pSlot, pGame);
  if (pProxy !== 0) {
    m.setU8(pProxy + 0x04, 0);
  }
  if (m.u8(pVendorState) === 0) {
    if (hooks && hooks.openVendorInventory) {
      hooks.openVendorInventory(m, pPlayer, pNpc, pGame, pSlot);
    } else {
      NPCTRADE_PopulateVendorItemsFromTable_6FCDF2E0_113c(
        m as SparseMemory113c,
        pGame,
        pPlayer,
        pNpc,
        0,
      );
    }
    m.setU8(pVendorState, 1);
  }
  if (m.u8(pVendorState + 0x01) === 0) {
    const nClassSigned = nNpcClassId | 0;
    if (nClassSigned === 0x96 || nClassSigned === 0x203 || nClassSigned === 0xc6 || nClassSigned === 0xfc) {
      NPC_InitHirelingVendorRoster_6FCDCED0_113c(m, pSlot, pGame, nClassSigned);
    }
    m.setU8(pVendorState + 0x01, 1);
  }
}

/**
 * Handles Act 2 Quest 2 (The Horadric Staff) NPC speech completion for Deckard Cain (`0xF4`),
 * consuming the Horadric Scroll (`'tr1 '`) and setting quest `0x0A` state bits across messages `0x14F..0x153`.
 *
 * @dll D2Game.dll
 * @va 0x6FCE7DC0
 * @ordinalOrName D2Game_6FCE7DC0
 */
export function ACT2Q2_OnNpcSpeechComplete_6FCE7DC0_113c(
  m: D2Memory113c,
  pQuest: number,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FCE7DC0);
  if (pQuestArg === 0) return;
  const pPlayer = m.u32(pQuestArg + 0x0c);
  const pGame = m.u32(pQuestArg);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);

  if (((m.u16(pQuestArg + 0x14) << 16) >> 16) !== 0xf4) {
    return;
  }

  const wMsgId = ((m.u16(pQuestArg + 0x18) << 16) >> 16);
  if (wMsgId === 0x14f) {
    removePlayerQuestItemByCode113c(m, pPlayer, 0x20317274, pGame, hooks);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 3);
    return;
  }
  if (wMsgId === 0x150) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 4);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 3);
    return;
  }
  if (wMsgId === 0x151) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 5);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 3);
    return;
  }
  if (wMsgId === 0x152) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 6);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 3);
    return;
  }
  if (wMsgId === 0x153) {
    const pActiveQuest = pQuest !== 0 ? pQuest : findQuestByIdInGame113c(m, pGame, 0x0a);
    QUESTRECORD_ClearQuestState113c(m, pQuestFlags, 0x0a, 1);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 3);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 0x0a);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 4);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 6);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 5);
    if (pActiveQuest !== 0) {
      const dwPlayerGuid = pPlayer !== 0 && m.u32(pPlayer) === 0 ? m.u32(pPlayer + 0x0c) : 0xffffffff;
      QUESTS_GuidListAdd113c(m, pActiveQuest + 0x1c, dwPlayerGuid);
    }
    const pNpc = m.u32(pQuestArg + 0x08);
    QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
  }
}

/**
 * Handles Act 2 Quest 6 (The Seven Tombs) NPC speech completion (`0x6FCE8050`) for Tyrael (`0xFB`),
 * Jerhyn (`0xC9`), Meshif (`0xD2`), and town NPCs (`0x1BC..0x1C4`), spawning the Lut Gholein portal and completing Act 2.
 *
 * @dll D2Game.dll
 * @va 0x6FCE8050
 * @ordinalOrName D2Game_6FCE8050
 */
export function ACT2Q6_OnNpcSpeechComplete_6FCE8050_113c(
  m: D2Memory113c,
  pQuest: number,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FCE8050);
  if (pQuest === 0 || pQuestArg === 0) return;
  const pPlayer = m.u32(pQuestArg + 0x0c);
  const pGame = m.u32(pQuestArg);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) return;

  const wNpcId = ((m.u16(pQuestArg + 0x14) << 16) >> 16);
  const wMsgId = ((m.u16(pQuestArg + 0x18) << 16) >> 16);

  if (wNpcId === 0xfb) {
    if (wMsgId === 0x12e) {
      if (m.u8(pState + 0x07) === 0) {
        const pNpc = m.u32(pQuestArg + 0x08);
        const pCoords = D2GAME_SCRATCH_W15B1_113C;
        const pFreeCoords = D2GAME_SCRATCH_W15B1_113C + 8;
        PATH_GetTargetTypeAndPosition113c(m, pNpc, pCoords);
        const pNpcRoom = UNITS_GetRoom113c(m, pNpc);
        m.setU32(pFreeCoords, m.u32(pCoords));
        m.setU32(pFreeCoords + 4, m.u32(pCoords + 4));
        COLLISION_FindFreePositionBasic113c(m, pNpcRoom, pFreeCoords, 3, 0x400, 0xbe1, 1, 0);
        const nPortalX = (m.u32(pFreeCoords) | 0);
        const nPortalY = (m.u32(pFreeCoords + 4) | 0);
        const pDestRoom = ROOM_FindRoomContainingSubtile113c(m, pNpcRoom, nPortalX, nPortalY);
        if (pDestRoom !== 0) {
          const pPortal = SUNIT_AllocUnitData113c(m, 2, 0x3b, nPortalX, nPortalY, pGame, pDestRoom, 1, 1, 0);
          if (pPortal !== 0) {
            const pPortalData = m.u32(pPortal + 0x14);
            if (pPortalData !== 0) {
              m.setU8(pPortalData + 0x04, 0x28);
            }
            UNITS_ChangeAnimMode113c(m, pPortal, 1);
            PORTAL_CreateLinkedDestinationPortal_6FCC22E0_113c(
              m,
              pGame,
              pPortal,
              0x28,
              DUNGEON_GetLevelIdFromRoom113c(m, pNpcRoom),
            );
            const nPortalFlags = UNITS_GetObjectPortalFlags113c(m, pPortal);
            UNITS_SetObjectPortalFlags113c(m, pPortal, nPortalFlags | 3);
            DUNGEON_ToggleHasPortalFlag113c(m, pDestRoom, 0);
            m.setU8(pState + 0x07, 1);
          }
        }
      }
      if (m.u8(pQuest + 0x0b) !== 4 && m.u8(pQuest + 0x0b) !== 5) {
        m.setU8(pQuest + 0x14, 0);
        m.setU8(pQuest + 0x0b, 4);
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT2Q6_SendAlert0DIfQuest14Active_6FCE4D30_113c,
          pQuest,
        );
      }
      if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x0e, 0) === 0) {
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT2Q6_UnitIterate_CompleteInTalRashaChamber_6FCE59A0_113c,
          pQuest,
        );
        m.setU8(pState + 0x5c, 0);
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT2Q6_PropagatePartyCompletionCallback_6FCE65A0_113c,
          pQuest,
        );
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT2Q6_UnitIterateSetCompletionState_6FCE4BD0_113c,
          pQuest,
        );
      }
    }
    return;
  }

  if (wNpcId === 0xc9) {
    if (wMsgId === 0x1ae) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 1);
      m.setU8(pQuest + 0x14, 1);
      m.setU8(pQuest + 0x0b, 5);
      D2GAME_SUNIT_IterateAllLivingPlayers113c(
        m,
        pGame,
        ACT2Q6_SendAlert0DIfQuest14Active_6FCE4D30_113c,
        pQuest,
      );
      if (m.u8(pState + 0x01) === 1) {
        m.setU8(pState + 0x01, 0);
        const pDoor = m.u32(pState + 0x6c);
        if (pDoor !== 0) {
          PATH_SetUnitCollisionPattern113c(m, pDoor, 0);
          PATH_RemoveUnitCollisionFootprint113c(m, pDoor, 1);
        }
      }
      const pNpc = m.u32(pQuestArg + 0x08);
      QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
      return;
    }
    if (wMsgId === 0x1ba) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 5);
      return;
    }
  } else if (wNpcId === 0xd2 && wMsgId === 0x1c2) {
    if (hooks && hooks.deleteAllPlayerQuestItems) {
      hooks.deleteAllPlayerQuestItems(m, pGame, pPlayer, 0x20747368);
      hooks.deleteAllPlayerQuestItems(m, pGame, pPlayer, 0x20706976);
      hooks.deleteAllPlayerQuestItems(m, pGame, pPlayer, 0x2066736d);
    } else {
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20747368, pGame, hooks);
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20706976, pGame, hooks);
      removePlayerQuestItemByCode113c(m, pPlayer, 0x2066736d, pGame, hooks);
    }

    QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x0e);
    QUESTRECORD_ClearQuestState113c(m, pQuestFlags, 0x0e, 1);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 0x0d);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 0);
    m.setU8(pState, 1);
    QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 0x0e);
    QUESTS_SetGlobalQuestState_6FC53920_113c(m, pGame, 0x0e, 0);
    const pNpc = m.u32(pQuestArg + 0x08);
    QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    return;
  }

  if (wMsgId === 0x1bc) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 6);
  } else if (wMsgId === 0x1be) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 7);
  } else if (wMsgId === 0x1bf) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 8);
  } else if (wMsgId === 0x1c0) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 9);
  } else if (wMsgId === 0x1c1) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 0x0a);
  } else if (wMsgId === 0x1c4) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0e, 0x0b);
  }
}

/**
 * Handles Act 2 Quest 2 Horadric Staff Orifice activation (`0x6FCE9CB0`), completing quest `0x0A`,
 * consuming the Horadric Staff (`'hst '`), Viper Amulet (`'vip '`), and Staff of Kings (`'msf '`),
 * propagating completion to the party, and scheduling the tomb wall opening timer.
 *
 * @dll D2Game.dll
 * @va 0x6FCE9CB0
 * @ordinalOrName D2Game_6FCE9CB0
 */
export function ACT2Q2_OnHoradricStaffOrificeActivate_6FCE9CB0_113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FCE9CB0);
  void A5Q4_OpenTemplePortalObject_6FCE94E0_113c;
  if (pGame === 0 || pPlayer === 0) return;
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 0);
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x0a, 0x0d);

  const delAllFn =
    hooks && hooks.deleteAllPlayerQuestItems
      ? hooks.deleteAllPlayerQuestItems
      : deleteMatchingQuestItemByBaseCode113c;
  delAllFn(m, pGame, pPlayer, 0x20747368);
  delAllFn(m, pGame, pPlayer, 0x20706976);
  delAllFn(m, pGame, pPlayer, 0x2066736d);

  const wPartyId = D2GAME_PARTY_GetPartyIdForUnit113c(m, pPlayer, pGame);
  if (wPartyId !== -1 && (wPartyId & 0xffff) !== 0xffff) {
    const partyCb =
      hooks && hooks.partyHoradricStaffCallback
        ? hooks.partyHoradricStaffCallback
        : (mem: D2Memory113c, g: number, u: number, arg: number) => {
            ACT2Q2_CleanupHoradricStaffItemsOnEnterAct1_6FCE7D00_113c(
              mem as SparseMemory113c,
              g,
              u,
              arg,
            );
          };
    PARTY_ForEachSubPartyPlayerUnit_6FCBC160_113c(m, pGame, wPartyId, partyCb, 0);
  }

  const pQuestCtrl = m.u32(pGame + 0x10f4);
  if (pQuestCtrl !== 0) {
    m.setU8(pQuestCtrl + 0x20, 3);
    D2GAME_SUNIT_IterateAllLivingPlayers113c(
      m,
      pGame,
      QUESTS_SyncPlayerQuestLogAndPacket89_6FC559C0_113c,
      pQuestCtrl,
    );
  }

  const pQuest0D = findQuestByIdInGame113c(m, pGame, 0x0d);
  if (pQuest0D !== 0) {
    const pState0D = m.u32(pQuest0D + 0x18);
    if (pState0D !== 0 && m.u8(pState0D + 0x0d) === 0) {
      m.setU8(pState0D + 0x0d, 1);
      m.setU8(pState0D + 0x0e, 1);
      if (m.u8(pState0D + 0x03) === 0) {
        QUESTS_AppendQuestTimer_6FC53AF0_113c(m, 2, pQuest0D, 0x6fce94e0);
        m.setU8(pState0D + 0x03, 1);
      }

      const dwOrificeGuid = m.u32(pState0D + 0x18);
      let pOrificeObj = 0;
      const pBucketHead = m.u32(pGame + 0x1520 + ((dwOrificeGuid & 0x7f) << 2));
      let pCur = pBucketHead;
      while (pCur !== 0) {
        if (m.u32(pCur + 0x0c) === dwOrificeGuid) {
          pOrificeObj = pCur;
          break;
        }
        pCur = m.u32(pCur + 0xe4);
      }

      if (pOrificeObj !== 0) {
        UNITS_ChangeAnimMode113c(m, pOrificeObj, 1);
        const pRoom = UNITS_GetRoom113c(m, pOrificeObj);
        DUNGEON_ToggleHasPortalFlag113c(m, pRoom, 0);
        const pCoords = D2GAME_SCRATCH_W15B1_113C;
        PATH_GetTargetTypeAndPosition113c(m, pOrificeObj, pCoords);
        const nAdjX = (m.u32(pCoords) | 0) + 3;
        const nAdjY = (m.u32(pCoords + 4) | 0) - 13;
        const pAdjRoom = ROOM_FindRoomContainingSubtile113c(m, pRoom, nAdjX, nAdjY);
        if (pAdjRoom !== 0) {
          DUNGEON_ToggleHasPortalFlag113c(m, pAdjRoom, 0);
        }
      }
    }
  }
}

/**
 * Validates and dispatches C2S packet `0x32` (Buy item from NPC vendor, length `0x11`).
 *
 * @dll D2Game.dll
 * @va 0x6FCEF220
 * @ordinalOrName D2Game_6FCEF220
 */
export function C2S_Packet_NpcBuyItem_6FCEF220_113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  pPacket: number,
  nPacketLen: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FCEF220);
  if (nPacketLen !== 0x11) {
    return 3;
  }
  const dwNpcGuid = m.u32(pPacket + 0x01);
  const dwItemGuid = m.u32(pPacket + 0x05);
  const dwRawTab = m.u32(pPacket + 0x09);
  const wCost = m.u16(pPacket + 0x0d);
  const dwCost = m.u32(pPacket + 0x0d);
  if (hooks && hooks.npcBuyItemImpl) {
    hooks.npcBuyItemImpl(m, pPlayer, pGame, dwNpcGuid, dwItemGuid, dwRawTab, wCost, 1);
    return 0;
  }
  return NPCTRADE_InteractBuyItem_6FCDF200_113c(
    m as SparseMemory113c,
    pGame,
    pPlayer,
    dwNpcGuid,
    dwItemGuid,
    (dwRawTab & 0x7fffffff) >>> 16,
    dwRawTab & 0x7fffffff,
    dwCost,
  );
}

/**
 * Validates and dispatches C2S packet `0x17` (Drop cursor item to ground, length `5`).
 *
 * @dll D2Game.dll
 * @va 0x6FCEF380
 * @ordinalOrName D2Game_6FCEF380
 */
export function C2S_Packet_DropCursorItem_6FCEF380_113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  pPacket: number,
  nPacketLen: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FCEF380);
  if (nPacketLen !== 5) {
    return 3;
  }
  const dwItemGuid = m.u32(pPacket + 0x01);
  const nValidateRc = C2S_ValidateCursorItem_6FCECF70_113c(m, pGame, dwItemGuid, pPlayer) | 0;
  if (nValidateRc !== 0) {
    return nValidateRc;
  }
  if (pPlayer !== 0 && m.u32(pPlayer) === 0) {
    let bCheckTrade = m.u8(pPlayer + 0x6c) !== 0;
    if (!bCheckTrade) {
      const pInv = m.u32(pPlayer + 0x60);
      if (INVENTORY_GetCursorItem113c(m, pInv) !== 0) {
        bCheckTrade = true;
      } else {
        const pPlayerData = UNITS_GetPlayerData113c(m, pPlayer);
        if (pPlayerData !== 0 && m.u32(pPlayerData + 0x4c) !== 0) {
          bCheckTrade = true;
        }
      }
    }
    if (bCheckTrade && PLRTRADE_IsInteractingWithValidPlayer113c(m, pPlayer, pGame) !== 0) {
      return 3;
    }
  }
  const pInv = pPlayer !== 0 ? m.u32(pPlayer + 0x60) : 0;
  const pItem = pInv !== 0 ? INVENTORY_GetCursorItem113c(m, pInv) : 0;
  if (hooks && hooks.dropItemAtPlayer) {
    if (pItem !== 0) {
      hooks.dropItemAtPlayer(m, pGame, pPlayer, pItem, 0, 0, 0);
    }
    return 0;
  }
  ITEMS_DuplicateAndDropCursorItem_6FCF8310_113c(
    m as SparseMemory113c,
    dwItemGuid,
    pGame,
    pPlayer,
  );
  return 0;
}

/**
 * Validates and dispatches C2S packet `0x36` (Hire mercenary / repair item via NPC, length `9`).
 *
 * @dll D2Game.dll
 * @va 0x6FCF0060
 * @ordinalOrName D2Game_6FCF0060
 */
export function C2S_Packet_HireMercenary_6FCF0060_113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  pPacket: number,
  nPacketLen: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FCF0060);
  if (nPacketLen !== 9) {
    return 3;
  }
  const dwNpcGuid = m.u32(pPacket + 0x01);
  const wMercId = m.u16(pPacket + 0x05);
  if (hooks && hooks.hireMercenaryImpl) {
    hooks.hireMercenaryImpl(m, pGame, pPlayer, wMercId);
  } else {
    NPCTRADE_InteractRepairItem_6FCE1890_113c(
      m as SparseMemory113c,
      pGame,
      pPlayer,
      dwNpcGuid,
      wMercId,
    );
  }
  return 0;
}

/**
 * Splits or transmutes a stacked/transmutable grid item (`0x6FCF8440`) into its target base code (`[pItemTxt+0xC8]`),
 * rolling random quantity (`stat 0x46`) and placing the new item in the player's inventory or on the ground.
 *
 * @dll D2Game.dll
 * @va 0x6FCF8440
 * @ordinalOrName D2Game_6FCF8440
 */
export function ITEMS_SplitOrTransmuteStackedItem_6FCF8440_113c(
  m: D2Memory113c,
  pGame: number,
  pPlayer: number,
  pItem: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FCF8440);
  if (pGame === 0 || pPlayer === 0 || pItem === 0 || m.u32(pItem) !== 4) {
    return 0;
  }
  const pItemTxt = DATATBLS_GetItemsTxtRecordMemPort113c(m, m.u32(pItem + 0x04));
  if (pItemTxt === 0 || m.u8(pItemTxt + 0x139) === 0) {
    return 0;
  }
  const dwTargetCode = m.u32(pItemTxt + 0xc8);
  const pOutTargetIdx = D2GAME_SCRATCH_W15B1_113C;
  m.setU32(pOutTargetIdx, 0);
  const pTargetRec = DATATBLS_GetItemsTxtRecordByCode113c(m, dwTargetCode, pOutTargetIdx);
  if (pTargetRec === 0) {
    return 0;
  }
  if (m.u32(pItem + 0x10) !== 0) {
    return 0;
  }

  const nTargetClassId = (m.u32(pOutTargetIdx) | 0);
  const pDropParams = D2GAME_SCRATCH_W15B1_113C + 0x10;
  ITEMS_BuildItemDropParamsFromItem113c(m, pDropParams, pItem, pGame, nTargetClassId);

  ITEMS_ConsumeGridItemAndNotify9D_6FCF39B0_113c(m, pItem, pPlayer, pGame);

  const pNewItem = D2GAME_CreateItemEx_6FC31490_113c(m, pGame, pDropParams, 0);
  if (pNewItem === 0) {
    return 0;
  }

  const bTmogMin = m.u8(pItemTxt + 0x13a);
  const bTmogMax = m.u8(pItemTxt + 0x13b);
  let nFinalQty = 0;
  if (bTmogMin > 0 && bTmogMax > 0) {
    nFinalQty =
      (SEED_RollLimitedFast113c(m, (pPlayer + 0x20) >>> 0, (bTmogMax - bTmogMin) | 0) + bTmogMin) | 0;
  }
  STATLIST_SetUnitStat113c(m, pNewItem, 0x46, nFinalQty, 0);

  ITEMS_SetInvPage113c(m, pNewItem, 0);

  const dwNewGuid = m.u32(pNewItem + 0x0c);
  const nDropX = (m.u32(pDropParams + 0x1c) | 0);
  const nDropY = (m.u32(pDropParams + 0x20) | 0);
  const pOutResult = D2GAME_SCRATCH_W15B1_113C + 0xa0;
  m.setU32(pOutResult, 0);
  let bPlaced = 0;
  if (hooks && hooks.autoPlaceCreatedItemInPlayerGrid) {
    bPlaced = hooks.autoPlaceCreatedItemInPlayerGrid(
      m,
      pGame,
      pPlayer,
      dwNewGuid,
      nDropX,
      nDropY,
      0,
      1,
      pOutResult,
    );
  } else {
    bPlaced = ITEMS_PlaceItemInUnitInventoryGrid_6FCF76A0_113c(
      m as SparseMemory113c,
      0x6fd1b14c,
      0x163c,
      pGame,
      pPlayer,
      dwNewGuid,
      nDropX,
      nDropY,
      0,
      1,
      0,
    );
    if (bPlaced === 0) {
      bPlaced = ITEMS_PlaceItemInUnitInventoryGrid_6FCF76A0_113c(
        m as SparseMemory113c,
        0x6fd1b14c,
        0x163e,
        pGame,
        pPlayer,
        dwNewGuid,
        0,
        0,
        1,
        1,
        0,
      );
    }
  }

  if (bPlaced === 0) {
    if (hooks && hooks.dropItemAtPlayer) {
      hooks.dropItemAtPlayer(m, pGame, pPlayer, pNewItem, 0, 0, 0);
    } else {
      ITEMS_DuplicateAndDropCursorItem_6FCF8310_113c(
        m as SparseMemory113c,
        dwNewGuid,
        pGame,
        pPlayer,
      );
    }
  }
  return 1;
}

/**
 * Handles Act 3 Quest 5 (The Blackened Temple / Khalim's Will) NPC speech completion (`0x6FD089A0`)
 * for Ormus (`0xFF`, `0x252`) and Deckard Cain (`0xF5`, `0x272`), cleaning up Khalim relics if quest `0x12` is complete.
 *
 * @dll D2Game.dll
 * @va 0x6FD089A0
 * @ordinalOrName D2Game_6FD089A0
 */
export function ACT3Q5_OnNpcSpeechComplete_6FD089A0_113c(
  m: D2Memory113c,
  pQuest: number,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FD089A0);
  if (pQuest === 0 || pQuestArg === 0) return;
  const pPlayer = m.u32(pQuestArg + 0x0c);
  const pGame = m.u32(pQuestArg);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);

  const wMsgId = ((m.u16(pQuestArg + 0x18) << 16) >> 16);
  const wNpcId = ((m.u16(pQuestArg + 0x14) << 16) >> 16);

  if (wMsgId === 0x252) {
    if (wNpcId === 0xff) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x15, 2);
      if (m.u8(pQuest + 0x0b) < 2) {
        m.setU8(pQuest + 0x0b, 2);
      }
      const pNpc = m.u32(pQuestArg + 0x08);
      QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    }
    return;
  }

  if (wMsgId !== 0x272 || wNpcId !== 0xf5) {
    return;
  }

  if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x15, 1) === 1) {
    if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x12, 0) !== 0) {
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20796571, pGame, hooks);
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20726871, pGame, hooks);
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20726271, pGame, hooks);
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20316671, pGame, hooks);
      removePlayerQuestItemByCode113c(m, pPlayer, 0x20326671, pGame, hooks);
    }
    const pState = m.u32(pQuest + 0x18);
    QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x15);
    QUESTRECORD_ClearQuestState113c(m, pQuestFlags, 0x15, 1);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x15, 0);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x15, 0x0d);
    if (pState !== 0) {
      m.setU8(pState + 0x23, 1);
    }
    QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 0x0b);
    QUESTS_SetGlobalQuestState_6FC53920_113c(m, pGame, 0x15, 0);
    const pNpc = m.u32(pQuestArg + 0x08);
    QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
  }
}

/**
 * Handles Act 3 Quest 1 (The Golden Bird) NPC speech completion (`0x6FD08B60`) for Deckard Cain (`0xF5`),
 * Alkor (`0xFE`), and Meshif (`0x108`), exchanging the Jade Figurine (`'j34 '`) for the Golden Bird (`'g34 '`)
 * and granting the Potion of Life (`'xyz '`).
 *
 * @dll D2Game.dll
 * @va 0x6FD08B60
 * @ordinalOrName D2Game_6FD08B60
 */
export function ACT3Q1_OnNpcSpeechComplete_6FD08B60_113c(
  m: D2Memory113c,
  pQuest: number,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FD08B60);
  if (pQuest === 0 || pQuestArg === 0) return;
  const pPlayer = m.u32(pQuestArg + 0x0c);
  const pGame = m.u32(pQuestArg);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) return;

  const wNpcId = ((m.u16(pQuestArg + 0x14) << 16) >> 16);
  const wMsgId = ((m.u16(pQuestArg + 0x18) << 16) >> 16);

  if (wNpcId === 0xf5) {
    if (wMsgId === 0x20f) {
      QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x14);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x14, 3);
      return;
    }
    if (wMsgId === 0x213) {
      QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x14);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x14, 4);
    }
    return;
  }

  if (wNpcId === 0xfe) {
    if (wMsgId === 0x216) {
      if (ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, 0x20343367) !== 0) {
        removePlayerQuestItemByCode113c(m, pPlayer, 0x20343367, pGame, hooks);
        m.setU32(pState + 0x18, (m.u32(pState + 0x18) - 1) >>> 0);
        QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x14, 1);
        QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x14);
        QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x14, 5);
        m.setU8(pQuest + 0x0b, 5);
        const pNpc = m.u32(pQuestArg + 0x08);
        QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
      }
      return;
    }
    if (wMsgId === 0x21a && DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x14, 1) === 1) {
      QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x14);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x14, 6);
      QUESTRECORD_ClearQuestState113c(m, pQuestFlags, 0x14, 1);
      m.setU8(pState + 0x04, 1);
      const pPotion =
        hooks && hooks.createQuestRewardItem
          ? hooks.createQuestRewardItem(m, pGame, pPlayer, 0x207a7978, 0, 2, 1)
          : D2Game_6FC56470_113c(m as SparseMemory113c, 0, 0x207a7978, pPlayer, pGame, 2, 1);
      if (pPotion !== 0) {
        m.setU32(pState + 0x1c, (m.u32(pState + 0x1c) + 1) >>> 0);
        m.setU8(pState + 0x06, 1);
        QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 8);
      }
      const pNpc = m.u32(pQuestArg + 0x08);
      QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    }
    return;
  }

  if (wNpcId === 0x108 && wMsgId === 0x211) {
    if (ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, 0x2034336a) !== 0) {
      removePlayerQuestItemByCode113c(m, pPlayer, 0x2034336a, pGame, hooks);
      m.setU32(pState + 0x14, (m.u32(pState + 0x14) - 1) >>> 0);
      m.setU8(pState + 0x02, 1);
      const pBird =
        hooks && hooks.createQuestRewardItem
          ? hooks.createQuestRewardItem(m, pGame, pPlayer, 0x20343367, 0, 2, 1)
          : D2Game_6FC56470_113c(m as SparseMemory113c, 0, 0x20343367, pPlayer, pGame, 2, 1);
      if (pBird !== 0) {
        m.setU8(pState + 0x03, 1);
        m.setU32(pState + 0x18, (m.u32(pState + 0x18) + 1) >>> 0);
        QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x14);
        QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x14, 4);
      }
    }
  }
}

/**
 * Handles Act 3 Quest 4 (Lam Esen's Tome) NPC speech completion (`0x6FD08FE0`) for Alkor (`0xFE`),
 * consuming Lam Esen's Tome (`'bbb '`), granting 5 stat points, and completing quest `0x11`.
 *
 * @dll D2Game.dll
 * @va 0x6FD08FE0
 * @ordinalOrName D2Game_6FD08FE0
 */
export function ACT3Q4_OnNpcSpeechComplete_6FD08FE0_113c(
  m: D2Memory113c,
  pQuest: number,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FD08FE0);
  if (pQuest === 0 || pQuestArg === 0) return;
  const pPlayer = m.u32(pQuestArg + 0x0c);
  const pGame = m.u32(pQuestArg);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) return;

  if (((m.u16(pQuestArg + 0x14) << 16) >> 16) !== 0xfe) {
    return;
  }

  const wMsgId = ((m.u16(pQuestArg + 0x18) << 16) >> 16);
  if (wMsgId === 0x225) {
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x11, 2);
    if (m.u8(pQuest + 0x0b) <= 2) {
      m.setU8(pQuest + 0x14, 1);
      m.setU8(pQuest + 0x0b, 2);
      D2GAME_SUNIT_IterateAllLivingPlayers113c(
        m,
        pGame,
        ACT3Q4_SendLamEsensTomeQuestAlertCallback_6FD06550_113c,
        pQuest,
      );
    }
    const pNpc = m.u32(pQuestArg + 0x08);
    QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    return;
  }

  if (wMsgId === 0x234 && ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, 0x20626262) !== 0) {
    removePlayerQuestItemByCode113c(m, pPlayer, 0x20626262, pGame, hooks);
    m.setU32(pState + 0x10, (m.u32(pState + 0x10) - 1) >>> 0);
    m.setU8(pState + 0x02, 1);

    if (m.u8(pQuest + 0x0b) <= 4) {
      m.setU8(pQuest + 0x14, 0);
      m.setU8(pQuest + 0x0b, 4);
      D2GAME_SUNIT_IterateAllLivingPlayers113c(
        m,
        pGame,
        ACT3Q4_SendLamEsensTomeQuestAlertCallback_6FD06550_113c,
        pQuest,
      );
    }

    QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x11);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x11, 0);
    QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x11, 0x0d);
    QUESTRECORD_ClearQuestState113c(m, pQuestFlags, 0x11, 1);
    ACT3Q4_GrantPlayerStatPointsReward_6FD06470_113c(m, pQuestFlags, pPlayer);

    const wPartyId = D2GAME_PARTY_GetPartyIdForUnit113c(m, pPlayer, pGame);
    if (wPartyId !== -1 && (wPartyId & 0xffff) !== 0xffff) {
      PARTY_ForEachSubPartyPlayerUnit_6FCBC160_113c(
        m,
        pGame,
        wPartyId,
        ACT3Q4_CompleteLamEsensTomePartyCallback_6FD064C0_113c,
        0,
      );
    }

    D2GAME_SUNIT_IterateAllLivingPlayers113c(
      m,
      pGame,
      ACT1Q4_SetCainRescuedByPartyCallback_6FC816F0_113c,
      pQuest,
    );
    QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 0x11);
    QUESTS_SetGlobalQuestState_6FC53920_113c(m, pGame, 0x11, 0);
    const pNpc = m.u32(pQuestArg + 0x08);
    QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    ACT3Q4_PropagateTomeQuestStateToSubParty_6FD06B90_113c(m, pGame, pPlayer);
  }
}

/**
 * Handles Act 3 Quest 2 (Blade of the Old Religion / The Gidbinn) NPC speech completion (`0x6FD09600`)
 * for Ormus (`0xFF`), Hratli (`0xFD`), and Asheara (`0xFC`), consuming the Gidbinn (`'g33 '`),
 * spawning the rare ring reward (`'rin '`), and hiring a free Iron Wolf mercenary.
 *
 * @dll D2Game.dll
 * @va 0x6FD09600
 * @ordinalOrName D2Game_6FD09600
 */
export function ACT3Q2_OnNpcSpeechComplete_6FD09600_113c(
  m: D2Memory113c,
  pQuest: number,
  pQuestArg: number,
  hooks?: W15B1Hooks113c,
): void {
  hitD2GameVa113c(0x6FD09600);
  if (pQuest === 0 || pQuestArg === 0) return;
  const pPlayer = m.u32(pQuestArg + 0x0c);
  const pGame = m.u32(pQuestArg);
  const pQuestFlags = PLAYER_GetQuestRecordForDifficulty_6FC21020_113c(m, pPlayer, pGame);
  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) return;

  const wNpcId = ((m.u16(pQuestArg + 0x14) << 16) >> 16);
  const wMsgId = ((m.u16(pQuestArg + 0x18) << 16) >> 16);

  if (wNpcId === 0xff) {
    if (wMsgId === 0x24b) {
      if (ITEMS_FindQuestItemByBaseCode_6FC2E660_113c(m, pPlayer, pGame, 0x20333367) !== 0) {
        QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x13);
        QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x13, 4);
        removePlayerQuestItemByCode113c(m, pPlayer, 0x20333367, pGame, hooks);
        m.setU32(pState + 0x24, (m.u32(pState + 0x24) - 1) >>> 0);
        m.setU8(pState + 0x02, 1);

        const wPartyId = D2GAME_PARTY_GetPartyIdForUnit113c(m, pPlayer, pGame);
        if (wPartyId !== -1 && (wPartyId & 0xffff) !== 0xffff) {
          PARTY_ForEachSubPartyPlayerUnit_6FCBC160_113c(
            m,
            pGame,
            wPartyId,
            ACT3Q2_SetGidbinnTurnInPartyCallback_6FD041D0_113c,
            0,
          );
        }
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT3Q6_SyncGidbinnState02Callback113c,
          pQuest,
        );
        const pNpc = m.u32(pQuestArg + 0x08);
        QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
      }
      return;
    }

    if (wMsgId === 0x251 && DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x13, 1) === 1) {
      QUESTRECORD_ClearQuestState113c(m, pQuestFlags, 0x13, 1);
      QUESTRECORD_ClearQuestStateBits2To11_113c(m, pQuestFlags, 0x13);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x13, 0);
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x13, 0x0d);
      m.setU8(pState + 0x04, 1);

      const bDiff = m.u8(pGame + 0x6d);
      let nRingIlvl = 0x15;
      if (bDiff === 1) {
        nRingIlvl = 0x23;
      } else if (bDiff === 2) {
        nRingIlvl = 0x4b;
      }
      if (hooks && hooks.createQuestRewardItem) {
        hooks.createQuestRewardItem(m, pGame, pPlayer, 0x206e6972, nRingIlvl, 6, 1);
      } else {
        D2Game_6FC56470_113c(m as SparseMemory113c, nRingIlvl, 0x206e6972, pPlayer, pGame, 6, 1);
      }

      QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 9);
      QUESTS_SetGlobalQuestState_6FC53920_113c(m, pGame, 0x13, 0);

      if (m.u8(pQuest + 0x0b) !== 5) {
        if (m.u8(pQuest + 0x0b) <= 4) {
          m.setU8(pQuest + 0x0b, 5);
        }
        m.setU8(pQuest + 0x14, 0);
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT3Q6_SetGidbinnState0ECallback113c,
          pQuest,
        );
      }
      D2GAME_SUNIT_IterateAllLivingPlayers113c(
        m,
        pGame,
        ACT3Q2_SetGidbinnState0ECallback_6FD04280_113c,
        pQuest,
      );
      const pNpc = m.u32(pQuestArg + 0x08);
      QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    }
    return;
  }

  if (wNpcId === 0xfd) {
    if (wMsgId === 0x23b) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x13, 2);
      if (m.u8(pQuest + 0x0b) < 2) {
        m.setU8(pQuest + 0x14, 1);
        m.setU8(pQuest + 0x0b, 2);
        D2GAME_SUNIT_IterateAllLivingPlayers113c(
          m,
          pGame,
          ACT3Q6_SetGidbinnState0ECallback113c,
          pQuest,
        );
      }
      const pNpc = m.u32(pQuestArg + 0x08);
      QUESTS_TriggerNpcInteractAndSendPacket27_6FC55910_113c(m, pNpc, pPlayer, pGame);
    }
    return;
  }

  if (wNpcId === 0xfc && wMsgId === 0x24d) {
    if (DRLGWARP_TestRoomTileBit113c(m, pQuestFlags, 0x13, 0x0c) === 0) {
      QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x13, 0x0c);
      if (hooks && hooks.hireAct3FreeMercenary) {
        hooks.hireAct3FreeMercenary(m, pGame, pPlayer, 2);
      } else {
        D2Game_6FCE1030_113c(m as SparseMemory113c, pGame, pPlayer, 0xfc);
      }
    }
  }
}

/**
 * Operates the Compelling Orb object (`0x6FD0A140`), checking that the player wields Khalim's Will (`'qf2 '`),
 * incrementing the orb hit counter to 2, destroying `'qf2 '`, firing the hellgate opener projectile,
 * and propagating quest `0x12` completion to the party.
 *
 * @dll D2Game.dll
 * @va 0x6FD0A140
 * @ordinalOrName D2Game_6FD0A140
 */
export function ACT3Q5_OnCompellingOrbOperate_6FD0A140_113c(
  m: D2Memory113c,
  pOpArg: number,
  hooks?: W15B1Hooks113c,
): number {
  hitD2GameVa113c(0x6FD0A140);
  if (pOpArg === 0) return 0;
  const pGame = m.u32(pOpArg);
  const pQuest = findQuestByIdInGame113c(m, pGame, 0x13);
  const pObject = m.u32(pOpArg + 0x04);
  if (pQuest === 0 || pObject === 0 || m.u32(pObject + 0x10) !== 0) {
    return 0;
  }

  const pPlayer = m.u32(pOpArg + 0x08);
  const pInv = pPlayer !== 0 ? m.u32(pPlayer + 0x60) : 0;
  const pWeapon = INVENTORY_GetCompositWeaponMemPort113c(m, pInv);
  if (pWeapon === 0 || ITEMS_GetBaseCode113c(m, pWeapon) !== 0x20326671) {
    SUNIT_SetUnitEventSound113c(m, pPlayer, 0x13, pPlayer);
    return 0;
  }

  const pState = m.u32(pQuest + 0x18);
  if (pState === 0) {
    return 0;
  }

  const nHits = ((m.u32(pState + 0x38) | 0) + 1) | 0;
  m.setU32(pState + 0x38, nHits >>> 0);
  if (nHits < 2) {
    return 0;
  }

  const pPlayerData = UNITS_GetPlayerData113c(m, pPlayer);
  const bDiff = m.u8(pGame + 0x6d);
  const pQuestFlags = pPlayerData !== 0 ? m.u32(pPlayerData + bDiff * 4 + 0x10) : 0;
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x12, 0);
  QUESTRECORD_SetQuestState113c(m, pQuestFlags, 0x12, 0x0d);

  const delAllFn =
    hooks && hooks.deleteAllPlayerQuestItems
      ? hooks.deleteAllPlayerQuestItems
      : deleteMatchingQuestItemByBaseCode113c;
  const nRemoved = delAllFn(m, pGame, pPlayer, 0x20326671);
  m.setU32(pState + 0x28, (m.u32(pState + 0x28) - nRemoved) >>> 0);

  const dwMonsterGuid = m.u32(pState + 0x2c);
  const pBucketHead = m.u32(pGame + 0x1320 + ((dwMonsterGuid & 0x7f) << 2));
  let pMonster = pBucketHead;
  while (pMonster !== 0) {
    if (m.u32(pMonster + 0x0c) === dwMonsterGuid) {
      break;
    }
    pMonster = m.u32(pMonster + 0xe4);
  }

  if (pMonster !== 0) {
    AI_StartModeAtCoordsKeepSteps_6FD121E0_113c(m, pMonster, 0, pGame, 0, 0);
    ACT3Q6_FireHellgateOpenerProjectile_6FD0AB60_113c(m, pMonster, pGame);
  }

  const pObjRec = DATATBLS_GetObjectsTxtRecord113c(m, m.u32(pObject + 0x04));
  UNITS_ChangeAnimMode113c(m, pObject, 1);
  const nFrameCnt = pObjRec !== 0 ? (m.u32(pObjRec + 0xdc) >>> 8) : 0;
  const dwExpireFrame = (nFrameCnt + m.u32(pGame + 0xa8)) >>> 0;
  if (m.u32(pGame + 0xb8) !== 0) {
    EVENT_SetEventFull113c(m, pGame, pObject, 1, dwExpireFrame, 0, 0, 0);
  }
  m.setU8(pState + 0x0c, 1);

  QUESTS_SetGameQuestFlag20AndSyncPlayers_6FC55E90_113c(m, pGame, 0x0a);

  const wPartyId = D2GAME_PARTY_GetPartyIdForUnit113c(m, pPlayer, pGame);
  if (wPartyId !== -1 && (wPartyId & 0xffff) !== 0xffff) {
    const partyCb =
      hooks && hooks.compellingOrbPartyCallback
        ? hooks.compellingOrbPartyCallback
        : (mem: D2Memory113c, g: number, u: number, arg: number) => {
            ACT3Q3_CleanupKhalimItemsOnEnterAct2OrComplete_6FD087E0_113c(
              mem as SparseMemory113c,
              g,
              u,
              arg,
            );
          };
    PARTY_ForEachSubPartyPlayerUnit_6FCBC160_113c(m, pGame, wPartyId, partyCb, 0);
  }

  return 0;
}

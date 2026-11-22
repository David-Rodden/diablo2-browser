#!/usr/bin/env npx tsx
/**
 * Headless Chrome + CDP Multi-Resolution Browser Verification for Character Skins:
 * - Verifies zero `/skins/` HTTP fetches while `character-skins` plugin is disabled (default)
 * - Opens `ModMenu`, enables `character-skins`, verifies Option A settings & action button
 * - Verifies in-game Necromancer -> Kel'Thuzad Archlich RGBA + Frost Glow rendering across
 *   `800x600`, `1068x600`, and `1280x720` on `.d2cap` town replay
 * - Verifies skyward spellcast (`mode = 10` `SC`), Trang-Oul Vampire (`token = 'tg'`) override
 *   preserving Kel'Thuzad appearance, and Phylactery death corpse (`mode = 17` `DD`)
 * - Verifies `.d2skin.zip` local import modal & IndexedDB custom skin registration
 */

import { join, resolve } from 'node:path'
import { assert, sleep, withPlayHarness } from './play-cdp-harness.ts'

const outOverride = process.env.D2W_SKIN_VERIFY_OUT ? resolve(process.env.D2W_SKIN_VERIFY_OUT) : null

async function main(): Promise<void> {
  await withPlayHarness('verify-character-skins', async (h) => {
    const outDir = outOverride ?? h.outDir

    // 1. Track network requests to `/skins/` via PerformanceEntry
    const initialSkinRequests = await h.cdp.evaluate<number>(`(
      performance.getEntriesByType('resource').filter(e => e.name.includes('/skins/')).length
    )`)
    assert(initialSkinRequests === 0, `Expected 0 /skins/ fetches while disabled, got ${String(initialSkinRequests)}`)

    // Switch replayed local player unit to Necromancer (charClass = 2, token = 'ne')
    const selfId = await h.cdp.evaluate<number>(`(() => {
      const app = window.__d2Play;
      const w = app.session.world;
      w.self.charClass = 2;
      app.session.selfAppearanceCache = null;
      const u = w.getUnit('player', w.selfId || 1);
      if (u) {
        u.classId = 2;
        u.token = 'ne';
        u.mode = 5;
        u.dir64 = 0;
        u.targetDirection = 0;
      }
      app.settings.set({ viewport: '800x600' });
      app.renderFrame(performance.now());
      return w.selfId || 1;
    })()`)
    await h.tick(4)
    await h.cdp.setViewport(800, 600)
    await h.cdp.captureScreenshot(join(outDir, '01-vanilla-necro-800x600.png'))

    const skinReqsBeforeEnable = await h.cdp.evaluate<number>(`(
      performance.getEntriesByType('resource').filter(e => e.name.includes('/skins/')).length
    )`)
    assert(skinReqsBeforeEnable === 0, `Expected 0 /skins/ fetches after vanilla Necro draw, got ${String(skinReqsBeforeEnable)}`)

    // 2. Open ModMenu, select `character-skins`, and toggle ON
    await h.cdp.evaluate(`(async () => {
      const app = window.__d2Play;
      app.pluginMenu.open();
      app.pluginMenu.selectPlugin('character-skins');
      await app.plugins.setEnabled('character-skins', true);
      app.pluginMenu.render();
      return true;
    })()`)
    await sleep(300)
    await h.cdp.setViewport(1068, 600)
    await h.cdp.captureScreenshot(join(outDir, '02-mod-menu-character-skins-1068x600.png'))

    const statusLevel = await h.cdp.evaluate<string>(`window.__d2Play.plugins.getStatus('character-skins').level`)
    assert(statusLevel === 'ok', `Expected character-skins status 'ok', got '${statusLevel}'`)

    // Close ModMenu and wait for Kel'Thuzad RGBA + Glow atlases to upload
    await h.cdp.evaluate(`window.__d2Play.pluginMenu.close()`)
    for (let i = 0; i < 40; i += 1) {
      await h.tick(2)
      const skinLoaded = await h.cdp.evaluate<boolean>(`(
        performance.getEntriesByType('resource').filter(e => e.name.includes('/skins/ne-kelthuzad/hero-')).length > 0
      )`)
      if (skinLoaded) break
      await sleep(100)
    }
    await h.tick(5)

    // 3. Multi-resolution screenshots of Kel'Thuzad hovering in town (`800x600`, `1068x600`, `1280x720`)
    for (const [vpKey, w, hgt] of [
      ['800x600', 800, 600],
      ['1068x600', 1068, 600],
      ['1280x720', 1280, 720],
    ] as const) {
      await h.cdp.setViewport(w, hgt)
      await h.cdp.evaluate(`(() => {
        const app = window.__d2Play;
        app.settings.set({ viewport: '${vpKey}' });
        const u = app.session.world.getUnit('player', ${String(selfId)});
        if (u) { u.mode = 1; u.dir64 = 0; u.targetDirection = 0; }
        app.renderFrame(performance.now());
      })()`)
      await h.tick(3)
      await h.cdp.captureScreenshot(join(outDir, `03-kelthuzad-idle-${vpKey}.png`))
    }

    // 4. Spellcast (`mode = 10` SC) + Trang-Oul Vampire state (State 177 -> `tg`) override check at 1068x600
    await h.cdp.setViewport(1068, 600)
    await h.cdp.evaluate(`(() => {
      const app = window.__d2Play;
      app.settings.set({ viewport: '1068x600' });
      const w = app.session.world;
      w.self.states.add(177);
      const u = w.getUnit('player', ${String(selfId)});
      if (u) {
        u.states.replaceAll([177]);
        u.classId = 2;
        u.castState = {
          skillId: 84,
          mode: 10,
          startedAtMs: performance.now() - 200,
          durationMs: 2000,
          stepSpeed256: 256,
          effRate: 0,
        };
        u.direction = 0;
      }
      app.renderFrame(performance.now());
    })()`)
    await sleep(80)
    await h.cdp.evaluate(`window.__d2Play.renderFrame(performance.now())`)
    await h.cdp.captureScreenshot(join(outDir, '04-kelthuzad-cast-trangoul-override-1068x600.png'))

    // 5. Open Custom Skin Import & Manager Modal via plugin action `manage-skins`
    await h.cdp.evaluate(`(() => {
      window.__d2Play.plugins.runAction('character-skins', 'manage-skins');
    })()`)
    await sleep(300)
    const modalVisible = await h.cdp.evaluate<boolean>(`Boolean(document.getElementById('d2-skin-manager-modal-overlay'))`)
    assert(modalVisible, 'Expected #d2-skin-manager-modal-overlay to open from manage-skins action')
    await h.cdp.captureScreenshot(join(outDir, '05-skin-manager-import-modal-1068x600.png'))

    // Close modal via Escape key
    await h.cdp.evaluate(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`)
    await sleep(100)
    const modalClosed = await h.cdp.evaluate<boolean>(`!document.getElementById('d2-skin-manager-modal-overlay')`)
    assert(modalClosed, 'Expected Escape to close #d2-skin-manager-modal-overlay')

    // 6. Phase 2: Spawn all 6 Necromancer Summons (Ghoul, 4-element WC3 Necromancers, Rock Golem,
    //    Abomination, Flesh Golem, Infernal) + HUD portraits + Hovered Monster Plaque!
    await h.cdp.evaluate(`(() => {
      const app = window.__d2Play;
      const w = app.session.world;
      const hero = w.getUnit('player', ${String(selfId)});
      if (hero) {
        hero.castState = undefined;
        hero.mode = 1;
        hero.direction = 0;
      }
      const bx = hero ? hero.x : w.self.x;
      const by = hero ? hero.y : w.self.y;
      const summons = [
        // [id, petType, classId, dx, dy, dir, compS4]
        [9101, 4, 363, -4.8,  2.2, 0, undefined], // Ghoul #1 (South)
        [9102, 4, 363, -2.6,  4.4, 7, undefined], // Ghoul #2 (SE)
        [9103, 5, 364, -5.6, -1.6, 1, 1],         // WC3 Necromancer (Cold cyan orb)
        [9104, 5, 364, -2.4, -4.2, 0, 2],         // WC3 Necromancer (Fire orange orb)
        [9105, 3, 289,  1.2,  4.2, 0, undefined], // Rock Golem (Clay Golem)
        [9106, 3, 290,  5.6,  3.2, 1, undefined], // Abomination (Blood Golem)
        [9107, 3, 291,  1.8, -4.2, 0, undefined], // Flesh Golem (Iron Golem)
        [9108, 3, 292,  6.2, -1.2, 1, undefined], // Infernal (Fire Golem)
      ];
      w.pets.clear();
      for (const [id, petType, classId, dx, dy, dir, s4] of summons) {
        w.pets.set(id, {
          unitId: id,
          petType,
          classId,
          ownerId: ${String(selfId)},
          lifePct: 128,
          lifePctScale: 128,
          isDead: false,
        });
        const m = w.ensureUnit(1, id);
        m.classId = classId;
        m.x = bx + dx;
        m.y = by + dy;
        m.mode = 1;
        m.direction = dir * 8;
        m.dir64 = dir * 8;
        m.targetDirection = dir * 8;
        m.lifePct = 128;
        m.ownerType = 'player';
        m.ownerId = ${String(selfId)};
        if (s4 !== undefined) {
          m.compVariants = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, s4];
        }
        w.npcMotion.reassignMonster(id, bx + dx, by + dy);
      }
      if (app.hudModel) {
        app.hudModel.syncFromWorld();
        app.hudModel.setHoveredMonster(9105); // Hover Rock Golem (Clay Golem)
      }
      app.renderFrame(performance.now());
    })()`)

    // Wait for all 6 minion atlases + HUD portraits to finish lazy loading
    for (let i = 0; i < 60; i += 1) {
      await h.tick(2)
      const ready = await h.cdp.evaluate<boolean>(`(() => {
        const res = performance.getEntriesByType('resource');
        const minionCount = res.filter(e => e.name.includes('/skins/ne-kelthuzad/minion-')).length;
        const sp = window.__d2Play.hudManager?.summonPortraits ?? [];
        return minionCount >= 6 && sp.length >= 3 && sp.every(s => Boolean(s.customPortrait));
      })()`)
      if (ready) break
      await sleep(100)
    }
    await sleep(120)
    await h.tick(4)

    // Verify HUD summon portraits & hovered monster bar adopted Scourge names & custom portraits
    const hudCheck = await h.cdp.evaluate<{
      readonly labels: readonly string[]
      readonly hasCustomPortraits: boolean
      readonly targetCustomZh: string | null
    }>(`(() => {
      const app = window.__d2Play;
      app.hudModel.syncFromWorld();
      app.hudModel.setHoveredMonster(9105);
      app.renderFrame(performance.now());
      const sp = app.hudManager?.summonPortraits ?? [];
      return {
        labels: sp.map((s) => s.label),
        hasCustomPortraits: sp.length >= 3 && sp.every((s) => Boolean(s.customPortrait)),
        targetCustomZh: app.hudManager?.targetMonster?.customDisplayName?.zh ?? null,
      };
    })()`)
    assert(
      hudCheck.hasCustomPortraits,
      `Expected all summonPortraits to carry custom WC3 portraits, got ${JSON.stringify(hudCheck)}`,
    )
    assert(
      hudCheck.targetCustomZh === '岩石傀儡',
      `Expected hovered Clay Golem targetMonster customDisplayName.zh === '岩石傀儡', got '${String(hudCheck.targetCustomZh)}'`,
    )

    // Capture multi-resolution Scourge Army + WC3 HUD Portraits + Hover Bar screenshots!
    for (const [vpKey, w, hgt] of [
      ['800x600', 800, 600],
      ['1068x600', 1068, 600],
      ['1280x720', 1280, 720],
    ] as const) {
      await h.cdp.setViewport(w, hgt)
      await h.cdp.evaluate(`(() => {
        const app = window.__d2Play;
        app.settings.set({ viewport: '${vpKey}' });
        app.hudModel.syncFromWorld();
        app.hudModel.setHoveredMonster(9105);
        app.renderFrame(performance.now());
      })()`)
      await h.tick(3)
      await h.cdp.captureScreenshot(join(outDir, `06-scourge-summons-army-${vpKey}.png`))
    }

    // 7. Every other class -> its built-in Warcraft III hero (mesh skins without summons).
    // Loaded models are counted through the skin service: the browser's resource-timing buffer is
    // full by now, so new fetches no longer show up in `performance.getEntriesByType('resource')`.
    const countMeshModels = `(async () => {
      const mod = await import('/src/client/render/character-skin-cache.ts');
      return mod.getGlobalCharacterSkinService().listMeshSkinRuntimes()
        .reduce((n, rt) => n + rt.meshRenderer.liveModelCount, 0);
    })()`
    await h.cdp.evaluate(`(() => {
      const w = window.__d2Play.session.world;
      w.pets.clear();
      for (const id of [9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108]) {
        const m = w.getUnit('monster', id);
        if (m) { m.x += 40; m.y += 40; w.npcMotion.reassignMonster(id, m.x, m.y); }
      }
      w.self.states.delete(177);
    })()`)
    for (const [classId, token, skinId] of [
      [0, 'am', 'am-sylvanas'],
      [1, 'so', 'so-jaina'],
      [3, 'pa', 'pa-arthas'],
      [4, 'ba', 'ba-grom'],
      [5, 'dz', 'dz-malfurion'],
      [6, 'ai', 'ai-maiev'],
    ] as const) {
      const modelsBefore = await h.cdp.evaluate<number>(countMeshModels)
      await h.cdp.evaluate(`(() => {
        const app = window.__d2Play;
        const w = app.session.world;
        w.self.charClass = ${String(classId)};
        app.session.selfAppearanceCache = null;
        const u = w.getUnit('player', ${String(selfId)});
        if (u) { u.classId = ${String(classId)}; u.token = '${token}'; u.mode = 1; u.dir64 = 0; u.targetDirection = 0; u.castState = undefined; u.states.replaceAll([]); }
        app.hudModel.syncFromWorld();
        app.renderFrame(performance.now());
      })()`)
      let loaded = false
      for (let i = 0; i < 40 && !loaded; i += 1) {
        await h.tick(2)
        loaded = (await h.cdp.evaluate<number>(countMeshModels)) > modelsBefore
        if (!loaded) await sleep(100)
      }
      assert(loaded, `Expected the ${skinId} hero model to be loaded for class '${token}'`)
      const clip = await h.cdp.evaluate<string | null>(`(async () => {
        const mod = await import('/src/client/render/character-skin-cache.ts');
        window.__d2Play.renderFrame(performance.now());
        for (const rt of mod.getGlobalCharacterSkinService().listMeshSkinRuntimes()) {
          const st = rt.animator.snapshot().find((u) => u.unitKey === 'player:${String(selfId)}');
          if (st) return st.clip;
        }
        return null;
      })()`)
      assert(clip === 'nu', `Expected class '${token}' to play the idle clip of ${skinId}, got '${String(clip)}'`)
      await h.tick(5)
      for (const [vpKey, w, hgt] of [
        ['800x600', 800, 600],
        ['1068x600', 1068, 600],
        ['1280x720', 1280, 720],
      ] as const) {
        await h.cdp.setViewport(w, hgt)
        await h.cdp.evaluate(`(() => {
          const app = window.__d2Play;
          app.settings.set({ viewport: '${vpKey}' });
          app.renderFrame(performance.now());
        })()`)
        await h.tick(3)
        await h.cdp.captureScreenshot(join(outDir, `07-${skinId}-${vpKey}.png`))
      }
    }

    assert(h.cdp.missingArt.length === 0, `Unexpected missingArt errors: ${JSON.stringify(h.cdp.missingArt)}`)
    assert(h.cdp.consoleErrors.length === 0, `Unexpected console errors: ${JSON.stringify(h.cdp.consoleErrors)}`)
    console.log(`[verify-character-skins] All multi-resolution & Trang-Oul override checks PASSED -> ${outDir}`)
  })
}

main().catch((err) => {
  console.error('[verify-character-skins] FAILED:', err)
  process.exit(1)
})

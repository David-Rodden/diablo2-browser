import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const dragInteractPlugin = createTogglePlugin({
  id: 'drag-interact',
  name: { zh: '按住拖动即交互', en: 'Hold-and-Drag Interact' },
  description: {
    zh: '按住左键拖动时，经过的敌人会被攻击，经过的物品会被拾取。NPC、传送点和箱子仍需单独点击。',
    en: 'Hold the left button and drag: monsters you pass over get attacked and items get picked up. NPCs, waypoints and chests still need their own click.',
  },
  port: (ctx) => ctx.dragInteract,
})

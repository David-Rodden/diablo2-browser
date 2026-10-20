import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const autoGoldPickupPlugin = createTogglePlugin({
  id: 'auto-gold-pickup',
  name: { zh: '自动拾取金币', en: 'Auto Gold Pickup' },
  description: {
    zh: '自动拾取附近的金币。稍远的金币会在你空闲时走过去捡。',
    en: "Picks up gold near you. Gold a few steps away is collected when you're idle.",
  },
  defaultEnabled: false,
  port: (ctx) => ctx.autoGoldPickup,
})

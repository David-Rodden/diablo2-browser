export interface LifeGauge {
  readonly maxHp: number
  readonly healableHp: number
}

export const lifeCap = ({ maxHp, healableHp }: LifeGauge, maxLife: number) => Math.min(maxHp || maxLife, healableHp || Infinity)

export const lifeShare = (gauge: LifeGauge, me: { readonly life: number; readonly maxLife: number }) => Math.min(1, me.life / Math.max(1, lifeCap(gauge, me.maxLife)))

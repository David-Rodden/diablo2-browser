/**
 * Loads the baked 1.13c weather assets (`npm run pack:weather` → `public/weather/weather.json`):
 * the act palettes LoadWeather 0x6fb31750 builds its colour ramps from and the drawn overlay cels.
 * There is no fallback: a missing or corrupt file is an error.
 */

import { validateWeatherManifest, type WeatherManifestData } from '../../common/pack-contract/index.ts'

export const WEATHER_ASSETS_URL = '/weather/weather.json'

export async function loadWeatherAssets(
  url: string = WEATHER_ASSETS_URL,
  fetchImpl: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<WeatherManifestData> {
  try {
    const resp = await fetchImpl(url)
    if (!resp.ok) throw new Error(`HTTP ${String(resp.status)}`)
    return validateWeatherManifest((await resp.json()) as unknown)
  } catch (err) {
    throw new Error(`weather assets ${url}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

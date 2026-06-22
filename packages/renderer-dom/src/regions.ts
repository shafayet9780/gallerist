// Region mounting (spec §13). The renderer exposes named region hosts; plugins inject Nodes.
// toolbar/footer are additive (many plugins contribute buttons); thumbnails/stage/backdrop are
// exclusive (one owner) — a second claim warns and the last wins.

import type { PluginInstance, RegionCtx, RegionName } from '@visora/core'

export type RegionHosts = Record<RegionName, HTMLElement>

const ADDITIVE: ReadonlySet<string> = new Set(['toolbar', 'footer'])

/** (Re)mount all plugin regions into their hosts. Called once at mount and on plugin changes. */
export function mountPluginRegions(
  hosts: RegionHosts,
  plugins: readonly PluginInstance[],
  ctx: RegionCtx,
): void {
  for (const host of Object.values(hosts)) host.replaceChildren()

  const claimedBy = new Map<string, string>()
  for (const plugin of plugins) {
    if (!plugin.regions) continue
    for (const [name, render] of Object.entries(plugin.regions)) {
      if (!render) continue
      const host = hosts[name]
      if (!host) {
        // RegionName is open-ended in the contract, but the DOM renderer hosts only a fixed set;
        // warn instead of silently dropping the plugin's UI (review S-A2).
        console.warn(
          `[visora] plugin "${plugin.name}" targets region "${name}", which the default renderer does not host`,
        )
        continue
      }
      if (!ADDITIVE.has(name) && claimedBy.has(name)) {
        console.warn(
          `[visora] region "${name}" claimed by multiple plugins; "${plugin.name}" wins over "${claimedBy.get(name)}"`,
        )
        host.replaceChildren()
      }
      host.appendChild(render(ctx))
      if (!ADDITIVE.has(name)) claimedBy.set(name, plugin.name)
    }
  }
}

/** Aggregate a flat keymap across plugins (later plugins win on key conflicts). */
export function aggregateKeymap(
  plugins: readonly PluginInstance[],
): Record<string, (e: KeyboardEvent) => void> {
  const map: Record<string, (e: KeyboardEvent) => void> = {}
  for (const plugin of plugins) {
    if (plugin.keymap) Object.assign(map, plugin.keymap)
  }
  return map
}

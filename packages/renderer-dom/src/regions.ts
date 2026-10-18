// Region mounting (spec §13). The renderer exposes named region hosts; plugins inject Nodes.
// toolbar/footer are additive (many plugins contribute buttons); thumbnails/stage/backdrop are
// exclusive (one owner) — a second claim warns and the last wins.

import type { PluginInstance, RegionCtx, RegionName } from '@gallerist/core'

export type RegionHosts = Record<RegionName, HTMLElement>

const ADDITIVE: ReadonlySet<string> = new Set(['toolbar', 'footer'])

/**
 * Returns a function that mounts the current plugin set's regions into their hosts; call it at
 * mount and on every plugin change. Each plugin's region renderer runs once (its Node is cached per
 * plugin instance, as PLUGIN-AUTHORING promises), and only hosts whose node list changed are
 * touched, so unrelated plugin churn (a React <Gallerist.Overlay> mounting) leaves region DOM,
 * focus and scroll position alone.
 */
export function createRegionMounter(
  hosts: RegionHosts,
  ctx: RegionCtx,
): (plugins: readonly PluginInstance[]) => void {
  const rendered = new WeakMap<PluginInstance, Map<string, Node>>()
  const applied = new Map<HTMLElement, Node[]>()

  return (plugins) => {
    const desired = new Map<HTMLElement, Node[]>()
    for (const host of Object.values(hosts)) desired.set(host, [])
    const claimedBy = new Map<string, string>()
    for (const plugin of plugins) {
      if (!plugin.regions) continue
      let nodes = rendered.get(plugin)
      if (!nodes) {
        nodes = new Map()
        rendered.set(plugin, nodes)
      }
      for (const [name, render] of Object.entries(plugin.regions)) {
        if (!render) continue
        const host = hosts[name]
        if (!host) {
          // RegionName is open-ended in the contract, but the DOM renderer hosts only a fixed set;
          // warn instead of silently dropping the plugin's UI (review S-A2).
          console.warn(
            `[gallerist] plugin "${plugin.name}" targets region "${name}", which the default renderer does not host`,
          )
          continue
        }
        let node = nodes.get(name)
        if (!node) {
          node = render(ctx)
          nodes.set(name, node)
        }
        const list = desired.get(host) ?? []
        if (!ADDITIVE.has(name) && claimedBy.has(name)) {
          console.warn(
            `[gallerist] region "${name}" claimed by multiple plugins; "${plugin.name}" wins over "${claimedBy.get(name)}"`,
          )
          list.length = 0
        }
        list.push(node)
        desired.set(host, list)
        if (!ADDITIVE.has(name)) claimedBy.set(name, plugin.name)
      }
    }
    for (const [host, list] of desired) {
      const prev = applied.get(host)
      if (prev && prev.length === list.length && prev.every((n, i) => n === list[i])) continue
      host.replaceChildren(...list)
      applied.set(host, list)
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

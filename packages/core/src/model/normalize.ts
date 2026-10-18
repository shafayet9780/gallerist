import type { Collection, CollectionInput, Group } from '../types'

/**
 * Normalize the three public front doors (spec §4.2) into one internal Collection.
 * Flat `items` become singleton groups (group.id = item.id); `groups`/`collection`
 * pass through. Validates that every group and item carries a stable, unique string id
 * and that no group is empty (spec §4.4). Input is never mutated.
 */
export function normalize<GM = unknown, IM = unknown>(
  input: CollectionInput<GM, IM>,
): Collection<GM, IM> {
  const doors = (['items', 'groups', 'collection'] as const).filter((k) => input[k] !== undefined)
  if (doors.length === 0) {
    throw new Error('normalize: provide one of { items, groups, collection }')
  }
  if (doors.length > 1) {
    throw new Error(
      `normalize: provide exactly one of items/groups/collection (got: ${doors.join(', ')})`,
    )
  }

  let collection: Collection<GM, IM>
  if (input.collection) {
    collection = { groups: [...input.collection.groups], meta: input.collection.meta }
  } else if (input.groups) {
    collection = { groups: [...input.groups] }
  } else {
    const items = input.items ?? []
    // Flat sugar: each item becomes a singleton group (group.id = item.id). The cast
    // tolerates a runtime-missing id, which validate() reports with a clear message.
    collection = { groups: items.map((it) => ({ id: it.id, items: [it] }) as Group<GM, IM>) }
  }

  validate(collection)
  return collection
}

// Ids must be unique: slides are keyed by group id and `state.loaded` by item id, so a duplicate
// silently orphans slide nodes and shows the wrong media. Groups and items are separate
// namespaces — flat sugar's singleton groups (group.id === item.id) are fine.
function validate(collection: Collection): void {
  const groupIds = new Set<string>()
  const itemIds = new Set<string>()
  collection.groups.forEach((group, gi) => {
    if (!group || typeof group.id !== 'string' || group.id === '') {
      throw new Error(`normalize: group at index ${gi} is missing a stable string id`)
    }
    if (groupIds.has(group.id)) {
      throw new Error(`normalize: duplicate group id "${group.id}" (index ${gi})`)
    }
    groupIds.add(group.id)
    if (!Array.isArray(group.items) || group.items.length === 0) {
      throw new Error(`normalize: group "${group.id}" (index ${gi}) has no items`)
    }
    group.items.forEach((it, ii) => {
      if (!it || typeof it.id !== 'string' || it.id === '') {
        throw new Error(
          `normalize: item at group "${group.id}", index ${ii} is missing a stable string id`,
        )
      }
      if (itemIds.has(it.id)) {
        throw new Error(
          `normalize: duplicate item id "${it.id}" (group "${group.id}", index ${ii}); item ids must be unique across the collection`,
        )
      }
      itemIds.add(it.id)
    })
  })
}

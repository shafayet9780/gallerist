import type { Collection, CollectionInput, Group } from '../types'

/**
 * Normalize the three public front doors (spec §4.2) into one internal Collection.
 * Flat `items` become singleton groups (group.id = item.id); `groups`/`collection`
 * pass through. Validates that every group and item carries a stable string id and
 * that no group is empty (spec §4.4). Input is never mutated.
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

function validate(collection: Collection): void {
  collection.groups.forEach((group, gi) => {
    if (!group || typeof group.id !== 'string' || group.id === '') {
      throw new Error(`normalize: group at index ${gi} is missing a stable string id`)
    }
    if (!Array.isArray(group.items) || group.items.length === 0) {
      throw new Error(`normalize: group "${group.id}" (index ${gi}) has no items`)
    }
    group.items.forEach((it, ii) => {
      if (!it || typeof it.id !== 'string' || it.id === '') {
        throw new Error(
          `normalize: item at group "${group.id}", index ${ii} is missing a stable string id`,
        )
      }
    })
  })
}

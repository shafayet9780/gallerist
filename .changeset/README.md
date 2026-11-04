# Changesets

Add a changeset with `pnpm changeset` for every change that should be released. The Release workflow
(Actions → Release, run by hand) turns pending changesets into a "Version Packages" pull request, and
publishes to npm once that pull request is merged.

## One version for every package

All published `@gallerist/*` packages are in one `fixed` group in `config.json`, so they always share a
version. A new package under `packages/` must be added to that group; `pnpm check:versions` fails if
one is missing.

## Staying on 0.x

While Gallerist is below 1.0, use the bump types like this:

- `patch` for fixes and small additions: 0.3.0 → 0.3.1
- `minor` for new features or breaking changes: 0.3.0 → 0.4.0
- `major` only when 1.0 is planned (see below)

Out of the box, changesets would turn a `minor` into 1.0.0. The plugins, the renderer and the React
adapter list `@gallerist/core` (and the React adapter also lists `@gallerist/renderer-dom`) as a peer
dependency. By default, changesets gives a package a major bump whenever one of its peer
dependencies gets a minor or major bump, and the fixed group then carries every package to 1.0.0.

Two settings prevent that:

- `onlyUpdatePeerDependentsWhenOutOfRange` (under `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH`
  in `config.json`) makes changesets bump a peer dependent only when the new version falls outside
  its peer range.
- The internal peer ranges are `workspace:>=0.3.0 <1` rather than `workspace:^`. Under 0.x, `^0.3.0`
  does not include 0.4.0, so a minor would still fall outside the range. `>=0.3.0 <1` covers every
  0.x minor, and pnpm publishes it as `>=0.3.0 <1`.

The trade-off: npm will not warn a user who installs, say, a 0.5 plugin with a 0.3 core. The fixed
group means we never publish mismatched versions, and the getting-started guide tells users to keep
the packages on one version. If a package comes to depend on something new in core, you can raise the
lower bound of its peer range (for example to `workspace:>=0.5.0 <1`) in the same change; changesets
leaves a range alone while the new version is inside it.

`pnpm check:versions` runs in CI and in the Release workflow before anything is versioned or
published. It fails if the packages' versions differ, or if any version, now or after the pending
changesets, would be 1.0.0 or higher.

## Going to 1.0

When 1.0 is planned: change the internal peer ranges back to `workspace:^`, drop
`onlyUpdatePeerDependentsWhenOutOfRange` (or keep it, now that `^1.0.0` covers the minors), and lift the
1.0.0 limit in `scripts/check-versions.mjs`. Then add a `major` changeset.

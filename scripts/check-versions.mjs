// Guards the 0.x lockstep release of the @gallerist/* packages (see .changeset/README.md).
//
// Fails when:
// - a publishable package is missing from the changesets `fixed` group, or the group names a
//   package that doesn't exist or isn't publishable;
// - the publishable packages don't all share one version, or that version is 1.0.0 or higher;
// - the pending changesets would release a version of 1.0.0 or higher, or different versions.
//
// The last check reads the same release plan `changeset version` would apply, so a changeset
// that would jump to 1.0.0 fails CI on its own pull request, not after the version PR merges.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const errors = []
const fail = (message) => errors.push(message)
const majorOf = (version) => Number(/^(\d+)\./.exec(version)?.[1] ?? Number.NaN)

const publishable = new Map()
for (const dir of readdirSync('packages')) {
  const file = `packages/${dir}/package.json`
  if (!existsSync(file)) continue
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  if (!manifest.private) publishable.set(manifest.name, manifest.version)
}
if (publishable.size === 0) fail('no publishable packages found under packages/')

// Every publishable package moves in the one fixed group, so they always share a version.
const config = JSON.parse(readFileSync('.changeset/config.json', 'utf8'))
const fixed = config.fixed ?? []
if (fixed.length !== 1)
  fail(`.changeset/config.json should have exactly one fixed group, found ${fixed.length}`)
const group = new Set(fixed[0] ?? [])
for (const name of publishable.keys()) {
  if (!group.has(name)) fail(`${name} is publishable but not in the changesets fixed group`)
}
for (const name of group) {
  if (!publishable.has(name)) fail(`fixed group names ${name}, which is not a publishable package`)
}

function checkVersions(label, versions) {
  const distinct = new Set(versions.values())
  if (distinct.size > 1) {
    const list = [...versions].map(([name, version]) => `  ${name} ${version}`).join('\n')
    fail(`${label}: the publishable packages don't share one version:\n${list}`)
  }
  const tooHigh = [...versions].filter(([, version]) => !(majorOf(version) < 1))
  if (tooHigh.length > 0) {
    const list = tooHigh.map(([name, version]) => `${name} ${version}`).join(', ')
    fail(
      `${label}: ${list}. @gallerist/* stays below 1.0.0 until 1.0 is planned (see .changeset/README.md)`,
    )
  }
}

checkVersions('package.json', publishable)

// The release plan, from the copy of @changesets/get-release-plan that @changesets/cli uses
// (a dependency of the CLI, so it is resolved from there rather than added to the root).
const fromCli = createRequire(
  createRequire(import.meta.url).resolve('@changesets/cli/package.json'),
)
const getReleasePlan = fromCli('@changesets/get-release-plan').default
const plan = await getReleasePlan(process.cwd())
const planned = new Map(publishable)
if (plan.changesets.length > 0) {
  for (const release of plan.releases) {
    if (release.type !== 'none' && planned.has(release.name))
      planned.set(release.name, release.newVersion)
  }
  checkVersions(`pending changesets (${plan.changesets.length})`, planned)
}

if (errors.length > 0) {
  for (const message of errors) console.error(`check-versions: ${message}`)
  process.exit(1)
}
const [version] = new Set(publishable.values())
const [next] = new Set(planned.values())
const pending = next === version ? '' : `, pending changesets release ${next}`
console.log(`check-versions: ${publishable.size} packages at ${version}${pending}`)

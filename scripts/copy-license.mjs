// Copies the root LICENSE into the current package dir at pack/publish time so every
// published tarball carries the MIT license text. Invoked from each package's `prepack`
// (cwd = the package being packed). The copied file is git-ignored (see .gitignore).
import { copyFileSync } from 'node:fs'

const root = new URL('../LICENSE', import.meta.url)
copyFileSync(root, new URL(`file://${process.cwd()}/LICENSE`))

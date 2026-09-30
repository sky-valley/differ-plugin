# Contributing

Issues and pull requests are welcome. Use Node 24+ and Python 3. Run `npm ci`
then `npm run check`; tests use temporary files and a local fake HTTP boundary,
not production publications or account credentials.

Change the local helper in `helper/`. Add a behavioral test for a changed
contract, prove it fails, then implement and rerun the affected tests.
`npm run build` regenerates the bundle, licenses and both distributions.
Commit generated changes so a fresh install needs no build.

Skills and examples are snapshots of the public Control MCP skills. To suggest
a skill change, open an issue or include the proposed wording in a pull request
description. A maintainer applies it to Control's canonical skill source,
deploys it, and imports the verified snapshot here with `npm run sync-skills`.
Do not edit the snapshot or invent new hashes to bypass that process.

The two plugin distributions share the same identity and version. The local
package starts Node; the directory package connects to remote MCP. Test both
when changing metadata or packaging. Follow [releases](docs/releases.md) for
versioning and [submission](docs/submission.md) for directory-specific updates.

Your contributions are made under the repository's MIT license. Dependency
licenses are retained in the local plugin's `THIRD_PARTY_NOTICES.txt`.

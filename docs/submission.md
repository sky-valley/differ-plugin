# Directory submission and remaining gates

Researched against the live official documentation on **2026-09-30**. GitHub
release availability is separate from listing acceptance. No directory
submission or account approval is recorded by this repository.

## Package choice

The local marketplace serves `plugins/differ`: Node 24+, local files, a bundled
stdio MCP server, and the verified skill snapshot. The bundle is about 1.4 MiB;
Anthropic's scanner would hold it for review under its 256 KiB non-image file
threshold. It also cannot run as a remote MCP process in a hosted chat.

Both directory submissions should use **`directory/differ`**, generated from the
same version and skills with a single remote MCP URL. No Node dependency install,
local daemon, hooks, app IDs, symlinks, or minified helper enter that package.
The skills select the remote connector when the helper is unavailable. Their
optional runtime/browser checks still need an execution environment and must
never be represented as checks a plain chat host has performed.

## Anthropic

Use the current [developer portal](https://claude.ai/directory/manage), introduced
in the [September 25 announcement](https://claude.com/blog/build-plugins-for-claude).
Do not use the older Claude Code repository's form as the primary process.

Submit a **Plugin bundle** with:

- Repository: `https://github.com/sky-valley/differ-plugin`
- Plugin path: `directory/differ`
- Tracked branch: `main`
- Identity: `differ`, display name `Differ`, publisher `Sky Valley`

The submitting Claude organization's connected GitHub account must have push
access. The repository must be public before publication. Validate the exact
commit, inspect the listing, answer data-handling questions, supply a reachable
contact, and accept the directory terms as an authorized publisher. Submit
Control's remote MCP endpoint separately as an **MCP connector**, as Anthropic
requires for a plugin that references its own server.

Use a push webhook or scheduled directory checks for new commits. Bump the
plugin version for every release. Passing validation does not automatically
publish: reviewer and auto-publish settings control when a passing version goes
live, and the previous approved version remains available meanwhile. Repository
and plugin path cannot be changed after submission.

Sources: [submission and updates](https://claude.com/docs/plugins/submit),
[pre-submission checks](https://claude.com/docs/plugins/pre-submission-checklist),
[connector submission](https://claude.com/docs/connectors/building/submission),
[platform support](https://claude.com/docs/plugins/platform-support),
[marketplace updates](https://code.claude.com/docs/en/plugins/host-marketplace).

The directory checks README length, license, names, regular files, safe paths,
package sizes, script behavior, and secret handling. Local CLI validation covers
formatting only. This repository deliberately keeps build dependencies outside
plugin folders, since a package.json plus lockfile inside a Claude Code plugin
can trigger dependency installation. No binaries or ZIPs live in the submitted
folder; ZIPs are GitHub release assets.

## OpenAI

The current source of truth is [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission).
Its latest flow starts with a ZIP, unlike the older skills-only/With-MCP flow
still described on some migration pages.

Upload `differ-directory-VERSION.zip` at
[OpenAI Plugins](https://platform.openai.com/plugins). It includes the remote
MCP from the first upload; a skills-only listing cannot later add MCP through
the current update flow. Select the verified developer identity, resolve package
and skill scans, verify domain ownership with the portal's exact challenge, and
connect and scan the MCP server. Complete review materials, submit, and publish
the approved version explicitly.

New metadata or skill versions need a new ZIP on the existing listing. Hosted
tool changes are scanned separately, normally daily or through **Rescan**;
eligible changes become available after checks. A rejected tool change can leave
the previous approved schema live. Keep the endpoint stable; changing its URL
requires support under the current process.

Sources: [packaging](https://developers.openai.com/plugins/build/plugins),
[submission](https://developers.openai.com/plugins/deploy/submission),
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines),
[MCP review](https://developers.openai.com/plugins/deploy/app-review),
[Claude migration/local MCP limit](https://developers.openai.com/plugins/guides/submit-claude-plugin).

## Before either submission

These gates require product/account work beyond an installable open-source repo:

1. **Service privacy policy and terms.** No current approved URLs were found in
   the inspected Player source or public landing page. Do not invent URLs or
   present the MIT license or implementation notes as hosted-service terms.
   Add the approved HTTPS URLs to `interfaceFields` in `scripts/build.mjs`, then
   rebuild. OpenAI requires website, support, privacy and terms URLs. Anthropic's
   connector process also needs privacy and support information.
2. **Publisher and domain verification.** The operator selects the correct
   organization, verifies Sky Valley's publishing identity and proves endpoint
   ownership. Portal-generated challenge tokens belong in the selected domain's
   controlled deployment, not in source with fabricated values.
3. **Reviewer access and host testing.** Run the eight proposed cases in
   `submission/review-cases.json` through each intended host. Account cases need
   a dedicated review account, never production-user credentials. Differ uses
   Google sign-in; OpenAI requires reviewer access without interactive MFA/code
   dependencies. Resolve that access with the operator, without weakening auth.
4. **Video.** Record the actual tested workflow and provide its accessible URL
   for OpenAI review. No generated demonstration or local unit test can stand in
   for that recording. Do not expose claim links or credentials in it.
5. **MCP effects and authentication.** `npm run check-service` audits live tool
   annotations and OAuth discovery without writes. Public publishing and
   revisions must be labeled accurately. Metadata discovery alone does not prove
   a host can complete account consent, refresh, or file upload.
6. **Final portal validation and attestations.** Name availability, automated
   scan results, plan eligibility and legal attestations are determined there.
   Neither a passing CI run nor these packages claim approval.

## Facts checked in this extraction

The public service exposes six tools and advertises DCR and S256 PKCE. Its
2026-09-30 audit initially found missing explicit destructive annotations on
read tools and incorrect public-write annotations on the two publishing tools.
The extraction includes a Control correction and a repeatable read-only audit.
Review the current command output rather than assuming an old audit is current.

No account was connected, no review credentials were created, no test post was
published, and no portal attestation was accepted during package extraction.

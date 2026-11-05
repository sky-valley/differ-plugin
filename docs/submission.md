# Directory submission playbook

Differ was submitted to both directories on **2026-11-05**: OpenAI (plugin
`plugin_asdk_app_6aec535cf4988191a435c6fe28e3c998`, package 0.7.6) and
Anthropic (plugin bundle plus MCP connector). This is the path that worked, with
each trap at the step where it bites. Re-read the linked portal docs before the
next submission: both portals changed during that week.

Two commands guard most of it:

- `npm run check` fails the build if the directory package loses anything a portal
  rejected (`scripts/validate.mjs`): mixed MCP auth, the review cases in both
  manifests, an OpenAI category, the four listing URLs, starter prompts and
  Claude's `privacyPolicyUrl`.
- `npm run check-service` checks the live server, read-only: every tool's title
  and annotations, each host's sign-in signal, OAuth discovery and the OpenAI
  domain token. Run it before every submission and after Control changes.

## Package choice

Submit **`directory/differ`** to both directories, never `plugins/differ`. The
local package bundles a stdio MCP server and `scripts/differ.cjs`; Anthropic's
validator holds it for review ("Files or downloads the validator couldn't
inspect", "Local MCP server: not on claude.ai") and OpenAI excludes local MCP.
The directory package has one remote server, `https://publish.getdiffer.com/mcp`,
and no hooks, `.app.json`, dependencies or helper.

Build the ZIP from the exact commit under review (`npm run release` or the
GitHub release). GitHub's automatic "Source code (zip)" is the whole repository:
never upload it.

## One MCP URL, two sign-in conventions

Guest tools (`start_bit`, `publish_bit`, `get_bit`) need no account; the account
tools (`get_profile`, `publish_as_me`, `start_upload_as_me`) need OAuth. The hosts
disagree on how a server asks for sign-in mid-session, so Control answers an
anonymous account-tool call by caller (gdiffer #314):

- **Claude** ([lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication)):
  an HTTP `401` with `WWW-Authenticate`. Claude shows an inline Connect card and
  retries. A `200` error tool result only shows text.
- **ChatGPT and Codex** ([Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth)):
  a `200` error tool result whose `_meta["mcp/www_authenticate"]` names `error`
  and `error_description`, with per-tool `securitySchemes`. OpenAI staff say not
  to rely on a `401` during a tool call. Control picks this path when the
  User-Agent names OpenAI or ChatGPT.

Do not add a second, sign-in-only URL: Claude's directory supports this mix on one
URL ("Required when the server asks").

## OpenAI

Portal: [platform.openai.com/plugins](https://platform.openai.com/plugins).
Docs: [package](https://developers.openai.com/plugins/build/plugins),
[submission](https://developers.openai.com/plugins/deploy/submission),
[errors](https://developers.openai.com/plugins/deploy/submission-errors).

1. **Identity.** Verify the business (Sky Valley Ambient Computing, UK company
   17041955) in organization settings, and choose it as the developer identity on
   upload. Verify the UK company: the privacy policy and terms name it.
2. **Upload** `differ-directory-VERSION.zip` with **Upload new or existing plugin**.
   The package carries, and `npm run check` enforces:
   - `mcp.json` → `mcpServers.differ.extensions["com.openai"].auth`
     `{ "type": "mixed", "client": { "mode": "dcr" } }`. Without it: "Declare
     extensions.com.openai.auth.type for the MCP server". The portal adds
     `baseScopes` from discovery.
   - Review cases (5 positive, 3 negative, from `submission/review-cases.json`),
     `commerce: false`, and `publication.release_notes` under
     `extensions["com.openai"]`, **in both `plugin.json` and
     `.codex-plugin/plugin.json`**. With the cases only in the root manifest, the
     portal imported every field except `prompt` and showed "Test case user prompt
     is required" ([forum](https://community.openai.com/t/plugin-submission-bug-user-prompt-fields-are-empty-despite-valid-prompt-values-in-plugin-json/1412959)).
     Imported cases are read-only in the dashboard; change them in the package.
   - Category **Creativity**. "Productivity" drew "We couldn't confirm the selected
     category". Allowed: Productivity, Creativity, Developer Tools, Business &
     Operations, Data & Analytics, Communication, Education & Research, Security,
     Finance, Healthcare, Travel, Entertainment, Other.
3. **MCPs → Connect.** The panel shows Authentication "Mixed Auth" read from
   `mcp.json`; leave request headers empty (public submission rejects them).
   - **Domain verification**: the portal shows a token. Serve it as plain text at
     `https://publish.getdiffer.com/.well-known/openai-apps-challenge`, then
     **Verify Domain**. It is currently an exact-match `location` in the
     publish.getdiffer.com server block of nginx on the Control VM (outside
     gdiffer's `deploy/pagelike/front-door.conf`); keep it served, because OpenAI
     rescans. `npm run check-service` fails if it disappears.
   - **Connect**, then sign in to Differ and approve the connection in the popup.
     Wait for the tool scan: six tools, no findings.
4. **Review information.**
   - Reviewer credentials: Differ has Google and email-code sign-in and open
     sign-up, but OpenAI requires an account that already exists and needs no
     registration or MFA. Use a dedicated Google account with 2-step verification
     off that has signed in to Differ once and chosen a handle, entered under
     "Username and password". The email-code option (mcp-review@theaicompany.org)
     only works if that inbox's person and handle exist beforehand, which Control
     cannot create.
   - Video walkthrough URL (required): an accessible recording of the guest
     publish, update and connected-draft cases. Keep claim links and passwords
     off screen.
5. **Submit for review**, accept the attestations, and **Publish plugin** after
   approval. Only one review can be active; don't upload a new ZIP mid-review.

Later: hosted tool changes are rescanned daily (or **Rescan**) without a new ZIP;
metadata or skill changes need a new ZIP and review. The MCP URL can't change
without OpenAI support.

## Anthropic

Portal: [claude.ai/directory/manage](https://claude.ai/directory/manage). Docs:
[plugin submission](https://claude.com/docs/plugins/submit),
[connector submission](https://claude.com/docs/connectors/building/submission),
[authentication](https://claude.com/docs/connectors/building/authentication).

1. **Plugin bundle**: repository `https://github.com/sky-valley/differ-plugin`,
   plugin path **`directory/differ`**, branch `main`. The repository and path can't
   change after submission. The validator follows `.claude-plugin/marketplace.json`
   (which points at the local package) if the path is left to it.
   Expected notes, not holds: "agent-plugins manifest detected" (the root
   `plugin.json` is OpenAI's) and the privacy URL, which
   `.claude-plugin/plugin.json` carries as `privacyPolicyUrl`.
2. **MCP connector** for the same server, required for a plugin that references
   its own server:
   - Connection: Universal URL `https://publish.getdiffer.com/mcp`.
   - Authentication requirement: **Required when the server asks**; method OAuth;
     client **Register automatically** (DCR). Control doesn't advertise CIMD, so
     "Claude's published identity" won't work.
   - Every tool needs a `title` and annotations (Control sets them).
   - Test in Claude first: add a custom connector with "Sign in when needed".
     A connector's auth setting can't be edited later; remove and re-add it.

## Releasing

Bump the version for any change to installed bytes (`check-release-change`
enforces it on main). Tag the exact commit whose package is under review, not a
later main: `v0.7.6` is on the #29 merge, while main had moved to 0.8.x. Merging
and tagging are separate, explicit steps; the release workflow publishes the
ZIPs and `SHA256SUMS`.

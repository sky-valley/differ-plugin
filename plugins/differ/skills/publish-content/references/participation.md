# Shared participation

Keep posts passive unless shared state serves the experience. For participation,
ship ordinary HTML/CSS/JS plus a root `rules.html`. This opts the post into
pagelike: HTML documents, selectors, HTTP mutations, composition and live SSE.
No Node process or external database is needed. Runtime paths are reserved:
`/-/` is the participation bridge and management surface, `/v/` selects an
authored version, `/data/` is live data and `/uploads/` is participant media.

Keep app code and rules outside `data/`. A `data/*.html`, `.json` or `.txt`
file in the bundle is a seed, applied once to that path. Revisions keep existing
participation, including deleted seeds. A diff starts fresh from the selected
authored files, rules and seeds. Never download live visitor data into a diff.
Use relative authored asset URLs to stay on the selected version; root URLs
address the current post. Live data always uses root `/data/...` URLs.

Load `<script src="/-/client.js"></script>`. On load, call
`await pagelike.identity()` to quietly restore a returning participant's opaque
post identity, including on another device signed into the same account. It
returns `null` for first-time or signed-out visitors and when identity is
unavailable, without a popup. Use the returned identity to read and mark their
existing entries; restoration never adds a contribution. Keep public reads and
local play usable while it resolves. Do not infer ownership from localStorage.

When someone explicitly chooses
to contribute, call `await pagelike.participate()`. Player handles sign-in and
participation, and the runtime sets its host-only HttpOnly partitioned cookie. The
result is an opaque identity string stable within this post. No email,
handle or cross-post identity is disclosed. Then use same-origin `fetch`:

```js
await pagelike.participate();
const entry = document.createElement('li');
entry.textContent = answer;
const response = await fetch('/data/answers.html', {
  method: 'POST',
  headers: { 'Content-Type': 'text/html', Range: 'selector=#answers' },
  body: entry.outerHTML,
});
if (!response.ok) throw new Error('Your answer could not be saved.');
```

Seed `data/answers.html` with `<ul id="answers"></ul>`. Grant only the writes
the experience needs in `rules.html`, for example:

```html
<div itemscope itemtype="https://pagelove.org/AuthorizationRule">
  <meta itemprop="actor" content="*">
  <meta itemprop="resource" content="/data/answers.html">
  <meta itemprop="method" content="GET">
  <meta itemprop="action" content="Allow">
</div>
<div itemscope itemtype="https://pagelove.org/AuthorizationRule">
  <meta itemprop="actor" content="users">
  <meta itemprop="resource" content="/data/answers.html">
  <meta itemprop="method" content="POST">
  <meta itemprop="selector" content="#answers">
  <meta itemprop="action" content="Allow">
</div>
```

Ordinary GET is public by default, but SSE subscriptions are not. The explicit
GET grant above enables anonymous `EventSource('/data/answers.html')`. Fetch a
snapshot initially and again on `open`, `mutation`, `reset` and browser `online`.
Refresh the writer after a successful write; its own event may be suppressed.
Serialize/coalesce refreshes so an older response cannot replace a newer one.
Show read/write failures. A participant never gets permission to rewrite app
code or rules. Removing the POST grant closes new participation without deleting
existing answers. Include `data/` documents using `p:include`, or fetch them.

Permissions follow the brief. A collection usually permits adding and built-in
own-removal; a deliberately collaborative board can permit selector-scoped
PUT/DELETE over others' entries. Whole-resource replacement is broader authority.
POST alone does not prove ownership: application-supplied identity fields must
be checked against the trusted request identity on the server. A browser's
localStorage ID, disabled button or ownership-looking selector is insufficient.

Shared HTML is inert. Each submitted top-level element receives a platform
contribution marker; do not supply that marker yourself. Scripts, event handlers,
styles, template expressions and runtime configuration are rejected. Escape user
text with DOM APIs. Closed shapes must permit `data-contribution-id` on contributed
elements because the platform adds it before shape validation; submitted markers
remain forbidden. JSON and plain text replace complete resources. Images in
`/uploads/` must be JPEG, PNG or GIF: at most 10 MiB and 16 megapixels. They are
decoded and re-encoded without metadata; GIF uploads become a still first frame.
Other uploads are rejected. Data requests are at most 512 KiB. Each post is
limited to 10,000 live documents, 256 MiB of live data and 100,000 recorded
contributions. These are initial operating limits, not a scaling promise.

`data-contribution-id` identifies one contribution, not its author. It changes
on each contribution. Do not group votes by this marker or guess an author
attribute from the stored HTML; the vote example binds its own identity field
to `Context.request.auth.username` before accepting it.

Player's **Your participation** opens `/-/manage`: visitors remove their own
contributions and report concerns; the creator can moderate all contributions.
A contribution containing later nested participation requires creator moderation
so withdrawing it cannot silently erase other people's additions. Contributors
may remove their work after new participation closes. Replacing a whole uploaded
resource ends the earlier contribution's removal authority over that path.

Browse and local interaction continue during an identity outage; shared writes
fail with an actionable error. Logging out revokes the runtime sessions created
by that browser login. Browser copies may survive post removal, but the platform
stops delivering the removed post and accepting its writes.

## Complete example and rehearsal

Read [the changeable-vote example](examples/vote/README.md). It includes every
publishable file and executable checks, not just a grant fragment. Its trigger
rejects forged identities and multi-entry payloads; the UI counts each identity's
latest remaining choice. Copy and adapt the complete contract, including tests.
For different authority, use [the photo collection](examples/collection/README.md)
or [the deliberately shared wall](examples/board/README.md). These are examples,
not mandatory categories or interchangeable permission templates.

The skill also serves `scripts/runtime.mjs`, a dependency-free Node rehearsal
fixture. Set `PAGELIKE_BINARY` to a built pagelike executable, then run
`node <skill-directory>/examples/vote/check.mjs`. It starts a fresh loopback runtime
with separate anonymous, Alice, Bob and creator identities and removes its data
afterward. Adapt the example's checks to your post's real payloads and promises;
a passing vote check does not certify an unrelated post. Run browser checks too.
The collection and board each provide `check.mjs` with actual browser interactions;
install Playwright in the checking workspace, or set `PLAYWRIGHT_MODULE` to its
absolute `index.mjs`, and run the chosen example's check with `PAGELIKE_BINARY`.
Hosts without a filesystem can read all files through MCP resources. If they
cannot run the runtime, report participation as unverified and provide the
bundle and checks for a capable host; do not claim a static preview proved it.
If `PAGELIKE_BINARY` or browser tooling is unavailable, stop that verification
step and report the missing dependency. Do not search unrelated projects or
substitute a mock runtime as authorization evidence.

Analysis and diff previews use disposable one-hour origins, but all visitors there
share one authenticated preview identity. They cannot prove anonymous access or
cross-person authorization. The rehearsal tests the runtime with fixture identity;
Player sign-in, consent and browser cookie behavior need separate verification.
Publication means the bundle was accepted, not that these checks passed.
Do not add product analytics or paid worker calls.

# Shared participation

Keep bits passive unless shared state serves the experience. For participation,
ship ordinary HTML/CSS/JS plus a root `rules.html`. This opts the bit into
pagelike: HTML documents, selectors, HTTP mutations, composition and live SSE.
No Node process or external database is needed. Runtime paths are reserved:
`/-/` is the participation bridge and management surface, `/v/` selects an
authored version, `/data/` is live data and `/uploads/` is participant media.

Keep the bit's code and rules outside `data/`. A `data/*.html`, `.json` or `.txt`
file in the bundle is a seed, applied once to that path. Seeds need the root
`rules.html`: a bundle with files under `data/` and no `rules.html` is refused
(`data_without_rules`). New versions keep existing
participation, including deleted seeds. A diff starts fresh from the selected
authored files, rules and seeds. Never download live visitor data into a diff.
Use relative authored asset URLs to stay on the selected version; root URLs
address the current bit. Live data always uses root `/data/...` URLs.

Load `<script src="/-/client.js"></script>`. On load, call
`await pagelike.identity()` to quietly restore a returning participant's opaque
bit identity, including on another device signed into the same account. It
returns `null` for first-time or signed-out visitors and when identity is
unavailable, without a popup. Use the returned identity to read and mark their
existing entries; restoration never adds a contribution. Keep public reads and
local play usable while it resolves. Do not infer ownership from localStorage.

When someone explicitly chooses
to contribute, call `await pagelike.participate()`. Differ handles sign-in and
participation, and the runtime sets its host-only HttpOnly partitioned cookie. The
result is an opaque identity string stable within this bit. No email,
handle or cross-bit identity is disclosed. Then use same-origin `fetch`:

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
Show read/write failures. A participant never gets permission to rewrite the bit's
code or rules. Removing the POST grant closes new participation without deleting
existing answers. Include `data/` documents using `p:include`, or fetch them.

Permissions follow the brief. A collection usually permits adding and built-in
own-removal; a deliberately collaborative board can permit selector-scoped
PUT/DELETE over others' entries. Whole-resource replacement is broader authority.
POST alone does not prove ownership: bit-supplied identity fields must
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
Other uploads are rejected. Data requests are at most 512 KiB. Each bit is
limited to 10,000 live documents, 256 MiB of live data and 100,000 recorded
contributions. These are initial operating limits, not a scaling promise.

`data-contribution-id` identifies one contribution, not its author. It changes
on each contribution. Do not group votes by this marker or guess an author
attribute from the stored HTML; the vote example binds its own identity field
to `Context.request.auth.username` before accepting it.

Differ's **Your participation** opens `/-/manage`: visitors remove their own
contributions and report concerns; the creator can moderate all contributions.
A contribution containing later nested participation requires creator moderation
so withdrawing it cannot silently erase other people's additions. Contributors
may remove their work after new participation closes. Replacing a whole uploaded
resource ends the earlier contribution's removal authority over that path.

Browse and local interaction continue during an identity outage; shared writes
fail with an actionable error. Logging out revokes the runtime sessions created
by that browser login. Browser copies may survive bit removal, but the platform
stops delivering the removed bit and accepting its writes.

## What shared state can do

Use this to choose a design and to show the human what they could ask for.
Offer the options that serve their idea, not the whole list.

- **Kinds of shared state**: a collection people add to (answers, photos,
  places), one choice per person (votes, picks, guesses), a shared surface
  anyone may rewrite (a board, a story), and state only the creator changes
  (an answer, a round, a winner).
- **Server-enforced rules**: who may write what, one entry or N entries per
  person, length or value limits, a creator-controlled open/closed switch.
- **The creator's controls** inside the bit: reveal an answer, close or reopen
  a round, pin a winner, clear a document. Nobody else can use them.
- **Pages rendered from live data**: counts, tallies or a reveal computed on
  the server, and views only the creator sees.
- **Photos** people upload, and live updates for everyone watching.
- **Lifecycle**: updates keep everything people added; a new round is a new
  document in an update; closing participation keeps what is there; a diff
  starts empty.

It cannot send notifications or email, show participants' names or handles
(people type a name if the bit asks), keep secrets, call paid or model APIs,
reach other servers, or run anything on a schedule. Don't rely on
server-side clock checks: close a round with the creator's switch or an
update. Participation is per bit.

## The creator's controls

The actor `role:moderator` is the bit's creator when they open it signed in
on Differ. Grant them what visitors lack:

```html
<div itemscope itemtype="https://pagelove.org/AuthorizationRule">
  <meta itemprop="actor" content="role:moderator">
  <meta itemprop="resource" content="/data/state.html">
  <meta itemprop="method" content="PUT">
  <meta itemprop="action" content="Allow">
</div>
```

Seed `data/state.html`, for example `<div id="state" data-open="yes"></div>`,
and have the creator replace it with a selector-scoped `PUT`
(`Range: selector=#state`) to reveal an answer or close a round. A `PUT` of
a whole document (no Range) clears it, for example to empty a board. Show the
controls only when `await (await fetch('/-/me')).json()` has
`moderator: true`; the rule, not the hidden button, is what protects them.
Everyone watching gets the change live. Give the creator only what the
brief reserves for them; what it gives participants (marking their own find
returned, editing their own entry) stays theirs.

Authored files and seeds are public, so a secret never goes in the bundle.
The creator can type it in later instead: deny public reads of its document,
let `role:moderator` `GET` and `PUT` it, and render it on the server only
once revealed (see below):

```html
<p r:answer="#answer" r:shown="#state[data-revealed=yes]" p:template="text/liquid">
  {% if shown.size > 0 or request.auth.roles contains "moderator" %}{{ answer | first }}{% else %}Revealed on Friday{% endif %}
</p>
```

with `data/secret.html` seeded as `<p id="answer"></p>`, a rule with actor
`*`, method `GET` and action `Deny` on it, and `data/state.html` as the
creator's switch.

## Rules the server enforces

A rule in `rules.html` says who may write; a Trigger checks each write and
can refuse it with a status and a message the bit shows. These run on the
server, so a modified browser cannot skip them. One Trigger can check
identity, shape, length, a per-person quota and the creator's switch:

```html
<div itemscope itemtype="https://pagelove.org/Trigger">
  <meta itemprop="resource" content="/data/lines.html">
  <meta itemprop="method" content="POST">
  <div itemprop="action" itemscope itemtype="https://pagelove.org/Sessel">
    <script itemprop="source" type="text/sessel">
      @schema Context url("https://pagelove.org/Context");
      @schema HTTPResponse url("https://pagelove.org/HTTPResponse");
      let me = Context.request.auth.username;
      let body = Document.parse("<div>" + Context.request.body + "</div>");
      if (body.children().count() != 1 || body.${li}.count() != 1) {
        throw new HTTPResponse { status: 422, message: "Add one line." }
      }
      let line = body.children().first();
      if (line.attr("data-by") != me) {
        throw new HTTPResponse { status: 403, message: "Write only as yourself." }
      }
      if (line.text().count() > 140) {
        throw new HTTPResponse { status: 422, message: "Keep it under 140 characters." }
      }
      if ((${li} from "/data/lines.html").filter(l => l.attr("data-by") == me).count() >= 2) {
        throw new HTTPResponse { status: 429, message: "Two lines each." }
      }
      if ((${#state[data-open="no"]} from "/data/state.html").count() > 0) {
        throw new HTTPResponse { status: 403, message: "This round is closed." }
      }
    </script>
  </div>
</div>
```

The client sends `data-by` set to its `pagelike.participate()` identity; the
Trigger refuses any other. Enforce on the server every limit the page
promises, or a signed-in person can bypass it with a plain request. Some
checks that come up often:

- Text that must be real: `let text = line.text().trim();` then refuse
  `text.isEmpty()`, and `text.contains("\n")` for one line.
- Ids the client picks: refuse one that exists, or a second entry can take
  over the first:
  `(${li} from "/data/finds.html").filter(l => l.attr("id") == line.attr("id")).count() > 0`.
- One entry each: a quota of 1 as above. For a changeable choice, let the
  page count each person's latest entry, as the vote example does.

Add a ShapeConstraint, as in the vote example, to permit only the element
shapes the bit uses. Show the message from a refused write's error document
to the person.

## Pages rendered from live data

Authored HTML pages are composed on the server on every request. Declare
`xmlns:p="https://pagelove.org/1.0"` and
`xmlns:r="https://pagelove.org/Binding/CSS"` on `<html>`. `r:name="selector"`
binds every matching element in the bit's documents; `p:template="text/liquid"`
renders the element's content with Liquid; `<p:include selector="#x"
resource="/data/x.html"></p:include>` splices one element in:

```html
<p r:guesses="#guesses > li" p:template="text/liquid">{{ guesses.size }} guesses so far</p>
<p p:template="text/liquid">{% if request.auth.roles contains "moderator" %}You made this bit.{% endif %}</p>
```

Bindings read every document, even one whose public GET a rule denies, so a
page can show a count of entries nobody can read directly, or reveal them only
to the creator. Escape participants' text with `| escape`. Server rendering
happens on load; for live changes, subscribe with `EventSource` and refetch.

## After publishing

No tool reads, edits, resets or exports a published bit's live data for you.
You can read a publicly readable document at
`https://<bit>.differ.page/data/<name>`. To change live data, offer the human:

- **Spam or a wrong entry**: as the creator, remove it in the bit's
  **Your participation** (`/-/manage`); anyone removes their own there.
- **Something the creator does again and again** (reveal, close, reset, pick
  a winner): a creator control in the bit, added by an update.
- **A fresh round on the same bit**: an update whose code reads and writes a
  new document, seeded as a new path such as `data/december.html`. The old
  round stays readable, so the bit can show last round's result. Changing an
  existing seed does nothing: a seed applies once per path.
- **Stop new entries**: an update without the write grant, or the creator's
  switch. Existing entries stay.
- **A different activity, or empty data under a new link**: a diff.

## pagelike's own documentation

The runtime is pagelike, a PageLove-compatible server. Its docs, starting at
`https://sky-valley.github.io/pagelike/llms.txt`, specify Sessel, composition,
Liquid and schemas in depth under `https://sky-valley.github.io/pagelike/spec/`
(`sessel/`, `composing/`, `liquid/`, `modeling/`). On Differ, this reference
wins where they differ: there is no WebDAV, sign-in route, local account or
authoring key; data is inert; only Differ's identity and the actors above
exist; and uploads follow the limits here. Rely on anything else from there
only once a rehearsal shows it works.

## Complete example and rehearsal

### The example code

The examples' code and the rehearsal scripts (`scripts/` and every `.mjs`,
`.js` and `.html` file under `examples/`) are part of this skill when Differ
serves it over MCP, as `skill://publish-content/...` resources. Plugin copies
of this skill carry its instructions only, since plugin directories accept
nothing else. There, read the code through the Differ connector's resources, or
in `https://app.getdiffer.com/agent/participation-examples.json`, which holds
the same files' text with each one's SHA-256. Paths below that name a `.mjs`,
`.js` or `.html` file mean those files.

Read [the changeable-vote example](examples/vote/README.md). It includes every
publishable file and executable checks, not just a grant fragment. Its trigger
rejects forged identities and multi-entry payloads; the UI counts each identity's
latest remaining choice. Copy and adapt the complete contract, including tests.
For different authority, use [the photo collection](examples/collection/README.md)
or [the deliberately shared wall](examples/board/README.md). These are examples,
not mandatory categories or interchangeable permission templates.

The skill also serves `scripts/runtime.mjs`, a dependency-free Node rehearsal
fixture. Where your copy of the skill has it, set `PAGELIKE_BINARY` to a built
pagelike executable, then run `node examples/vote/check.mjs` from the skill
directory. It starts a fresh loopback runtime
with separate anonymous, Alice, Bob and creator identities and removes its data
afterward. Its browser transport serves the Differ SDK at `/__differ/sdk.js` and
puts it first in every page, as the content Worker does, so the global `differ`
is there. Adapt the example's checks to your bit's real payloads and promises;
a passing vote check does not certify an unrelated bit. Run browser checks too.
The collection and board each provide `check.mjs` with actual browser interactions;
install Playwright, or set `PLAYWRIGHT_MODULE` to its
absolute `index.mjs`, and run the chosen example's check with `PAGELIKE_BINARY`.
A copy without the scripts, or a host without a filesystem, cannot rehearse:
build from the examples you read, report participation as unverified, and
provide the bundle and its checks for a capable host; do not claim a static
preview proved it.
If `PAGELIKE_BINARY` or browser tooling is unavailable, stop that verification
step and report the missing dependency. Do not search unrelated projects or
substitute a mock runtime as authorization evidence.

Analysis and diff stages use disposable one-hour origins, but all visitors there
share one authenticated stage identity. They cannot prove anonymous access or
cross-person authorization. The rehearsal tests the runtime with fixture identity;
Differ sign-in, consent and browser cookie behavior need separate verification.
Publication means the bundle was accepted, not that these checks passed.
Do not add product analytics or paid worker calls.

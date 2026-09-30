# The afternoon question

A complete ordinary HTML/JS post: tea or coffee, with one effective choice per
signed-in identity, changeable over time. Uses the managed identity SDK, with no generated rules or external
database. Publish only `examples/vote/content/`.

Read `examples/vote/content/index.html`, `app.mjs`, `vote.mjs`, `rules.html` and
`data/votes.html`. Paths after the first are relative to that content directory.
MCP hosts can read each as `skill://publish-content/examples/vote/content/<path>`.

The client appends a choice. The authored trigger checks every submitted entry
against `Context.request.auth.username`, rejects multiple/nested entries, and
restricts choices. The browser counts the latest remaining choice for each
trusted identity. Repeated clicks do not increase that identity's effective
vote. This is one vote per identity, not a guarantee about physical people.

On load, `pagelike.identity()` quietly restores an existing post identity. The
UI then marks its latest remaining choice before any click. A new or signed-out
visitor stays anonymous. Opening does not append a vote; `participate()` and
the write remain in the button handler.

History is deliberate: removing the latest choice reveals an earlier remaining
one. Player's Your participation removes individual contributions; removing all
of your choices leaves no vote. The creator can moderate contributions. The UI
states these semantics. If your brief requires different withdrawal semantics,
change and verify the model rather than copying it silently.

`examples/vote/check.mjs` submits the actual UI's `voteRequest` payloads to a
fresh pagelike hosting process through `scripts/runtime.mjs`. It checks anonymous
reads and an actual SSE mutation, two identities, changes, forgery, multi-entry
payloads, whole replacement, cross-person removal, own-removal and moderation.
Run with Node 24+ and `PAGELIKE_BINARY=/absolute/path/to/pagelike`.

Also run `node examples/vote/check-browser.mjs` with that variable and Playwright
installed (or `PLAYWRIGHT_MODULE` pointing to its `index.mjs`). It verifies an
existing choice appears before interaction, opening adds no vote, and a
deliberate change updates the choice. It uses fixture identity with the real
runtime; the platform's separate integration verifies restoration across logins.

These checks have a specific contract. For a new activity, adapt its checks and
prove them against deliberately defective variants before trusting green output.
Browser and Player login checks remain separate. Never point mutation tests at
production posts.

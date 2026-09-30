# Publishing with the Differ helper

The helper is the Differ plugin's local bridge. Use its tools, or run the
bundled Node 24+ script: `node <skill-directory>/../../scripts/differ.cjs <command>`.
To install it, read [setup](references/setup.md).

1. `publisher_status` / `doctor` reports guest or connected creator mode.
2. `check_content` / `check APP` selects `content/` or root `index.html` and
   validates static files, explicitly reporting participation as unverified.
   Read `references/participation.md` and use its complete example and real
   runtime checks for shared state. Resolve the named app, not the repository. Keep
   source notes, recordings and credentials outside the content directory.
3. `preview APP` serves a local static snapshot and refuses stateful bundles.
   It cannot test participation. Restart after edits. Review phone and
   desktop sizes, reach the payoff and test recipient state. Image conversion
   candidates (`image_candidate`) are optional; compare them before adopting.
4. `publish_directory` / `publish APP` packages files, saves the request before
   mutation, publishes and stores the receipt. Titles default to the saved or
   HTML title.
5. Return the result as the skill's rules require.

## Connecting an account

When asked to sign in, `connect_account` / `connect` returns a browser link and
verification code. Give both to the human; they sign in with Google, choose a
handle and approve. Then use `connection_status` / `connection-status`,
respecting its retry delay. Differ issues separate, revocable publishing
credentials, saved privately in `~/.config/differ/publisher.json` (mode 600);
no credential belongs in chat, Git, command arguments or public bindings.
A claimed post refuses its guest upload pass: connect its owner to revise it
from the same directory. `disconnect_account` / `disconnect` is an explicit
user choice; it revokes this connection before returning future publishing to
guest mode. Manage other connections at https://player.getdiffer.com/connect.

Unrecognized configurations fail closed: `connect` to publish as yourself, or
deliberately `disconnect` for guest mode. A connection saved for another
publisher stops with target_changed: run `connect` again.

## Saved state

Keep public `differ-post.json` with source; it is a reference, not editing
permission. Keep private `.differ/state.json` locally for ownership and retries,
never in Git or uploaded assets. On uncertainty run `publication_status` /
`status DIR`, then retry unchanged. Never delete pending state to retry.
Conflicts require comparing the current post (`get_post` / `get-post ID`);
`bind DIR --post ID` deliberately rebases after review. `--new` starts an
unrelated post only when requested.

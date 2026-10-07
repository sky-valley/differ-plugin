# Publishing contract

The local bridge exposes publisher_status, check_content, publish_directory,
publication_status, get_post, connect_account, connection_status and
disconnect_account, plus optional media helpers. It transfers local asset bytes
without making the model transcribe them. Copied player prompts retain their
reserved post/upload pass; do not replace them with a fresh plugin publication.

Control is the publisher. The helper addresses https://publish.getdiffer.com, or
DIFFER_PUBLISH_URL (HTTPS, or loopback HTTP for a local Control); saved
configuration never chooses it. Publishing errors are {code, message}; OAuth
errors are {error, error_description}. The helper reports both as code and
message and adds its own recovery.

## Guest and connected publishing

A guest post starts with POST /v1/publishing/posts/{id}/reservation
{ownerProof}: a fresh UUID and 64 lowercase hex characters, saved before the
request so a lost response is recovered by reserving again. Control stores
hashes and derives the upload pass from the proof. Its 201 creation returns the
pass, the private claim link and the deadline. The helper keeps the link in its
private journal and shows it; it never builds one.

POST /v1/publishing/posts/{id}/versions carries Authorization: Bearer with the
guest upload pass or the connected account's access token. The body is
{requestId, title, expectedRevisionId (null first), files [{path, base64
content}]}, plus parentPostId and parentRevisionId for a diff. The post id and
credentials never travel in it. A connected account creates a post by publishing
to a fresh UUID and revises only posts it owns. GET
/v1/publishing/posts/{id}/operations/{requestId} with the same bearer returns
the saved receipt, or state unknown: retry the exact saved request.

Same request/payload returns the saved upload receipt; changed content
or stale revision conflicts. Control stores each file once by SHA-256, then saves
a complete manifest and a draft or published version. A 4xx refuses a request before
anything commits, so the helper drops it. reconnect_required and upload_busy can
follow an earlier attempt that did commit; those, network failures and 5xx keep
the request for status and an exact retry.

A live receipt contains post/revision IDs, public and revision URLs,
artifactId and runtime URL; unclaimed receipts include the deadline. Connected
helper uploads instead return `draft: true`, a draft preview/publish `url`, the
pending `revisionId`, and an expiry, with no public runtime or revision URL.
The next upload uses that pending revision as `expectedRevisionId`. The helper
reports drafts as unpublished and skips public-content verification. It does
not send `publish: true`; the human publishes from the returned draft page.
The remote connector supports that flag when explicitly asked to skip preview.
artifactId
is the lowercase SHA-256 of compact UTF-8 JSON
`{"files":{"path":"sha256 of file bytes"}}`, with paths sorted lexically. The
helper computes that same manifest digest to recognize unchanged content.

## Claims and ownership

GET /v1/publishing/posts/{id} is public: {id, ready, claimed, expiresAt, url,
post}; post names its owner's username only once claimed. No public binding,
post, feed, runtime or URL grants ownership. Opening the claim link claims
nothing; the player's verified sign-in binds the post to that person's handle,
keeps all post/revision IDs and ends the guest pass. Later guest versions are
refused (owner_conflict); an exact earlier request still returns its receipt.

A connected account is its handle: GET /v1/publishing/account returns
{username}. The helper revises a guest draft as the account once the post is
claimed under that username, and stops before upload when another creator owns
it. Connecting claims nothing: unclaimed guest drafts keep using their pass.

## Connections

The stdio bridge uses the OAuth device flow for deliberate browser approval:
POST /oauth/device (client_id differ-plugin, resource <publisher>/mcp, scope
"profile posts:write"), POST /oauth/token with the device_code grant and then
refresh_token grants, and POST /oauth/revoke on disconnect. Tokens are opaque;
access lasts 15 minutes and a connection 30 days. Refresh tokens rotate and a
replayed one revokes the connection. Concurrent refresh is serialized locally.

The private mode-600 config holds {url, mode, accessToken, refreshToken,
expiresAt, accountUsername}. No tokens appear in receipts or normal tool output.
A token Control refuses (401 reconnect_required) stops publishing; the helper
never falls back to guest. A connection saved for another publisher, including
one made before Control published, fails with target_changed: run connect.
Disconnect revokes the grant before selecting guest mode. The player /connect
page can revoke other connections.

Remote MCP at <publisher>/mcp offers start_creation, publish_creation,
get_creation, get_profile and publish_as_me. Guest tools use bounded per-post
capabilities. Protected tools advertise OAuth scopes and return MCP authorization
challenges. Discovery uses RFC 9728 and OAuth authorization-server metadata,
exact registered redirects, authorization code + S256 PKCE, resource validation,
and revocation. Dynamic client registration is supported for current host
interoperability; client metadata documents (CIMD) are not yet supported.
Production host acceptance still needs testing in each host; this is not a claim
of App Directory approval or mobile file access.

## Durable local state

Keep differ-post.json with source: version, publisher, postId, revisionId and
optional title. This public binding is excluded from uploads and does not grant
editing permission. Keep .differ/state.json private: it contains the guest proof,
upload pass and claim link, requests, receipts and prior post handoffs when
intentionally starting new posts. Never delete uncertain pending state.
Destination and account changes stop; bind is deliberate conflict recovery after
reviewing the latest revision. Bindings and journals made for another publisher
stop with target_changed.

Shared-token publishing and its upload/configure routes are removed. Only guest
capabilities and connected creator grants authorize publication. Unsupported
saved configurations fail closed instead of silently changing identity.

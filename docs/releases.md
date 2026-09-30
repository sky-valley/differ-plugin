# Maintaining releases

The source repository is `sky-valley/differ-plugin`. The `main` branch holds
complete installable packages. Work on a `codex/` or contributor branch, open a
pull request, and run CI before merging. Do not force-push shared history.

## Change and verify

1. Change helper source, metadata or documentation. For skills, have Control's
   maintainer apply the change to its canonical source and deploy it first.
2. For a skill update, run `npm run sync-skills` from the repo root. This fetches
   the public MCP skill manifest and verifies every file's size and SHA-256.
   `npm run check-skills` checks the local lock against the live service without
   rewriting anything. Normal CI uses the committed snapshot and needs no
   production credentials or live service.
3. Run `npm run version -- X.Y.Z`, update `CHANGELOG.md`, and run `npm run check`.
   This rebuilds both distributions and tests archive contents, relocation,
   publishing/retry contracts against local fixtures, and snapshot integrity.
4. Commit source and generated packages together. CI repeats the build and
   refuses a generated diff. `directory/differ` is generated; never edit it.
5. Run `npm run release` to inspect the two ZIPs and SHA-256 checksums in `dist/`.

## Publish a GitHub release

After the change is merged into main and CI passes:

```sh
git switch main
git pull --ff-only
git tag vX.Y.Z
git push origin vX.Y.Z
```

The release workflow checks that the tag matches `package.json` and is on main,
rebuilds and tests, and publishes the ZIPs plus `SHA256SUMS` as a GitHub release.
Never move a published tag. Verify the release workflow and downloadable assets.
This publishes open-source distribution files, not a post or directory listing.

## Refresh skills through GitHub

The **Sync Control skills** workflow accepts the next semantic version. It reads
the public MCP endpoint, verifies the snapshot, rebuilds and tests, and pushes a
branch for review, with a compare link in the workflow summary. Open the pull
request from that link, using `.github/skill-sync-body.md` as its description.
It does not merge or release itself. Sky Valley's organization policy currently
disallows Actions from creating pull requests; this workflow respects that
policy instead of requiring a personal token or changing organization settings.
No Control credentials are needed. If there is no skill change it exits without
creating a branch or consuming a version.

## Update the directories

Anthropic follows `directory/differ` on the submission's tracked branch. Push
updates trigger or await scans; reviewer/auto-publish settings control release.
OpenAI package updates require uploading the new directory ZIP to the existing
listing and publishing after approval. It scans hosted MCP tools separately.

Always consult [the dated submission guide](submission.md) and refresh the live
official documentation before changing this process. A GitHub release is not
evidence that either directory has accepted an update.

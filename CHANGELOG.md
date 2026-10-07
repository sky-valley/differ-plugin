# Changelog

## 0.6.0

- Call them diffs: a post made from someone's published post is a diff, in the
  skills, the helper's messages and the docs (gdiffer decision 0109).
- The helper's problem code for a half-named parent is now `invalid_diff`
  (was `invalid_remix`).
- Refresh both distributions from Control's verified public skill snapshot.

## 0.5.1

- Teach posts to restore returning participants on open with
  `pagelike.identity()`, while keeping first-time and signed-out viewers anonymous.
- Show an existing choice in the vote example before another click, and include
  a browser check that opening the example writes no contribution.
- Refresh both distributions from Control's verified public skill snapshot.

## 0.5.0

- Extract the creator plugin into its own public, MIT-licensed repository.
- Preserve the local helper and generate a remote MCP distribution for directory
  submission from the same verified skills.
- Add host metadata, the Differ icon, dependency notices, reproducible release
  ZIPs, CI, and a skill-refresh review-branch workflow.
- Document installation, updates, data handling and current submission gates.
- Point setup guidance at this repository.
- Report Control's new connected draft receipts accurately, without attempting
  to verify a public runtime that does not exist yet.

## 0.4.0

Last release in apps-to-diff. Included complete participation examples and
explicitly distinguished static validation from verified live behavior.

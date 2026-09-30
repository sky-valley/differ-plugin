Import the skills currently served by production Control, with every file
verified against its advertised size and digest. Rebuild both distributions
and the helper using the proposed release version.

Validation: `npm run check` passed in the refresh workflow. Review the skill
changes and update CHANGELOG.md before merging. This does not publish a GitHub
release or update either official directory listing.

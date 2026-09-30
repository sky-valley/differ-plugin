# Extraction provenance

The initial public source was extracted from only `plugins/differ/` at
apps-to-diff commit `040d6033f64dd24281618828698d978dc9b653b4` (plugin 0.4.0).
The private repository's history, unrelated posts, local files, and credentials
were not imported. Version 0.5.0 starts the standalone distribution.

Helper source and tests moved to the repository root's `helper/` and `test/`
folders. Development dependencies moved to the root, outside installable
packages. The local plugin retains the bundled helper. The generated directory
package shares its skills and identity but declares remote MCP.

`assets/icon.svg` is Differ's existing application mark from app-player's
`public/icons/differ-app-icon.svg`. It is not an Anthropic or OpenAI mark.
The MIT license grants rights to code and documentation, not endorsement or
permission to misrepresent a fork as Sky Valley's official service.

Third-party code included in the helper bundle is listed with its license in
`plugins/differ/THIRD_PARTY_NOTICES.txt`, regenerated from esbuild's actual inputs.

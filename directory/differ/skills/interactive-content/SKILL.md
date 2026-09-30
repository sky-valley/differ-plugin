---
name: interactive-content
description: >-
  Create or refine interactive social content, playable posts, and small browser
  experiences: hooks, gestures, payoffs, participation, sharing, and remixing.
  Use before choosing architecture. Excludes general SaaS interfaces,
  deployment-only work, and read-only app analysis.
---

# Interactive content

Author a post people encounter, enjoy, and may pass on. Treat software as the
medium; preserve the creator's specific premise, voice, and requested scope.
Deliver a runnable interactive webpage unless explicitly asked otherwise.
Images, copy, and screenshots support it; they are not substitutes.

## Frame

Before coding, identify the hook, action, payoff, sharing motive, and recipient
experience. Always assess self-insertion, response, challenge, and remix;
implement opportunities inherent in the premise, not unrelated mechanics.
Participation is optional for visitors, not optional to consider.
Infer from the brief; ask only about consequential gaps.

## Author

- Start with a finished, specific piece: this dog, this handshake, someone's
  three picks. Avoid empty templates, landing pages, onboarding, dashboards,
  accounts, and settings unless the experience requires them.
- Derive the hook from the material: a real contrast, curiosity, joke, opinion,
  or recognizable situation. Fulfil its promise; never invent facts or popularity.
- Make the subject actionable: boop the nose, wash the wall, shake back.
  Make the invitation noticeable without obscuring the subject; retire hints
  once learned. Prefer direct gestures to redundant narration; retain accessible labels.
- Deliver a perceptible payoff: reveal, transformation, answer, punchline,
  personal artifact, win/loss, or satisfying loop. Spend effort on assets,
  composition, timing, motion, sound, and exact copy.
- Participation fills the format (your location/picks/answers); remixing changes
  it (time spans/rules/style/premise). Make invitations concrete and optional.
  Consumption and participation must stand alone without remixing.
- Separate invariants from variation. Preserve the agreed subject/context;
  vary meaningful form or behavior, not merely branding, unless a reskin was requested.
- Identify why someone would send this to whom: challenge, gift, identity,
  opinion, surprise. A share button supplies transport, not motivation.
  Share the actual piece or personal result; recipients need context and a
  meaningful next action without reconstructing the sender's session.
- Preserve authored moments and saved artifacts. Freeze snapshots when the
  moment matters; distinguish edits, revisions, and someone else's response.
- Design for the actual surface: immediate mobile readability, reachable touch
  targets, intact focal subjects, and deliberate desktop/iframe adaptation.
  Keep authoring controls and implementation details off the consuming surface
  unless needed there; respect the player's existing navigation and sharing.

## Implement

Default to portable HTML/CSS/JS and static assets. Simple infrastructure can
support rich content. Use browser storage/compute where appropriate; add server
capabilities only for concrete needs such as shared durable state, trusted
decisions, secrets, or work that must outlive a tab. Honour explicit stack
requirements and the destination's runtime contract. This skill grants no
publishing authority.

On Differ, a root `rules.html` selects the document runtime. Authored HTML can
compose live documents under `/data/`; `/uploads/` holds participant images.
Read the publishing skill's participation reference before building shared
state, including its complete examples and runtime checks. Decide what each
person may do from the premise; do not treat every board as private contributions
or every interactive post as shared state. Visitors can explore without signing in; ask them to join only when
they choose to save a contribution. Keep paid/server model actions out of posts.

Keep publishable files in `content/`; source masters, experiments and recordings
outside it. Where the Differ helper is available, its content check reports
weights and possible unused assets. Compare compression candidates visually
before adoption; never infer quality or dead files from size/reference checks
alone.

## Review

Verify the deliverable is the intended medium and natural participation
opportunities are implemented, not merely a working interaction.
Open the actual experience on phone and desktop. Perform the interaction,
reach its payoff, and test participation/sharing as a fresh recipient when
present. Check loading, gestures, framing, and failure states; report what was
observed versus unverified. Remove friction and generic product chrome.

When testing remix behaviour, distinguish consumption, participation, remixing,
and subsequent sharing. Forced steps do not demonstrate desire. Inherited
exposure is a distribution condition to verify, not assume; accept null results.

For requested social videos, read [recording](references/recording.md).

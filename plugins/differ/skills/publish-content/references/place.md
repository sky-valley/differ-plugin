# Making a creator's place

A place is a creator's own page on Differ, shown full screen behind their
profile on a phone. It isn't a bit: it isn't in the feed, has no caption and
no versions, and each creator has one. Treat 390×693 CSS px as the reference
screen and make it responsive. Make a place that feels like the creator, set
in a real world, with its own look carried through every detail. Their bits
can live in it.

Only a connected creator with a handle has a place; there are no guest places.
Keep this reference aligned with Differ's own place prompt on its Create page.

## What Differ draws over it

- A back button and a ⋯ menu in the top corners, over the top
  `var(--differ-top)` of the page, and a handle over the bottom
  `var(--differ-bottom)` that opens all the creator's bits. Keep text and
  buttons out of both, for example
  `.scene { position: fixed; inset: var(--differ-top, 98px) 0 var(--differ-bottom, 74px); }`.
- The creator's name and a Follow button. Never draw a name or Follow of the
  place's own: style and place Differ's in `differ.json` (below).

## The creator's data

Differ adds its place SDK to every page of a place as the global `differ`;
never reference `/__differ/sdk.js`. Read the creator's data only through it:

- `const { handle, pinnedBitId } = await differ.profile();`
- `const { items, next } = await differ.bits({ limit: 24 });` then
  `differ.bits({ limit: 24, after: next })`. Items are
  `{ id, title, cover, url, preview }`: `cover` is a picture URL or null, so
  give it `loading="lazy"`; `url` is the bit's page and `preview` its 390×520
  feed preview, or null when it has none.
- `differ.followers()` and `differ.following()` page the same way; their items
  are handles.
- To feature particular bits, ask the creator which ones: each bit's link ends
  in its id. `const { items } = await differ.bits({ ids: ["<id>", "<id>"] })`
  gives those that are still their live bits, in that order, 1 to 24 ids at a
  time. The handle at the bottom still has every one.
- `const bits = differ.list("bits"); await bits.more();` then `bits.items`
  holds all loaded so far, and `bits.done` is true once there are no more.
  Lists can be thousands long: load a page at a time, never all at once. Past
  a few hundred items on screen, render only what is visible.
- `differ.on("counts", ({ followers, following, bits }) => …)` gives the
  creator's counts at once, and again the instant someone follows. Use it for
  every count the place shows.
- To let people use a bit right in the place, put its `url` in an iframe laid
  out at 390×693 and scaled down, in a box of that same shape
  (`aspect-ratio: 390 / 693`) so the bit fills it. It starts paused; don't
  autoplay it: its first touch posts `{ v: 1, type: "differ:activity" }`, and
  from then send it `{ v: 1, type: "differ:show" }` while it's on screen and
  `{ v: 1, type: "differ:hide" }` when it leaves or the place is hidden. A
  phone holds only a few at once: load frames from about a screen ahead, keep
  the ones nearest the middle of the screen (at most six), remove the rest, and
  show their covers; a tap on a cover loads it. Give every bit, live or not,
  an open button of the place's own from the start that calls
  `differ.showBit(id)`. Don't frame `preview` for this: it's the feed's teaser,
  and a tap on it asks to open the bit.
- `differ.showBit(id)` asks Differ to open one of the creator's bits. Show
  their bits however suits the place, or not at all.
- `differ.on("hide", …)` and `differ.on("show", …)`: pause everything, sound
  included, while the place is hidden. Sound may start as soon as the place
  opens.
- `differ.on("layout", ({ handle, follow }) => …)` says where Differ drew the
  name and Follow, as `{ x, y, width, height }` in CSS px, so the place can
  build around them.

Outside Differ these calls still read, so the place can be tried on its own.

## The rules

- Bundle every file. The place loads only its own files, the creator's data
  through the SDK, Differ's cover pictures and their bits in frames: no CDNs,
  web fonts, APIs or trackers. Use relative URLs.
- Import modules only by relative path, never by package name: import from
  `./three.module.js`, not `three`. Edit any library copied in the same way.
  Differ's upload check doesn't read import maps.
- Never ask for sign-in, and use no forms, no links out and no pop-ups.
- `index.html` at the root; at most 8 MiB in all. A place meets a bit's file
  rules: nothing under `-/`, `v/`, `uploads/`, `__differ/` or `__dfr/`.

## differ.json, beside index.html

It places and styles the name and Follow on the 390×693 screen. Differ checks
it when the place is uploaded and refuses anything it can't draw well, with a
`code` and a `message` that says what to fix.

```json
{
  "v": 1,
  "handle": { "at": { "x": 24, "y": 104 }, "font": "bebas-neue", "size": 40, "case": "upper", "rotate": -3,
    "color": "#ff5fa2", "glow": "#ff5fa2", "plate": { "background": "#06090d", "radius": 6, "padding": 10 } },
  "follow": { "at": { "x": 28, "y": 180 }, "font": "nunito", "size": 16, "weight": 800, "letterSpacing": 0.14, "case": "upper",
    "height": 44, "paddingX": 18, "radius": 8, "background": "#06090d", "color": "#ffb341", "glow": "#ffb341",
    "border": { "color": "#ffb341", "width": 2 }, "following": { "background": "#ffb341", "color": "#1a1a1a" } }
}
```

- `at` is the top-left corner. Keep both fully between 98 and 619 px from the
  top, and don't let them overlap.
- `font`: a kit font by name (bebas-neue, fraunces, nunito, pixelify-sans,
  zen-maru-gothic), or the path of a `.woff2` in the place of at most 300 KB.
  Leave it out for Differ's own.
- `size` 16 to 72; `weight` 100 to 900; `letterSpacing` -0.05 to 0.5 em;
  `case` none, upper or lower; `rotate` -12 to 12 degrees.
- Colours as `#rrggbb`. The name needs a `plate` (background, radius,
  padding) or an `outline` (color, width 1 to 4) whose colour contrasts with
  its text at least 4.5:1, since the place behind it can be any colour.
  Follow's text contrasts with its background at least 4.5:1, and so do its
  `following` colours, after the tap.
- Follow is 44 to 96 px tall. Differ writes the words: @handle, Follow and
  Following.

## Uploading and publishing it

Making a place does not imply publishing it. When the human asks to put it on
Differ, upload it as the connected creator:

- with the helper, `publish_place` / `differ.cjs place APP`, which reads the
  place's files from its directory;
- with the connector, `upload_place_as_me`, with every file base64 encoded in
  the call, under 4 MiB in all.

The upload is the place's draft and replaces any draft before it; what
visitors see doesn't change. Say so plainly, “Saved as a draft, not published
yet. Look at it in your profile's frame and publish it: [url]”, using the
answer's `reviewUrl`. When they then ask you to publish it, publish that draft
with `publish_place_as_me` (connector) or `publish_place_draft` /
`differ.cjs place-publish` (helper). Publish at upload (`"publish": true`, or
`--publish` with the helper) only when the human explicitly asked to publish
the place now without looking at it first. Publishing replaces their live
place at once and keeps no history.

A refusal names what to fix: fix it and upload again. A place needs a handle,
so a creator without one chooses it in the app first.

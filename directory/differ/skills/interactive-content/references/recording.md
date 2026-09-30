# Social clips — only when requested

Confirm the available recorder supports continuous browser/screen capture.
Use a permitted recording tool; do not substitute intermittent screenshots
encoded at a higher frame rate. If unavailable, report that limitation.

Choose framing for the destination and preserve the focal subject. Show a
visible cursor/touch cue when the interaction would otherwise be unclear.
Hold the premise, perform the real action, let the payoff land. Pacing and
composition require judgment, not fixed durations for every piece.

Keep recordings outside `content/`. Read actual file metadata with `ffprobe`,
or the Differ helper's `inspect_video` tool (`inspect-video FILE`), which wraps it.
Check dimensions, aspect ratio, duration and codec against the requested target;
verify current platform requirements when relevant. Encoded frame rate is not
capture cadence. Play the exported clip to inspect motion, cue timing, clipping
and readability; do not claim playback verification from metadata alone.

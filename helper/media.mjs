import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';
import { problem } from './diagnostics.mjs';

function command(name, args, options = {}) {
  try { return execFileSync(name, args, { timeout: 60_000, maxBuffer: 32 * 1024 * 1024, ...options }); }
  catch (error) {
    throw problem(error.code === 'ENOENT' ? 'missing_media_tool' : 'media_tool_failed', `${name} ${error.code === 'ENOENT' ? 'is not installed' : 'could not process this file'}.`, `Use the official ${name === 'cwebp' ? 'WebP' : 'FFmpeg'} tools when this optional operation is needed. Originals are unchanged.`);
  }
}
function inputFile(path) {
  if (typeof path !== 'string') throw problem('missing_file', 'Supply a local media file.', 'Select the exact source file.');
  const full = resolve(path); const stat = lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink()) throw problem('unsafe_input', 'Media input must be a regular file.', 'Select the original file, not a link.');
  return full;
}
export function imageCandidate(input, output, quality = 85) {
  const source = inputFile(input);
  if (!/\.(png|jpe?g)$/i.test(source)) throw problem('unsupported_image', 'Candidates support still PNG/JPEG sources.', 'Do not flatten animation; use an appropriate format-specific workflow.');
  if (typeof output !== 'string' || extname(output).toLowerCase() !== '.webp' || !Number.isFinite(quality) || quality < 0 || quality > 100) throw problem('invalid_candidate', 'Specify a new .webp output and quality 0–100.', 'Write candidates outside publishable content; review before adopting.');
  const target = resolve(output);
  realpathSync(dirname(target));
  if (existsSync(target)) throw problem('output_exists', 'Candidate output already exists.', 'Choose a new path; originals and previous candidates are never overwritten.');
  const original = readFileSync(source);
  if (/\.png$/i.test(source)) {
    for (let offset = 8; offset + 12 <= original.length;) {
      if (original.toString('ascii', offset + 4, offset + 8) === 'acTL') throw problem('animated_image', 'Animated PNG requires a different encoder.', 'Keep animation intact; do not convert it as a still image.');
      offset += original.readUInt32BE(offset) + 12;
    }
  }
  const candidate = command('cwebp', ['-preset', 'photo', '-q', String(quality), '-m', '6', '-sharp_yuv', '-metadata', 'icc', '-quiet', source, '-o', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(target, candidate, { flag: 'wx' });
  return { source, candidate: target, originalBytes: original.length, candidateBytes: candidate.length, savingsPercent: Math.round(1000 * (1 - candidate.length / original.length)) / 10,
    adopted: false, review: 'Compare at intended display size and fine detail. Dimensions were not resized; ICC retained. EXIF/XMP not copied. No source or references changed.' };
}
export function inspectVideo(input) {
  const file = inputFile(input);
  const data = JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_frames:format=duration,size,format_name', '-of', 'json', file], { encoding: 'utf8' }));
  if (!data.streams?.length) throw problem('missing_video', 'No video stream found.', 'Select the recorded video, not still frames.');
  const stream = data.streams[0];
  return { file, ...stream, ...data.format, review: 'Encoding metadata does not prove smooth capture, visible gestures, pacing or legibility. Play the actual clip; do not certify stitched screenshots as real-time recording.' };
}

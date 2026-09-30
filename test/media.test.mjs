import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { imageCandidate, inspectVideo } from '../helper/media.mjs';

const available = name => !spawnSync(name, ['-version'], { stdio: 'ignore' }).error;
test('real media tools create non-overwriting candidates and report actual video metadata', { skip: !['ffmpeg', 'ffprobe', 'cwebp'].every(available) }, () => {
  const root = mkdtempSync(join(tmpdir(), 'differ-media-'));
  try {
    const source = join(root, 'original.png'), candidate = join(root, 'candidate.webp'), video = join(root, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x48:r=30', '-frames:v', '1', source]);
    const original = readFileSync(source);
    const result = imageCandidate(source, candidate);
    assert.equal(result.adopted, false); assert.equal(result.originalBytes, original.length);
    assert.equal(readFileSync(candidate).toString('ascii', 8, 12), 'WEBP');
    assert.deepEqual(readFileSync(source), original);
    assert.throws(() => imageCandidate(source, candidate), { code: 'output_exists' });
    assert.throws(() => imageCandidate(source, join(root, 'bad.webp'), 101), { code: 'invalid_candidate' });
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x48:r=30', '-t', '0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    const metadata = inspectVideo(video);
    assert.equal(metadata.width, 32); assert.equal(metadata.height, 48); assert.equal(metadata.codec_name, 'h264');
    assert.equal(metadata.avg_frame_rate, '30/1'); assert.ok(Number(metadata.duration) > 0);
  } finally { rmSync(root, { recursive: true }); }
});

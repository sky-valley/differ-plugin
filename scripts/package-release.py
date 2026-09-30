#!/usr/bin/env python3
"""Deterministic, runtime-only archives. Build and validate before packaging."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'dist')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
version = json.loads((root / 'package.json').read_text())['version']
checksums = []
for variant, directory in [('local', 'plugins/differ'), ('directory', 'directory/differ')]:
    source = root / directory
    assert source.is_dir(), 'Run npm run build first'
    target = args.output / f'differ-{variant}-{version}.zip'
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(source.rglob('*')):
            if file.is_symlink():
                raise ValueError(f'Symlink cannot ship: {file}')
            if not file.is_file():
                continue
            relative = file.relative_to(source)
            if any(part in {'node_modules', '.git', '.differ', '__pycache__'} or part.startswith('.env') for part in relative.parts):
                raise ValueError(f'Private or development file in plugin: {relative}')
            info = ZipInfo('differ/' + relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, file.read_bytes())
    checksums.append(f'{hashlib.sha256(target.read_bytes()).hexdigest()}  {target.name}')
(args.output / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')
print('\n'.join(checksums))

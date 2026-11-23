#!/usr/bin/env python3
"""Install a stable Linux build outside the checkout; keep releases for rollback.

Default is a read-only preview. Other operating systems use Tauri native bundles.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('desktop', ROOT / 'scripts/install-desktop.py')
desktop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(desktop)


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.new')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)


def promote(root, binary, data, rollback=False):
    """Stage immutable files, then switch launcher; never touch conversation data."""
    identifier = json.loads((root / 'src-tauri/tauri.conf.json').read_text())['identifier']
    base = data / 'agent-desk'
    manifest = base / 'install.json'
    old = json.loads(manifest.read_text()) if manifest.exists() else {}
    previous = old.get('current')
    if rollback:
        release = old.get('previous')
        if not release:
            raise ValueError('No previous release is available')
        if not release.isalnum():
            raise ValueError('Invalid release record')
        target = base / 'releases' / release
    else:
        if not binary.is_file() or not os.access(binary, os.X_OK):
            raise ValueError('Build the release binary first')
        icons = root / 'src-tauri/icons'
        license_file = root / 'LICENSE'
        icon_files = [icons / name for name in ('32x32.png', '128x128.png', 'icon.png')]
        digest = hashlib.sha256()
        for file in (binary, license_file, *icon_files):
            digest.update(file.read_bytes())
        release = digest.hexdigest()[:20]
        target = base / 'releases' / release
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=target.parent) as folder:
                staging = Path(folder) / release
                staging.mkdir()
                shutil.copy2(binary, staging / 'agent-desk')
                shutil.copy2(license_file, staging / 'LICENSE')
                (staging / 'icons').mkdir()
                for file in icon_files:
                    shutil.copy2(file, staging / 'icons' / file.name)
                # Never overwrite an existing release, including its running binary.
                staging.rename(target)
    desktop.install(target, target / 'agent-desk', data, identifier, icon_dir=target / 'icons')
    atomic_json(manifest, {'current': release, 'previous': previous if previous != release else old.get('previous')})
    return target / 'agent-desk'


def register_dev(root, data):
    # Hidden metadata gives Wayland the correct DEV icon; npm starts the dev app.
    return desktop.install(root, root / 'src-tauri/target/debug/agent-desk', data,
                           'local.agentdesk.app.dev', name='Agentrance Development',
                           hidden=True, icon_dir=root / 'src-tauri/icons/dev')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--install', action='store_true')
    action.add_argument('--rollback', action='store_true')
    action.add_argument('--register-dev', action='store_true')
    parser.add_argument('--data-dir', type=Path, default=Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share'))
    parser.add_argument('--binary', type=Path, default=ROOT / 'src-tauri/target/release/agent-desk')
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('This helper installs Linux desktop entries. Use npm run tauri build and the native installer on Windows/macOS.')
    if not (args.install or args.rollback or args.register_dev):
        print('Stable snapshots:', args.data_dir / 'agent-desk/releases')
        print('Application entry:', args.data_dir / 'applications/local.agentdesk.app.desktop')
        print('Run with --install to promote a release, --rollback to restore the previous one, or --register-dev for hidden DEV icon metadata.')
        return
    if args.register_dev:
        print('Registered:', *register_dev(ROOT, args.data_dir), sep='\n')
    else:
        print('Stable application:', promote(ROOT, args.binary.resolve(), args.data_dir, args.rollback))
        if args.install and (ROOT / 'src-tauri/target/debug/agent-desk').is_file():
            register_dev(ROOT, args.data_dir)
            print('Registered hidden Development icon metadata')
    for command in [['update-desktop-database', str(args.data_dir / 'applications')],
                    ['gtk-update-icon-cache', '--force', '--ignore-theme-index', str(args.data_dir / 'icons/hicolor')]]:
        if shutil.which(command[0]):
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode:
                print('Cache refresh warning:', result.stderr.strip())


if __name__ == '__main__':
    main()

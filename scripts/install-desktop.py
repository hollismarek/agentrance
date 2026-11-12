#!/usr/bin/env python3
"""Register the built Agent Desk binary and icon in the current user's desktop.

Without --install, prints the proposed launcher and makes no changes.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def key_value(value):
    return str(value).replace('\\', '\\\\').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')


def exec_argument(value):
    # Desktop Entry Exec quoting is not shell quoting. Escape its field codes
    # and both the key-file and command-line layers; never invoke a shell.
    escaped = {'\\': r'\\\\', '"': r'\\\"', '$': r'\\$', '`': r'\\`', '%': '%%'}
    return '"' + ''.join(escaped.get(c, c) for c in str(value)) + '"'


def desktop_entry(root, binary, identifier):
    for value in (str(root), str(binary), identifier):
        if any(c in value for c in '\n\r\0'):
            raise ValueError('Launcher paths must not contain newlines or null characters')
    return '\n'.join([
        '[Desktop Entry]', 'Type=Application', 'Name=Agent Desk',
        'Comment=Local workspace for coding agents',
        'Exec=' + exec_argument(binary), 'Path=' + key_value(root),
        'Icon=' + identifier, 'StartupWMClass=' + identifier,
        'Terminal=false', 'StartupNotify=true', 'Categories=Development;', '',
    ])


def install(root, binary, data_dir, identifier):
    binary = binary.resolve()
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError('Build the standalone binary before installing desktop integration')
    icons = {32: '32x32.png', 128: '128x128.png', 256: 'icon.png'}
    for name in icons.values():
        if not (root / 'src-tauri/icons' / name).is_file():
            raise ValueError('Application icon is missing: ' + name)
    files = []
    for size, name in icons.items():
        target = data_dir / f'icons/hicolor/{size}x{size}/apps' / (identifier + '.png')
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_suffix('.png.new')
        shutil.copyfile(root / 'src-tauri/icons' / name, temp)
        temp.replace(target)
        files.append(target)
    launcher = data_dir / 'applications' / (identifier + '.desktop')
    launcher.parent.mkdir(parents=True, exist_ok=True)
    temp = launcher.with_suffix('.desktop.new')
    temp.write_text(desktop_entry(root, binary, identifier))
    temp.replace(launcher)
    files.append(launcher)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--data-dir', type=Path, default=Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share'))
    parser.add_argument('--binary', type=Path, default=ROOT / 'src-tauri/target/release/agent-desk')
    args = parser.parse_args()
    identifier = json.loads((ROOT / 'src-tauri/tauri.conf.json').read_text())['identifier']
    if not args.install:
        print(desktop_entry(ROOT, args.binary.resolve(), identifier))
        print('Target:', args.data_dir / 'applications' / (identifier + '.desktop'))
        return
    for path in install(ROOT, args.binary, args.data_dir, identifier):
        print('Installed:', path)
    # Refresh menu/icon discovery only. Do not launch or interrupt the app.
    commands = [
        ['update-desktop-database', str(args.data_dir / 'applications')],
        ['gtk-update-icon-cache', '--force', '--ignore-theme-index', str(args.data_dir / 'icons/hicolor')],
    ]
    for command in commands:
        executable = shutil.which(command[0])
        if executable:
            result = subprocess.run([executable, *command[1:]], capture_output=True, text=True)
            if result.returncode:
                print('Desktop cache refresh skipped:', command[0], result.stderr.strip())


if __name__ == '__main__':
    main()

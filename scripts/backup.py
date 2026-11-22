#!/usr/bin/env python3
"""Back up Agentrance data or restore it into an empty profile."""

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import uuid
import zipfile

HISTORY = "history.sqlite3"
SETTINGS = ("providers.json", "workspace.json")
MANIFEST = "manifest.json"
FORMAT = {"format": "agentrance-backup", "version": 1}


def profile_path(channel):
    identifier = "local.agentdesk.app" + (".dev" if channel == "development" else "")
    if sys.platform == "darwin":
        base = Path.home() / "Library/Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ["APPDATA"])
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share")
    return base / identifier


def selected_profile(root):
    try:
        marker = (root / "active-profile").read_text(encoding="utf-8")
    except FileNotFoundError:
        return root
    return root / "profiles" / str(uuid.UUID(marker.strip()))


def validate_database(path):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        db.execute("PRAGMA trusted_schema=OFF")
        tables = dict(db.execute("SELECT name, type FROM sqlite_master WHERE name IN ('sessions', 'events')"))
        if tables != {"sessions": "table", "events": "table"}:
            raise ValueError("Backup database is missing Agentrance history tables.")
        if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise ValueError("Backup database failed SQLite integrity checks.")
        db.execute("SELECT id, provider, cwd FROM sessions LIMIT 0")
        db.execute("SELECT session, kind, data FROM events LIMIT 0")


def validate_settings(folder):
    for name in SETTINGS:
        path = folder / name
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if name == "providers.json":
            if not isinstance(data, list) or not data or not all(
                isinstance(entry, dict)
                and all(isinstance(entry.get(key), str) for key in ("id", "name", "executable", "cwd"))
                and isinstance(entry.get("args"), list)
                and all(isinstance(arg, str) for arg in entry["args"])
                and isinstance(entry.get("env"), dict)
                and all(isinstance(value, str) for value in entry["env"].values())
                for entry in data
            ):
                raise ValueError("Invalid provider settings in backup.")
        elif not isinstance(data, dict) or data.get("version") != 1:
            raise ValueError("Unsupported workspace recovery file in backup.")


def backup_profile(profile, destination):
    history = profile / HISTORY
    if not history.is_file():
        raise ValueError(f"No Agentrance history database in {profile}")
    with tempfile.TemporaryDirectory(prefix=".agentrance-backup-", dir=destination.parent) as tmp:
        stage = Path(tmp)
        snapshot = stage / HISTORY
        with closing(sqlite3.connect(history.as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(snapshot)) as target:
                source.backup(target)
                target.execute("PRAGMA journal_mode=DELETE")
        validate_database(snapshot)
        for name in SETTINGS:
            try:
                shutil.copyfile(profile / name, stage / name)
            except FileNotFoundError:
                pass
        validate_settings(stage)
        archive = stage / "backup.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as bundle:
            bundle.writestr(MANIFEST, json.dumps(FORMAT))
            for name in (HISTORY, *SETTINGS):
                path = stage / name
                if path.is_file():
                    bundle.write(path, name)
        # The archive is complete before copying. Exclusive creation protects existing backups.
        with archive.open("rb") as source:
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(fd, "wb") as target:
                    shutil.copyfileobj(source, target)
                    target.flush()
                    os.fsync(target.fileno())
            except BaseException:
                destination.unlink()
                raise


def restore_profile(archive, destination):
    if destination.exists() or destination.is_symlink():
        raise ValueError("Restore destination already exists. Choose a new profile directory.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".agentrance-restore-", dir=destination.parent) as tmp:
        stage = Path(tmp)
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            if (len(names) != len(set(names))
                or not {MANIFEST, HISTORY}.issubset(names)
                or set(names) - {MANIFEST, HISTORY, *SETTINGS}):
                raise ValueError("Unexpected or missing files in Agentrance backup.")
            if bundle.getinfo(MANIFEST).file_size > 4096 or json.loads(bundle.read(MANIFEST)) != FORMAT:
                raise ValueError("Unsupported Agentrance backup format.")
            for name in names:
                if name == MANIFEST:
                    continue
                with bundle.open(name) as source, (stage / name).open("wb") as target:
                    shutil.copyfileobj(source, target)
                (stage / name).chmod(0o600)
        validate_database(stage / HISTORY)
        validate_settings(stage)
        # Validate everything before installing the restored profile. On POSIX
        # rename can replace an empty directory, but never a populated profile.
        if destination.exists() or destination.is_symlink():
            raise ValueError("Restore destination already exists. Choose a new profile directory.")
        stage.rename(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("backup", "restore"))
    parser.add_argument("archive", type=Path, help="Path to the backup ZIP")
    parser.add_argument("--channel", choices=("stable", "development"), default="stable")
    parser.add_argument("--data-dir", type=Path, help="Override the profile folder")
    args = parser.parse_args()
    profile = (args.data_dir or profile_path(args.channel)).expanduser().absolute()
    archive = args.archive.expanduser().absolute()
    try:
        if args.action == "backup":
            backup_profile(selected_profile(profile), archive)
            print(f"Backup saved to {archive}")
        else:
            restore_profile(archive, profile)
            print(f"Backup restored to {profile}")
    except (OSError, ValueError, sqlite3.Error, zipfile.BadZipFile, RuntimeError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()

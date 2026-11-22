from contextlib import closing
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'backup.py'


class BackupTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.archive = self.root / 'backup.zip'
        self.restored = self.root / 'restored'

    def command(self, action, profile, archive=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), action, str(archive or self.archive), '--data-dir', str(profile)],
            capture_output=True, text=True,
        )

    def test_round_trip_includes_uncheckpointed_history_settings_and_drafts(self):
        with closing(sqlite3.connect(self.source / 'history.sqlite3')) as live:
            live.executescript("""
                PRAGMA journal_mode=WAL;
                PRAGMA wal_autocheckpoint=0;
                CREATE TABLE sessions(id TEXT, provider TEXT, cwd TEXT);
                CREATE TABLE events(session TEXT, kind TEXT, data TEXT);
                INSERT INTO sessions VALUES ('one', 'Test', '/original/project');
                INSERT INTO events VALUES ('one', 'user', '"saved prompt"');
            """)
            self.assertTrue((self.source / 'history.sqlite3-wal').exists())
            providers = [{'id':'test','name':'Test','executable':'test-cli','cwd':'/original/project','args':[],'env':{}}]
            workspace = json.loads((SCRIPT.parents[1] / 'tests/fixtures/backup-workspace.json').read_text())
            (self.source / 'providers.json').write_text(json.dumps(providers), encoding='utf-8')
            (self.source / 'workspace.json').write_text(json.dumps(workspace), encoding='utf-8')
            backup = self.command('backup', self.source)
            self.assertEqual(backup.returncode, 0, backup.stderr)
            duplicate = self.command('backup', self.source)
            self.assertNotEqual(duplicate.returncode, 0)
            restored = self.command('restore', self.restored)
            self.assertEqual(restored.returncode, 0, restored.stderr)
        with closing(sqlite3.connect(self.restored / 'history.sqlite3')) as db:
            self.assertEqual(db.execute('SELECT data FROM events').fetchone(), ('"saved prompt"',))
        self.assertEqual(json.loads((self.restored / 'workspace.json').read_text()), workspace)
        self.assertEqual(json.loads((self.restored / 'providers.json').read_text()), providers)
        self.assertNotEqual(self.command('restore', self.restored).returncode, 0)

    def test_corrupt_database_or_unexpected_paths_are_rejected_before_installation(self):
        for extra in (None, '../outside'):
            with self.subTest(extra=extra):
                with zipfile.ZipFile(self.archive, 'w') as bundle:
                    bundle.writestr('manifest.json', json.dumps({'format':'agentrance-backup','version':1}))
                    bundle.writestr('history.sqlite3', b'not a database')
                    if extra:
                        bundle.writestr(extra, b'ignored')
                result = self.command('restore', self.restored)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.restored.exists())
                self.assertFalse((self.root / 'outside').exists())

    def test_oversized_workspace_zip_entry_is_rejected(self):
        with zipfile.ZipFile(self.archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr('manifest.json', json.dumps({'format':'agentrance-backup','version':1}))
            bundle.writestr('history.sqlite3', b'database placeholder')
            bundle.writestr('workspace.json', b' ' * (8 * 1024**2 + 1))
        result = self.command('restore', self.restored)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('workspace.json exceeds the backup size limit', result.stderr)
        self.assertFalse(self.restored.exists())


if __name__ == '__main__':
    unittest.main()

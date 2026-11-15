import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import json
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('local_install', Path(__file__).resolve().parents[1] / 'scripts/install-local.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class StableInstallTests(unittest.TestCase):
    def setup_project(self, folder):
        root = Path(folder) / 'project'
        icons = root / 'src-tauri/icons'
        icons.mkdir(parents=True)
        (root / 'src-tauri/tauri.conf.json').write_text('{"identifier":"local.agentdesk.app"}')
        for name in ('32x32.png','128x128.png','icon.png'):
            (icons / name).write_bytes(name.encode())
        binary = root / 'candidate'
        binary.write_text('first')
        binary.chmod(0o755)
        return root, binary, Path(folder) / 'data'

    def test_snapshots_survive_rebuild_and_rollback_preserves_user_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root, binary, data = self.setup_project(folder)
            history = data / 'local.agentdesk.app/history.sqlite3'
            history.parent.mkdir(parents=True)
            history.write_text('user data')
            first = installer.promote(root,binary,data)
            binary.write_text('second')
            second = installer.promote(root,binary,data)
            self.assertNotEqual(first,second)
            self.assertEqual(first.read_text(),'first')
            self.assertEqual(second.read_text(),'second')
            self.assertEqual(installer.promote(root,binary,data),second)
            self.assertEqual(installer.promote(root,binary,data,rollback=True),first)
            launcher = (data / 'applications/local.agentdesk.app.desktop').read_text()
            self.assertIn(str(first),launcher)
            self.assertNotIn(str(root),launcher)
            self.assertEqual(history.read_text(),'user data')
            self.assertEqual(installer.promote(root,binary,data,rollback=True),second)

    def test_missing_candidate_and_missing_rollback_do_not_modify_launcher(self):
        with tempfile.TemporaryDirectory() as folder:
            root,binary,data=self.setup_project(folder)
            with self.assertRaises(ValueError): installer.promote(root,binary,data,rollback=True)
            binary.unlink()
            with self.assertRaises(ValueError): installer.promote(root,binary,data)
            self.assertFalse(data.exists())

    def test_dev_metadata_is_hidden_and_does_not_replace_stable(self):
        with tempfile.TemporaryDirectory() as folder:
            root,binary,data=self.setup_project(folder)
            installer.promote(root,binary,data)
            stable=data / 'applications/local.agentdesk.app.desktop'
            before=stable.read_text()
            debug=root / 'src-tauri/target/debug/agent-desk'
            debug.parent.mkdir(parents=True)
            debug.write_text('debug');debug.chmod(0o755)
            icons=root / 'src-tauri/icons/dev';icons.mkdir()
            for name in ('32x32.png','128x128.png','icon.png'):(icons/name).write_text('dev')
            installer.register_dev(root,data)
            entry=(data / 'applications/local.agentdesk.app.dev.desktop').read_text()
            self.assertIn('Name=Agent Desk Development',entry)
            self.assertIn('NoDisplay=true',entry)
            self.assertIn('Icon=local.agentdesk.app.dev',entry)
            self.assertEqual(stable.read_text(),before)

if __name__ == '__main__': unittest.main()

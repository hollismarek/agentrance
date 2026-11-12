import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('desktop', Path(__file__).resolve().parents[1] / 'scripts/install-desktop.py')
desktop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(desktop)

class DesktopIntegrationTests(unittest.TestCase):
    def test_installs_matching_launcher_and_icon_sizes_without_touching_other_entries(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'project with space'
            icons = root / 'src-tauri/icons'
            icons.mkdir(parents=True)
            for name in ['32x32.png', '128x128.png', 'icon.png']:
                (icons / name).write_bytes(name.encode())
            binary = root / 'agent-desk'
            binary.write_text('#!/bin/sh\nexit 0\n')
            binary.chmod(0o755)
            data = Path(folder) / 'desktop data'
            (data / 'applications').mkdir(parents=True)
            other = data / 'applications/other.desktop'
            other.write_text('keep')
            paths = desktop.install(root, binary, data, 'local.agentdesk.app')
            self.assertEqual(len(paths), 4)
            launcher = data / 'applications/local.agentdesk.app.desktop'
            text = launcher.read_text()
            self.assertIn('Icon=local.agentdesk.app\n', text)
            self.assertIn('StartupWMClass=local.agentdesk.app\n', text)
            self.assertIn(f'Exec="{binary}"\n', text)
            for size, name in [(32,'32x32.png'),(128,'128x128.png'),(256,'icon.png')]:
                self.assertEqual((data / f'icons/hicolor/{size}x{size}/apps/local.agentdesk.app.png').read_bytes(),(icons/name).read_bytes())
            desktop.install(root, binary, data, 'local.agentdesk.app')
            self.assertEqual(launcher.read_text(),text)
            self.assertEqual(other.read_text(),'keep')
            validator = shutil.which('desktop-file-validate')
            if validator:
                result = subprocess.run([validator,str(launcher)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_rejects_missing_binary_before_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with self.assertRaises(ValueError):
                desktop.install(root,root/'missing',root/'desktop','local.agentdesk.app')
            self.assertFalse((root/'desktop').exists())

    def test_exec_quoting_does_not_use_a_shell_and_escapes_field_codes(self):
        text=desktop.desktop_entry(Path('/tmp/project path'),Path('/tmp/program%name'), 'local.agentdesk.app')
        self.assertIn('Exec="/tmp/program%%name"',text)
        self.assertNotIn('sh -c',text)
        with self.assertRaises(ValueError):
            desktop.desktop_entry(Path('/tmp/project'),Path('/tmp/bad\nname'),'local.agentdesk.app')

if __name__ == '__main__':
    unittest.main()

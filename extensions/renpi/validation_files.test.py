import importlib.util
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch
from validation_files import COPY_LIMIT, sdk_path, sha, stage_file

PREPARE = Path(__file__).resolve().parents[2] / "renpi-tutorial/authoring/checks/prepare-check.py"
spec = importlib.util.spec_from_file_location("preview_staging_test", PREPARE)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class SdkPathTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="renpi-sdk-paths-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.sdk = self.root / "SDK 中文 with spaces"
        (self.sdk / "lib/py3-windows-x86_64").mkdir(parents=True)
        (self.sdk / "renpy/common").mkdir(parents=True)
        (self.sdk / "renpy.py").touch()
        (self.sdk / "lib/py3-windows-x86_64/python.exe").touch()

    def test_environment_and_explicit_precedence(self):
        with patch.dict(os.environ, {"RENPY_HOME": str(self.sdk)}):
            self.assertEqual(sdk_path(), self.sdk)
            with self.assertRaisesRegex(SystemExit, "SDK file not found"):
                sdk_path(str(self.root / "missing"))
        with patch.dict(os.environ, {"RENPY_HOME": str(self.root / "missing")}):
            self.assertEqual(sdk_path(str(self.sdk)), self.sdk)

    def test_missing_or_blank_input(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(SystemExit, "set RENPY_HOME"):
                sdk_path()
        with patch.dict(os.environ, {"RENPY_HOME": str(self.sdk)}):
            for argument in ("", " "):
                with self.subTest(argument=argument), self.assertRaisesRegex(SystemExit, "set RENPY_HOME"):
                    sdk_path(argument)

    def test_required_sdk_entries(self):
        for relative in ("renpy.py", "lib/py3-windows-x86_64/python.exe", "renpy/common"):
            entry = self.sdk / relative
            backup = entry.with_name(entry.name + ".backup")
            entry.rename(backup)
            try:
                with self.subTest(relative=relative), self.assertRaisesRegex(SystemExit, "not found"):
                    sdk_path(str(self.sdk))
            finally:
                backup.rename(entry)

    def test_relative_path(self):
        previous = Path.cwd()
        try:
            os.chdir(self.root)
            self.assertEqual(sdk_path(self.sdk.name), self.sdk)
        finally:
            os.chdir(previous)

    def test_both_drivers_validate_before_workspace_creation(self):
        for name in ("client-sdk-check.py", "client-e2e-check.py"):
            driver = Path(__file__).with_name(name)
            for argument, environment in ((None, None), (str(self.root / "missing"), str(self.sdk))):
                env = {} if environment is None else {"RENPY_HOME": environment}
                argv = [str(driver)] + ([] if argument is None else [argument])
                with self.subTest(driver=name, argument=argument), patch.dict(os.environ, env, clear=True), \
                        patch("sys.argv", argv), patch("os.mkdir") as mkdir:
                    with self.assertRaises(SystemExit):
                        runpy.run_path(str(driver), run_name="__main__")
                    mkdir.assert_not_called()
            with self.subTest(driver=name, valid=True), patch.dict(os.environ, {"RENPY_HOME": str(self.sdk)}), \
                    patch("sys.argv", [str(driver)]), patch("os.mkdir", side_effect=RuntimeError("preflight complete")) as mkdir:
                with self.assertRaisesRegex(RuntimeError, "preflight complete"):
                    runpy.run_path(str(driver), run_name="__main__")
                mkdir.assert_called_once()


class StagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="renpi-validation-files-")
        self.root = Path(self.temp.name).resolve()
        self.addCleanup(self.temp.cleanup)

    def put(self, relative, data=b"fixture"):
        file = self.root / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
        return file

    def test_links_boundary_and_independent_script(self):
        for name, size, linked in [("large.bin", COPY_LIMIT, True), ("tiny.png", 1, True),
                                   ("tiny.ttf", 1, True), ("below.txt", COPY_LIMIT - 1, False), ("script.rpy", 1, False)]:
            source = self.put("source/" + name, b"x" * size)
            dest = self.root / "scratch" / name
            self.assertEqual(stage_file(source, dest), "symlink" if linked else "copy")
            self.assertEqual(dest.is_symlink(), linked)
            self.assertEqual(sha(source), sha(dest))
        (self.root / "scratch/script.rpy").write_bytes(b"edited")
        self.assertEqual((self.root / "source/script.rpy").read_bytes(), b"x")

    def test_link_failure_preserves_existing_copy_and_never_creates_new_copy(self):
        source = self.put("source/image.png")
        existing = self.put("scratch/image.png")
        with patch.object(Path, "symlink_to", side_effect=PermissionError("denied")):
            for dest in (existing, self.root / "scratch/new.png"):
                with self.assertRaisesRegex(RuntimeError, "No copy fallback"):
                    stage_file(source, dest)
        self.assertFalse(existing.is_symlink())
        self.assertEqual(existing.read_bytes(), b"fixture")
        self.assertFalse((self.root / "scratch/new.png").exists())

    def test_identical_old_copy_is_replaced_but_changed_copy_and_large_script_are_preserved(self):
        source = self.put("source/image.png")
        dest = self.put("scratch/image.png")
        stage_file(source, dest)
        self.assertTrue(dest.is_symlink())
        self.assertEqual(stage_file(source, dest), "symlink")
        changed = self.put("scratch/changed.png", b"user edit")
        with self.assertRaisesRegex(ValueError, "Preserve changed"):
            stage_file(source, changed)
        self.assertEqual(changed.read_bytes(), b"user edit")
        script = self.put("source/large.rpy", b" " * COPY_LIMIT)
        with self.assertRaisesRegex(ValueError, "Oversized writable"):
            stage_file(script, self.root / "scratch/large.rpy")

    def test_source_links_and_destination_directory_links_are_rejected(self):
        source = self.put("source/image.png")
        alias = self.root / "alias.png"
        alias.symlink_to(source)
        with self.assertRaisesRegex(ValueError, "regular file"):
            stage_file(alias, self.root / "scratch/image.png")
        directory = self.root / "directory"
        directory.symlink_to(source.parent, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "directory link"):
            stage_file(source, directory / "new.png")

    def test_preview_reuses_links_and_detects_source_or_link_tampering(self):
        self.put("sdk/renpy.py")
        self.put("sdk/renpy/common/font.ttf", b"x" * COPY_LIMIT)
        self.put("sdk/renpy/common/common.rpy")
        for name in ("options.rpy", "screens.rpy", "opening.rpy", "fonts/font.ttf"):
            self.put("project/authoring/shared/tutorial/" + name)
        for name in ("renpi_bridge.rpy", "python-packages/renpi_bridge.py", "images/image.png", "gui/renpi/panel.png"):
            self.put("project/game/" + name)
        for name in ("check-boundary.rpy", "say-layout-check.rpy"):
            self.put("project/authoring/checks/fixtures/" + name)
        project, sdk = self.root / "project", self.root / "sdk"
        first = preview.prepare(project, sdk)
        self.assertEqual(preview.prepare(project, sdk), first)
        manifest = json.loads((project / "authoring/checks/input-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["asset_links"]), 3)
        self.assertEqual(len(manifest["sdk_asset_links"]), 1)
        preview.verify_links(project, sdk, manifest)
        image = project / "game/images/image.png"
        image.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "linked source changed"):
            preview.verify_links(project, sdk, manifest)
        image.write_bytes(b"fixture")
        link = first / "game/images/image.png"
        link.unlink()
        link.write_bytes(b"fixture")
        with self.assertRaisesRegex(ValueError, "link changed"):
            preview.verify_links(project, sdk, manifest)


if __name__ == "__main__":
    unittest.main()

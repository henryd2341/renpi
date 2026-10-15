"""Use the installed SDK with an isolated common copy. No publication or real bridge."""
import importlib.util
import json
import os
from pathlib import Path
import sys

sdk = Path(os.environ.get("RENPY_HOME", "")).resolve()
if not (sdk / "renpy.py").is_file():
    raise SystemExit("Set RENPY_HOME to the installed Ren'Py SDK.")
shadow = Path(__file__).resolve().parent / "isolated-sdk"
common = shadow / "renpy/common"
if not common.is_dir():
    raise SystemExit("Run authoring/checks/prepare-check.py first.")
sys.dont_write_bytecode = True
project = Path(__file__).resolve().parents[2]
check_spec = importlib.util.spec_from_file_location("rp_preview_staging", Path(__file__).with_name("prepare-check.py"))
check = importlib.util.module_from_spec(check_spec)
check_spec.loader.exec_module(check)
manifest = json.loads((project / "authoring/checks/input-manifest.json").read_text(encoding="utf-8"))
check.verify_links(project, sdk, manifest)
spec = importlib.util.spec_from_file_location("rp_isolated_sdk_entry", sdk / "renpy.py")
entry = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = entry
spec.loader.exec_module(entry)
# Preserve SDK-relative renpy/common identity, so lint treats it as SDK code.
sys.path.append(str(sdk))
entry.path_to_renpy_base = lambda: str(shadow)
entry.path_to_common = lambda _base: str(common)
try:
    entry.main()
finally:
    check.verify_links(project, sdk, manifest)

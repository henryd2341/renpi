"""Real Node bridge + real SDK + actual shared choice screen actions. No provider."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from validation_files import sdk_path, stage_file

sdk = sdk_path(sys.argv[1] if len(sys.argv) > 1 else None)
root = Path(tempfile.gettempdir()) / ("renpi-client-e2e-" + str(uuid.uuid4()))
os.mkdir(root)
shutil.copytree(Path(__file__).parent / "template/game", root / "game", copy_function=stage_file)
control = root / ".renpi-live/bridge"
control.mkdir(parents=True)
(control / "project.json").write_text(json.dumps(dict(format_version=1, protocol="renpi-bridge-v1", project_id="client-e2e", base_branch_id="base")), encoding="utf-8")
common = root / "common"
shutil.copytree(sdk / "renpy/common", common, copy_function=stage_file,
                ignore=shutil.ignore_patterns("*.rpyc", "*.rpymc", "*.pyc", "__pycache__"))
wrapper = root / "run-sdk.py"
wrapper.write_text("import importlib.util, sys\nspec=importlib.util.spec_from_file_location('sdk_main', " + repr(str(sdk / "renpy.py")) + ")\nm=importlib.util.module_from_spec(spec)\nsys.modules['sdk_main']=m\nspec.loader.exec_module(m)\nm.path_to_common=lambda base: " + repr(str(common)) + "\nm.main()\n", encoding="utf-8")
(root / "game/script.rpy").write_text('''
define config.name = "Shared Bridge E2E"
define config.version = "1"
define config.save_directory = None
define config.developer = True
init 100 python:
    import json
    import os
    import time
    if not hasattr(renpi_bridge, "e2e"):
        renpi_bridge.e2e = {"actions": [], "visits": [], "started": time.monotonic()}
    def e2e_action():
        c = _renpi_client()
        run = renpi_bridge.e2e
        if time.monotonic() - run["started"] > 90:
            raise Exception("E2E timeout: " + str(c.error) + str(run))
        screen = renpy.get_screen("renpi_bridge_choice")
        if not screen or c.busy or c.pending or not c.state:
            return
        if c.error:
            raise Exception("Bridge error: " + c.error)
        buttons = []
        def collect(d):
            if isinstance(d, renpy.display.behavior.Button):
                texts = []
                def text(t):
                    if isinstance(t, renpy.text.text.Text):
                        texts.extend(v for v in t.text if isinstance(v, str))
                d.visit_all(text)
                buttons.append(("".join(texts), d))
        screen.visit_all(collect)
        anchor = screen.scope["anchor"]
        if anchor == "nested":
            wanted = "Leave this choice"
        elif len(run["visits"]) >= 2:
            wanted = "Leave this choice"
        else:
            wanted = next((name for name in ("Confirm reloaded entry", "Enter confirmed branch", "Reload published candidate", "Adopt candidate", "Read existing branch", "First choice") if any(text == name for text, button in buttons)), None)
        for text, button in buttons:
            if text == wanted and button.sensitive is not False and renpy.is_sensitive(button.action):
                if anchor == "nested":
                    run["visits"].append(renpi_branch_id)
                run["actions"].append({"anchor": anchor, "button": text, "branch": renpi_branch_id})
                return renpy.run(button.action)
    config.overlay_screens.append("e2e_driver")
screen e2e_driver():
    timer 0.3 repeat True action Function(e2e_action)
label start:
    call renpi_choice("outer", [("first", "First choice")])
    $ assert len(renpi_bridge.e2e["visits"]) == 2
    $ assert renpi_bridge.e2e["visits"][0] == renpi_bridge.e2e["visits"][1]
    $ assert renpi_branch_id == "base"
    $ renpi_bridge.write_json(os.path.join(config.basedir, "e2e-result.json"), renpi_bridge.e2e)
    $ renpy.quit()
''', encoding="utf-8")
server_script = root / "server.mjs"
server_script.write_text('''
import fs from 'node:fs/promises';
import path from 'node:path';
import { startBridge, initialState } from %s;
const root = %s, sdk = %s;
await fs.writeFile(path.join(root, ".renpi-live/bridge/state.json"), JSON.stringify(initialState(JSON.parse(await fs.readFile(path.join(root, ".renpi-live/bridge/project.json"), "utf8")))));
const bridge = await startBridge({root, sdk, sessionId: 'client-e2e'});
let productions = 0;
await fs.writeFile(path.join(root, 'server-ready'), 'ready');
try {
  while (true) {
    const job = Object.values(bridge.status().jobs).some(job => job.status === "queued") ? await bridge.claimNext() : null;
    if (job) {
      productions++;
      await fs.mkdir(job.output, {recursive: true});
      await fs.writeFile(path.join(job.output, 'scene.rpy'), `label ${job.entry_label}:\n    call renpi_choice("nested", [("inner", "Inner choice")])\n    return\n`);
      await bridge.submitCandidate(job.id);
    }
    try { await fs.access(path.join(root, 'stop-server')); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
} finally {
  await fs.writeFile(path.join(root, 'server-result.json'), JSON.stringify({productions, state: bridge.status()}, null, 2));
  await bridge.close();
}
''' % (json.dumps((Path(__file__).parent / "bridge.mjs").resolve().as_uri()), json.dumps(str(root)), json.dumps(str(sdk))), encoding="utf-8")
startup = subprocess.STARTUPINFO() if os.name == "nt" else None
if startup:
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
options = dict(startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
server_log = open(root / "server.log", "w", encoding="utf-8")
server = subprocess.Popen(["node", str(server_script)], stdout=server_log, stderr=subprocess.STDOUT, **options)
env = dict(os.environ, SDL_AUDIODRIVER="dummy", RENPY_RENDERER="sw", RENPY_SKIP_MAIN_MENU="1", RENPY_PATH_TO_SAVES=str(root / "user-saves"))
try:
    deadline = time.monotonic() + 10
    while not (root / "server-ready").exists() and time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError((root / "server.log").read_text(encoding="utf-8"))
        time.sleep(.1)
    assert (root / "server-ready").exists()
    result = subprocess.run([str(sdk / "lib/py3-windows-x86_64/python.exe"), str(wrapper), str(root), "--savedir", str(root / "saves")], capture_output=True, text=True, timeout=110, env=env, **options)
    (root / "engine.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads((root / "e2e-result.json").read_text(encoding="utf-8"))
    (root / "stop-server").write_text("stop")
    server.wait(timeout=15)
    assert server.returncode == 0, (root / "server.log").read_text(encoding="utf-8")
    server_report = json.loads((root / "server-result.json").read_text(encoding="utf-8"))
    assert server_report["productions"] == 1, server_report["productions"]
    state = server_report["state"]
    assert state["adoption"]["phase"] == "committed"
    assert state["head_branch_id"] == "base"
    assert len(state["branches"]) == 2
    summary = dict(root=str(root), productions=server_report["productions"], branch=report["visits"][0], visits=len(report["visits"]), adoption=state["adoption"]["phase"], actions=report["actions"])
    print(json.dumps(summary, indent=2))
finally:
    (root / "stop-server").write_text("stop")
    try: server.wait(timeout=15)
    except subprocess.TimeoutExpired:
        server.terminate()
        server.wait(timeout=5)
    server_log.close()
    print("Isolated evidence:", root)

"""Real SDK compile + reload/entry/loaded-ACK check, isolated from existing games."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sdk = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/Renpy/renpy-8.5.3-sdk")
root = Path(tempfile.gettempdir()) / ("renpi-sdk-client-" + str(uuid.uuid4()))
os.mkdir(root)
shutil.copytree(Path(__file__).parent / "template/game", root / "game")
control = root / ".renpi-live/bridge"
control.mkdir(parents=True)
descriptor = dict(format_version=1, protocol="renpi-bridge-v1", project_id="sdk-test", base_branch_id="base")
(control / "project.json").write_text(json.dumps(descriptor))
adoption = dict(id="adopt", branch_id="child", candidate_id="candidate", entry_label="rp_client_test_entry", anchor_id="rp_client_test_entry", phase="pending")
state = dict(project_id="sdk-test", head_branch_id="child", position=dict(branch_id="child", anchor_id="rp_client_test_entry", revision=1), adoption=adoption, branches={"child": dict(published=True)})
received = []
class Handler(BaseHTTPRequestHandler):
    def do_GET(self): self.respond()
    def do_POST(self):
        received.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        event = received[-1]
        if event.get("type") == "position":
            state["position"] = dict(branch_id=event["branch_id"], anchor_id=event["anchor_id"], revision=2)
        self.respond()
    def respond(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps(dict(ok=True, state=state, result=dict(phase="committed"))).encode())
    def log_message(self, *args): pass
server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
instance = str(uuid.uuid4())
token_dir = Path(tempfile.gettempdir()) / "renpi-bridge/sdk-test" / instance
token_dir.mkdir(parents=True)
(token_dir / "bridge.token").write_text("a" * 64, encoding="ascii")
(control / "connection.json").write_text(json.dumps(dict(protocol="renpi-bridge-v1", project_id="sdk-test", root=str(root), port=server.server_port, token_file=str(token_dir / "bridge.token"), instance_id=instance)))
(control / "client-adoption.json").write_text(json.dumps(adoption))
(root / "game/script.rpy").write_text('''
define config.name = "Renpi Client SDK check"
define config.version = "1"
define config.save_directory = None
define config.developer = True
init 100 python:
    import os
    import json
    def sdk_after_load_check():
        c = _renpi_client()
        assert c.restored_adoption == renpi_pending_adoption
        assert renpy.has_label("rp_client_test_entry")
        assert renpi_bridge.options([("a", "A")]) == [("a", "A")]
        c.state = c.request()["state"]
        import time
        deadline = time.time() + 5
        while c.busy and time.time() < deadline:
            time.sleep(.01)
            c.pump()
        assert c.loaded(renpy.has_label, renpi_pending_adoption)
        import time
        deadline = time.time() + 5
        while c.busy and time.time() < deadline:
            time.sleep(.01)
            c.pump()
        assert not c.pending and not c.error, c.error
        with open(os.path.join(config.basedir, "sdk-result.json"), "w") as f:
            json.dump({"reloaded": True, "entry": True, "ack": True, "native_choices": True}, f)
        renpy.quit()
    config.after_load_callbacks.append(sdk_after_load_check)
screen sdk_driver():
    timer 0.3 repeat True action Return(("leave", None))
label sdk_nested:
    call renpi_choice("nested", [("nested_option", "Nested option")])
    return
label start:
    $ _renpi_client().adoption = None
    show screen sdk_driver
    call renpi_choice("outer", [("a", "A")])
    call sdk_nested
    hide screen sdk_driver
    $ _renpi_client().adoption = renpi_bridge.read_json(os.path.join(config.basedir, ".renpi-live", "bridge", "client-adoption.json"))
    $ renpi_pending_adoption = dict(_renpi_client().adoption)
    $ renpi_bridge.write_json(os.path.join(config.basedir, "native.json"), {"values": [1, 2]})
    $ _renpi_native = renpi_bridge.read_json(os.path.join(config.basedir, "native.json"))
    $ assert renpi_bridge.options(_renpi_native.get("choices", [("a", "A")]))
    $ open(os.path.join(config.gamedir, "candidate.rpy"), "w").write("label rp_client_test_entry:\\n    return\\n")
    $ renpy.retain_after_load()
    $ renpy.reload_script()
    pause
''', encoding="utf-8")
common = root / "common"
shutil.copytree(sdk / "renpy/common", common)
wrapper = root / "run-sdk.py"
wrapper.write_text("import importlib.util, sys\nspec=importlib.util.spec_from_file_location('sdk_main', " + repr(str(sdk / "renpy.py")) + ")\nm=importlib.util.module_from_spec(spec)\nsys.modules['sdk_main']=m\nspec.loader.exec_module(m)\nm.path_to_common=lambda base: " + repr(str(common)) + "\nm.main()\n")
executable = sdk / "lib/py3-windows-x86_64/python.exe"
env = dict(os.environ, SDL_AUDIODRIVER="dummy", RENPY_RENDERER="sw", RENPY_SKIP_MAIN_MENU="1", RENPY_PATH_TO_SAVES=str(root / "saves"))
try:
    for command in ("compile", "lint"):
        result = subprocess.run([str(executable), str(wrapper), str(root), command] + (["--error-code"] if command == "lint" else []), capture_output=True, text=True, timeout=60, env=env)
        print(command, result.returncode, result.stdout, result.stderr)
        assert result.returncode == 0 and "Traceback" not in result.stderr
    result = subprocess.run([str(executable), str(wrapper), str(root)], capture_output=True, text=True, timeout=60, env=env)
    print("run", result.returncode, result.stdout, result.stderr)
    assert result.returncode == 0 and "Traceback" not in result.stderr
    report = json.loads((root / "sdk-result.json").read_text())
    assert any(event.get("type") == "loaded" and event.get("success") for event in received)
    print(json.dumps(dict(root=str(root), result=report, events=received), indent=2))
finally:
    server.shutdown()
    server.server_close()
    shutil.rmtree(token_dir)
    print("Isolated SDK evidence:", root)

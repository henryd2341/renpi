import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODULE = Path(__file__).parent / "template/game/python-packages/renpi_bridge.py"
spec = importlib.util.spec_from_file_location("renpi_bridge", MODULE)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class ClientTests(unittest.TestCase):
    def setUp(self):
        # os.mkdir uses inherited Windows ACLs, unlike tempfile's private directory mode.
        self.root = Path(tempfile.gettempdir()) / ("renpi-client-" + str(bridge.uuid.uuid4()))
        os.mkdir(self.root)
        self.control = self.root / ".renpi-live/bridge"
        self.control.mkdir(parents=True)
        self.write("project.json", dict(format_version=1, protocol=bridge.PROTOCOL, project_id="test", base_branch_id="base"))
        self.state = dict(project_id="test", head_branch_id="base", position=dict(branch_id="base", anchor_id="a", revision=0), branches={})
        self.received = []
        self.reply = {}
        self.http_status = 200
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.received.append((None, dict(self.headers)))
                self.respond()
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                owner.received.append((body, dict(self.headers)))
                if body.get("type") == "position":
                    owner.state["position"] = dict(branch_id=body["branch_id"], anchor_id=body["anchor_id"], revision=1)
                self.respond()
            def respond(self):
                self.send_response(owner.http_status)
                self.end_headers()
                self.wfile.write(json.dumps(dict(ok=True, state=owner.state, result=owner.reply)).encode())
            def log_message(self, *args):
                pass
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.instance = str(bridge.uuid.uuid4())
        self.token_dir = Path(tempfile.gettempdir()) / "renpi-bridge/test" / self.instance
        self.token_dir.mkdir(parents=True)
        (self.token_dir / "bridge.token").write_text("a" * 64, encoding="ascii")
        self.discovery = dict(protocol=bridge.PROTOCOL, project_id="test", root=str(self.root), port=self.server.server_port, token_file=str(self.token_dir / "bridge.token"), instance_id=self.instance)
        self.write("connection.json", self.discovery)
        self.client = bridge.Client(str(self.root))
        self.client.last_poll = float("inf")

    def write(self, name, data):
        (self.control / name).write_text(json.dumps(data), encoding="utf-8")

    def tearDown(self):
        self.client.close()
        self.server.shutdown()
        self.server.server_close()
        import shutil
        shutil.rmtree(self.root)
        shutil.rmtree(self.token_dir)

    def finish(self):
        deadline = time.monotonic() + 3
        while self.client.busy and time.monotonic() < deadline:
            time.sleep(.01)
            self.client.pump()
        self.assertFalse(self.client.busy)

    def test_native_and_revertable_containers(self):
        class RevertableList(list): pass
        self.assertEqual(bridge.options(RevertableList([("a", "A")])), [("a", "A")])
        with self.assertRaises(ValueError): bridge.options([("a", "A"), ("a", "B")])
        self.assertIsInstance(self.client.request()["state"], dict)

    def test_auth_discovery_reread_and_no_redirect(self):
        self.client.request()
        self.assertEqual(self.received[-1][1]["Authorization"], "Bearer " + "a" * 64)
        self.assertEqual(self.received[-1][1]["X-Renpi-Instance"], self.instance)
        (self.token_dir / "bridge.token").write_text("b" * 64, encoding="ascii")
        self.write("connection.json", self.discovery)
        self.client.request()
        self.assertEqual(self.received[-1][1]["Authorization"], "Bearer " + "b" * 64)
        self.http_status = 302
        with self.assertRaisesRegex(ValueError, "redirect"): self.client.request()
        self.discovery["project_id"] = "wrong"
        self.write("connection.json", self.discovery)
        with self.assertRaises(ValueError): self.client.request()

    def test_revised_candidate_and_cancel_recovery_actions_remain_reachable(self):
        branch = dict(published=True, status="ready", candidate_id="new", published_candidate_id="old")
        self.assertEqual(bridge.branch_actions(branch), ["read", "adopt", "cancel"])
        self.assertEqual(bridge.branch_actions(dict(branch, status="validating")), ["read", "cancel"])
        self.assertEqual(bridge.branch_actions(dict(branch, status="cancelled")), ["read", "continue"])
        self.assertEqual(bridge.branch_actions(dict(branch, status="published", candidate_id="old")), ["read"])

    def test_http_response_is_closed_before_return_or_error(self):
        responses = []
        getresponse = bridge.http.client.HTTPConnection.getresponse
        def capture(connection):
            response = getresponse(connection)
            responses.append(response)
            return response
        try:
            with patch.object(bridge.http.client.HTTPConnection, "getresponse", capture):
                for status in (200, 302, 401, 500):
                    with self.subTest(status=status):
                        self.http_status = status
                        if status == 200:
                            self.client.request()
                        else:
                            with self.assertRaises((ValueError, RuntimeError)):
                                self.client.request()
                        self.assertTrue(responses[-1].isclosed(), "response stream must close even without Content-Length")
        finally:
            for response in responses:
                response.close()

    def test_single_owner(self):
        with self.assertRaises(RuntimeError): bridge.Client(str(self.root))

    def test_outbox_reconnect_reuses_uuid_after_restart(self):
        self.client.position = ("base", "a")
        self.client.synced = self.client.position
        self.http_status = 500
        self.client.send(dict(type="choose", branch_id="base"))
        self.finish()
        request_id = self.client.pending["request_id"]
        self.client.close()
        self.client = bridge.Client(str(self.root))
        self.client.last_poll = float("inf")
        self.assertEqual(self.client.pending["request_id"], request_id)
        self.client.observe("base", "a")
        self.assertFalse(self.client.reconcile_only)
        self.http_status = 200
        self.reply = dict(replay=True, branch_id="old")
        self.state["head_branch_id"] = "current"
        self.state["position"] = dict(branch_id="current", anchor_id="entry", revision=3)
        self.client.reconnect()
        self.finish()
        self.assertEqual(self.received[-1][0]["request_id"], request_id)
        self.assertEqual(self.client.target, "current")
        self.assertEqual(self.client.navigation, self.state["position"])
        self.assertEqual(self.received[-1][0]["type"], "choose")
        self.assertIsNone(self.client.pending)

    def test_expired_auth_retains_uuid_but_stale_position_is_retired(self):
        self.http_status = 401
        self.client.send(dict(type="choose"))
        self.finish()
        retained = self.client.pending["request_id"]
        self.assertEqual(self.received[-1][0]["request_id"], retained)
        self.http_status = 409
        self.client.reconnect()
        self.finish()
        self.assertIsNone(self.client.pending)
        self.assertEqual(self.received[-1][0]["request_id"], retained)

    def test_old_save_reconciles_choice_without_navigation(self):
        self.client.position = ("A2", "a")
        self.client.synced = self.client.position
        self.http_status = 500
        self.client.send(dict(type="choose", branch_id="A2", anchor_id="a"))
        self.finish()
        retained = self.client.pending["request_id"]
        self.client.reset_reading()
        self.client.observe("A1", "a")
        self.assertTrue(bridge.read_json(self.client.outbox_path)["reconcile_only"])
        self.http_status = 200
        self.reply = dict(replay=True, branch_id="A2-child")
        self.state.update(head_branch_id="A2-child", position=dict(branch_id="A2-child", anchor_id="entry", revision=2))
        self.client.reconnect()
        self.finish()
        self.assertIsNone(self.client.navigation)
        self.assertEqual(self.client.synced, ("A1", "a"))
        self.assertEqual(self.received[-2][0]["request_id"], retained)
        self.assertEqual(self.received[-1][0]["type"], "position")
        self.assertEqual(self.received[-1][0]["branch_id"], "A1")

    def test_old_position_receipt_never_claims_new_reading_synced(self):
        self.client.position = ("A2", "a")
        self.client.synced = self.client.position
        self.http_status = 500
        self.client.send(dict(type="position", branch_id="A2", anchor_id="a"))
        self.finish()
        retained = self.client.pending["request_id"]
        self.client.reset_reading()
        self.client.observe("A1", "a")
        self.http_status = 200
        self.client.reconnect()
        self.finish()
        self.assertEqual(self.received[-2][0]["request_id"], retained)
        self.assertEqual(self.received[-1][0]["branch_id"], "A1")
        self.assertEqual(self.client.synced, ("A1", "a"))

    def test_old_epoch_does_not_navigate(self):
        self.client.send(dict(type="choose"))
        self.client.epoch += 1
        self.finish()
        self.assertIsNone(self.client.target)
        self.assertIsNone(self.client.state)
        self.assertIsNone(self.client.pending)

    def test_loaded_identity_and_label(self):
        adoption = dict(id="adopt", branch_id="child", candidate_id="candidate", entry_label="entry", anchor_id="entry", phase="pending")
        self.client.adoption = adoption
        self.client.state = dict(self.state, adoption=adoption)
        self.client.restored_adoption = adoption
        self.client.loaded(lambda label: label == "entry", adoption)
        self.finish()
        self.assertTrue(self.received[-1][0]["success"])
        self.client.adoption = dict(adoption, candidate_id="wrong")
        self.client.state = dict(self.state, adoption=adoption)
        before = len(self.received)
        self.assertFalse(self.client.loaded(lambda label: True, adoption))
        self.assertEqual(len(self.received), before)
        self.client.adoption = adoption
        self.client.restored_adoption = dict(adoption, candidate_id="old-candidate")
        self.assertFalse(self.client.loaded(lambda label: True, self.client.restored_adoption))
        self.assertEqual(len(self.received), before)
        self.client.restored_adoption = adoption
        self.client.loaded(lambda label: False, adoption)
        self.finish()
        self.assertFalse(self.received[-1][0]["success"])


if __name__ == "__main__":
    unittest.main()

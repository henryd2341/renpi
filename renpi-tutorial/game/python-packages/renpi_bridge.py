"""Shared Ren'Pi transport. No credentials or worker objects enter Ren'Py saves."""
import atexit
import http.client
import json
import os
import queue
import re
import tempfile
import threading
import time
import uuid

PROTOCOL = "renpi-bridge-v1"


def read_json(path):
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def write_json(path, value):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=True)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def options(value):
    # Native builtins here accept both ordinary JSON and Ren'Py revertable containers.
    if not isinstance(value, (list, tuple)):
        raise ValueError("choices must be a list of (stable ID, text) pairs")
    result = []
    for item in value:
        if not isinstance(item, (list, tuple)) or len(item) != 2 or not all(isinstance(v, str) and v for v in item):
            raise ValueError("invalid choice")
        if any(old[0] == item[0] for old in result):
            raise ValueError("duplicate choice ID")
        result.append(tuple(item))
    return result


def branch_actions(branch):
    actions = []
    if branch.get("published"):
        actions.append("read")
    if branch.get("status") == "ready" and branch.get("candidate_id") != branch.get("published_candidate_id"):
        actions.append("adopt")
    if branch.get("status") in ("interrupted", "cancelled", "failed"):
        actions.append("continue")
    if branch.get("status") in ("queued", "running", "validating", "ready"):
        actions.append("cancel")
    return actions


class Rejected(RuntimeError):
    """An explicit non-retryable protocol rejection, not an uncertain commit."""


class Client:
    def __init__(self, root):
        self.root = os.path.realpath(root)
        self.control = os.path.join(self.root, ".renpi-live", "bridge")
        descriptor = read_json(os.path.join(self.control, "project.json"))
        if descriptor.get("format_version") != 1 or descriptor.get("protocol") != PROTOCOL:
            raise ValueError("unsupported project descriptor")
        self.project_id = descriptor["project_id"]
        if not isinstance(self.project_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", self.project_id):
            raise ValueError("invalid project identity")
        self.base_branch = descriptor["base_branch_id"]
        self.handle = None
        self.acquire()
        self.outbox_path = os.path.join(self.control, "client-outbox.json")
        self.adoption_path = os.path.join(self.control, "client-adoption.json")
        try:
            outbox = read_json(self.outbox_path)
            self.pending = outbox["event"] if outbox else None
            self.pending_context = outbox.get("context") if outbox else None
            self.reconcile_only = outbox.get("reconcile_only", False) if outbox else False
        except FileNotFoundError:
            self.pending = None
            self.pending_context = None
            self.reconcile_only = False
        try:
            self.adoption = read_json(self.adoption_path)
        except FileNotFoundError:
            self.adoption = None
        self.state = None
        self.error = ""
        self.busy = False
        self.epoch = 0
        self.inbox = queue.Queue()
        self.position = None
        self.synced = None
        self.last_poll = 0
        self.target = None
        self.last_result = None
        self.navigation = None
        self.restored_adoption = None
        atexit.register(self.close)

    def acquire(self):
        handle = open(os.path.join(self.control, "gui.lock"), "a+b")
        if not os.fstat(handle.fileno()).st_size:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            raise RuntimeError("another GUI owns this project")
        self.handle = handle

    def close(self):
        if self.handle:
            self.handle.close()
            self.handle = None

    def connection(self):
        declaration = read_json(os.path.join(self.control, "connection.json"))
        if (not isinstance(declaration, dict) or declaration.get("protocol") != PROTOCOL
                or declaration.get("project_id") != self.project_id
                or not isinstance(declaration.get("root"), str)
                or os.path.normcase(os.path.realpath(declaration["root"])) != os.path.normcase(self.root)
                or type(declaration.get("port")) is not int or not 0 < declaration["port"] < 65536
                or not isinstance(declaration.get("instance_id"), str) or not declaration["instance_id"]):
            raise ValueError("invalid bridge discovery")
        instance = str(uuid.UUID(declaration["instance_id"]))
        expected = os.path.join(tempfile.gettempdir(), "renpi-bridge", self.project_id, instance, "bridge.token")
        token_file = declaration.get("token_file")
        if not isinstance(token_file, str) or os.path.normcase(os.path.realpath(token_file)) != os.path.normcase(os.path.realpath(expected)):
            raise ValueError("unexpected bridge credential location")
        with open(token_file, encoding="ascii") as stream:
            token = stream.read(65).strip()
        if not re.fullmatch(r"[0-9a-f]{64}", token):
            raise ValueError("invalid bridge credential")
        return declaration, token

    def request(self, body=None):
        declaration, token = self.connection()
        # HTTPConnection uses neither environment proxies nor redirect handlers.
        connection = http.client.HTTPConnection("127.0.0.1", declaration["port"], timeout=10)
        try:
            connection.request("GET" if body is None else "POST", "/status" if body is None else "/event",
                body=None if body is None else json.dumps(body).encode("utf-8"),
                headers={"Authorization": "Bearer " + token,
                         "X-Renpi-Instance": declaration["instance_id"], "Content-Type": "application/json"})
            with connection.getresponse() as response:
                raw = response.read(4 * 1024 * 1024 + 1)
                if len(raw) > 4 * 1024 * 1024:
                    raise ValueError("bridge response exceeds limit")
                if 300 <= response.status < 400:
                    raise ValueError("bridge redirect rejected")
                data = json.loads(raw)
                if not isinstance(data, dict) or not 200 <= response.status < 300 or data.get("ok") is not True:
                    error_type = Rejected if 400 <= response.status < 500 and response.status not in (401, 408, 429) else RuntimeError
                    raise error_type("bridge error: " + str(data.get("error") if isinstance(data, dict) else response.status))
                state = data.get("state")
                if not isinstance(state, dict) or state.get("project_id") != self.project_id:
                    raise ValueError("bridge response project mismatch")
                return data
        finally:
            connection.close()

    def launch(self, body=None):
        if self.busy:
            return False
        self.busy = True
        epoch = self.epoch
        def worker():
            try:
                result, error = self.request(body), None
            except Exception as exc:
                result, error = None, exc
            self.inbox.put((epoch, body, result, error))
        threading.Thread(target=worker, daemon=True).start()
        return True

    def send(self, event):
        if self.busy or self.pending:
            return False
        body = dict(event, project_id=self.project_id, request_id=str(uuid.uuid4()))
        self.pending = body
        self.pending_context = self.position
        self.reconcile_only = False
        self.save_outbox()
        self.error = ""
        return self.launch(body)

    def save_outbox(self):
        write_json(self.outbox_path, dict(event=self.pending, context=self.pending_context,
                                         reconcile_only=self.reconcile_only) if self.pending else None)

    def reset_reading(self):
        """Load changes reading intent even when its coordinates happen to match."""
        self.epoch += 1
        self.synced = None
        self.navigation = None
        self.target = None
        if self.pending:
            self.reconcile_only = True
            self.save_outbox()

    def reconnect(self):
        self.error = ""
        return self.launch(self.pending)

    def observe(self, branch, anchor):
        value = (branch, anchor)
        if value != self.position:
            if self.pending and self.pending_context is not None and tuple(self.pending_context) != value:
                self.reconcile_only = True
                self.save_outbox()
            self.position = value
            self.synced = None
            self.target = None
            self.navigation = None
            self.epoch += 1

    def pump(self):
        while not self.inbox.empty():
            epoch, body, data, error = self.inbox.get_nowait()
            self.busy = False
            if error:
                self.error = str(error)
                if isinstance(error, Rejected) and body and self.pending and body["request_id"] == self.pending["request_id"]:
                    write_json(self.outbox_path, None)
                    self.pending = None
                    self.synced = None
                continue
            reconcile = self.reconcile_only or (self.pending_context is not None and
                tuple(self.pending_context) != self.position)
            # A committed receipt can retire its outbox even if reading rolled back.
            if body is not None and self.pending and body["request_id"] == self.pending["request_id"]:
                write_json(self.outbox_path, None)
                self.pending = None
            if epoch != self.epoch:
                continue
            self.error = ""
            self.state = data["state"]
            result = data.get("result", {})
            if body:
                self.last_result = result
            if body and body["type"] == "position":
                actual = self.state["position"]
                reported = (body.get("branch_id"), body.get("anchor_id"))
                authoritative = (actual.get("branch_id"), actual.get("anchor_id"))
                self.synced = self.position if reported == self.position == authoritative else None
            if body and body["type"] in ("choose", "retry") and not reconcile:
                # Replays use current HEAD, never the original receipt's target.
                self.target = self.state["head_branch_id"] if result.get("replay") else result.get("branch_id")
                self.navigation = self.state["position"]
            adoption = self.state.get("adoption")
            if adoption and adoption.get("phase") == "awaiting_load":
                if self.adoption != adoption:
                    write_json(self.adoption_path, adoption)
                    self.adoption = adoption
            elif self.adoption and adoption and adoption.get("phase") in ("committed", "rolled_back"):
                write_json(self.adoption_path, None)
                self.adoption = None
        if not self.busy and not self.pending and not self.error and not self.navigation:
            if self.position and self.synced != self.position and not self.adoption:
                self.send(dict(type="position", branch_id=self.position[0], anchor_id=self.position[1]))
            elif time.monotonic() - self.last_poll > 1:
                self.last_poll = time.monotonic()
                self.launch()

    def choose(self, option_id, text, retry=False):
        if self.synced != self.position or not self.state:
            return False
        return self.send(dict(type="retry" if retry else "choose", branch_id=self.position[0],
            anchor_id=self.position[1], position_revision=self.state["position"]["revision"], option_id=option_id, text=text))

    def record_load(self, marker):
        self.reset_reading()
        self.restored_adoption = dict(marker) if isinstance(marker, dict) else None
        self.state = None

    def can_confirm(self, marker):
        authoritative = self.state.get("adoption") if self.state else None
        values = (self.adoption, authoritative, marker, self.restored_adoption)
        keys = ("id", "branch_id", "candidate_id", "entry_label", "anchor_id")
        return all(isinstance(value, dict) for value in values) and all(
            all(value.get(key) == self.adoption.get(key) for key in keys) for value in values)

    def loaded(self, has_label, marker):
        if not self.can_confirm(marker):
            self.error = "Restored adoption identity differs. Reload the current candidate before confirmation."
            return False
        return self.load_receipt(bool(has_label(self.adoption["entry_label"])))

    def reject_load(self):
        return self.load_receipt(False)

    def load_receipt(self, success):
        adoption = self.adoption
        authoritative = self.state.get("adoption") if self.state else None
        if not adoption or not authoritative or adoption.get("id") != authoritative.get("id"):
            return False
        return self.send(dict(type="loaded", adoption_id=adoption["id"], branch_id=adoption["branch_id"],
            candidate_id=adoption["candidate_id"], anchor_id=adoption["anchor_id"], success=success))



client = None


def get_client(root):
    global client
    if client is None:
        client = Client(root)
    return client


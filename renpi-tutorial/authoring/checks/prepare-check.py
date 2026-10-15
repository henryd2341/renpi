"""Stage independent scripts and symlinked assets for the retained manual preview."""
import importlib.util
import json
import os
from pathlib import Path

helper = Path(__file__).resolve().parents[3] / "extensions/renpi/validation_files.py"
spec = importlib.util.spec_from_file_location("renpi_validation_files", helper)
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)
stage_file, sha = staging.stage_file, staging.sha


def verify_links(project, sdk, report):
    for key in ("asset_links", "sdk_asset_links"):
        if key not in report:
            raise ValueError("Restage the preview with prepare-check.py to record asset links")
        for relative, record in report[key].items():
            dest, src = project / relative, Path(record["target"])
            allowed_dest = (project / "authoring/checks/opening/game", project / "authoring/checks/isolated-sdk/renpy/common")
            if not any(dest.is_relative_to(root) for root in allowed_dest) or dest.parent.resolve() != dest.parent:
                raise ValueError(f"Unexpected validation link location: {dest}")
            if not (src.is_relative_to(project) or src.is_relative_to(sdk / "renpy/common")) or src.resolve(strict=True) != src:
                raise ValueError(f"Unexpected validation source: {src}")
            if src.suffix.lower() in staging.WRITABLE or not staging.linked_to(dest, src):
                raise ValueError(f"Validation link changed: {dest}")
            if sha(src) != record["sha256"]:
                raise ValueError(f"Validation linked source changed: {src}")


def prepare(project, sdk):
    project, sdk = project.resolve(), sdk.resolve()
    if not (sdk / "renpy.py").is_file():
        raise ValueError("RENPY_HOME must identify the installed SDK")
    check = project / "authoring/checks/opening"
    if (check / ".renpi-live/bridge").exists():
        raise ValueError("Preview contains production bridge state")
    game = check / "game"
    common = project / "authoring/checks/isolated-sdk/renpy/common"
    sdk_links = {}
    for src in (sdk / "renpy/common").rglob("*"):
        if "__pycache__" in src.parts or src.suffix.lower() in {".rpyc", ".rpymc", ".pyc", ".pyo"}:
            continue
        if src.is_symlink() or getattr(src, "is_junction", lambda: False)():
            raise ValueError(f"Unexpected SDK source link: {src}")
        if src.is_file():
            dest = common / src.relative_to(sdk / "renpy/common")
            if stage_file(src, dest) == "symlink":
                sdk_links[str(dest.relative_to(project))] = {"target": str(src), "sha256": sha(src)}
    records, links = {}, {}

    def stage(src, dest):
        storage = stage_file(src, dest)
        records[src.relative_to(project).as_posix()] = sha(src)
        if storage == "symlink":
            links[dest.relative_to(project).as_posix()] = {"target": str(src), "sha256": sha(src)}

    for name in ("options.rpy", "screens.rpy", "opening.rpy"):
        stage(project / "authoring/shared/tutorial" / name, game / name)
    for src in (project / "authoring/shared/tutorial/fonts").iterdir():
        if src.suffix.lower() in (".ttf", ".txt"):
            stage(src, game / "fonts" / src.name)
    for folder in ("images", "gui/renpi"):
        for src in (project / "game" / folder).glob("*.png"):
            stage(src, game / folder / src.name)
    for rel in ("renpi_bridge.rpy", "python-packages/renpi_bridge.py"):
        stage(project / "game" / rel, game / rel)
    # User forbids E2E testing. Stage only the non-production boundary and lint hook.
    for name in ("check-boundary.rpy", "say-layout-check.rpy"):
        stage(project / "authoring/checks/fixtures" / name, game / name)
    report = {"purpose": "isolated preview, NOT published or bridge-validated", "sdk": str(sdk),
              "project": str(check), "sources_sha256": records, "asset_links": links,
              "sdk_asset_links": sdk_links, "ignored_checks": [],
              "retention": "Reused by start-preview.cmd; release only after that preview reference is retired.",
              "external_calls": "renpi_choice overridden by explicit non-production boundary only in checks"}
    verify_links(project, sdk, report)
    (project / "authoring/checks/input-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return check


if __name__ == "__main__":
    print(prepare(Path(__file__).resolve().parents[2], Path(os.environ.get("RENPY_HOME", ""))))

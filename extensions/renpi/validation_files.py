"""Validation inputs: locate the SDK, link media, and isolate writable scripts."""
import hashlib
import os
from pathlib import Path
import shutil
import uuid

COPY_LIMIT = 1024 * 1024
MEDIA = set(".png .apng .jpg .jpeg .webp .gif .avif .bmp .tga .tif .tiff .svg .ico .ogg .opus .mp3 .wav .flac .aac .aif .aiff .m4a .mp4 .m4v .mkv .mpg .mpeg .webm .ogv .avi .mov .ttf .ttc .otf .woff .woff2 .rpa".split())
WRITABLE = set(".rpy .rpym .rpyc .rpymc .py .pyc .pyo".split())


def sdk_path(argument=None):
    value = argument if argument is not None else os.environ.get("RENPY_HOME")
    if not value or not value.strip():
        raise SystemExit("Pass the RenPy SDK directory or set RENPY_HOME.")
    sdk = Path(value).expanduser().resolve()
    for relative in ("renpy.py", "lib/py3-windows-x86_64/python.exe"):
        if not (sdk / relative).is_file():
            raise SystemExit(f"RenPy SDK file not found: {sdk / relative}")
    if not (sdk / "renpy/common").is_dir():
        raise SystemExit(f"RenPy SDK directory not found: {sdk / 'renpy/common'}")
    return sdk


def sha(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def linked_to(dest, src):
    if not dest.is_symlink():
        return False
    target = str(dest.readlink())
    # Windows readlink exposes the extended-length prefix, unlike Path.resolve().
    if target.startswith("\\\\?\\UNC\\"):
        target = "\\\\" + target[8:]
    elif target.startswith("\\\\?\\"):
        target = target[4:]
    return Path(target) == src and dest.resolve(strict=True) == src


def stage_file(src, dest):
    src, dest = Path(src).absolute(), Path(dest).absolute()
    if src.resolve(strict=True) != src or src.is_symlink() or not src.is_file():
        raise ValueError(f"Validation source must be a regular file without links: {src}")
    if dest.parent.resolve() != dest.parent:
        raise ValueError(f"Validation destination contains a directory link: {dest}")
    linked = src.stat().st_size >= COPY_LIMIT or src.suffix.lower() in MEDIA
    if linked and src.suffix.lower() in WRITABLE:
        raise ValueError(f"Oversized writable validation input: {src}; split or separately isolate it first.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_symlink():
        if linked and linked_to(dest, src):
            return "symlink"
        raise ValueError(f"Unexpected existing validation link: {dest}")
    if linked:
        if dest.exists() and sha(dest) != sha(src):
            raise ValueError(f"Preserve changed validation asset before replacing it: {dest}")
        temporary = dest.with_name(f"{dest.name}.{uuid.uuid4()}.link")
        try:
            try:
                temporary.symlink_to(src)
            except OSError as error:
                raise RuntimeError(f"Validation requires a file symlink: {dest}; check symlink permission. No copy fallback.") from error
            # Replace only an identical old scratch copy, after the new link exists.
            os.replace(temporary, dest)
        finally:
            if temporary.is_symlink():
                temporary.unlink()
        return "symlink"
    shutil.copy2(src, dest)
    return "copy"

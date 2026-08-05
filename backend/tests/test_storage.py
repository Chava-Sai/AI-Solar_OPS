"""
GCS-backed document/ChromaDB durability. Uses a fake in-memory bucket (no
live GCS credentials available in this environment) that mimics exactly the
blob API surface app/storage.py calls — proves the tar/upload/restore round
trip is actually correct, not just that it doesn't throw.
"""
import io
from pathlib import Path

import pytest


class FakeBlob:
    def __init__(self, store, name):
        self._store = store
        self.name = name

    def upload_from_filename(self, path):
        self._store[self.name] = Path(path).read_bytes()

    def upload_from_file(self, file_obj, content_type=None):
        self._store[self.name] = file_obj.read()

    def download_to_file(self, file_obj):
        file_obj.write(self._store[self.name])

    def exists(self):
        return self.name in self._store

    def delete(self):
        del self._store[self.name]


class FakeBucket:
    def __init__(self):
        self.store = {}

    def blob(self, name):
        return FakeBlob(self.store, name)


@pytest.fixture()
def storage_module(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET_NAME", "fake-test-bucket")
    import importlib
    import app.storage as storage
    importlib.reload(storage)

    fake_bucket = FakeBucket()
    monkeypatch.setattr(storage, "_bucket", lambda: fake_bucket)
    return storage


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("GCS_BUCKET_NAME", raising=False)
    import importlib
    import app.storage as storage
    importlib.reload(storage)
    assert storage.is_enabled() is False
    # every operation should be a safe no-op, not an error, when disabled
    storage.upload_document_file(Path("/nonexistent"), "x.pdf")
    storage.delete_document_file("x.pdf")
    storage.backup_chroma_db("/nonexistent")
    storage.restore_chroma_backup_if_configured("/nonexistent")


def test_document_upload_and_delete_round_trip(storage_module, tmp_path):
    doc = tmp_path / "sop.pdf"
    doc.write_bytes(b"fake pdf bytes")

    storage_module.upload_document_file(doc, "sop.pdf")
    blob = storage_module._bucket().blob(storage_module.DOCUMENTS_PREFIX + "sop.pdf")
    assert blob.exists()

    storage_module.delete_document_file("sop.pdf")
    assert not blob.exists()


def test_chroma_backup_and_restore_round_trip(storage_module, tmp_path):
    # build a fake chroma_db directory with nested structure, like the real thing
    source = tmp_path / "chroma_db"
    source.mkdir()
    (source / "chroma.sqlite3").write_bytes(b"fake sqlite content")
    nested = source / "collection-uuid"
    nested.mkdir()
    (nested / "data_level0.bin").write_bytes(b"fake vector data")

    storage_module.backup_chroma_db(str(source))
    blob = storage_module._bucket().blob(storage_module.CHROMA_BACKUP_BLOB)
    assert blob.exists()

    # restore into a DIFFERENT directory — simulates a fresh container with no prior state
    restore_target = tmp_path / "restored_chroma_db"
    storage_module.restore_chroma_backup_if_configured(str(restore_target))

    assert (restore_target / "chroma.sqlite3").read_bytes() == b"fake sqlite content"
    assert (restore_target / "collection-uuid" / "data_level0.bin").read_bytes() == b"fake vector data"


def test_restore_with_no_backup_yet_is_a_safe_noop(storage_module, tmp_path):
    target = tmp_path / "chroma_db"
    target.mkdir()
    (target / "baked-in-snapshot.txt").write_bytes(b"shipped with the image")

    storage_module.restore_chroma_backup_if_configured(str(target))

    # nothing to restore yet — the baked-in snapshot must be left untouched
    assert (target / "baked-in-snapshot.txt").read_bytes() == b"shipped with the image"


def test_restore_replaces_stale_local_state_not_merges_it(storage_module, tmp_path):
    """A container that already has SOME local chroma state (e.g. the image's
    baked-in snapshot) must end up with exactly the GCS backup's contents —
    not a mix of both, which could resurrect deleted documents' chunks."""
    source = tmp_path / "chroma_db"
    source.mkdir()
    (source / "chroma.sqlite3").write_bytes(b"the real backup")
    storage_module.backup_chroma_db(str(source))

    target = tmp_path / "existing_local_chroma_db"
    target.mkdir()
    (target / "stale_file_from_old_image.txt").write_bytes(b"should not survive restore")

    storage_module.restore_chroma_backup_if_configured(str(target))

    assert (target / "chroma.sqlite3").read_bytes() == b"the real backup"
    assert not (target / "stale_file_from_old_image.txt").exists()

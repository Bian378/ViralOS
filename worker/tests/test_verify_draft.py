import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from test_build_short_draft import sample, sample_wav, FFMPEG_READY
import build_short_draft as builder
import verify_draft as verifier


class VerifyDraftTests(unittest.TestCase):
    @unittest.skipUnless(FFMPEG_READY, "Requires FFmpeg and DejaVu font")
    def test_full_audio_build_integrity_and_nonpublishing_result(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            wav=root/"tone.wav"
            sample_wav(wav)
            dest=root/"package"
            builder.build_draft(sample(root),dest,narration=wav,audio_rights_checked=True)
            report=verifier.verify_draft(dest)
            self.assertEqual(report["result"],"DRAFT_INTEGRITY_CHECK_PASSED")
            self.assertTrue(report["hasAudio"])
            self.assertFalse(report["rightsVerified"])
            self.assertFalse(report["uploadAllowed"])
            self.assertFalse(report["publicReleaseAllowed"])

    @unittest.skipUnless(FFMPEG_READY, "Requires FFmpeg and DejaVu font")
    def test_tampered_mp4_detected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            dest=root/"package"
            builder.build_draft(sample(root),dest,silent_preview=True)
            with (dest/"short-DRAFT.mp4").open("ab") as f:
                f.write(b"tamper")
            with self.assertRaisesRegex(ValueError,"SHA-256"):
                verifier.verify_draft(dest)

    @unittest.skipUnless(FFMPEG_READY, "Requires FFmpeg and DejaVu font")
    def test_tampered_source_manifest_detected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            dest=root/"package"
            builder.build_draft(sample(root),dest,silent_preview=True)
            source=dest/"source-DRAFT.json"
            source.write_text(source.read_text()+"\n")
            with self.assertRaisesRegex(ValueError,"SHA-256"):
                verifier.verify_draft(dest)

    @unittest.skipUnless(FFMPEG_READY, "Requires FFmpeg and DejaVu font")
    def test_receipt_claiming_public_release_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            dest=root/"package"
            builder.build_draft(sample(root),dest,silent_preview=True)
            file=dest/"draft-receipt.json"
            doc=json.loads(file.read_text())
            doc["publicReleaseAuthorized"]=True
            file.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError,"already-authorized"):
                verifier.verify_draft(dest)

    @unittest.skipUnless(FFMPEG_READY, "Requires FFmpeg and DejaVu font")
    def test_missing_audio_provenance_detected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            wav=root/"tone.wav"
            sample_wav(wav)
            dest=root/"package"
            builder.build_draft(sample(root),dest,narration=wav,audio_rights_checked=True)
            (dest/"narration-owned.wav").unlink()
            with self.assertRaisesRegex(ValueError,"Audio SHA"):
                verifier.verify_draft(dest)

    def test_missing_report_is_not_falsely_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            with self.assertRaisesRegex(ValueError,"Missing or linked"):
                verifier.verify_draft(root)

    def test_symlink_directory_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"link").symlink_to(root,target_is_directory=True)
            with self.assertRaisesRegex(ValueError,"actual local draft"):
                verifier.verify_draft(root/"link")


if __name__ == "__main__":
    unittest.main()

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_short_draft as pipeline
from test_render_from_plan import manifest

FFMPEG_READY = (shutil.which("ffmpeg") is not None and
                shutil.which("ffprobe") is not None and
                Path(pipeline.render.__globals__["FONT"]).is_file())


def sample(root):
    path = root / "input.json"
    path.write_text(json.dumps(manifest()), encoding="utf-8")
    return path


def sample_wav(path, seconds=6):
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
        "-i", f"sine=frequency=450:sample_rate=16000:duration={seconds}",
        "-c:a", "pcm_s16le", str(path)
    ], check=True, timeout=30)


class PipelineValidation(unittest.TestCase):
    def test_exactly_one_explicit_mode_is_required(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = sample(root)
            with self.assertRaisesRegex(ValueError, "exactly one"):
                pipeline.build_draft(source, root / "new")
            with self.assertRaisesRegex(ValueError, "exactly one"):
                pipeline.build_draft(source, root / "new", silent_preview=True,
                                     narration=root / "voice.wav")

    def test_denies_unapproved_audio_before_file_access(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = sample(root)
            with self.assertRaisesRegex(ValueError, "audio ownership"):
                pipeline.build_draft(source, root / "out", narration=root / "voice.wav")
            with self.assertRaisesRegex(ValueError, "voice-model license"):
                pipeline.build_draft(source, root / "out", piper_model=root / "model.onnx")
            self.assertFalse((root / "out").exists())

    def test_never_overwrites_existing_user_folder(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = sample(root)
            out = root / "existing"
            out.mkdir()
            (out / "important.txt").write_text("keep me")
            with self.assertRaisesRegex(FileExistsError, "Never overwrite"):
                pipeline.build_draft(source, out, silent_preview=True)
            self.assertEqual((out / "important.txt").read_text(), "keep me")

    def test_invalid_manifest_does_not_create_any_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            bad = root / "bad.json"
            bad.write_text("{}")
            with self.assertRaisesRegex(ValueError, "draft"):
                pipeline.build_draft(bad, root / "out", silent_preview=True)
            self.assertFalse((root / "out").exists())

    def test_missing_or_zero_revision_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            m = manifest()
            m["scenePlan"]["revision"] = 0
            bad = root / "old.json"
            bad.write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError, "saved project"):
                pipeline.build_draft(bad, root / "out", silent_preview=True)

    def test_hash_matches_exact_video_and_does_not_grant_upload(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = sample(root)
            with patch.object(pipeline, "render") as fake:
                def render_stub(manifest_file, movie, audio, **kwargs):
                    movie.write_bytes(b"draft video not a real mp4" * 100)
                    movie.with_suffix(".qc.json").write_text(
                        json.dumps({"output": str(movie), "audioAttached": False}))
                    return {"audioAttached": False}
                fake.side_effect = render_stub
                result = pipeline.build_draft(source, root / "out", silent_preview=True)
            self.assertEqual(
                result["draftMp4Sha256"],
                pipeline.hash_file(root / "out" / "short-DRAFT.mp4"))
            self.assertEqual(result["sourceManifestSha256"], pipeline.hash_file(source))
            self.assertFalse(result["privateUploadAuthorized"])
            self.assertFalse(result["publicReleaseAuthorized"])
            self.assertFalse(result["humanReviewed"])
            self.assertEqual(result["status"], "UNAPPROVED_DRAFT_LOCAL_ONLY")
            self.assertTrue((root / "out" / "draft-receipt.json").is_file())
            self.assertEqual(
                json.loads((root / "out" / "short-DRAFT.qc.json").read_text())["output"],
                "short-DRAFT.mp4")

    def test_partial_render_failure_removes_output_folder(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = sample(root)
            with patch.object(pipeline, "render", side_effect=RuntimeError("encoder failed")):
                with self.assertRaisesRegex(RuntimeError, "encoder failed"):
                    pipeline.build_draft(source, root / "out", silent_preview=True)
            self.assertFalse((root / "out").exists())

    @unittest.skipUnless(FFMPEG_READY, "FFmpeg and DejaVu font required")
    def test_real_offline_audio_mp4_package_with_valid_checksum(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = sample(root)
            wav = root / "owned-test-tone.wav"
            sample_wav(wav)
            package = root / "out"
            receipt = pipeline.build_draft(
                source, package, narration=wav, audio_rights_checked=True)
            self.assertTrue((package / "short-DRAFT.mp4").is_file())
            self.assertTrue((package / "short-DRAFT.qc.json").is_file())
            self.assertTrue((package / "captions-ESTIMATED-DRAFT.srt").is_file())
            self.assertIn("00:00:06,000", (package / "captions-ESTIMATED-DRAFT.srt").read_text())
            self.assertTrue((package / "source-DRAFT.json").is_file())
            self.assertTrue((package / "narration-owned.wav").is_file())
            self.assertEqual(receipt["audio"], "operator_wav")
            self.assertEqual(receipt["audioSha256"], pipeline.hash_file(wav))
            self.assertTrue(receipt["audioIncluded"])
            self.assertFalse(receipt["humanReviewed"])
            metadata = pipeline.render.__globals__["probe_json"]([
                "-show_entries",
                "stream=codec_type,codec_name,width,height:format=duration",
                str(package / "short-DRAFT.mp4")
            ])
            self.assertTrue(any(x.get("codec_type") == "audio"
                                for x in metadata["streams"]))
            self.assertTrue(any(x.get("codec_name") == "h264"
                                for x in metadata["streams"]))

    @unittest.skipUnless(FFMPEG_READY, "FFmpeg and DejaVu font required")
    def test_real_silent_offline_mp4_still_needs_review(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            receipt = pipeline.build_draft(
                sample(root), root / "out", silent_preview=True)
            self.assertFalse(receipt["audioIncluded"])
            self.assertEqual(receipt["audio"], "silent")
            self.assertEqual(receipt["status"], "UNAPPROVED_DRAFT_LOCAL_ONLY")
            self.assertEqual(receipt["subtitleTiming"], "ESTIMATED_NOT_SPEECH_SYNCED")


if __name__ == "__main__":
    unittest.main()

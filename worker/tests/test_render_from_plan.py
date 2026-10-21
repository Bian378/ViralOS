import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import render_from_plan as renderer


def manifest():
    return {
        "schemaVersion": 1,
        "kind": "viralos-draft-production-plan",
        "status": "unapproved_preproduction",
        "notForPublication": True,
        "subtitlesAreEstimated": True,
        "assetRights": "unverified",
        "scenePlan": {
            "projectId": "qa", "revision": 1, "fps": 30,
            "width": 1080, "height": 1920, "format": "mp4",
            "totalFrames": 60, "needsOwnerApproval": True,
            "voiceStatus": "not_generated",
            "mediaStatus": "not_generated",
            "exportStatus": "not_rendered",
            "scenes": [
                {
                    "order": 1, "startFrame": 0, "durationFrames": 30,
                    "text": "A new world of original stories",
                    "assetStatus": "not_selected", "rightsStatus": "unverified",
                    "captionCues": [
                        {"startFrame": 0, "durationFrames": 30, "text": "A new world"}
                    ],
                },
                {
                    "order": 2, "startFrame": 30, "durationFrames": 30,
                    "text": "This is a local draft, never published",
                    "assetStatus": "not_selected", "rightsStatus": "unverified",
                    "captionCues": [
                        {"startFrame": 30, "durationFrames": 30, "text": "Never published"}
                    ],
                },
            ]
        }
    }


class ValidationTests(unittest.TestCase):
    def load(self, body):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "plan.json"
            path.write_text(json.dumps(body), encoding="utf-8")
            return renderer.load_and_validate(path)

    def test_valid_and_non_public_manifest(self):
        self.assertEqual(self.load(manifest())["totalFrames"], 60)

    def test_unapproved_nonpublishing_required(self):
        bad = manifest()
        bad["notForPublication"] = False
        with self.assertRaisesRegex(ValueError, "unapproved"):
            self.load(bad)

    def test_wrong_resolution_rejected(self):
        bad = manifest()
        bad["scenePlan"]["height"] = 1080
        with self.assertRaisesRegex(ValueError, "1080 x 1920"):
            self.load(bad)

    def test_noncontiguous_scenes_rejected(self):
        bad = manifest()
        bad["scenePlan"]["scenes"][1]["startFrame"] = 29
        with self.assertRaisesRegex(ValueError, "contiguous"):
            self.load(bad)

    def test_missing_caption_frames_rejected(self):
        bad = manifest()
        bad["scenePlan"]["scenes"][0]["captionCues"][0]["durationFrames"] = 25
        with self.assertRaisesRegex(ValueError, "exactly cover"):
            self.load(bad)

    def test_fake_media_clearance_rejected(self):
        bad = manifest()
        bad["scenePlan"]["scenes"][0]["rightsStatus"] = "approved"
        with self.assertRaisesRegex(ValueError, "asset rights"):
            self.load(bad)

    def test_ffmpeg_escapes_textfile_paths(self):
        with tempfile.TemporaryDirectory() as d:
            filters = renderer.create_filters(manifest()["scenePlan"], Path(d))
            self.assertIn("expansion=none", filters)
            self.assertIn("enable='gte(t,0.000000)*lt(t,1.000000)'", filters)
            self.assertIn("enable='gte(t,1.000000)*lt(t,2.000000)'", filters)
            files = list(Path(d).glob("*.txt"))
            self.assertEqual(len(files), 4)

    def test_audio_requires_explicit_rights_check_before_probing(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.json"
            p.write_text(json.dumps(manifest()), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "audio rights declaration"):
                renderer.render(p, Path(d) / "x.mp4", Path(d) / "narration.wav")

    def test_outside_subprocess_is_not_called_for_invalid_input(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "invalid.json"
            path.write_text(json.dumps({"kind": "wrong"}), encoding="utf-8")
            with patch.object(renderer.subprocess, "run") as executor:
                with self.assertRaisesRegex(ValueError, "draft"):
                    renderer.render(path, Path(d) / "x.mp4")
                executor.assert_not_called()


    @unittest.skipUnless(
        __import__("shutil").which("ffmpeg") and __import__("shutil").which("ffprobe")
        and Path(renderer.FONT).is_file(),
        "FFmpeg or DejaVuSans not available on runner",
    )
    def test_actual_two_second_h264_preview_with_no_music_or_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest_path = root / "input.json"
            destination = root / "preview.mp4"
            manifest_path.write_text(json.dumps(manifest()), encoding="utf-8")
            result = renderer.render(manifest_path, destination)
            self.assertEqual(result["status"], "DRAFT_REQUIRES_HUMAN_REVIEW")
            self.assertEqual(result["width"], 1080)
            self.assertEqual(result["height"], 1920)
            self.assertEqual(result["fps"], 30)
            self.assertFalse(result["audioAttached"])
            self.assertFalse(result["humanApproved"])
            self.assertFalse(result["published"])
            self.assertTrue(destination.is_file())
            self.assertGreater(destination.stat().st_size, 1000)
            self.assertTrue(destination.with_suffix(".qc.json").exists())


    @unittest.skipUnless(
        __import__("shutil").which("ffmpeg") and __import__("shutil").which("ffprobe")
        and Path(renderer.FONT).is_file(),
        "FFmpeg or DejaVuSans not available on runner",
    )
    def test_actual_audio_muxes_into_private_draft_with_ffprobe(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            path=root/"input.json"
            output=root/"draft-audio.mp4"
            wav=root/"operator-supplied-test-tone.wav"
            path.write_text(json.dumps(manifest()),encoding="utf-8")
            renderer.subprocess.run([
                "ffmpeg","-nostdin","-v","error","-y",
                "-f","lavfi","-i","sine=frequency=440:duration=2:sample_rate=16000",
                "-c:a","pcm_s16le",str(wav)
            ],check=True)
            receipt=renderer.render(path,output,wav,True)
            self.assertTrue(receipt["audioAttached"])
            self.assertEqual(receipt["estimatedTimelineRetimedToNarration"],False)
            self.assertFalse(receipt["humanApproved"])
            self.assertFalse(receipt["published"])
            self.assertEqual(receipt["rights"],"UNVERIFIED_BY_SOFTWARE")

    @unittest.skipUnless(
        __import__("shutil").which("ffmpeg") and __import__("shutil").which("ffprobe")
        and Path(renderer.FONT).is_file(),
        "FFmpeg or DejaVuSans not available on runner",
    )
    def test_longer_voice_retimes_captioned_draft_when_user_opts_in(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            path=root/"input.json"
            output=root/"retimed-draft.mp4"
            wav=root/"demo-tone.wav"
            path.write_text(json.dumps(manifest()),encoding="utf-8")
            renderer.subprocess.run([
                "ffmpeg","-nostdin","-v","error","-y",
                "-f","lavfi","-i","sine=frequency=440:duration=6:sample_rate=16000",
                "-c:a","pcm_s16le",str(wav)
            ],check=True)
            receipt=renderer.render(path,output,wav,True,True)
            self.assertTrue(receipt["audioAttached"])
            self.assertTrue(receipt["estimatedTimelineRetimedToNarration"])
            self.assertEqual(receipt["originalPlanFrames"],60)
            self.assertEqual(receipt["renderedFrames"],180)
            self.assertEqual(receipt["subtitles"],"ESTIMATED_NOT_SPEECH_SYNCED")
            self.assertTrue(output.is_file())


if __name__ == "__main__":
    unittest.main()

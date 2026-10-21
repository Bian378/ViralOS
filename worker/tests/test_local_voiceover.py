import json
from pathlib import Path
import sys
import tempfile
import unittest
import wave
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import local_voiceover as local
from test_render_from_plan import manifest as mock_manifest


def setup(root):
    path = root / "draft.json"
    p = mock_manifest()
    # Provide a realistic 100-word source, while keeping the video test fixture short.
    p["scenePlan"]["scenes"][0]["text"] = "English " * 50
    p["scenePlan"]["scenes"][1]["text"] = "voice " * 50
    path.write_text(json.dumps(p), encoding="utf-8")
    model = root / "en_US-example-medium.onnx"
    model.write_bytes(b"not a real neural network in this mocked test")
    model.with_suffix(".onnx.json").write_text(
        json.dumps({"language": {"code": "en_US"}}), encoding="utf-8")
    return path, model, root / "voice.wav"

def fake_piper(cmd, *, text, check, timeout, stdout, stderr):
    destination = Path(cmd[cmd.index("-f") + 1])
    with wave.open(str(destination), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b"\x00\x00" * (16000 * 12))
    return None

class LocalPiperTests(unittest.TestCase):
    def test_reject_without_voice_license_review_before_dispatch(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path, model, out=setup(root)
            with patch.object(local.subprocess, "run") as runner:
                with self.assertRaisesRegex(ValueError,"license review"):
                    local.create_local_voiceover(path,model,out)
                runner.assert_not_called()

    def test_missing_local_model_and_config_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            model.unlink()
            with self.assertRaisesRegex(ValueError,"local Piper"):
                local.create_local_voiceover(path,model,out,True)
            model.write_bytes(b"test")
            model.with_suffix(".onnx.json").unlink()
            with self.assertRaisesRegex(ValueError,"matching local voice"):
                local.create_local_voiceover(path,model,out,True)

    def test_other_language_voice_is_not_allowed(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            model.with_suffix(".onnx.json").write_text(
                json.dumps({"language":{"code":"sv_SE"}}),encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"English Piper voice"):
                local.create_local_voiceover(path,model,out,True)

    def test_missing_piper_module_fails_with_no_calls(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            with patch.object(local.subprocess,"run") as run:
                with patch.object(local.importlib.util,"find_spec",return_value=None):
                    with self.assertRaisesRegex(ValueError,"locally installed Piper"):
                        local.create_local_voiceover(path,model,out,True)
                    run.assert_not_called()

    def test_correct_piper_cli_and_honest_voice_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            with patch.object(local.subprocess,"run",side_effect=fake_piper) as runner:
                with patch.object(local.importlib.util,"find_spec",return_value=object()):
                    report=local.create_local_voiceover(path,model,out,True)
            self.assertTrue(runner.called)
            args=runner.call_args
            self.assertEqual(args.args[0][1:3],["-m","piper"])
            self.assertEqual(args.args[0][3:5],["-m",model.stem])
            self.assertEqual(args.args[0][-1], " ".join(("English " * 50 + "voice " * 50).split()))
            self.assertEqual(args.kwargs["timeout"],180)
            self.assertNotIn("https://",str(args.args[0]))
            self.assertTrue(out.is_file())
            self.assertAlmostEqual(report["seconds"],12.0)
            self.assertTrue(report["needsTimelineRealignment"])
            self.assertFalse(report["perWordCaptionsSynchronized"])
            self.assertFalse(report["humanApproved"])
            self.assertFalse(report["published"])
            self.assertTrue(out.with_suffix(".voice.qc.json").is_file())

    def test_does_not_overwrite_existing_wav(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            out.write_bytes(b"important existing audio")
            with self.assertRaisesRegex(ValueError,"new, writable"):
                local.create_local_voiceover(path,model,out,True)
            self.assertEqual(out.read_bytes(),b"important existing audio")

    def test_malformed_manifest_cannot_start_piper(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            path.write_text("{}",encoding="utf-8")
            with patch.object(local.subprocess, "run") as runner:
                with self.assertRaisesRegex(ValueError,"draft"):
                    local.create_local_voiceover(path,model,out,True)
                runner.assert_not_called()

    def test_failed_command_removes_partial_audio(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            def failure(cmd,**kw):
                out.write_bytes(b"partial")
                raise RuntimeError("piper error")
            with patch.object(local.subprocess,"run",side_effect=failure):
                with patch.object(local.importlib.util,"find_spec",return_value=object()):
                    with self.assertRaisesRegex(RuntimeError,"piper error"):
                        local.create_local_voiceover(path,model,out,True)
            self.assertFalse(out.exists())

    def test_non_pcm_voice_rejected_without_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path,model,out=setup(root)
            def invalid(*args,**kw):
                out.write_bytes(b"not-a-wav")
            with patch.object(local.subprocess,"run",side_effect=invalid):
                with patch.object(local.importlib.util,"find_spec",return_value=object()):
                    with self.assertRaises(Exception):
                        local.create_local_voiceover(path,model,out,True)
            self.assertFalse(out.exists())
            self.assertFalse(out.with_suffix(".voice.qc.json").exists())

if __name__ == "__main__":
    unittest.main()

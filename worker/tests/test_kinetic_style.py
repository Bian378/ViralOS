"""Regression checks for procedural kinetic previews, without third-party assets."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from kinetic_style import create_kinetic_filters,gradient_source
from render_from_plan import render,FONT
from build_short_draft import build_draft
from verify_draft import verify_draft
from test_render_from_plan import manifest


class KineticSafetyTests(unittest.TestCase):
    def test_uses_only_builtin_gradient_source(self):
        source=gradient_source()
        self.assertTrue(source.startswith("gradients="))
        self.assertIn("540x960",source)
        self.assertIn("radial",source)
        self.assertNotIn("https",source)
        self.assertNotIn("movie=",source)

    def test_fails_closed_for_bad_shape(self):
        bad=manifest()["scenePlan"]
        bad["width"]=720
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,"1080x1920"):
                create_kinetic_filters(bad,Path(d))

    def test_uses_escaped_textfiles_not_dynamic_user_filter_expressions(self):
        data=manifest()["scenePlan"]
        data["scenes"][0]["text"]="Someone: playing <danger> with x=1, t=2"
        with tempfile.TemporaryDirectory() as d:
            graph=create_kinetic_filters(data,Path(d))
            self.assertIn("alpha=",graph)
            self.assertIn("sin(",graph)
            self.assertIn("drawgrid",graph)
            self.assertNotIn("Someone:",graph)
            self.assertNotIn("danger",graph)
            titles=list(Path(d).glob("kinetic-title-*.txt"))
            self.assertEqual(len(titles),2)
            self.assertIn("‹danger›",titles[0].read_text(encoding="utf-8"))

    def test_captions_still_use_storyboard_timestamps(self):
        data=manifest()["scenePlan"]
        with tempfile.TemporaryDirectory() as d:
            graph=create_kinetic_filters(data,Path(d))
            self.assertIn("gte(t,0.000000)*lt(t,1.000000)",graph)
            self.assertIn("gte(t,1.000000)*lt(t,2.000000)",graph)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe") and
                         Path(FONT).is_file(),"FFmpeg and DejaVu required")
    def test_real_kinetic_mp4_and_integrity_without_approval(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source=root/"source.json"
            source.write_text(json.dumps(manifest()),encoding="utf-8")
            target=root/"kinetic"
            receipt=build_draft(source,target,silent_preview=True,kinetic_preview=True)
            self.assertEqual(receipt["visualStyle"],"kinetic_procedural")
            self.assertFalse(receipt["publicReleaseAuthorized"])
            movie=target/"short-DRAFT.mp4"
            self.assertTrue(movie.stat().st_size>1000)
            qc=json.loads((target/"short-DRAFT.qc.json").read_text())
            self.assertEqual(qc["visualStyle"],"kinetic_procedural")
            self.assertFalse(qc["externalVisualAssets"])
            confirmed=verify_draft(target)
            self.assertFalse(confirmed["publicReleaseAllowed"])
            self.assertFalse(confirmed["rightsVerified"])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe") and
                         Path(FONT).is_file(),"FFmpeg and DejaVu required")
    def test_previous_default_style_remains_static(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source=root/"source.json"
            source.write_text(json.dumps(manifest()),encoding="utf-8")
            target=root/"classic"
            result=build_draft(source,target,silent_preview=True)
            self.assertEqual(result["visualStyle"],"typography_static")
            self.assertEqual(verify_draft(target)["result"],"DRAFT_INTEGRITY_CHECK_PASSED")


if __name__=="__main__":
    unittest.main()

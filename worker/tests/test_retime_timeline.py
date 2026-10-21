import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from retime_timeline import retime_plan_to_duration
from test_render_from_plan import manifest


class RetimeTests(unittest.TestCase):
    def test_scales_video_to_local_audio_duration_without_mutating_source(self):
        source=manifest()["scenePlan"]
        original=copy.deepcopy(source)
        resized=retime_plan_to_duration(source,12)
        self.assertEqual(resized["totalFrames"],360)
        self.assertEqual(resized["scenes"][0]["durationFrames"],180)
        self.assertEqual(resized["scenes"][1]["startFrame"],180)
        self.assertEqual(resized["scenes"][1]["durationFrames"],180)
        self.assertEqual(source,original)
        self.assertEqual(resized["subtitlesStatus"],"estimated_not_synced")

    def test_every_caption_remains_contiguous_at_new_length(self):
        data=manifest()["scenePlan"]
        data["scenes"][0]["captionCues"]=[
            {"startFrame":0,"durationFrames":11,"text":"first"},
            {"startFrame":11,"durationFrames":19,"text":"second"},
        ]
        resized=retime_plan_to_duration(data,7.1)
        self.assertEqual(resized["totalFrames"],213)
        self.assertEqual(sum(s["durationFrames"] for s in resized["scenes"]),213)
        for s in resized["scenes"]:
            position=s["startFrame"]
            for cue in s["captionCues"]:
                self.assertEqual(position,cue["startFrame"])
                self.assertGreater(cue["durationFrames"],0)
                position+=cue["durationFrames"]
            self.assertEqual(position,s["startFrame"]+s["durationFrames"])

    def test_length_limit_enforced(self):
        for seconds in (0,3,61,float("nan"),float("inf")):
            with self.subTest(seconds=seconds):
                with self.assertRaises(ValueError):
                    retime_plan_to_duration(manifest()["scenePlan"],seconds)

    def test_reject_malformed_scene_plan(self):
        scene=manifest()["scenePlan"]
        scene["scenes"][1]["startFrame"]=31
        with self.assertRaisesRegex(ValueError,"contiguous"):
            retime_plan_to_duration(scene,12)

if __name__ == "__main__":
    unittest.main()

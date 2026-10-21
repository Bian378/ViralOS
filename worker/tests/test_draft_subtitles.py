import unittest
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from draft_subtitles import srt_time,draft_srt
from retime_timeline import retime_plan_to_duration
from test_render_from_plan import manifest


class DraftSubtitlesTests(unittest.TestCase):
    def test_srt_time_and_frame_precision(self):
        self.assertEqual(srt_time(0),"00:00:00,000")
        self.assertEqual(srt_time(1),"00:00:00,033")
        self.assertEqual(srt_time(1800),"00:01:00,000")

    def test_original_plan_has_two_exactly_contiguous_cues(self):
        result=draft_srt(manifest()["scenePlan"])
        self.assertIn("00:00:00,000 --> 00:00:01,000",result)
        self.assertIn("00:00:01,000 --> 00:00:02,000",result)
        self.assertTrue(result.startswith("1\r\n"))
        self.assertIn("\r\n2\r\n",result)

    def test_retained_estimated_cues_follow_longer_voice(self):
        plan=retime_plan_to_duration(manifest()["scenePlan"],6)
        result=draft_srt(plan)
        self.assertIn("00:00:00,000 --> 00:00:03,000",result)
        self.assertIn("00:00:03,000 --> 00:00:06,000",result)
        self.assertNotIn("SYNCHRONIZED",result)

    def test_rejects_gapped_or_overlap_timing(self):
        plan=manifest()["scenePlan"]
        plan["scenes"][1]["captionCues"][0]["startFrame"]=29
        with self.assertRaisesRegex(ValueError,"contiguous"):
            draft_srt(plan)

    def test_rejects_missing_final_caption(self):
        plan=manifest()["scenePlan"]
        plan["scenes"].pop()
        with self.assertRaisesRegex(ValueError,"entire video"):
            draft_srt(plan)

    def test_html_and_control_characters_are_not_promoted_to_markup(self):
        plan=manifest()["scenePlan"]
        plan["scenes"][0]["captionCues"][0]["text"]="<script>hi</script>\n -->"
        result=draft_srt(plan)
        self.assertNotIn("<script>",result)
        self.assertIn("‹script›",result)
        self.assertIn("→",result)


if __name__=="__main__":
    unittest.main()

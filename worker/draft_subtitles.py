"""Write a frame-based draft SRT from a ViralOS production plan.

All timing is scene-relative and approximate. This function does not perform
speech transcription, forced alignment or copyright checks.
"""
from __future__ import annotations

import re


def srt_time(frames: int, fps: int = 30) -> str:
    if type(frames) is not int or frames < 0 or fps != 30:
        raise ValueError("Expected nonnegative frames at 30 FPS.")
    milliseconds = round(frames * 1000 / fps)
    h, remain = divmod(milliseconds, 3600000)
    m, remain = divmod(remain, 60000)
    sec, ms = divmod(remain, 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def draft_srt(plan: dict) -> str:
    if plan.get("fps") != 30 or type(plan.get("totalFrames")) is not int:
        raise ValueError("Missing 30 FPS production plan.")
    scenes = plan.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("Missing storyboard scenes.")
    end = 0
    index = 0
    blocks = []
    for scene in scenes:
        for cue in scene.get("captionCues", []):
            start = cue.get("startFrame")
            duration = cue.get("durationFrames")
            if type(start) is not int or type(duration) is not int or \
               duration < 1 or start != end:
                raise ValueError("Cue timing must be complete and contiguous.")
            text = cue.get("text")
            if not isinstance(text, str):
                raise ValueError("Caption text must be a string.")
            # Never render user-provided HTML or subtitle cue structures as markup.
            clean = re.sub(r"[\x00-\x1f\x7f]", " ", text).strip()
            clean = clean.replace("-->", "→").replace("<", "‹").replace(">", "›")
            if not clean or len(clean) > 320:
                raise ValueError("Invalid caption text.")
            index += 1
            blocks.append(
                f"{index}\r\n{srt_time(start)} --> {srt_time(start + duration)}"
                f"\r\n{clean}\r\n"
            )
            end = start + duration
    if index == 0 or end != plan["totalFrames"]:
        raise ValueError("Draft captions do not cover the entire video.")
    return "\r\n".join(blocks) + "\r\n"

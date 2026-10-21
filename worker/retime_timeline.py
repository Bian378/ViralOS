"""Deterministic proportional plan retiming for a finished operator-supplied WAV.

Only rescales *estimated* captions; does not perform speech recognition,
phoneme or word alignment. Preserve source plan and retain owner review gates.
"""
from __future__ import annotations

from copy import deepcopy
import math

def retime_plan_to_duration(plan: dict, narration_seconds: float) -> dict:
    if not math.isfinite(narration_seconds) or not 5 <= narration_seconds <= 60:
        raise ValueError("Narration needs a valid 5-60 second duration.")
    fps = plan.get("fps")
    frames = plan.get("totalFrames")
    if fps != 30 or type(frames) is not int or not 30 <= frames <= 1800:
        raise ValueError("Expected valid 30 FPS draft scene plan.")
    target = round(narration_seconds * fps)
    if target < 1 or target > 1800:
        raise ValueError("Narration exceeds valid frame length.")
    out = deepcopy(plan)
    scale = target / frames
    if not isinstance(out.get("scenes"), list) or not out["scenes"]:
        raise ValueError("Missing storyboard scenes.")
    position = 0
    for scene in out["scenes"]:
        old_start = scene["startFrame"]
        old_end = old_start + scene["durationFrames"]
        new_start = round(old_start * scale)
        new_end = round(old_end * scale)
        if new_start != position or new_end <= new_start:
            raise ValueError("Could not fit contiguous scenes to narration.")
        cue_pos = new_start
        for cue in scene["captionCues"]:
            cue_end = round((cue["startFrame"] + cue["durationFrames"]) * scale)
            if cue_end <= cue_pos or cue_end > new_end:
                raise ValueError("Retimed captions became invalid: use manual alignment.")
            cue["startFrame"] = cue_pos
            cue["durationFrames"] = cue_end - cue_pos
            cue_pos = cue_end
        if cue_pos != new_end:
            raise ValueError("Retimed captions did not cover scene.")
        scene["startFrame"] = new_start
        scene["durationFrames"] = new_end - new_start
        position = new_end
    if position != target:
        raise ValueError("Retimed scenes did not cover narration.")
    out["totalFrames"] = target
    out["estimatedSeconds"] = target / fps
    # This is explicitly NOT precise subtitle/audio synchronization.
    out["subtitlesStatus"] = "estimated_not_synced"
    return out

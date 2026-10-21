"""Render a private, original-typography YouTube Short DRAFT from ViralOS JSON export.

Usage: python worker/render_from_plan.py plan-DRAFT.json out.mp4
Optional narration already owned/licensed by the operator:
    --narration narration.wav --audio-rights-checked
No network downloads, AI calls, asset acquisition or platform upload.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile
import textwrap
from fractions import Fraction
from retime_timeline import retime_plan_to_duration
from kinetic_style import create_kinetic_filters, gradient_source

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FPS = 30
MAX_FRAMES = 1800


def load_and_validate(manifest_file: Path) -> dict:
    data = json.loads(manifest_file.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("kind") != "viralos-draft-production-plan":
        raise ValueError("Requires a ViralOS draft production plan JSON.")
    if data.get("status") != "unapproved_preproduction" or \
       data.get("notForPublication") is not True or \
       data.get("subtitlesAreEstimated") is not True or \
       data.get("assetRights") != "unverified":
        raise ValueError("Only unapproved draft plans are accepted.")
    plan = data.get("scenePlan")
    if not isinstance(plan, dict) or plan.get("fps") != FPS or \
       plan.get("width") != 1080 or plan.get("height") != 1920 or \
       plan.get("format") != "mp4" or plan.get("needsOwnerApproval") is not True:
        raise ValueError("Invalid 1080 x 1920, 30 fps draft plan.")
    if plan.get("voiceStatus") != "not_generated" or \
       plan.get("mediaStatus") != "not_generated" or \
       plan.get("exportStatus") != "not_rendered":
        raise ValueError("Production statuses do not match the draft renderer.")
    frames = plan.get("totalFrames")
    if type(frames) is not int or not FPS <= frames <= MAX_FRAMES:
        raise ValueError("Draft duration must be 1-60 seconds.")
    scenes = plan.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 8:
        raise ValueError("Expected one to eight storyboard scenes.")
    position = 0
    for i, scene in enumerate(scenes):
        if not isinstance(scene, dict) or scene.get("order") != i + 1 or \
           scene.get("startFrame") != position or \
           type(scene.get("durationFrames")) is not int or scene["durationFrames"] < 1 or \
           not isinstance(scene.get("text"), str) or not scene["text"].strip() or \
           len(scene["text"]) > 1500 or \
           scene.get("assetStatus") != "not_selected" or \
           scene.get("rightsStatus") != "unverified":
            raise ValueError("Invalid contiguous storyboard scene or unknown asset rights.")
        start = position
        position += scene["durationFrames"]
        cues = scene.get("captionCues")
        if not isinstance(cues, list) or not cues:
            raise ValueError("Missing captions.")
        for cue in cues:
            if not isinstance(cue, dict) or type(cue.get("startFrame")) is not int or \
               type(cue.get("durationFrames")) is not int or cue["durationFrames"] < 1 or \
               cue["startFrame"] != start or \
               not isinstance(cue.get("text"), str) or not cue["text"].strip() or \
               len(cue["text"]) > 300:
                raise ValueError("Invalid subtitle timing or caption text.")
            start += cue["durationFrames"]
        if start != position:
            raise ValueError("Caption cues must exactly cover their scene.")
    if position != frames:
        raise ValueError("Storyboard does not cover the expected total duration.")
    return plan


def probe_json(args: list[str]) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-of", "json", *args],
        check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    return json.loads(proc.stdout)


def _filter_path(path: Path) -> str:
    # FFmpeg filtergraph filenames must be escaped as filter VALUES.
    return str(path.resolve()).replace("\\", "\\\\").replace(":", "\\:") \
        .replace("'", "\\'").replace(",", "\\,")


def create_filters(plan: dict, work_dir: Path) -> str:
    filters = ["drawbox=x=0:y=0:w=iw:h=16:color=0x54cab3:t=fill"]
    for scene in plan["scenes"]:
        index = scene["order"]
        start = scene["startFrame"] / FPS
        end = (scene["startFrame"] + scene["durationFrames"]) / FPS
        scene_path = work_dir / f"scene-{index}.txt"
        raw = scene["text"].replace("<", "‹").replace(">", "›")
        scene_path.write_text("\n".join(textwrap.wrap(raw, width=28)), encoding="utf-8")
        filters.append(
            f"drawtext=fontfile={FONT}:textfile={_filter_path(scene_path)}:"
            "expansion=none:fontcolor=white:fontsize=56:line_spacing=24:"
            "box=1:boxcolor=0x0a1925@0.70:boxborderw=24:"
            "x=(w-text_w)/2:y=(h-text_h)/2:"
            f"enable='gte(t,{start:.6f})*lt(t,{end:.6f})'"
        )
        for cue_index, cue in enumerate(scene["captionCues"]):
            caption_path = work_dir / f"caption-{index}-{cue_index}.txt"
            text = cue["text"].replace("<", "‹").replace(">", "›")
            caption_path.write_text("\n".join(textwrap.wrap(text, width=27)),
                                    encoding="utf-8")
            cue_start = cue["startFrame"] / FPS
            cue_end = (cue["startFrame"] + cue["durationFrames"]) / FPS
            filters.append(
                f"drawtext=fontfile={FONT}:textfile={_filter_path(caption_path)}:"
                "expansion=none:fontcolor=0x92f0ce:fontsize=48:"
                "box=1:boxcolor=black@0.8:boxborderw=18:"
                "x=(w-text_w)/2:y=h*0.83-text_h/2:"
                f"enable='gte(t,{cue_start:.6f})*lt(t,{cue_end:.6f})'"
            )
    return ",".join(filters)


def render(manifest: Path, destination: Path, narration: Path | None = None,
           audio_rights_checked: bool = False,
           fit_narration: bool = False,
           kinetic_preview: bool = False) -> dict:
    plan = load_and_validate(manifest)
    if narration and not audio_rights_checked:
        raise ValueError("Explicit audio rights declaration required.")
    if fit_narration and not narration:
        raise ValueError("Narration file required for timeline fitting.")
    original_frames = plan["totalFrames"]
    total_seconds = plan["totalFrames"] / FPS
    if narration:
        metadata = probe_json(["-show_entries", "format=duration", str(narration.resolve())])
        audio_seconds = float(metadata["format"]["duration"])
        if not math.isfinite(audio_seconds) or audio_seconds <= 0:
            raise ValueError("Narration has invalid duration.")
        if fit_narration:
            plan = retime_plan_to_duration(plan, audio_seconds)
            total_seconds = plan["totalFrames"] / FPS
        elif abs(audio_seconds - total_seconds) > 0.75:
            raise ValueError("Narration must match scene length within 0.75s or use --fit-narration.")
    destination = destination.resolve()
    if destination.suffix.lower() != ".mp4":
        raise ValueError("Output must be a .mp4 file.")
    with tempfile.TemporaryDirectory() as directory:
        filters = (create_kinetic_filters(plan, Path(directory))
                   if kinetic_preview else create_filters(plan, Path(directory)))
        source = (gradient_source() if kinetic_preview
                  else f"color=c=0x0b1925:s=1080x1920:r={FPS}")
        cmd = [
            "ffmpeg", "-nostdin", "-v", "error", "-y",
            "-f", "lavfi", "-i", source,
        ]
        if narration:
            cmd += ["-i", str(narration.resolve())]
        cmd += ["-vf", filters, "-map", "0:v:0"]
        if narration:
            cmd += ["-map", "1:a:0"]
        cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
                "-crf", "25", "-r", str(FPS), "-frames:v", str(plan["totalFrames"])]
        if narration:
            cmd += ["-c:a", "aac", "-b:a", "128k"]
        else:
            cmd += ["-an"]
        cmd += ["-movflags", "+faststart", str(destination)]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    meta = probe_json([
        "-show_entries", "stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration",
        str(destination),
    ])
    streams = meta.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None or video.get("width") != 1080 or video.get("height") != 1920 or \
       video.get("codec_name") != "h264" or \
       Fraction(video.get("avg_frame_rate", "0/1")) != FPS:
        raise ValueError("Rendered MP4 failed technical verification.")
    audio_present = any(s.get("codec_type") == "audio" for s in streams)
    if audio_present != bool(narration):
        raise ValueError("Unexpected audio stream presence.")
    qc = {
        "output": str(destination), "status": "DRAFT_REQUIRES_HUMAN_REVIEW",
        "sourceFootageUsed": False,
        "visualStyle": "kinetic_procedural" if kinetic_preview else "typography_static",
        "externalVisualAssets": False,
        "width": 1080, "height": 1920, "fps": FPS,
        "durationSeconds": float(meta["format"]["duration"]),
        "audioAttached": audio_present,
        "estimatedTimelineRetimedToNarration": bool(narration and fit_narration),
        "originalPlanFrames": original_frames,
        "renderedFrames": plan["totalFrames"],
        "subtitles": "ESTIMATED_NOT_SPEECH_SYNCED",
        "rights": "UNVERIFIED_BY_SOFTWARE",
        "humanApproved": False,
        "published": False,
    }
    destination.with_suffix(".qc.json").write_text(
        json.dumps(qc, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return qc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--narration", type=Path, default=None)
    parser.add_argument("--audio-rights-checked", action="store_true")
    parser.add_argument("--fit-narration", action="store_true",
                        help="Retimes estimated scenes/captions to provided narration; not speech alignment")
    parser.add_argument("--kinetic-preview", action="store_true",
                        help="Opt in to procedural animated gradient and moving typography")
    args = parser.parse_args()
    result = render(args.manifest, args.destination, args.narration,
                    args.audio_rights_checked, args.fit_narration, args.kinetic_preview)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Original, procedural FFmpeg kinetic typography for review-only ViralOS Shorts.

No stock footage, third-party images, paid models, remote API, automatic
publishing or inferred media rights. Scene and caption timing are estimated.
"""
from __future__ import annotations

import textwrap
from pathlib import Path

FPS = 30
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def gradient_source() -> str:
    """Use FFmpeg built-in moving radial gradient at half output resolution."""
    return (
        "gradients=s=540x960:r=30:"
        "c0=0x081724:c1=0x10354a:c2=0x247268:n=3:"
        "type=radial:speed=0.015"
    )


def _path(path: Path) -> str:
    # Escape filtergraph textfile VALUE, never embed user text in filter options.
    return str(path.resolve()).replace("\\", "\\\\").replace(":", "\\:") \
        .replace("'", "\\'").replace(",", "\\,")


def _alpha(at: float) -> str:
    # Escaped FFmpeg expression commas; alpha ramps from transparent to opaque.
    return f"min(1\\,max(0\\,(t-{at:.6f})*3))"


def create_kinetic_filters(plan: dict, work_dir: Path) -> str:
    """Build animated text overlays from an ALREADY VALIDATED scene plan."""
    if plan.get("width") != 1080 or plan.get("height") != 1920 or plan.get("fps") != FPS:
        raise ValueError("Kinetic preview accepts only verified 1080x1920@30fps plans.")
    scenes = plan.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 8:
        raise ValueError("Kinetic preview requires 1-8 validated scenes.")
    filters = [
        "scale=1080:1920:flags=bicubic",
        "drawgrid=width=120:height=120:thickness=1:color=white@0.035",
        "drawbox=x=0:y=0:w=iw:h=13:color=0x66e0c9:t=fill",
        "drawbox=x=85:y=148:w=10:h=110:color=0x66e0c9@0.65:t=fill",
    ]
    for scene in scenes:
        index = scene["order"]
        start = scene["startFrame"] / FPS
        end = (scene["startFrame"] + scene["durationFrames"]) / FPS
        headline = " ".join(scene["text"].split()[:14])
        title_file = work_dir / f"kinetic-title-{index}.txt"
        title_file.write_text("\n".join(textwrap.wrap(headline.replace("<", "‹").replace(">", "›"), width=20)), encoding="utf-8")
        kicker_file = work_dir / f"kinetic-kicker-{index}.txt"
        kicker_file.write_text(f"VIRALOS  /  {index:02d} OF {len(scenes):02d}   /   DRAFT", encoding="utf-8")
        on = f"gte(t,{start:.6f})*lt(t,{end:.6f})"
        filters.append(
            f"drawtext=fontfile={FONT}:textfile={_path(kicker_file)}:"
            "expansion=none:fontsize=30:fontcolor=0x9debdc:"
            "x=100:y=165:"
            f"enable='{on}'"
        )
        filters.append(
            f"drawtext=fontfile={FONT}:textfile={_path(title_file)}:"
            "expansion=none:fontsize=69:line_spacing=19:fontcolor=white:"
            "borderw=2:bordercolor=0x0a1925@0.80:"
            "box=1:boxcolor=0x081824@0.38:boxborderw=24:"
            f"x=(w-text_w)/2+22*sin((t-{start:.6f})*0.9):"
            f"y=(h-text_h)/2-170+17*cos((t-{start:.6f})*0.85):"
            f"alpha='{_alpha(start)}':enable='{on}'"
        )
        for j, cue in enumerate(scene["captionCues"]):
            path = work_dir / f"kinetic-caption-{index}-{j}.txt"
            cleaned = cue["text"].replace("<", "‹").replace(">", "›")
            path.write_text("\n".join(textwrap.wrap(cleaned, width=27)), encoding="utf-8")
            cue_start = cue["startFrame"] / FPS
            cue_end = (cue["startFrame"] + cue["durationFrames"]) / FPS
            cue_on = f"gte(t,{cue_start:.6f})*lt(t,{cue_end:.6f})"
            filters.append(
                f"drawtext=fontfile={FONT}:textfile={_path(path)}:"
                "expansion=none:fontsize=46:line_spacing=12:fontcolor=0xaaffd7:"
                "box=1:boxcolor=0x041321@0.79:boxborderw=20:"
                f"x=(w-text_w)/2:y=h*0.79-text_h/2+12*sin((t-{cue_start:.6f})*1.8):"
                f"alpha='{_alpha(cue_start)}':enable='{cue_on}'"
            )
    return ",".join(filters)

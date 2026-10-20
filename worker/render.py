"""Standalone renderer foundation. Not deployed or connected to the dashboard.
Usage: python render.py composition.json output.mp4 [narration.wav]
The input is an original script JSON: {"script": "...paragraphs...", "title": "..."}.
A narration file must be owned/licensed by the operator. No network downloads.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import textwrap

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

def render(source, destination, narration=None):
    data = json.loads(pathlib.Path(source).read_text(encoding="utf-8"))
    script = str(data.get("script", "")).strip()
    words = script.split()
    if not 5 <= len(words) <= 180:
        raise ValueError("A short video requires 5 to 180 words")
    scenes = [" ".join(words[i:i + 18]) for i in range(0, len(words), 18)]
    duration = max(15, min(45, len(scenes) * 5))
    if narration:
        probe = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                     "-of", "json", str(pathlib.Path(narration).resolve())])
        duration = float(json.loads(probe.stdout)["format"]["duration"])
        if not 15 <= duration <= 45:
            raise ValueError("Narration must last 15 to 45 seconds")
    destination = pathlib.Path(destination).resolve()
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        filters = []
        for index, scene in enumerate(scenes):
            filename = root / ("scene" + str(index) + ".txt")
            filename.write_text("\n".join(textwrap.wrap(scene, width=23)), encoding="utf-8")
            start = index * duration / len(scenes)
            end = (index + 1) * duration / len(scenes)
            filters.append("drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:"
                           "textfile=" + str(filename) + ":expansion=none:"
                           "fontcolor=white:fontsize=64:line_spacing=22:"
                           "x=(w-text_w)/2:y=(h-text_h)/2:"
                           "enable='gte(t," + str(start) + ")*lt(t," + str(end) + ")'")
        args = ["ffmpeg", "-nostdin", "-y", "-f", "lavfi", "-i",
                "color=c=0x0b1925:s=1080x1920:r=24:d=" + str(duration)]
        if narration:
            args.extend(["-i", str(pathlib.Path(narration).resolve())])
        args.extend(["-vf", ",".join(filters), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                     "-preset", "medium", "-crf", "20", "-t", str(duration)])
        if narration:
            args.extend(["-c:a", "aac", "-b:a", "192k"])
        else:
            args.append("-an")
        args.extend(["-movflags", "+faststart", str(destination)])
        run(args)
    probe = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(destination)])
    metadata = json.loads(probe.stdout)
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    if video["width"] != 1080 or video["height"] != 1920 or video["codec_name"] != "h264":
        raise ValueError("Output format verification failed")
    result = {"output": str(destination), "width": 1080, "height": 1920,
              "duration": float(metadata["format"]["duration"]), "narration": bool(narration),
              "subtitle_timing": "even scene intervals; not speech-aligned",
              "status": "rendered; manual content review required"}
    destination.with_suffix(".qc.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))

if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("Usage: render.py composition.json output.mp4 [narration.wav]")
    render(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else None)

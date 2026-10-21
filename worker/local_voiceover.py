"""Prepare an English Short voiceover using a USER-PROVIDED LOCAL Piper voice.

No model downloads, paid API requests, external uploads or model installation.
Piper binary, matching .onnx/.onnx.json voice files, and voice usage rights
must already be available locally. Produces only a WAV and DRAFT receipt.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import wave

from render_from_plan import load_and_validate

def english_voice_config(model: Path) -> dict:
    if model.suffix.lower() != ".onnx" or not model.is_file():
        raise ValueError("An existing local Piper .onnx model file is required.")
    config = model.with_suffix(".onnx.json")
    if not config.is_file():
        raise ValueError("The matching local voice .onnx.json is missing.")
    data = json.loads(config.read_text(encoding="utf-8"))
    code = data.get("language", {}).get("code", "") if isinstance(data.get("language"), dict) else ""
    if not isinstance(code, str) or not code.lower().startswith("en"):
        raise ValueError("An English Piper voice model is required for ViralOS.")
    return data

def narration_text(plan: dict) -> str:
    scenes = plan["scenes"]
    content = " ".join(scene["text"].strip().replace("\n", " ") for scene in scenes).strip()
    if not content or len(content) > 3500:
        raise ValueError("Script text is missing or oversized.")
    if not 60 <= len(content.split()) <= 160:
        raise ValueError("English voiceover must have 60-160 words.")
    return content

def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or \
           audio.getframerate() < 8000 or audio.getframerate() > 96000 or \
           audio.getnframes() <= 0:
            raise ValueError("Piper must produce a valid mono 16-bit PCM WAV.")
        return audio.getnframes() / audio.getframerate()

def create_local_voiceover(manifest: Path, model: Path, destination: Path,
                           voice_license_checked: bool = False, piper_bin: str = "piper") -> dict:
    # Validate ALL owner-controlled input before launching a subprocess.
    plan = load_and_validate(manifest)
    if voice_license_checked is not True:
        raise ValueError("Explicit manual voice-model license review is required.")
    model = model.resolve()
    english_voice_config(model)
    text = narration_text(plan)
    if not isinstance(piper_bin, str) or not piper_bin or \
       not (Path(piper_bin).is_file() or shutil.which(piper_bin)):
        raise ValueError("A locally installed Piper executable is required.")
    destination = destination.resolve()
    if destination.suffix.lower() != ".wav" or not destination.parent.is_dir() or \
       destination.exists():
        raise ValueError("A new, writable .wav destination is required.")
    command = [piper_bin, "--model", str(model), "--output_file", str(destination)]
    try:
        subprocess.run(command, input=text + "\n", text=True, check=True,
                       timeout=180, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if not destination.is_file() or destination.stat().st_size < 100:
            raise ValueError("Piper did not produce a valid audio file.")
        seconds = wav_duration(destination)
        if not 5 <= seconds <= 60:
            raise ValueError("Generated narration must last 5-60 seconds.")
        planned = plan["totalFrames"] / 30
        report = {
            "status": "DRAFT_NARRATION_REQUIRES_HUMAN_REVIEW",
            "generatedWith": "local_piper_model",
            "wav": str(destination),
            "englishVoiceModel": model.name,
            "language": "en",
            "seconds": round(seconds, 3),
            "plannedVideoSeconds": round(planned, 3),
            "durationDifferenceSeconds": round(seconds - planned, 3),
            "needsTimelineRealignment": abs(seconds - planned) > 0.75,
            "perWordCaptionsSynchronized": False,
            "voiceModelLicense": "operator_self_attested_not_independently_verified",
            "humanApproved": False,
            "published": False,
        }
        destination.with_suffix(".voice.qc.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        return report
    except BaseException:
        # Never leave behind a misleading partial voiceover after failure.
        destination.unlink(missing_ok=True)
        raise

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("model", type=Path, help="Existing, legally usable English .onnx voice")
    parser.add_argument("destination", type=Path)
    parser.add_argument("--voice-license-checked", action="store_true")
    parser.add_argument("--piper-bin", default="piper")
    arguments = parser.parse_args()
    print(json.dumps(create_local_voiceover(
        arguments.manifest, arguments.model, arguments.destination,
        arguments.voice_license_checked, arguments.piper_bin),
        indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()

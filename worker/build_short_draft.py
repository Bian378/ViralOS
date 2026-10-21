"""Build one local unapproved ViralOS video package without AppDeploy credits.

Choose exactly one: --silent-preview, --narration WAV or --piper-model ONNX.
No model downloads, network APIs, automatic YouTube uploads, or publication.
Outputs a NEW folder with MP4, frozen draft, QC and SHA-256 provenance receipt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from local_voiceover import create_local_voiceover, english_voice_config, wav_duration
from render_from_plan import load_and_validate, render
from retime_timeline import retime_plan_to_duration
from draft_subtitles import draft_srt


def hash_file(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def build_draft(
    manifest: Path, destination: Path, *,
    narration: Path | None = None,
    piper_model: Path | None = None,
    silent_preview: bool = False,
    audio_rights_checked: bool = False,
    voice_license_checked: bool = False,
    kinetic_preview: bool = False,
) -> dict:
    if sum([narration is not None, piper_model is not None, silent_preview]) != 1:
        raise ValueError("Choose exactly one: --narration, --piper-model, or --silent-preview.")
    if narration is not None and audio_rights_checked is not True:
        raise ValueError("Explicit audio ownership/license check required.")
    if piper_model is not None and voice_license_checked is not True:
        raise ValueError("Explicit voice-model license check required.")
    manifest = manifest.resolve(strict=True)
    if not manifest.is_file() or manifest.stat().st_size > 250_000:
        raise ValueError("A readable draft JSON of at most 250 kB is required.")
    plan = load_and_validate(manifest)
    if not isinstance(plan.get("projectId"), str) or not plan["projectId"].strip() or \
       type(plan.get("revision")) is not int or plan["revision"] < 1:
        raise ValueError("A saved project and positive manuscript revision are required.")
    if narration is not None:
        narration = narration.resolve(strict=True)
        if not narration.is_file() or narration.suffix.lower() != ".wav" or \
           narration.stat().st_size > 50_000_000:
            raise ValueError("A local, owned WAV of at most 50MB is required.")
        duration = wav_duration(narration)
        if not 5 <= duration <= 60:
            raise ValueError("Audio duration must be 5–60 seconds.")
    if piper_model is not None:
        piper_model = piper_model.resolve(strict=True)
        english_voice_config(piper_model)  # Does not download a voice.
    destination = destination.absolute()
    if destination.name in {".", ".."} or not destination.parent.is_dir():
        raise ValueError("Output directory must have an existing parent.")
    if destination.exists() or destination.is_symlink():
        raise FileExistsError("Never overwrite an existing output folder.")
    # Reserve destination before production to avoid accidentally replacing another run.
    destination.mkdir(exist_ok=False, parents=False)
    try:
        with tempfile.TemporaryDirectory(prefix=".viralos-build-", dir=destination.parent) as temp:
            stage = Path(temp)
            script_snapshot = stage / "source-DRAFT.json"
            shutil.copyfile(manifest, script_snapshot)
            wav = None
            voice_receipt = None
            kind = "silent"
            if narration is not None:
                wav = stage / "narration-owned.wav"
                shutil.copyfile(narration, wav)
                kind = "operator_wav"
            elif piper_model is not None:
                wav = stage / "narration-generated-DRAFT.wav"
                voice_receipt = create_local_voiceover(
                    script_snapshot, piper_model, wav, voice_license_checked)
                kind = "local_piper"
            movie = stage / "short-DRAFT.mp4"
            video_receipt = render(
                script_snapshot, movie, wav,
                audio_rights_checked=(wav is not None),
                fit_narration=(wav is not None),
                kinetic_preview=kinetic_preview,
            )
            # Use the same proportional frame scaling used inside the renderer.
            # These cues are still only ESTIMATES, not speech-aligned.
            caption_plan = (retime_plan_to_duration(plan, wav_duration(wav))
                            if wav is not None else plan)
            caption_file = stage / "captions-ESTIMATED-DRAFT.srt"
            caption_file.write_bytes(draft_srt(caption_plan).encode("utf-8"))
            if not movie.is_file() or movie.stat().st_size < 1000:
                raise ValueError("Renderer did not produce a usable draft MP4.")
            qc_path = movie.with_suffix(".qc.json")
            saved_qc = json.loads(qc_path.read_text(encoding="utf-8"))
            saved_qc["output"] = "short-DRAFT.mp4"
            qc_path.write_text(json.dumps(saved_qc, indent=2), encoding="utf-8")
            if voice_receipt is not None:
                voice_report = wav.with_suffix(".voice.qc.json")
                data = json.loads(voice_report.read_text(encoding="utf-8"))
                data["wav"] = wav.name
                voice_report.write_text(json.dumps(data, indent=2), encoding="utf-8")
            receipt = {
                "formatVersion": 1,
                "status": "UNAPPROVED_DRAFT_LOCAL_ONLY",
                "visualStyle": "kinetic_procedural" if kinetic_preview else "typography_static",
                "projectId": plan["projectId"],
                "manuscriptRevision": plan["revision"],
                "sourceManifestSha256": hash_file(script_snapshot),
                "draftMp4Sha256": hash_file(movie),
                "draftMp4Bytes": movie.stat().st_size,
                "audio": kind,
                "audioSha256": hash_file(wav) if wav else None,
                "audioIncluded": video_receipt["audioAttached"],
                "subtitleTiming": "ESTIMATED_NOT_SPEECH_SYNCED",
                "captionSha256": hash_file(caption_file),
                "licensedAssets": "OPERATOR_SELF_ATTESTATION_ONLY" if wav else "NO_EXTERNAL_MEDIA",
                "humanReviewed": False,
                "productionApproved": False,
                "privateUploadAuthorized": False,
                "publicReleaseAuthorized": False,
                "published": False,
                "files": sorted(x.name for x in stage.iterdir() if x.is_file()),
            }
            (stage / "draft-receipt.json").write_text(
                json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
            for staged in stage.iterdir():
                if staged.is_file():
                    shutil.copy2(staged, destination / staged.name)
            return receipt
    except BaseException:
        shutil.rmtree(destination)  # No partial or falsely approved output.
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("destination", type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--narration", type=Path)
    group.add_argument("--piper-model", type=Path)
    group.add_argument("--silent-preview", action="store_true")
    parser.add_argument("--audio-rights-checked", action="store_true")
    parser.add_argument("--voice-license-checked", action="store_true")
    parser.add_argument("--kinetic-preview", action="store_true")
    args = parser.parse_args()
    result = build_draft(
        args.manifest, args.destination, narration=args.narration,
        piper_model=args.piper_model, silent_preview=args.silent_preview,
        audio_rights_checked=args.audio_rights_checked,
        voice_license_checked=args.voice_license_checked,
        kinetic_preview=args.kinetic_preview,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Verify a ViralOS DRAFT package after rendering or transfer.

Checks documented SHA-256 hashes, source revision, FFprobe format and QC flags.
These are basic local integrity checks, NOT signed provenance, account identity,
rights clearance, upload consent or permission to publish.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import json
from pathlib import Path

from build_short_draft import hash_file
from render_from_plan import load_and_validate, probe_json


def verify_draft(directory: Path) -> dict:
    root = directory.resolve(strict=True)
    if not root.is_dir() or directory.is_symlink():
        raise ValueError("Expected an actual local draft directory.")
    names = ["source-DRAFT.json", "short-DRAFT.mp4", "short-DRAFT.qc.json",
             "captions-ESTIMATED-DRAFT.srt",
             "draft-receipt.json"]
    for name in names:
        f = root / name
        if not f.is_file() or f.is_symlink():
            raise ValueError("Missing or linked draft file: " + name)
    receipt = json.loads((root / "draft-receipt.json").read_text(encoding="utf-8"))
    if not isinstance(receipt, dict) or \
       receipt.get("status") != "UNAPPROVED_DRAFT_LOCAL_ONLY" or \
       receipt.get("humanReviewed") is not False or \
       receipt.get("productionApproved") is not False or \
       receipt.get("privateUploadAuthorized") is not False or \
       receipt.get("publicReleaseAuthorized") is not False or \
       receipt.get("published") is not False:
        raise ValueError("Invalid or already-authorized draft receipt.")
    manuscript = root / "source-DRAFT.json"
    movie = root / "short-DRAFT.mp4"
    plan = load_and_validate(manuscript)
    if plan.get("projectId") != receipt.get("projectId") or \
       plan.get("revision") != receipt.get("manuscriptRevision"):
        raise ValueError("Source manuscript revision does not match receipt.")
    if receipt.get("sourceManifestSha256") != hash_file(manuscript) or \
       receipt.get("draftMp4Sha256") != hash_file(movie) or \
       receipt.get("draftMp4Bytes") != movie.stat().st_size or \
       receipt.get("captionSha256") != hash_file(root / "captions-ESTIMATED-DRAFT.srt"):
        raise ValueError("SHA-256 or file-size integrity mismatch.")
    video_qc = json.loads((root / "short-DRAFT.qc.json").read_text(encoding="utf-8"))
    if video_qc.get("status") != "DRAFT_REQUIRES_HUMAN_REVIEW" or \
       video_qc.get("humanApproved") is not False or \
       video_qc.get("published") is not False or \
       video_qc.get("rights") != "UNVERIFIED_BY_SOFTWARE":
        raise ValueError("Video QC falsely claims approval or rights clearance.")
    visual = receipt.get("visualStyle")
    if visual not in ("typography_static", "kinetic_procedural") or \
       video_qc.get("visualStyle") != visual or \
       video_qc.get("externalVisualAssets") is not False:
        raise ValueError("Video visual style or external asset declaration mismatch.")
    kind = receipt.get("audio")
    if kind not in ("silent", "operator_wav", "local_piper"):
        raise ValueError("Unknown audio source.")
    if kind == "silent":
        if receipt.get("audioSha256") is not None or \
           receipt.get("audioIncluded") is not False:
            raise ValueError("Silent output has inconsistent audio claims.")
    else:
        audio_name = ("narration-owned.wav" if kind == "operator_wav"
                      else "narration-generated-DRAFT.wav")
        wav = root / audio_name
        if not wav.is_file() or wav.is_symlink() or \
           hash_file(wav) != receipt.get("audioSha256") or \
           receipt.get("audioIncluded") is not True:
            raise ValueError("Audio SHA-256 or presence mismatch.")
    metadata = probe_json([
        "-show_entries",
        "stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration",
        str(movie),
    ])
    streams = metadata.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None or video.get("codec_name") != "h264" or \
       video.get("width") != 1080 or video.get("height") != 1920 or \
       Fraction(video.get("avg_frame_rate", "0/1")) != 30:
        raise ValueError("Current MP4 technical format does not match H.264 9:16 30 FPS.")
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    if has_audio != receipt["audioIncluded"] or has_audio != video_qc.get("audioAttached"):
        raise ValueError("Current MP4 audio status does not match receipts.")
    return {
        "result": "DRAFT_INTEGRITY_CHECK_PASSED",
        "projectId": plan["projectId"],
        "manuscriptRevision": plan["revision"],
        "sha256": receipt["draftMp4Sha256"],
        "hasAudio": has_audio,
        "captions": "ESTIMATED_NOT_SPEECH_SYNCED",
        "rightsVerified": False,
        "ownerAuthenticated": False,
        "uploadAllowed": False,
        "publicReleaseAllowed": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("draft_folder", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify_draft(args.draft_folder), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

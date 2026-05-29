from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from pathlib import Path
from typing import Final

MODEL_ID: Final = "greblus/solitito-ai"
MODEL_REVISION: Final = "e7e78e58a3bec8872b030bade5781de016571fef"
MODEL_FILENAME: Final = "chord_model_v31_16k.onnx"
DSP_WEIGHTS_FILENAME: Final = "dsp_weights.json"
# Payload SHA-256 values. Hugging Face's final ETag may be a Xet reconstruction hash instead.
MODEL_SHA256: Final = "cc84711eedd6218cc5b16940f5baca602d9c08014ae5e512fcd13f14208cd1f0"
DSP_WEIGHTS_SHA256: Final = "a9c9ea86ab9f2326ef3d11001e35396fb9d66b6e6b65e44c605828f4f7aa67e1"

ASSETS = (
    (MODEL_FILENAME, MODEL_SHA256),
    (DSP_WEIGHTS_FILENAME, DSP_WEIGHTS_SHA256),
)


def solitito_asset_dir(cache_root: Path | None = None) -> Path:
    root = cache_root or default_cache_root()
    return root / "models" / "solitito" / MODEL_REVISION


def default_cache_root() -> Path:
    configured = os.environ.get("GUITAR_CHORD_MODEL_CACHE_ROOT")
    if configured:
        return Path(configured).expanduser()
    source_path = Path(__file__).resolve()
    for parent in source_path.parents:
        if (parent / "package.json").exists() and (parent / "apps" / "backend").exists():
            return parent / ".eval-cache" / "chord-detection"
    return Path.cwd() / ".eval-cache" / "chord-detection"


def ensure_solitito_assets(cache_root: Path | None = None, *, force: bool = False) -> dict[str, str]:
    asset_dir = solitito_asset_dir(cache_root)
    asset_dir.mkdir(parents=True, exist_ok=True)

    paths: dict[str, str] = {}
    for filename, expected_sha in ASSETS:
        target = asset_dir / filename
        if force or not target.exists() or sha256_file(target) != expected_sha:
            download_asset(filename, target)
        actual_sha = sha256_file(target)
        if actual_sha != expected_sha:
            raise RuntimeError(
                f"Solitito asset checksum mismatch for {filename}: expected {expected_sha}, got {actual_sha}"
            )
        paths[filename] = str(target)

    manifest = {
        "modelId": MODEL_ID,
        "revision": MODEL_REVISION,
        "assets": {filename: {"sha256": sha} for filename, sha in ASSETS},
    }
    (asset_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return paths


def solitito_asset_paths(cache_root: Path | None = None) -> dict[str, Path]:
    asset_dir = solitito_asset_dir(cache_root)
    return {
        MODEL_FILENAME: asset_dir / MODEL_FILENAME,
        DSP_WEIGHTS_FILENAME: asset_dir / DSP_WEIGHTS_FILENAME,
    }


def download_asset(filename: str, target: Path) -> None:
    url = f"https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{filename}"
    tmp = target.with_suffix(target.suffix + ".tmp")
    with urllib.request.urlopen(url, timeout=120) as response:
        tmp.write_bytes(response.read())
    tmp.replace(target)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    paths = ensure_solitito_assets()
    print("Solitito assets ready")
    for filename, path in paths.items():
        print(f"{filename}: {path}")


if __name__ == "__main__":
    main()

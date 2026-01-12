from __future__ import annotations

import base64
import os
from io import BytesIO
from typing import Any

import face_recognition
from flask import Flask, jsonify, request


app = Flask(__name__)


def _decode_b64_image(image_b64: str) -> bytes:
    if not isinstance(image_b64, str) or not image_b64.strip():
        raise ValueError("image_b64 is required")

    s = image_b64.strip()
    if s.startswith("data:"):
        parts = s.split(",", 1)
        if len(parts) != 2:
            raise ValueError("invalid data url")
        s = parts[1]

    try:
        return base64.b64decode(s, validate=True)
    except Exception as e:
        raise ValueError("invalid base64") from e


def _first_face_encoding(image_bytes: bytes):
    img = face_recognition.load_image_file(BytesIO(image_bytes))
    enc = face_recognition.face_encodings(img)
    return enc[0] if enc else None


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/faces/count")
def faces_count():
    data: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    image_b64 = data.get("image_b64", "")
    image_bytes = _decode_b64_image(image_b64)
    img = face_recognition.load_image_file(BytesIO(image_bytes))
    loc = face_recognition.face_locations(img)
    return jsonify({"faces": int(len(loc))})


@app.post("/faces/distance")
def faces_distance():
    data: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    image1_b64 = data.get("image1_b64", "")
    image2_b64 = data.get("image2_b64", "")
    image1_bytes = _decode_b64_image(image1_b64)
    image2_bytes = _decode_b64_image(image2_b64)

    enc1 = _first_face_encoding(image1_bytes)
    if enc1 is None:
        return jsonify({"error": "no_face_enrolled"}), 400

    enc2 = _first_face_encoding(image2_bytes)
    if enc2 is None:
        return jsonify({"error": "no_face_probe"}), 400

    dist = float(face_recognition.face_distance([enc1], enc2)[0])
    return jsonify({"distance": dist})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

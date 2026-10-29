"""Persistent faster-whisper worker, spawned once by index.js.

Protocol on stdin: one JSON header line {"id": int, "lang": str, "bytes": int} followed by
`bytes` of raw 16 kHz 16-bit little-endian mono PCM.
Reply on stdout: one JSON line {"id": int, "text": str} or {"id": int, "error": str}.
A header with "status": true (and "bytes": 0) gets a self-test reply instead: model, settings, timing, RAM.
"""
import json
import os
import sys
import time

import numpy as np
from faster_whisper import WhisperModel

try:
    import resource
except ImportError:  # not available on Windows dev machines
    resource = None

out = sys.stdout
sys.stdout = sys.stderr  # keep any library prints off the protocol channel

MODEL = os.environ.get("WHISPER_MODEL", "base")
THREADS = 3
model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=THREADS)
print("whisper worker ready", flush=True)


def status():
    start = time.perf_counter()
    # decode 1 s of silence with VAD off, so the model itself really runs
    segments, _ = model.transcribe(
        np.zeros(16000, dtype=np.float32), language="en", beam_size=1, vad_filter=False, condition_on_previous_text=False
    )
    list(segments)
    return {
        "model": MODEL,
        "compute_type": "int8",
        "cpu_threads": THREADS,
        "infer_ms": round((time.perf_counter() - start) * 1000),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024) if resource else None,
    }


stdin = sys.stdin.buffer
for header in iter(stdin.readline, b""):
    req = json.loads(header)
    pcm = stdin.read(req.get("bytes", 0))
    try:
        if req.get("status"):
            res = {"id": req["id"], **status()}
        else:
            audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
            segments, _ = model.transcribe(
                audio,
                language=req.get("lang") or None,  # empty/None = auto-detect
                beam_size=1,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            res = {"id": req["id"], "text": " ".join(s.text.strip() for s in segments).strip()}
    except Exception as e:  # bad language code, odd byte count, ...: report and keep serving
        res = {"id": req["id"], "error": str(e)}
    out.write(json.dumps(res) + "\n")
    out.flush()

"""Analyze one encrypted SSH input stream. The worker keeps model weights only."""
import contextlib
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "3D-Speaker-main"))
RATE = 16000
MAX_AUDIO_BYTES = 256 * 1024 * 1024


def pipeline():
    import torch
    from funasr import AutoModel
    from speakerlab.bin import infer_diarization as diarization

    torch.set_num_threads(min(8, os.cpu_count() or 1))
    device = os.environ.get("YOGURT_SPEAKER_DEVICE", "cpu")
    vad = AutoModel(model="fsmn-vad", model_revision="v2.0.4", device=device,
                    disable_update=True, disable_pbar=True, disable_log=True)
    # FunASR provides the same FSMN VAD as the older ModelScope pipeline.
    diarization.get_voice_activity_detection_model = lambda *_: lambda wav: vad.generate(input=wav.numpy())
    return diarization.Diarization3Dspeaker(device=device)


def read_audio(path):
    import av
    import numpy as np
    import torch

    resampler = av.AudioResampler(format="fltp", layout="mono", rate=RATE)
    buffers = []
    samples = 0
    with av.open(str(path)) as container:
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                samples += output.samples
                if samples > RATE * 6 * 3600:
                    raise ValueError("Recording exceeds six hours")
                buffers.append(output.to_ndarray()[0])
        buffers.extend(frame.to_ndarray()[0] for frame in resampler.resample(None))
    return torch.from_numpy(np.concatenate(buffers)).unsqueeze(0)


def analyze(model, wav):
    import numpy as np

    speech = model.do_vad(wav)
    chunks = [chunk for start, end in speech for chunk in model.chunk(start, end)]
    if not chunks:
        return {"turns": [], "voices": []}
    vectors = model.do_emb_extraction(chunks, wav)
    if len(chunks) == 1:
        turns = [[*chunks[0], 0]]
    else:
        _, turns = model.do_clustering(chunks, vectors)
    voices = []
    for speaker in sorted({label for _, _, label in turns}):
        # Use the longest clusters' clean interiors for enrollment, away from speaker changes.
        examples = sorted([(start, stop) for start, stop, label in turns if label == speaker],
                          key=lambda span: span[1] - span[0], reverse=True)[:8]
        samples = [(start + .2, min(start + 3.2, stop - .2))
                   for start, stop in examples if stop - start >= 2.0]
        vector = None
        if samples:
            embeddings = model.do_emb_extraction(samples, wav)
            embeddings /= np.maximum(np.linalg.norm(embeddings, axis=1, keepdims=True), 1e-8)
            centroid = embeddings.mean(axis=0)
            vector = (centroid / max(float(np.linalg.norm(centroid)), 1e-8)).tolist()
        voices.append({"id": speaker, "vector": vector, "sampleMs": round(examples[0][0] * 1000),
                       "sampleEndMs": round(min(examples[0][1], examples[0][0] + 8) * 1000)})
    return {"turns": [{"startMs": round(a * 1000), "endMs": round(b * 1000), "speaker": c}
                      for a, b, c in turns if round(a * 1000) < round(b * 1000)],
            "voices": voices}


def split_mixed(result, wav, intervals):
    from funasr import AutoModel

    replacements = []
    recognizer = None
    for segment_id, start, stop in intervals:
        overlaps = [(max(start, t["startMs"]), min(stop, t["endMs"]), t["speaker"])
                    for t in result["turns"] if min(stop, t["endMs"]) - max(start, t["startMs"]) >= 350]
        if len({speaker for _, _, speaker in overlaps}) < 2 or len(overlaps) > 12:
            continue
        if sum(end - begin for begin, end, _ in overlaps) < .65 * (stop - start):
            continue
        if recognizer is None:
            recognizer = AutoModel(model="paraformer-zh", model_revision="v2.0.4",
                                   device=os.environ.get("YOGURT_SPEAKER_DEVICE", "cpu"),
                                   disable_update=True, disable_pbar=True, disable_log=True)
        parts = []
        for begin, end, speaker in overlaps:
            clip = wav[0, begin * 16:end * 16].numpy()
            if not len(clip):
                break
            detected = recognizer.generate(input=clip, fs=RATE)
            text = detected[0].get("text", "").strip() if detected else ""
            if not text:
                break
            parts.append({"startMs": begin, "endMs": end, "speaker": speaker, "text": text})
        if len(parts) == len(overlaps):
            replacements.append({"id": segment_id, "parts": parts})
    return replacements


def main():
    output = sys.stdout
    # Model loaders and progress bars must stay out of the JSON protocol.
    with contextlib.redirect_stdout(sys.stderr):
        model = pipeline()
        if sys.argv[1:] == ["--warmup"]:
            result = {"ready": True}
        else:
            intervals = []
            if sys.argv[1:] == ["--intervals"]:
                intervals = json.loads(sys.stdin.buffer.readline(1024 * 1024))
                if len(intervals) > 20000 or any(len(row) != 3 or not all(type(n) is int for n in row)
                      or not 0 <= row[1] < row[2] <= 6 * 3600 * 1000 for row in intervals):
                    raise ValueError("Invalid transcript intervals")
            with tempfile.TemporaryDirectory(prefix="yogurt-speaker-") as directory:
                path = Path(directory) / "recording.m4a"
                with path.open("wb") as f:
                    while block := sys.stdin.buffer.read(1024 * 1024):
                        if f.tell() + len(block) > MAX_AUDIO_BYTES:
                            raise ValueError("Recording exceeds size limit")
                        f.write(block)
                wav = read_audio(path)
                result = analyze(model, wav)
                if intervals:
                    result["replacements"] = split_mixed(result, wav, intervals)
    json.dump(result, output, allow_nan=False)


if __name__ == "__main__":
    main()

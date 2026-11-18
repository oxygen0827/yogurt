#!/bin/sh
# Run on the Spark from ~/.local/share/yogurt-speaker after copying analyze.py here.
set -eu
umask 077
cd "$(dirname "$0")"
uv=${UV:-"$HOME/.local/bin/uv"}
if [ ! -f 3D-Speaker-main/speakerlab/bin/infer_diarization.py ]; then
  revision=065629c313eaf1a01c65c640c46d77e61e9607b4
  staging=$(mktemp -d .3d-speaker.XXXXXX)
  trap 'rm -rf "$staging"' EXIT
  curl -fsSL --retry 2 --max-time 120 "https://codeload.github.com/modelscope/3D-Speaker/tar.gz/$revision" -o "$staging/source.tar.gz"
  mkdir "$staging/source"
  tar -xzf "$staging/source.tar.gz" --strip-components=1 -C "$staging/source"
  mv "$staging/source" 3D-Speaker-main
fi
# Overlap detection is optional. The legacy ModelScope pipeline has been replaced by FunASR.
sed -i '/^from pyannote.audio import Inference, Model$/d;
        /^from modelscope.pipelines import pipeline$/d;
        /^from modelscope.utils.constant import Tasks$/d' 3D-Speaker-main/speakerlab/bin/infer_diarization.py
"$uv" venv --python 3.12 --allow-existing .venv
"$uv" pip install --python .venv/bin/python torch==2.8.0 torchaudio==2.8.0 'numpy<2' scipy scikit-learn \
  pyyaml soundfile kaldiio tqdm modelscope==1.40.3 funasr==1.4.27 packaging av 'fastcluster<1.3' hdbscan
.venv/bin/python analyze.py --warmup

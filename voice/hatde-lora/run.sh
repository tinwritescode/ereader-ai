# Trains a Hạt Dẻ LoRA from /data/dataset and writes comparison audio to /data/out.
# Runs as Cloud Run job `hatde-train` (L4 GPU, image built from ./Dockerfile) with the bucket
# project-4c921956-28e0-4057-9ee-hatde-train mounted at /data, holding dataset/ (from cut.py),
# run.sh, synth.py and text.txt (the sentences synth.py reads).
# adapter/ in this folder is checkpoint-26 from this run. It still falls silent mid-sentence at
# times (17 s once in 20 sentences), so it is kept, not served.
set -euxo pipefail
cd /vieneu
OUT=/data/out
mkdir -p $OUT
WORK=/vieneu/work
mkdir -p $WORK
cp -r /data/dataset $WORK/dataset
nvidia-smi --query-gpu=name,memory.total --format=csv | tee $OUT/gpu.txt

python finetune/prepare_dataset.py --dataset-dir $WORK/dataset 2>&1 | tee $OUT/prepare.log

# 211 clips at batch 16 is ~13 steps an epoch; checkpoints near 2 and 3 epochs, then the end of 5.
python finetune/train_lora.py --data $WORK/dataset/train.parquet --run hatde --output-dir $WORK/runs \
  --epochs 5 --eval-ratio 0.05 --eval-every 13 --log-every 13 --save-every 13 --num-workers 0 2>&1 | tee $OUT/train.log
cp $WORK/runs/hatde/train_log.jsonl $OUT/

REF=$(ls $WORK/dataset/raw_audio/hatde_001.wav)
# The chosen voice: about two epochs. Its adapter and voice file are kept so the model can be rebuilt.
for ADAPTER in checkpoint-26; do
  python finetune/merge_lora.py --adapter $WORK/runs/hatde/$ADAPTER --out $WORK/merged-$ADAPTER 2>&1 | tail -2
  python finetune/make_voice.py --audio $REF --name hatde --gender female --out $WORK/merged-$ADAPTER 2>&1 | tail -1
  python /data/synth.py --repo $WORK/merged-$ADAPTER --voice hatde --out /tmp/lora-$ADAPTER.wav
  cp /tmp/lora-$ADAPTER.wav $OUT/
  mkdir -p /tmp/keep/$ADAPTER
  cp -r $WORK/runs/hatde/$ADAPTER/. /tmp/keep/$ADAPTER/
  cp $WORK/merged-$ADAPTER/voices_v3_turbo.json $WORK/runs/hatde/train_args.json /tmp/keep/$ADAPTER/
  tar -C /tmp/keep -czf /tmp/$ADAPTER.tgz $ADAPTER
  cp /tmp/$ADAPTER.tgz $OUT/
done
echo done | tee $OUT/done.txt

# The voice service image plus VieNeu's fine-tune extras, from the same lock file.
FROM asia-southeast1-docker.pkg.dev/project-4c921956-28e0-4057-9ee/voice/vieneu-gpu:1
WORKDIR /vieneu
RUN uv sync --frozen --no-dev --extra cuda --extra finetune --no-install-project --no-build --python python3.12
COPY run.sh synth.py /train/
CMD ["bash", "/train/run.sh"]

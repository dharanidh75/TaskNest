# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ build-essential libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# 1. Install CPU-only torch FIRST — this pins it before sentence-transformers
#    can pull in the 2.5GB CUDA variant
RUN pip install --no-cache-dir \
    "torch==2.1.2+cpu" \
    "torchvision==0.16.2+cpu" \
    --extra-index-url https://download.pytorch.org/whl/cpu

# 2. Install everything else — torch is already satisfied (CPU), won't be upgraded
RUN pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Only what's needed at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder (skip the build tools)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy app source (dockerignore keeps chroma_data/uploads/pycache out)
COPY . .

# Persistent storage dirs — Railway volume mounts here
RUN mkdir -p /data/chroma /data/uploads

# Sentence-transformers cache lives on the volume too (avoids re-download on restart)
ENV SENTENCE_TRANSFORMERS_HOME=/data/models
ENV CHROMA_PATH=/data/chroma
ENV UPLOADS_DIR=/data/uploads

# Non-root user
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
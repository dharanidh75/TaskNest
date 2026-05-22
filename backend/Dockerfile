# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ build-essential libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only torch FIRST — pins it before sentence-transformers pulls in the 2.5GB CUDA build
RUN pip install --no-cache-dir \
    "torch==2.2.0+cpu" \
"torchvision==0.17.0+cpu" \
    --extra-index-url https://download.pytorch.org/whl/cpu

# Install everything else — torch already satisfied (CPU), won't be upgraded
RUN pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

RUN mkdir -p /data/chroma /data/uploads

ENV SENTENCE_TRANSFORMERS_HOME=/data/models
ENV CHROMA_PATH=/data/chroma
ENV UPLOADS_DIR=/data/uploads

RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

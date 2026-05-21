FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libmagic1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip uninstall -y nvidia-cublas-cu12 nvidia-cuda-cupti-cu12 \
        nvidia-cuda-nvrtc-cu12 nvidia-cuda-runtime-cu12 \
        nvidia-cudnn-cu12 nvidia-cufft-cu12 nvidia-curand-cu12 \
        nvidia-cusolver-cu12 nvidia-cusparse-cu12 nvidia-nccl-cu12 \
        nvidia-nvjitlink-cu12 nvidia-nvtx-cu12 triton 2>/dev/null || true && \
    apt-get purge -y --auto-remove gcc g++ build-essential && \
    rm -rf /root/.cache/pip /tmp/*

COPY . .

RUN mkdir -p chroma_data uploads models

ENV SENTENCE_TRANSFORMERS_HOME=/app/models

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY render.py /app/render.py
RUN useradd --create-home renderer
USER renderer
ENTRYPOINT ["python", "/app/render.py"]

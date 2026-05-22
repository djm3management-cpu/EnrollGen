FROM python:3.12-alpine

RUN apk add --no-cache ca-certificates && update-ca-certificates

WORKDIR /app
COPY sync.py /app/sync.py

ENV PYTHONUNBUFFERED=1

CMD ["python", "/app/sync.py"]

# Stage 1: build the React PWA
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI serves the API and the built PWA from one origin (https via the host platform)
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY docs/dv-Form06-J480.pdf docs/dv-Form06-J480.pdf
COPY --from=frontend /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 8000
# $PORT is provided by Render/Railway/Cloud Run; falls back to 8000 locally
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

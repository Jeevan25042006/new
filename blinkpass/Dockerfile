# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY blinkpass-frontend/package*.json ./
RUN npm ci
COPY blinkpass-frontend/ ./
RUN npm run build

# Stage 2: Final image with Python backend + Nginx
FROM python:3.11-slim
WORKDIR /app

# Install nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY app/ ./app/
COPY reset_db.py .

# Copy built frontend to nginx
COPY --from=frontend-builder /app/frontend/dist /var/www/html

# Nginx config
COPY nginx.conf /etc/nginx/sites-available/default

# Startup script
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 80
CMD ["./start.sh"]

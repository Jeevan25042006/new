#!/bin/bash
# Initialize database
python reset_db.py

# Start nginx in background
nginx -g "daemon off;" &

# Start FastAPI backend
uvicorn app.main:app --host 0.0.0.0 --port 8005

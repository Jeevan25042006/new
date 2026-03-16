"""Drop and recreate all BlinkPass database tables."""
import sys
import os

# Ensure the blinkpass package is importable when run from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from app.storage.database import engine, init_db
from app.storage.models import Base

Base.metadata.drop_all(bind=engine)
print("All tables dropped.")
init_db()
print("Database reset complete.")

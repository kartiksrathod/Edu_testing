# database.py

from config import db

# Optional ping to validate connection via the config.db client
try:
    db.client.admin.command("ping")
    print("✅ MongoDB connected successfully via config.db")
except Exception as e:
    print(f"❌ MongoDB ping failed (database.py): {e}")

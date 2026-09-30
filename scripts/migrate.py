"""Run database migrations once before starting the production service."""

from app import apply_database_migrations


if __name__ == "__main__":
    apply_database_migrations()


# ==================================================
# FLASK APPLICATION ENTRYPOINT: backend/app.py
# Simplified AWS Student Management System
# ==================================================

import os
import sqlite3
from flask import Flask, send_from_directory
from flask_cors import CORS

from backend.config import Config
from backend.routes import routes_bp

def initialize_db():
    """Initializes SQLite database if configured as the database type."""
    if Config.DB_TYPE == 'sqlite':
        sqlite_db_path = os.path.join(Config.BASE_DIR, 'educloud_fallback.db')
        if os.path.exists(sqlite_db_path):
            return
            
        print("[SQLITE SETUP] Initializing fallback SQLite database...")
        conn = sqlite3.connect(sqlite_db_path)
        cursor = conn.cursor()
        
        schema_path = os.path.join(Config.BASE_DIR, 'database', 'schema.sql')
        seed_path = os.path.join(Config.BASE_DIR, 'database', 'seed.sql')

        if os.path.exists(schema_path) and os.path.exists(seed_path):
            with open(schema_path, 'r', encoding='utf-8') as f:
                schema_commands = f.read()
            with open(seed_path, 'r', encoding='utf-8') as f:
                seed_commands = f.read()

            # Adapt schema commands for SQLite
            schema_commands = schema_commands.replace("CREATE DATABASE IF NOT EXISTS educloud_db;", "")
            schema_commands = schema_commands.replace("USE educloud_db;", "")
            schema_commands = schema_commands.replace("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", "")
            
            try:
                cursor.executescript(schema_commands)
                
                # Adapt seed commands for SQLite
                seed_commands = seed_commands.replace("USE educloud_db;", "")
                seed_commands = seed_commands.replace("ON DUPLICATE KEY UPDATE id=id", "")
                
                statements = seed_commands.split(';')
                for stmt in statements:
                    if stmt.strip():
                        cursor.execute(stmt)
                
                conn.commit()
                print("[SQLITE SETUP] SQLite database successfully seeded.")
            except Exception as e:
                print(f"[SQLITE ERROR] Fallback initialization failed: {e}")
        conn.close()

def create_app():
    # Configure custom directories to serve frontend
    frontend_dir = os.path.join(Config.BASE_DIR, 'frontend')
    html_dir = os.path.join(frontend_dir, 'html')

    app = Flask(
        __name__,
        static_folder=None,
        template_folder=html_dir
    )
    
    # Configure app settings
    app.config.from_object(Config)

    # Configure CORS
    CORS(app, supports_credentials=True)

    # Initialize fallback database tables if needed
    initialize_db()

    # Create local upload directories if they do not exist
    uploads_dir = os.path.join(Config.BASE_DIR, 'uploads')
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)

    # Register unified API blueprints
    app.register_blueprint(routes_bp, url_prefix='/api')

    # Serve index page
    @app.route('/')
    def serve_index():
        return send_from_directory(html_dir, 'index.html')

    # Serve HTML pages dynamically
    @app.route('/<path:filename>')
    def serve_html_pages(filename):
        if filename.endswith('.html'):
            return send_from_directory(html_dir, filename)
        
        # Check custom asset redirects
        local_path = os.path.join(frontend_dir, filename)
        if os.path.exists(local_path):
            return send_from_directory(frontend_dir, filename)
            
        return send_from_directory(html_dir, 'index.html')

    # Serve locally uploaded files
    @app.route('/uploads/<path:filename>')
    def serve_uploaded_documents(filename):
        return send_from_directory(uploads_dir, filename)

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=Config.DEBUG)

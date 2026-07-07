# ==================================================
# SECURITY AUTHENTICATION MIDDLEWARE: backend/middleware/auth.py
# AWS Cloud-Based Student Management System
# ==================================================

import jwt
from functools import wraps
from flask import request, jsonify, g
from backend.config import Config
from aws.rds_connection import DBConnection

def login_required(f):
    """Decorator checking for any authenticated token (student or admin)"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_token()
        if not token:
            return jsonify({"error": "Authentication required. Missing token."}), 401
            
        try:
            data = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
            g.user_id = data['user_id']
            g.user_type = data['user_type'] # 'student' or 'admin'
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token session credentials."}), 401
            
        return f(*args, **kwargs)
    return decorated

def student_required(f):
    """Decorator enforcing student-only endpoints access validation"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_token()
        if not token:
            return jsonify({"error": "Student authentication token required."}), 401
            
        try:
            data = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
            if data.get('user_type') != 'student':
                return jsonify({"error": "Access denied. Student clearance required."}), 403
                
            g.student_id = data['user_id']
            
            # Fetch active student detail cache from RDS
            query = "SELECT id, name, email, status, department, semester, photo FROM students WHERE id = %s"
            student = DBConnection.execute_query(query, (g.student_id,), fetch='one')
            
            if not student:
                return jsonify({"error": "Student account registry not found."}), 404
                
            if student['status'] == 'Suspended':
                return jsonify({"error": "Your account has been suspended. Contact administrators."}), 403

            g.current_student = student
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token credentials."}), 401
            
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Decorator enforcing administrator console access validation"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_token()
        if not token:
            return jsonify({"error": "Admin authentication token required."}), 401
            
        try:
            data = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
            if data.get('user_type') != 'admin':
                return jsonify({"error": "Access denied. Admin console clearance required."}), 403
                
            g.admin_email = data['user_id']
            
            # Verify admin credentials
            query = "SELECT id, name, email FROM admins WHERE email = %s"
            admin = DBConnection.execute_query(query, (g.admin_email,), fetch='one')
            
            if not admin:
                return jsonify({"error": "Admin account credentials validation failed."}), 401
                
            g.current_admin = admin
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token credentials."}), 401
            
        return f(*args, **kwargs)
    return decorated

def extract_token():
    """Helper to extract token from Authorization header or cookies"""
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(' ')[1]
    
    # Try cookies lookup as fallback
    return request.cookies.get('sms_token')

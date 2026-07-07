# ==================================================
# AUTHENTICATION ROUTING SYSTEM: backend/routes/auth.py
# AWS Cloud-Based Student Management System
# ==================================================

import uuid
import datetime
import jwt
from flask import Blueprint, request, jsonify, make_response
from backend.config import Config
from aws.rds_connection import DBConnection
from aws.sns_service import SNSService
from backend.utils.helpers import SecurityHelper, AuditLogger

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    
    # Required Fields
    name = SecurityHelper.sanitize_input(data.get('name'))
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    gender = data.get('gender')
    dob = data.get('dob')
    department = data.get('department')
    semester = data.get('semester')
    address = SecurityHelper.sanitize_input(data.get('address'))
    password = data.get('password')
    photo_base64 = data.get('photo', '') # base64 profile string

    # Input validations
    if not (name and email and phone and gender and dob and department and semester and address and password):
        return jsonify({"error": "Missing required enrollment fields."}), 400

    if not SecurityHelper.validate_email(email):
        return jsonify({"error": "Invalid email formatting."}), 400

    if not SecurityHelper.validate_phone(phone):
        return jsonify({"error": "Invalid phone format. Numeric matches (+xx-xxxx) required."}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    # Check email duplicate
    email_check = DBConnection.execute_query("SELECT id FROM students WHERE email = %s", (email,), fetch='one')
    if email_check:
        return jsonify({"error": "Account with this email already exists."}), 409

    # Generate sequence ID
    try:
        last_student = DBConnection.execute_query("SELECT id FROM students ORDER BY id DESC LIMIT 1", fetch='one')
        if last_student:
            last_num = int(last_student['id'].split('-')[1])
            new_id = f"SMS-{last_num + 1}"
        else:
            new_id = "SMS-1001"
    except Exception:
        new_id = f"SMS-{uuid.uuid4().hex[:6].upper()}"

    # Hash Password
    pass_hash = SecurityHelper.hash_password(password)

    # Insert into RDS
    insert_query = """
        INSERT INTO students (id, name, email, phone, gender, dob, department, semester, address, photo, password_hash, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    try:
        DBConnection.execute_query(
            insert_query,
            (new_id, name, email, phone, gender, dob, department, semester, address, photo_base64, pass_hash, 'Active'),
            commit=True
        )
        
        # Log Audit activity & Notification dispatch
        AuditLogger.log_activity(new_id, 'student', 'Registration', 'Completed online portal enrollment.')
        SNSService.notify_registration(name, email, new_id)

        # Generate JWT session token
        token = jwt.encode({
            'user_id': new_id,
            'user_type': 'student',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)
        }, Config.JWT_SECRET_KEY, algorithm='HS256')

        response_data = {
            "message": "Account created successfully",
            "token": token,
            "student": {
                "id": new_id,
                "name": name,
                "email": email,
                "department": department,
                "semester": semester,
                "status": "Active"
            }
        }
        
        resp = make_response(jsonify(response_data), 201)
        resp.set_cookie('sms_token', token, max_age=Config.JWT_ACCESS_TOKEN_EXPIRES, httponly=True)
        return resp
    except Exception as e:
        return jsonify({"error": f"Registration failed: {e}"}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Missing login credentials."}), 400

    # 1. Look up student first
    student = DBConnection.execute_query("SELECT * FROM students WHERE email = %s", (email,), fetch='one')
    if student:
        if SecurityHelper.verify_password(student['password_hash'], password):
            if student['status'] == 'Suspended':
                AuditLogger.log_login(student['id'], 'student', status='Failed')
                return jsonify({"error": "Your account has been suspended. Contact support."}), 403

            token = jwt.encode({
                'user_id': student['id'],
                'user_type': 'student',
                'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)
            }, Config.JWT_SECRET_KEY, algorithm='HS256')

            AuditLogger.log_login(student['id'], 'student', status='Success')
            
            response_data = {
                "message": "Login successful",
                "token": token,
                "user_type": "student",
                "user": {
                    "id": student['id'],
                    "name": student['name'],
                    "email": student['email'],
                    "status": student['status'],
                    "department": student['department']
                }
            }
            resp = make_response(jsonify(response_data), 200)
            resp.set_cookie('sms_token', token, max_age=Config.JWT_ACCESS_TOKEN_EXPIRES, httponly=True)
            return resp
        else:
            AuditLogger.log_login(student['id'], 'student', status='Failed')
            return jsonify({"error": "Invalid password credentials."}), 401

    # 2. Look up admin second
    admin = DBConnection.execute_query("SELECT * FROM admins WHERE email = %s", (email,), fetch='one')
    if admin:
        if SecurityHelper.verify_password(admin['password_hash'], password):
            token = jwt.encode({
                'user_id': admin['email'],
                'user_type': 'admin',
                'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)
            }, Config.JWT_SECRET_KEY, algorithm='HS256')

            AuditLogger.log_login(admin['email'], 'admin', status='Success')

            response_data = {
                "message": "Login successful",
                "token": token,
                "user_type": "admin",
                "user": {
                    "name": admin['name'],
                    "email": admin['email']
                }
            }
            resp = make_response(jsonify(response_data), 200)
            resp.set_cookie('sms_token', token, max_age=Config.JWT_ACCESS_TOKEN_EXPIRES, httponly=True)
            return resp
        else:
            AuditLogger.log_login(admin['email'], 'admin', status='Failed')
            return jsonify({"error": "Invalid password credentials."}), 401

    # Audit failed login attempts
    AuditLogger.log_login(email, 'unknown', status='Failed')
    return jsonify({"error": "Account does not exist."}), 404


@auth_bp.route('/logout', methods=['POST'])
def logout():
    resp = make_response(jsonify({"message": "Logout successful"}), 200)
    resp.delete_cookie('sms_token')
    return resp


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({"error": "Email address required."}), 400

    # Verify email exists in student database
    user = DBConnection.execute_query("SELECT id, name FROM students WHERE email = %s", (email,), fetch='one')
    if not user:
        # Prevent details leakage, return success standard
        return jsonify({"message": "If email exists in our records, reset guidelines will be sent."}), 200

    # Generate token
    token = uuid.uuid4().hex
    expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=2)

    # Insert into reset registries
    DBConnection.execute_query("DELETE FROM password_resets WHERE email = %s", (email,), commit=True)
    DBConnection.execute_query(
        "INSERT INTO password_resets (email, token, expires_at) VALUES (%s, %s, %s)",
        (email, token, expiry),
        commit=True
    )

    # Notify via SNS
    subject = "EduCloud Support: Password Reset Token"
    message = (
        f"Dear {user['name']},\n\n"
        f"You requested to reset your password. Use the following security token to complete updates:\n"
        f"Token: {token}\n\n"
        f"Token is valid for 2 hours. If you did not make this request, ignore this notification."
    )
    SNSService.publish_notification(subject, message, email)

    return jsonify({"message": "Password reset token successfully dispatched."}), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    token = data.get('token')
    new_password = data.get('password')

    if not token or not new_password:
        return jsonify({"error": "Security token and new password entries required."}), 400

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    # Verify reset token
    reset = DBConnection.execute_query("SELECT * FROM password_resets WHERE token = %s", (token,), fetch='one')
    if not reset:
        return jsonify({"error": "Invalid or expired security token."}), 400

    # Parse expiration
    # sqlite returns timestamp strings, MySQL datetime objects
    expires_at = reset['expires_at']
    if isinstance(expires_at, str):
        expires_at = datetime.datetime.strptime(expires_at.split('.')[0], "%Y-%m-%d %H:%M:%S")

    if expires_at < datetime.datetime.utcnow():
        DBConnection.execute_query("DELETE FROM password_resets WHERE token = %s", (token,), commit=True)
        return jsonify({"error": "Security token has expired."}), 400

    # Hash and update
    pass_hash = SecurityHelper.hash_password(new_password)
    DBConnection.execute_query(
        "UPDATE students SET password_hash = %s WHERE email = %s",
        (pass_hash, reset['email']),
        commit=True
    )

    # Clear Token
    DBConnection.execute_query("DELETE FROM password_resets WHERE email = %s", (reset['email'],), commit=True)
    
    # Audit trail logging
    AuditLogger.log_activity(reset['email'], 'student', 'Password Reset', 'Updated credentials via token.')

    return jsonify({"message": "Password updated successfully. You can now log in."}), 200

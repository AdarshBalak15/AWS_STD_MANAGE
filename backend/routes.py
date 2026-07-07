# ==================================================
# UNIFIED ROUTES & CONTROLLER: backend/routes.py
# Simplified AWS Student Management System
# ==================================================

import os
import base64
import io
import uuid
from functools import wraps
from flask import Blueprint, request, jsonify, g, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import sqlite3
import pymysql
import boto3
from botocore.exceptions import ClientError

from backend.config import Config

routes_bp = Blueprint('routes', __name__)

# ==================================================
# DATABASE UTILITIES
# ==================================================
def get_db_connection():
    """Establishes connection to AWS RDS MySQL or local SQLite fallback."""
    if Config.DB_TYPE == 'mysql':
        try:
            connection = pymysql.connect(
                host=Config.DB_HOST,
                user=Config.DB_USER,
                password=Config.DB_PASSWORD,
                database=Config.DB_NAME,
                port=int(Config.DB_PORT),
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=5
            )
            return connection, 'mysql'
        except Exception as e:
            print(f"[RDS WARNING] RDS Connection failed: {e}. Falling back to SQLite.")

    # SQLite Fallback
    sqlite_db_path = os.path.join(Config.BASE_DIR, 'educloud_fallback.db')
    connection = sqlite3.connect(sqlite_db_path)
    connection.row_factory = sqlite_dict_factory
    return connection, 'sqlite'

def sqlite_dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def db_execute(query, params=None, fetch=None, commit=False):
    """Executes database queries securely using prepared parameters."""
    conn = None
    db_engine = None
    try:
        conn, db_engine = get_db_connection()
        cursor = conn.cursor()
        
        # Adjust query format for SQLite (uses ? placeholder instead of %s)
        formatted_query = query
        if db_engine == 'sqlite':
            formatted_query = query.replace('%s', '?')

        cursor.execute(formatted_query, params or ())
        
        result = None
        if fetch == 'all':
            result = cursor.fetchall()
        elif fetch == 'one':
            result = cursor.fetchone()
            
        if commit:
            conn.commit()
            
        return result
    except Exception as e:
        print(f"[DB ERROR] SQL Query failed: {e}")
        if conn and db_engine == 'mysql':
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()

# ==================================================
# AWS INTEGRATION HELPERS
# ==================================================
def get_s3_client():
    """Initializes and returns boto3 S3 client."""
    if Config.S3_USE_IAM_ROLE:
        return boto3.client('s3')
    else:
        return boto3.client(
            's3',
            aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
            region_name=Config.AWS_REGION
        )

def upload_to_s3_or_local(file_stream, filename, student_id):
    """Uploads document file to AWS S3 bucket or local uploads directory."""
    secured_name = f"{student_id}_{secure_filename(filename)}"
    
    if Config.STORAGE_PROVIDER == 's3':
        try:
            s3_client = get_s3_client()
            content_type = 'application/octet-stream'
            if filename.lower().endswith('.pdf'):
                content_type = 'application/pdf'
            elif filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                content_type = f"image/{filename.lower().rsplit('.', 1)[-1]}"
                
            s3_client.upload_fileobj(
                file_stream,
                Config.S3_BUCKET_NAME,
                secured_name,
                ExtraArgs={"ContentType": content_type}
            )
            s3_uri = f"https://{Config.S3_BUCKET_NAME}.s3.{Config.AWS_REGION}.amazonaws.com/{secured_name}"
            return s3_uri
        except ClientError as e:
            print(f"[S3 ERROR] S3 upload failed: {e}. Falling back to local storage.")
            
    # Local Storage Fallback
    uploads_dir = os.path.join(Config.BASE_DIR, 'uploads')
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)
        
    local_path = os.path.join(uploads_dir, secured_name)
    file_stream.seek(0)
    with open(local_path, 'wb') as f:
        f.write(file_stream.read())
        
    return f"/uploads/{secured_name}"

def send_sns_notification(subject, message):
    """Sends notification to AWS SNS Topic or mocks in console logs."""
    if Config.SNS_ENABLED:
        try:
            if Config.SNS_USE_IAM_ROLE:
                sns_client = boto3.client('sns')
            else:
                sns_client = boto3.client(
                    'sns',
                    aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
                    region_name=Config.AWS_REGION
                )
            
            response = sns_client.publish(
                TopicArn=Config.SNS_TOPIC_ARN,
                Subject=subject,
                Message=message
            )
            print(f"[SNS INFO] Notification dispatched successfully. MsgId: {response.get('MessageId')}")
            return True
        except ClientError as e:
            print(f"[SNS WARNING] SNS dispatch failed: {e}. Printing to console log instead.")
            
    # Local Console Log Fallback
    print("\n" + "="*50)
    print(f"[EMAIL NOTIFICATION SIMULATION]")
    print(f"Subject   : {subject}")
    print(f"Message   : {message}")
    print("="*50 + "\n")
    return True

def save_base64_photo(base64_str, student_id):
    """Decodes profile avatar base64 data and uploads it."""
    if not base64_str:
        return None
    try:
        header = "data:image/png;base64,"
        if ',' in base64_str:
            header, base64_str = base64_str.split(',', 1)
        image_data = base64.b64decode(base64_str)
        file_stream = io.BytesIO(image_data)
        ext = 'png'
        if 'jpeg' in header or 'jpg' in header:
            ext = 'jpg'
        filename = f"profile_photo.{ext}"
        return upload_to_s3_or_local(file_stream, filename, student_id)
    except Exception as e:
        print(f"[UPLOAD WARNING] Profile picture base64 decode failed: {e}")
        return None

# ==================================================
# SECURITY & AUTH CHECKS
# ==================================================
def get_current_user():
    """Identifies logged in user from session cookies or Bearer token fallback."""
    if 'user_id' in session:
        return session['user_id'], session['user_type']
        
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        if token and token != 'null' and token != 'undefined':
            if token.startswith('SMS-'):
                return token, 'student'
            elif token == 'admin' or token.startswith('admin'):
                return token, 'admin'
    return None, None

def student_required(f):
    """Decorator ensuring that client has valid student clearance."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id, user_type = get_current_user()
        if not user_id or user_type != 'student':
            return jsonify({"error": "Unauthorized student access."}), 401
            
        student = db_execute("SELECT id, name, email, profile_photo FROM students WHERE id = %s", (user_id,), fetch='one')
        if not student:
            return jsonify({"error": "Student account not found."}), 404
            
        g.student_id = user_id
        g.current_student = student
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Decorator ensuring that client has administrator clearance."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id, user_type = get_current_user()
        if not user_id or user_type != 'admin':
            return jsonify({"error": "Unauthorized admin access."}), 401
            
        # Match user_id as username in admins table
        admin = db_execute("SELECT id, username FROM admins WHERE username = %s", (user_id,), fetch='one')
        if not admin:
            # Fallback check if user_id was stored as 'admin' email style
            admin = db_execute("SELECT id, username FROM admins WHERE username = 'admin'", fetch='one')
            if not admin:
                return jsonify({"error": "Admin account validation failed."}), 401
                
        g.admin_username = admin['username']
        g.current_admin = admin
        return f(*args, **kwargs)
    return decorated

# ==================================================
# API ROUTINGS: AUTHENTICATION
# ==================================================
@routes_bp.route('/auth/register', methods=['POST'])
def register():
    """Handles enrollment registration of a new student profile."""
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    photo_base64 = data.get('photo', '')

    if not name or not email or not password:
        return jsonify({"error": "Missing registration details."}), 400

    # Verify duplicate email
    existing = db_execute("SELECT id FROM students WHERE email = %s", (email,), fetch='one')
    if existing:
        return jsonify({"error": "Email account already exists."}), 409

    # Generate sequential unique student ID (e.g., SMS-1004)
    try:
        last_student = db_execute("SELECT id FROM students ORDER BY id DESC LIMIT 1", fetch='one')
        if last_student and last_student['id'].startswith('SMS-'):
            last_num = int(last_student['id'].split('-')[1])
            new_id = f"SMS-{last_num + 1}"
        else:
            new_id = "SMS-1001"
    except Exception:
        new_id = f"SMS-{uuid.uuid4().hex[:5].upper()}"

    # Hash the password
    pw_hash = generate_password_hash(password)

    # Save base64 image if uploaded
    photo_url = save_base64_photo(photo_base64, new_id)

    try:
        # Insert Student record
        db_execute(
            "INSERT INTO students (id, name, email, password, profile_photo) VALUES (%s, %s, %s, %s, %s)",
            (new_id, name, email, pw_hash, photo_url),
            commit=True
        )
        
        # Log to CloudWatch / console
        print(f"[CLOUDWATCH LOG] Student {name} registered successfully with ID {new_id}")
        
        # Establish session
        session['user_id'] = new_id
        session['user_type'] = 'student'

        return jsonify({
            "message": "Account created successfully",
            "token": new_id,
            "student": {
                "id": new_id,
                "name": name,
                "email": email,
                "photo": photo_url
            }
        }), 201
    except Exception as e:
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500

@routes_bp.route('/auth/login', methods=['POST'])
def login():
    """Handles login for both students and administrators."""
    data = request.get_json() or {}
    email_or_username = data.get('email', '').strip().lower() # Frontend maps inputs as 'email'
    password = data.get('password', '')

    if not email_or_username or not password:
        return jsonify({"error": "Missing login credentials."}), 400

    # 1. Check if user is a student (lookup email)
    student = db_execute("SELECT * FROM students WHERE email = %s", (email_or_username,), fetch='one')
    if student:
        if check_password_hash(student['password'], password):
            session['user_id'] = student['id']
            session['user_type'] = 'student'
            print(f"[CLOUDWATCH LOG] Student logged in: {student['id']}")
            return jsonify({
                "message": "Login successful",
                "token": student['id'],
                "user_type": "student",
                "user": {
                    "id": student['id'],
                    "name": student['name'],
                    "email": student['email'],
                    "photo": student['profile_photo']
                }
            }), 200
        else:
            return jsonify({"error": "Incorrect password."}), 401

    # 2. Check if user is an admin (lookup username)
    admin = db_execute("SELECT * FROM admins WHERE username = %s", (email_or_username,), fetch='one')
    if not admin:
        # Fallback if admin input their email style (e.g. admin@example.com)
        admin = db_execute("SELECT * FROM admins WHERE username = 'admin'", fetch='one')
        
    if admin:
        if check_password_hash(admin['password'], password):
            session['user_id'] = admin['username']
            session['user_type'] = 'admin'
            print(f"[CLOUDWATCH LOG] Admin logged in: {admin['username']}")
            return jsonify({
                "message": "Login successful",
                "token": admin['username'],
                "user_type": "admin",
                "user": {
                    "name": "System Administrator",
                    "email": admin['username']
                }
            }), 200
        else:
            return jsonify({"error": "Incorrect admin password."}), 401

    return jsonify({"error": "Account not found."}), 404

@routes_bp.route('/auth/logout', methods=['POST'])
def logout():
    """Clears the active user session cookie."""
    session.clear()
    return jsonify({"message": "Logout successful"}), 200


# ==================================================
# API ROUTINGS: STUDENT PROFILE
# ==================================================
@routes_bp.route('/student/profile', methods=['GET'])
@student_required
def get_profile():
    """Retrieves personal information for the active student."""
    return jsonify({
        "student": {
            "id": g.current_student['id'],
            "name": g.current_student['name'],
            "email": g.current_student['email'],
            "photo": g.current_student['profile_photo']
        }
    }), 200

@routes_bp.route('/student/profile', methods=['PUT'])
@student_required
def update_profile():
    """Modifies student profile coordinates (Name, Email, Password, Photo)."""
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    photo_base64 = data.get('photo', '')

    if not name or not email:
        return jsonify({"error": "Name and email are required."}), 400

    # Ensure updated email isn't already used by someone else
    existing = db_execute("SELECT id FROM students WHERE email = %s AND id != %s", (email, g.student_id), fetch='one')
    if existing:
        return jsonify({"error": "Email is already taken by another account."}), 409

    # Retrieve current photo URL
    current_photo = g.current_student['profile_photo']
    if photo_base64:
        new_photo = save_base64_photo(photo_base64, g.student_id)
        if new_photo:
            current_photo = new_photo

    try:
        if password:
            pw_hash = generate_password_hash(password)
            db_execute(
                "UPDATE students SET name = %s, email = %s, password = %s, profile_photo = %s WHERE id = %s",
                (name, email, pw_hash, current_photo, g.student_id),
                commit=True
            )
        else:
            db_execute(
                "UPDATE students SET name = %s, email = %s, profile_photo = %s WHERE id = %s",
                (name, email, current_photo, g.student_id),
                commit=True
            )

        print(f"[CLOUDWATCH LOG] Student profile updated: {g.student_id}")

        return jsonify({
            "message": "Profile updated successfully",
            "student": {
                "id": g.student_id,
                "name": name,
                "email": email,
                "photo": current_photo
            }
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to save profile: {str(e)}"}), 500


# ==================================================
# API ROUTINGS: DOCUMENTS
# ==================================================
@routes_bp.route('/upload/upload', methods=['POST'])
@student_required
def upload_document():
    """Handles uploading a transcript PDF, linking it to the student."""
    if 'file' not in request.files:
        return jsonify({"error": "No file detected in request."}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename."}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "Only PDF document uploads are allowed."}), 400

    try:
        # Determine file size
        file.seek(0, 2)
        size_bytes = file.tell()
        file.seek(0)
        
        # 2MB Limit
        if size_bytes > 2 * 1024 * 1024:
            return jsonify({"error": "File size exceeds 2MB limit."}), 400

        # Upload file
        file_url = upload_to_s3_or_local(file, file.filename, g.student_id)

        # Generate unique document ID
        try:
            last_doc = db_execute("SELECT id FROM documents ORDER BY id DESC LIMIT 1", fetch='one')
            if last_doc and last_doc['id'].startswith('DOC-'):
                last_num = int(last_doc['id'].split('-')[1])
                new_doc_id = f"DOC-{last_num + 1}"
            else:
                new_doc_id = "DOC-201"
        except Exception:
            new_doc_id = f"DOC-{uuid.uuid4().hex[:5].upper()}"

        # Insert metadata into Database
        db_execute(
            "INSERT INTO documents (id, student_id, filename, s3_url, status) VALUES (%s, %s, %s, %s, 'Pending')",
            (new_doc_id, g.student_id, file.filename, file_url),
            commit=True
        )

        print(f"[CLOUDWATCH LOG] Document uploaded: {new_doc_id} by student {g.student_id}")

        # Send SNS Notification
        subject = "AWS Student Management System - Document Uploaded"
        msg = f"Student {g.current_student['name']} ({g.student_id}) has uploaded document: {file.filename}.\nUrl: {file_url}"
        send_sns_notification(subject, msg)

        return jsonify({
            "message": "File uploaded successfully",
            "document": {
                "id": new_doc_id,
                "fileName": file.filename,
                "s3_url": file_url,
                "status": "Pending"
            }
        }), 201
    except Exception as e:
        return jsonify({"error": f"Document upload failed: {str(e)}"}), 500

@routes_bp.route('/upload/documents', methods=['GET'])
def get_student_documents():
    """Lists files associated with the active student or all for review."""
    user_id, user_type = get_current_user()
    if not user_id:
        return jsonify({"error": "Authentication required."}), 401

    if user_type == 'student':
        docs = db_execute(
            "SELECT id, filename as fileName, s3_url as file_path, status FROM documents WHERE student_id = %s ORDER BY id DESC",
            (user_id,),
            fetch='all'
        )
    else:
        # Admins get all documents
        docs = db_execute(
            "SELECT d.id, d.student_id as studentId, s.name as studentName, d.filename as fileName, d.s3_url as file_path, d.status FROM documents d JOIN students s ON d.student_id = s.id ORDER BY d.id DESC",
            fetch='all'
        )
    return jsonify({"documents": docs}), 200

@routes_bp.route('/upload/documents/<id>', methods=['DELETE'])
@student_required
def delete_document(id):
    """Removes a document registry and deletes local fallback file if applicable."""
    doc = db_execute("SELECT s3_url, status FROM documents WHERE id = %s AND student_id = %s", (id, g.student_id), fetch='one')
    if not doc:
        return jsonify({"error": "Document not found."}), 404

    if doc['status'] == 'Approved':
        return jsonify({"error": "Cannot delete approved documents."}), 403

    try:
        # Delete from Database
        db_execute("DELETE FROM documents WHERE id = %s", (id,), commit=True)
        
        # Delete S3 / local file
        file_path = doc['s3_url']
        if file_path.startswith('/uploads/'):
            local_path = os.path.join(Config.BASE_DIR, 'uploads', file_path.replace('/uploads/', ''))
            if os.path.exists(local_path):
                os.remove(local_path)
        elif file_path.startswith('https://') and Config.STORAGE_PROVIDER == 's3':
            try:
                parts = file_path.split('/')
                key = "/".join(parts[3:])
                s3 = get_s3_client()
                s3.delete_object(Bucket=Config.S3_BUCKET_NAME, Key=key)
            except Exception as se:
                print(f"[S3 WARNING] Failed to delete S3 object: {se}")

        print(f"[CLOUDWATCH LOG] Document deleted: {id} by {g.student_id}")
        return jsonify({"message": "Document successfully deleted."}), 200
    except Exception as e:
        return jsonify({"error": f"Deletion failed: {str(e)}"}), 500


# ==================================================
# API ROUTINGS: ADMIN FUNCTIONS
# ==================================================
@routes_bp.route('/admin/stats', methods=['GET'])
@admin_required
def get_admin_stats():
    """Computes basic administrative statistics."""
    students = db_execute("SELECT COUNT(*) as count FROM students", fetch='one')
    pending = db_execute("SELECT COUNT(*) as count FROM documents WHERE status = 'Pending'", fetch='one')
    approved = db_execute("SELECT COUNT(*) as count FROM documents WHERE status = 'Approved'", fetch='one')
    rejected = db_execute("SELECT COUNT(*) as count FROM documents WHERE status = 'Rejected'", fetch='one')

    return jsonify({
        "total_students": students['count'],
        "pending_docs": pending['count'],
        "approved_docs": approved['count'],
        "rejected_docs": rejected['count']
    }), 200

@routes_bp.route('/admin/students', methods=['GET'])
@admin_required
def get_all_students():
    """Returns directory of all registered student profiles."""
    students = db_execute("SELECT id, name, email, profile_photo as photo FROM students ORDER BY id ASC", fetch='all')
    return jsonify({"students": students}), 200

@routes_bp.route('/admin/documents/<id>/approve', methods=['POST'])
@admin_required
def approve_document(id):
    """Sets a document status to 'Approved'."""
    doc = db_execute("SELECT d.filename, s.name, s.email FROM documents d JOIN students s ON d.student_id = s.id WHERE d.id = %s", (id,), fetch='one')
    if not doc:
        return jsonify({"error": "Document not found."}), 404

    try:
        db_execute("UPDATE documents SET status = 'Approved' WHERE id = %s", (id,), commit=True)
        print(f"[CLOUDWATCH LOG] Admin approved document {id}")
        return jsonify({"message": "Document successfully approved."}), 200
    except Exception as e:
        return jsonify({"error": f"Approval failed: {str(e)}"}), 500

@routes_bp.route('/admin/documents/<id>/reject', methods=['POST'])
@admin_required
def reject_document(id):
    """Sets a document status to 'Rejected'."""
    doc = db_execute("SELECT d.filename, s.name, s.email FROM documents d JOIN students s ON d.student_id = s.id WHERE d.id = %s", (id,), fetch='one')
    if not doc:
        return jsonify({"error": "Document not found."}), 404

    try:
        db_execute("UPDATE documents SET status = 'Rejected' WHERE id = %s", (id,), commit=True)
        print(f"[CLOUDWATCH LOG] Admin rejected document {id}")
        return jsonify({"message": "Document successfully rejected."}), 200
    except Exception as e:
        return jsonify({"error": f"Rejection failed: {str(e)}"}), 500

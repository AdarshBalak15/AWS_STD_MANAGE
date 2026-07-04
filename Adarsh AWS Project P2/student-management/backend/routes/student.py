# ==================================================
# STUDENT PORTAL ROUTING BLUEPRINT: backend/routes/student.py
# AWS Cloud-Based Student Management System
# ==================================================

from flask import Blueprint, request, jsonify, g
from aws.rds_connection import DBConnection
from backend.middleware.auth import student_required
from backend.utils.helpers import SecurityHelper, AuditLogger

student_bp = Blueprint('student', __name__)

@student_bp.route('/profile', methods=['GET'])
@student_required
def get_profile():
    # Return cache from authorization middleware context
    return jsonify({
        "student": g.current_student
    }), 200


@student_bp.route('/profile', methods=['PUT'])
@student_required
def update_profile():
    data = request.get_json() or {}
    
    # Allowable Modifiable fields
    name = SecurityHelper.sanitize_input(data.get('name'))
    phone = data.get('phone', '').strip()
    gender = data.get('gender')
    dob = data.get('dob')
    semester = data.get('semester')
    address = SecurityHelper.sanitize_input(data.get('address'))
    photo = data.get('photo', '') # base64 string

    if not (name and phone and gender and dob and semester and address):
        return jsonify({"error": "Missing required edit fields."}), 400

    if not SecurityHelper.validate_phone(phone):
        return jsonify({"error": "Invalid phone format."}), 400

    query = """
        UPDATE students
        SET name = %s, phone = %s, gender = %s, dob = %s, semester = %s, address = %s, photo = %s
        WHERE id = %s
    """
    try:
        DBConnection.execute_query(
            query,
            (name, phone, gender, dob, semester, address, photo, g.student_id),
            commit=True
        )
        
        # Log Audit activity
        AuditLogger.log_activity(g.student_id, 'student', 'Profile Edit', 'Modified personal profile details.')

        # Retrieve updated student details
        updated_student = DBConnection.execute_query(
            "SELECT id, name, email, status, department, semester, photo FROM students WHERE id = %s",
            (g.student_id,),
            fetch='one'
        )

        return jsonify({
            "message": "Profile updated successfully",
            "student": updated_student
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to save profile: {e}"}), 500


@student_bp.route('/change-password', methods=['POST'])
@student_required
def change_password():
    data = request.get_json() or {}
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not old_password or not new_password:
        return jsonify({"error": "Current and new password entries required."}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400

    # Fetch hashed password
    student = DBConnection.execute_query("SELECT password_hash FROM students WHERE id = %s", (g.student_id,), fetch='one')
    
    if not SecurityHelper.verify_password(student['password_hash'], old_password):
        return jsonify({"error": "Incorrect current password credentials."}), 401

    # Update new password hash
    new_hash = SecurityHelper.hash_password(new_password)
    DBConnection.execute_query(
        "UPDATE students SET password_hash = %s WHERE id = %s",
        (new_hash, g.student_id),
        commit=True
    )

    # Log audit event
    AuditLogger.log_activity(g.student_id, 'student', 'Password Change', 'Credentials password updated.')

    return jsonify({"message": "Password changed successfully."}), 200


@student_bp.route('/notifications', methods=['GET'])
@student_required
def get_notifications():
    query = """
        SELECT id, recipient_id as recipientId, title, message, type, read_status as read, 
               DATE_FORMAT(timestamp, '%%Y-%%m-%%d %%H:%%i') as timestamp
        FROM notifications
        WHERE recipient_id = %s
        ORDER BY timestamp DESC
    """
    # SQLite does not support DATE_FORMAT, provide fallback parsing
    db_conn, db_engine = DBConnection.get_connection()
    db_conn.close()
    
    if db_engine == 'sqlite':
        query = """
            SELECT id, recipient_id as recipientId, title, message, type, read_status as read, timestamp
            FROM notifications
            WHERE recipient_id = %s
            ORDER BY timestamp DESC
        """

    try:
        notifications = DBConnection.execute_query(query, (g.student_id,), fetch='all')
        
        # SQLite returns 0/1 for booleans
        for n in notifications:
            n['read'] = bool(n['read'])

        return jsonify({
            "notifications": notifications
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve alerts: {e}"}), 500


@student_bp.route('/notifications/<id>/read', methods=['POST'])
@student_required
def mark_notification_read(id):
    query = "UPDATE notifications SET read_status = TRUE WHERE id = %s AND recipient_id = %s"
    try:
        DBConnection.execute_query(query, (id, g.student_id), commit=True)
        return jsonify({"message": "Notification marked read."}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to update alert: {e}"}), 500

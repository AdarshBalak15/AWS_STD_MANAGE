# ==================================================
# ADMIN PORTAL ROUTING BLUEPRINT: backend/routes/admin.py
# AWS Cloud-Based Student Management System
# ==================================================

from flask import Blueprint, request, jsonify, g
from aws.rds_connection import DBConnection
from backend.middleware.auth import admin_required
from backend.utils.helpers import SecurityHelper, AuditLogger

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_stats():
    """Computes admin metrics dashboard statistics from RDS database"""
    try:
        # Total Students
        students_count = DBConnection.execute_query("SELECT COUNT(*) as count FROM students", fetch='one')
        
        # Documents metrics
        pending_count = DBConnection.execute_query("SELECT COUNT(*) as count FROM documents WHERE status = 'Pending'", fetch='one')
        approved_count = DBConnection.execute_query("SELECT COUNT(*) as count FROM documents WHERE status = 'Approved'", fetch='one')
        rejected_count = DBConnection.execute_query("SELECT COUNT(*) as count FROM documents WHERE status = 'Rejected'", fetch='one')

        return jsonify({
            "total_students": students_count['count'],
            "pending_docs": pending_count['count'],
            "approved_docs": approved_count['count'],
            "rejected_docs": rejected_count['count']
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to compute statistics: {e}"}), 500


@admin_bp.route('/students', methods=['GET'])
@admin_required
def get_students_directory():
    """Retrieves directory of students, with search queries, filtering and pagination"""
    search_query = request.args.get('search', '').strip().lower()
    dept_filter = request.args.get('department', '').strip()
    sem_filter = request.args.get('semester', '').strip()
    
    # Pagination
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 5))
    except ValueError:
        page = 1
        limit = 5

    offset = (page - 1) * limit

    # Build SQL queries dynamically
    where_clauses = []
    params = []

    if search_query:
        where_clauses.append("(LOWER(name) LIKE %s OR LOWER(id) LIKE %s OR LOWER(email) LIKE %s)")
        search_param = f"%{search_query}%"
        params.extend([search_param, search_param, search_param])

    if dept_filter:
        where_clauses.append("department = %s")
        params.append(dept_filter)

    if sem_filter:
        where_clauses.append("semester = %s")
        params.append(sem_filter)

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    count_query = f"SELECT COUNT(*) as count FROM students {where_sql}"
    data_query = f"""
        SELECT id, name, email, phone, gender, dob, department, semester, address, photo, status 
        FROM students 
        {where_sql} 
        ORDER BY created_at DESC 
        LIMIT %s OFFSET %s
    """
    
    try:
        # Get connection to format offset limits depending on SQL variant
        db_conn, db_engine = DBConnection.get_connection()
        db_conn.close()
        
        # SQLite uses LIMIT offset format or ? placeholder mappings
        # Prepare params
        data_params = list(params)
        data_params.extend([limit, offset])

        total_count = DBConnection.execute_query(count_query, params, fetch='one')
        students = DBConnection.execute_query(data_query, data_params, fetch='all')

        return jsonify({
            "total": total_count['count'],
            "students": students,
            "page": page,
            "limit": limit
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to load directory: {e}"}), 500


@admin_bp.route('/students/<id>', methods=['DELETE'])
@admin_required
def delete_student(id):
    """Deletes student record and cascades corresponding documents from the database"""
    try:
        # Check existence
        student = DBConnection.execute_query("SELECT name FROM students WHERE id = %s", (id,), fetch='one')
        if not student:
            return jsonify({"error": "Student record does not exist."}), 404

        # Execute Delete
        DBConnection.execute_query("DELETE FROM students WHERE id = %s", (id,), commit=True)

        # Log audit operation
        AuditLogger.log_activity(g.admin_email, 'admin', 'Delete Student', f"Purged student profile {id} ({student['name']}) from system.")

        return jsonify({"message": f"Student registry {id} successfully deleted."}), 200
    except Exception as e:
        return jsonify({"error": f"Deletion failed: {e}"}), 500


@admin_bp.route('/students/<id>/status', methods=['PUT'])
@admin_required
def update_student_status(id):
    """Updates student enrollment credentials details directly from administrative prompts"""
    data = request.get_json() or {}
    name = SecurityHelper.sanitize_input(data.get('name'))
    semester = data.get('semester')
    status = data.get('status') # Active, Suspended, Pending Approval

    if not name or not semester or not status:
        return jsonify({"error": "Missing profile status update fields."}), 400

    query = """
        UPDATE students
        SET name = %s, semester = %s, status = %s
        WHERE id = %s
    """
    try:
        DBConnection.execute_query(query, (name, semester, status, id), commit=True)
        
        # Log Audit activity
        AuditLogger.log_activity(g.admin_email, 'admin', 'Update Student Status', f"Updated profile parameters of {id} to Name={name}, Sem={semester}, Status={status}.")

        return jsonify({"message": "Student registry details successfully updated."}), 200
    except Exception as e:
        return jsonify({"error": f"Updates failed: {e}"}), 500


@admin_bp.route('/recent-uploads', methods=['GET'])
@admin_required
def get_recent_uploads():
    """Returns top 5 globally uploaded document logs for administrative dashboard consoles"""
    query = """
        SELECT d.id, d.student_id as studentId, s.name as studentName, d.file_name as fileName, 
               d.file_type as fileType, d.file_size as fileSize, d.category, d.status,
               DATE_FORMAT(d.uploaded_at, '%%Y-%%m-%%d %%H:%%i') as uploadedAt
        FROM documents d
        JOIN students s ON d.student_id = s.id
        ORDER BY d.uploaded_at DESC
        LIMIT 5
    """
    
    # SQLite fallback
    db_conn, db_engine = DBConnection.get_connection()
    db_conn.close()
    if db_engine == 'sqlite':
        query = """
            SELECT d.id, d.student_id as studentId, s.name as studentName, d.file_name as fileName, 
                   d.file_type as fileType, d.file_size as fileSize, d.category, d.status, d.uploaded_at as uploadedAt
            FROM documents d
            JOIN students s ON d.student_id = s.id
            ORDER BY d.uploaded_at DESC
            LIMIT 5
        """
        
    try:
        recent = DBConnection.execute_query(query, fetch='all')
        return jsonify({
            "recent_uploads": recent
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve document log history: {e}"}), 500

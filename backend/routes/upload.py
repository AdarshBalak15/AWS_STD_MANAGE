# ==================================================
# UPLOAD & DOCUMENT VALIDATION PORTAL: backend/routes/upload.py
# AWS Cloud-Based Student Management System
# ==================================================

import datetime
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
from aws.rds_connection import DBConnection
from aws.s3_service import S3Service
from aws.sns_service import SNSService
from backend.middleware.auth import login_required, student_required, admin_required
from backend.utils.helpers import SecurityHelper, AuditLogger

upload_bp = Blueprint('upload', __name__)

ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'}
MAX_FILE_SIZE = 2 * 1024 * 1024 # 2MB

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@upload_bp.route('/upload', methods=['POST'])
@student_required
def upload_file():
    """
    Handles file upload, checks file sizes/extensions, and uploads to S3 or local disk.
    Creates log entry in database.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file stream detected in payload."}), 400

    file = request.files['file']
    category = request.form.get('category')

    if not category:
        return jsonify({"error": "Verification category required."}), 400

    if file.filename == '':
        return jsonify({"error": "Selected filename is empty."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File format not supported. Upload PDF, DOCX, PNG, or JPG."}), 400

    # Calculate stream file size
    file.seek(0, 2)
    size_bytes = file.tell()
    file.seek(0) # reset position back to start

    if size_bytes > MAX_FILE_SIZE:
        return jsonify({"error": "File size exceeds 2MB limit."}), 400

    # Format Size String
    size_str = f"{(size_bytes / (1024 * 1024)):.2f} MB" if size_bytes > 1024 * 1024 else f"{(size_bytes / 1024):.0f} KB"
    file_type = file.filename.rsplit('.', 1)[1].lower()
    if file_type in ['jpg', 'png', 'jpeg']:
        file_type = 'image'

    # Save via S3 Service (handles direct uploads to S3 or fallback local file system)
    try:
        file_path, provider = S3Service.upload_document(file, file.filename, g.student_id)
        
        # Create unique document ID (DOC-XXX)
        last_doc = DBConnection.execute_query("SELECT id FROM documents ORDER BY id DESC LIMIT 1", fetch='one')
        if last_doc and last_doc['id'].startswith('DOC-'):
            last_num = int(last_doc['id'].split('-')[1])
            new_doc_id = f"DOC-{last_num + 1}"
        else:
            new_doc_id = "DOC-201"

        # Insert document metadata into database
        insert_query = """
            INSERT INTO documents (id, student_id, file_name, file_type, file_size, category, file_path, status, remarks)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'Pending', '')
        """
        DBConnection.execute_query(
            insert_query,
            (new_doc_id, g.student_id, file.filename, file_type, size_str, category, file_path),
            commit=True
        )

        # Log Activity & Dispatch notifications
        AuditLogger.log_activity(g.student_id, 'student', 'File Upload', f"Uploaded document {file.filename} to S3 ({new_doc_id}).")
        SNSService.notify_upload(g.current_student['name'], file.filename, category)

        return jsonify({
            "message": "File uploaded successfully",
            "document": {
                "id": new_doc_id,
                "fileName": file.filename,
                "fileType": file_type,
                "fileSize": size_str,
                "category": category,
                "status": "Pending",
                "uploadedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            }
        }), 201
    except Exception as e:
        return jsonify({"error": f"Upload failed: {e}"}), 500


@upload_bp.route('/documents', methods=['GET'])
@login_required
def get_documents():
    """
    Returns list of documents. 
    If user is student, returns their files. 
    If user is admin, returns pending documents queue.
    """
    if g.user_type == 'student':
        query = """
            SELECT id, file_name as fileName, file_type as fileType, file_size as fileSize, 
                   category, status, remarks, DATE_FORMAT(uploaded_at, '%%Y-%%m-%%d %%H:%%i') as uploadedAt
            FROM documents
            WHERE student_id = %s
            ORDER BY uploaded_at DESC
        """
        params = (g.user_id,)
    else:
        # Admin gets pending queue
        query = """
            SELECT d.id, d.student_id as studentId, s.name as studentName, d.file_name as fileName, 
                   d.file_type as fileType, d.file_size as fileSize, d.category, d.status,
                   DATE_FORMAT(d.uploaded_at, '%%Y-%%m-%%d %%H:%%i') as uploadedAt
            FROM documents d
            JOIN students s ON d.student_id = s.id
            WHERE d.status = 'Pending'
            ORDER BY d.uploaded_at DESC
        """
        params = ()

    # SQLite fallback
    db_conn, db_engine = DBConnection.get_connection()
    db_conn.close()
    if db_engine == 'sqlite':
        query = query.replace("DATE_FORMAT(uploaded_at, '%Y-%m-%d %H:%i')", "uploaded_at")
        query = query.replace("DATE_FORMAT(d.uploaded_at, '%Y-%m-%d %H:%i')", "d.uploaded_at")

    try:
        documents = DBConnection.execute_query(query, params, fetch='all')
        return jsonify({
            "documents": documents
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve documents: {e}"}), 500


@upload_bp.route('/documents/<id>/preview', methods=['GET'])
@login_required
def preview_document(id):
    """
    Returns a secure download/preview path for files.
    Generates AWS S3 pre-signed URLs on-the-fly if hosted on S3.
    """
    doc = DBConnection.execute_query("SELECT file_path, file_name FROM documents WHERE id = %s", (id,), fetch='one')
    if not doc:
        return jsonify({"error": "Document record not found."}), 404

    # Generate secure download path link
    url = S3Service.generate_download_url(doc['file_path'])
    return jsonify({
        "url": url,
        "fileName": doc['file_name']
    }), 200


@upload_bp.route('/documents/<id>', methods=['DELETE'])
@student_required
def delete_document(id):
    """Deletes document upload record (banned on Approved status)"""
    doc = DBConnection.execute_query("SELECT file_path, status, file_name FROM documents WHERE id = %s AND student_id = %s", (id, g.student_id), fetch='one')
    
    if not doc:
        return jsonify({"error": "Document record not found."}), 404

    if doc['status'] == 'Approved':
        return jsonify({"error": "Approved files cannot be deleted."}), 403

    try:
        # Delete from uploader registry
        DBConnection.execute_query("DELETE FROM documents WHERE id = %s", (id,), commit=True)
        
        # Delete S3 Object / Local files
        S3Service.delete_document(doc['file_path'])

        # Log Activity
        AuditLogger.log_activity(g.student_id, 'student', 'File Delete', f"Deleted document {doc['file_name']} ({id}).")

        return jsonify({"message": "Document successfully deleted."}), 200
    except Exception as e:
        return jsonify({"error": f"Deletion failed: {e}"}), 500


@upload_bp.route('/documents/<id>/approve', methods=['POST'])
@admin_required
def approve_document(id):
    """Admin approves document and inserts verification remarks comments"""
    data = request.get_json() or {}
    remarks = SecurityHelper.sanitize_input(data.get('remarks', ''))

    doc = DBConnection.execute_query("""
        SELECT d.file_name, d.student_id, s.name as studentName, s.email as studentEmail 
        FROM documents d
        JOIN students s ON d.student_id = s.id
        WHERE d.id = %s
    """, (id,), fetch='one')

    if not doc:
        return jsonify({"error": "Document record not found."}), 404

    try:
        # Update DB status
        DBConnection.execute_query(
            "UPDATE documents SET status = 'Approved', remarks = %s WHERE id = %s",
            (remarks, id),
            commit=True
        )

        # Notify student via notifications center
        notif_id = f"NOT-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        DBConnection.execute_query(
            """INSERT INTO notifications (id, recipient_id, title, message, type)
               VALUES (%s, %s, 'Document Approved', %s, 'success')""",
            (notif_id, doc['student_id'], f"Your document '{doc['file_name']}' was approved: {remarks}"),
            commit=True
        )

        # Log Audit activity & Dispatch SNS Alert
        AuditLogger.log_activity(g.admin_email, 'admin', 'Approve Document', f"Approved doc {id} ({doc['file_name']}) for student {doc['student_id']}.")
        SNSService.notify_approval(doc['studentName'], doc['studentEmail'], doc['file_name'], remarks)

        return jsonify({"message": "Document successfully approved."}), 200
    except Exception as e:
        return jsonify({"error": f"Verification failed: {e}"}), 500


@upload_bp.route('/documents/<id>/reject', methods=['POST'])
@admin_required
def reject_document(id):
    """Admin rejects document and provides feedback comments (remarks mandatory)"""
    data = request.get_json() or {}
    remarks = SecurityHelper.sanitize_input(data.get('remarks', ''))

    if not remarks:
        return jsonify({"error": "Rejection remarks feedback is required."}), 400

    doc = DBConnection.execute_query("""
        SELECT d.file_name, d.student_id, s.name as studentName, s.email as studentEmail 
        FROM documents d
        JOIN students s ON d.student_id = s.id
        WHERE d.id = %s
    """, (id,), fetch='one')

    if not doc:
        return jsonify({"error": "Document record not found."}), 404

    try:
        # Update DB status
        DBConnection.execute_query(
            "UPDATE documents SET status = 'Rejected', remarks = %s WHERE id = %s",
            (remarks, id),
            commit=True
        )

        # Notify student via notifications center
        notif_id = f"NOT-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        DBConnection.execute_query(
            """INSERT INTO notifications (id, recipient_id, title, message, type)
               VALUES (%s, %s, 'Document Rejected', %s, 'danger')""",
            (notif_id, doc['student_id'], f"Your document '{doc['file_name']}' was rejected: {remarks}"),
            commit=True
        )

        # Log Audit activity & Dispatch SNS Alert
        AuditLogger.log_activity(g.admin_email, 'admin', 'Reject Document', f"Rejected doc {id} ({doc['file_name']}) for student {doc['student_id']}.")
        SNSService.notify_rejection(doc['studentName'], doc['studentEmail'], doc['file_name'], remarks)

        return jsonify({"message": "Document successfully rejected."}), 200
    except Exception as e:
        return jsonify({"error": f"Rejection failed: {e}"}), 500

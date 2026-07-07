# ==================================================
# SECURITY UTILITIES & AUDITING HELPERS: backend/utils/helpers.py
# AWS Cloud-Based Student Management System
# ==================================================

import re
import datetime
from flask import request
from werkzeug.security import generate_password_hash, check_password_hash
from aws.rds_connection import DBConnection
from aws.cloudwatch_service import CloudWatchService

class SecurityHelper:
    @staticmethod
    def hash_password(password):
        """Hashes password using standard secure scrypt method"""
        return generate_password_hash(password)

    @staticmethod
    def verify_password(password_hash, password):
        """Verifies clear text password against the hashed record"""
        return check_password_hash(password_hash, password)

    @staticmethod
    def validate_email(email):
        """Regex email check"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    @staticmethod
    def validate_phone(phone):
        """Regex phone validation"""
        pattern = r'^\+?[\d\s-]{10,16}$'
        return bool(re.match(pattern, phone))

    @staticmethod
    def sanitize_input(text):
        """Removes simple dangerous markup scripts (Prevention of XSS)"""
        if not text:
            return text
        clean = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.IGNORECASE)
        clean = re.sub(r'<\/?[^>]*>', '', clean) # strip HTML tags
        return clean.strip()


class AuditLogger:
    @staticmethod
    def log_activity(user_id, user_type, action, details=None):
        """
        Inserts activity events records into RDS logs and streams to CloudWatch.
        """
        query = """
            INSERT INTO activity_logs (user_id, user_type, action, details)
            VALUES (%s, %s, %s, %s)
        """
        try:
            DBConnection.execute_query(query, (user_id, user_type, action, details), commit=True)
            
            # Stream to AWS CloudWatch Logs
            logger = CloudWatchService.get_logger()
            logger.info(f"AUDIT LOG: User={user_id} ({user_type}) | Action={action} | Details={details or 'None'}")
        except Exception as e:
            print(f"[AUDIT ERROR] Failed to write activity log: {e}")

    @staticmethod
    def log_login(user_id, user_type, status='Success'):
        """
        Records login histories (including User Agent and Client IP trackers).
        """
        # Retrieve headers trackers
        ip_address = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        if ip_address and ',' in ip_address:
            ip_address = ip_address.split(',')[0].strip()
            
        user_agent = request.headers.get('User-Agent', 'Unknown')

        query = """
            INSERT INTO login_history (user_id, user_type, ip_address, user_agent, login_status)
            VALUES (%s, %s, %s, %s, %s)
        """
        try:
            DBConnection.execute_query(query, (user_id, user_type, ip_address, user_agent[:255], status), commit=True)
            
            # Send metric if failed
            if status == 'Failed':
                CloudWatchService.log_login_failure(user_id, ip_address)
        except Exception as e:
            print(f"[AUDIT ERROR] Failed to write login history: {e}")

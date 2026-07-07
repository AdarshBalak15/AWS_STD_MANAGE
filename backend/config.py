# ==================================================
# APPLICATION CONFIGURATION: backend/config.py
# AWS Student Management System
# ==================================================

import os
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

class Config:
    # Basic Configs
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    ENV = os.getenv('FLASK_ENV', 'production')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    SECRET_KEY = os.getenv('SECRET_KEY', 'educloud-super-secret-session-key-998811')

    # Database Configuration (AWS RDS MySQL or Fallback SQLite)
    DB_TYPE = os.getenv('DB_TYPE', 'sqlite') # mysql, sqlite
    DB_HOST = os.getenv('RDS_HOSTNAME', 'localhost')
    DB_USER = os.getenv('RDS_USERNAME', 'root')
    DB_PASSWORD = os.getenv('RDS_PASSWORD', '')
    DB_NAME = os.getenv('RDS_DB_NAME', 'educloud_db')
    DB_PORT = os.getenv('RDS_PORT', '3306')

    # AWS Storage Configuration (Amazon S3)
    STORAGE_PROVIDER = os.getenv('STORAGE_PROVIDER', 'local') # s3, local
    S3_BUCKET_NAME = os.getenv('AWS_S3_BUCKET', 'educloud-student-transcripts-bucket')
    S3_USE_IAM_ROLE = os.getenv('AWS_S3_USE_IAM_ROLE', 'False').lower() in ('true', '1', 't')

    # AWS Credentials (optional if using IAM EC2 Roles)
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID', '')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY', '')
    AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')

    # AWS SNS Configuration
    SNS_ENABLED = os.getenv('AWS_SNS_ENABLED', 'False').lower() in ('true', '1', 't')
    SNS_TOPIC_ARN = os.getenv('AWS_SNS_TOPIC_ARN', '')
    SNS_USE_IAM_ROLE = os.getenv('AWS_SNS_USE_IAM_ROLE', 'False').lower() in ('true', '1', 't')

    # AWS Lambda Configuration (Used by S3 event integration)
    LAMBDA_ENABLED = os.getenv('AWS_LAMBDA_ENABLED', 'False').lower() in ('true', '1', 't')
    LAMBDA_USE_IAM_ROLE = os.getenv('AWS_LAMBDA_USE_IAM_ROLE', 'False').lower() in ('true', '1', 't')
    LAMBDA_IMAGE_RESIZE_NAME = os.getenv('AWS_LAMBDA_IMAGE_RESIZE_NAME', 'educloud-image-resize')

    # AWS CloudWatch Configuration
    CLOUDWATCH_ENABLED = os.getenv('AWS_CLOUDWATCH_ENABLED', 'False').lower() in ('true', '1', 't')
    CLOUDWATCH_LOG_GROUP = os.getenv('AWS_CLOUDWATCH_LOG_GROUP', 'educloud/student-management-system')
    CLOUDWATCH_LOG_STREAM = os.getenv('AWS_CLOUDWATCH_LOG_STREAM', 'app-logs')

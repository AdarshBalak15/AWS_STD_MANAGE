# AWS Student Management System (Beginner Showcase)

Welcome to the **AWS Student Management System**! This project is a simplified, beginner-friendly cloud portfolio application designed to showcase how to host a Python web application on AWS using core AWS services.

The application allows students to register, manage their profiles, upload profile photos, and upload PDF transcripts. It also provides an administrative portal to view registered students and approve or reject uploaded document credentials.

---

## Architecture & AWS Services Used

This showcase demonstrates how multiple AWS services coordinate to host a scalable, highly-available web application:

```
[ Client Browser ]
        │ (HTTPS Request)
        ▼
[ Application Load Balancer (ALB) ]
        │ (Distributes traffic)
        ▼
[ Auto Scaling Group (ASG) ] ──> Logs streamed to ──> [ Amazon CloudWatch ]
   └── [ EC2 Instance (Flask App) ]
           ├── DB persistence ──> [ Amazon RDS (MySQL) ]
           ├── File uploads ────> [ Amazon S3 (PDFs & Photos) ]
           │                         │
           │                         ▼ S3 upload event triggers
           │                      [ AWS Lambda (Resizer) ]
           │
           └── Upload alerting ──> [ Amazon SNS (Email notification) ]
```

1. **Amazon EC2**: Virtual servers hosting our Flask web application inside an Auto Scaling Group.
2. **Amazon RDS (MySQL)**: Relational database service used to store student and administrator credentials.
3. **Amazon S3**: Object storage used to save profile pictures and uploaded PDF documents.
4. **AWS Lambda**: Serverless computing service that automatically triggers when a profile photo is uploaded to S3 to create a resized avatar image.
5. **Application Load Balancer (ALB)**: Automatically distributes incoming web traffic across active EC2 instances.
6. **Auto Scaling Group (ASG)**: Scales the number of active EC2 instances up or down based on traffic/load metrics.
7. **CloudWatch**: Collects application print statements and error logging for analysis.
8. **Amazon SNS**: Simple Notification Service that dispatches emails to administration subscriptions when a student uploads a PDF.
9. **IAM**: Defines policies and roles allowing the EC2 instances to access S3, SNS, and CloudWatch without hardcoding AWS credentials.

---

## Folder Structure

The project directory has been organized to be as flat and descriptive as possible:

```
student-management/
├── backend/
│   ├── app.py             # Flask application entrypoint & SQLite DB initialization
│   ├── routes.py          # Unified API routes & direct AWS/DB connections
│   ├── config.py          # Environment settings & configuration variables
│   └── requirements.txt   # Python package dependencies
├── database/
│   ├── schema.sql         # SQL script defining Students, Documents, & Admins tables
│   └── seed.sql           # Initial dummy entries for student & administrator
├── frontend/
│   ├── html/              # All HTML layout web pages
│   ├── css/               # Styling sheets
│   └── js/                # Client-side JavaScript controllers
├── uploads/               # Local folder fallback for S3 storage
├── install.sh             # Setup script for deployment on EC2 Ubuntu
├── run.sh                 # Control script to start Gunicorn on EC2
├── .env.example           # Environment template file
└── README.md              # This file
```

---

## How to Run Locally

To test this project on your local computer before deploying to AWS, follow these steps:

### Prerequisites
- Python 3.8+ installed.
- MySQL server installed (optional; the application falls back to a local SQLite database file `educloud_fallback.db` if no RDS MySQL hostname is provided).

### Step-by-Step Setup
1. **Clone the repository**:
   ```bash
   git clone <repository_url>
   cd student-management
   ```

2. **Set up a virtual environment**:
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Prepare Environment Variables**:
   Copy the example template file to create a local `.env`:
   ```bash
   cp .env.example .env
   ```
   *Note: By default, `DB_TYPE=sqlite` and `STORAGE_PROVIDER=local` are configured inside `.env.example`, allowing the project to run immediately without any AWS connection configurations.*

5. **Run the Flask application**:
   ```bash
   python backend/app.py
   ```
   Open your browser and navigate to `http://127.0.0.1:5000` to interact with the system!

---

## AWS Integration & Deployment Guide

Follow these steps to deploy the application on AWS:

### 1. Setting up RDS MySQL
1. Open the **Amazon RDS console** and choose **Create database**.
2. Select **MySQL** engine and choose the **Free tier** template.
3. Configure your database identifier, admin username (`admin`), and password.
4. Set **Public access** to *No* (for security) and place it inside your VPC.
5. Once active, copy the **Endpoint host**. Update your `.env` configuration:
   ```env
   DB_TYPE=mysql
   RDS_HOSTNAME=<your-rds-endpoint>
   RDS_USERNAME=admin
   RDS_PASSWORD=<your-database-password>
   RDS_DB_NAME=educloud_db
   ```
6. Run the `database/schema.sql` and `database/seed.sql` queries on your RDS database to initialize tables and admin login credentials.

### 2. Setting up S3 Bucket
1. Open the **Amazon S3 console** and select **Create bucket**.
2. Uncheck *Block all public access* if you wish to host profile images that are directly visible, or use IAM Roles to allow the application server to generate secure presigned download links.
3. Update your `.env` variables:
   ```env
   STORAGE_PROVIDER=s3
   AWS_S3_BUCKET=<your-bucket-name>
   AWS_REGION=<your-bucket-region>
   ```

### 3. Deploying on EC2
1. Launch an EC2 Instance with **Ubuntu 22.04 LTS** (t2.micro is eligible for free tier).
2. Create an **IAM Role** with policies allowing access to S3, SNS, and CloudWatch:
   - `AmazonS3FullAccess`
   - `AmazonSNSFullAccess`
   - `CloudWatchLogsFullAccess`
3. Attach this IAM Role to your EC2 instance (Actions -> Security -> Modify IAM role).
4. SSH into your EC2 instance and clone your repository.
5. Create `.env` in the cloned project root and fill in the RDS/S3 settings. Make sure to set `AWS_S3_USE_IAM_ROLE=True` and `AWS_SNS_USE_IAM_ROLE=True` so that the application authenticates via the attached EC2 IAM Role instead of credentials files.
6. Make `install.sh` executable and run it:
   ```bash
   chmod +x install.sh
   sudo ./install.sh
   ```
7. Start the application:
   ```bash
   chmod +x run.sh
   ./run.sh
   ```

### 4. Setting up Load Balancers & Auto Scaling
1. Create a **Target Group** targeting TCP port 5000 (where Gunicorn is running).
2. Create an **Application Load Balancer (ALB)**, open HTTP Port 80, and forward traffic to your Target Group.
3. Set up an **Auto Scaling Group (ASG)** using a launch template containing your EC2 configuration. Configure scaling policies to launch new instances if CPU usage exceeds 70%.

### 5. Configuring SNS Email Alerts
1. Open the **Amazon SNS console** and select **Create topic** (choose *Standard* type).
2. Select **Create subscription**, choose *Email* as the protocol, and enter the administrator's email.
3. Confirm the subscription by clicking the confirmation link sent to that email.
4. Copy the **Topic ARN** and update `.env`:
   ```env
   AWS_SNS_ENABLED=True
   AWS_SNS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:your-topic-name
   ```

### 6. Setting up S3 Image Resizing with AWS Lambda
1. Create an AWS Lambda function using the **Python runtime**.
2. Zip the Python code along with a Pillow dependency layer (required for processing images).
3. The Lambda handler handles resizing:
   ```python
   import boto3
   from PIL import Image
   import io
   
   s3 = boto3.client('s3')
   
   def lambda_handler(event, context):
       bucket = event['Records'][0]['s3']['bucket']['name']
       key = event['Records'][0]['s3']['object']['key']
       
       # Fetch image from S3, resize using Pillow, and save back to S3 bucket
       # under a 'thumbnails/' folder prefix
   ```
4. Set up an **S3 Event Trigger** in your S3 Bucket settings so that every time a file is uploaded under the profile picture prefix, S3 automatically triggers this Lambda function.

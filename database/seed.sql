-- ==================================================
-- SEED DATA: database/seed.sql
-- Simplified AWS Student Management System
-- ==================================================

USE educloud_db;

-- 1. Insert Default Admins
-- Password is 'admin123' hashed using werkzeug.security
INSERT INTO admins (id, username, password)
VALUES (
    1,
    'admin',
    'scrypt:32768:8:1$vT0XqXUo9Yd9mB4K$4fa7d0577df1ccf6eb8b1e5a5ea2eb3a8a3a0e6c7104b2c14de3d10034a7812f86646542718e80718d752ca69e8ccbb2be73c52a92631a0e914041b6920f5dc9'
) ON DUPLICATE KEY UPDATE id=id;

-- 2. Insert Default Students
-- Password is 'password123' hashed using werkzeug.security
INSERT INTO students (id, name, email, password, profile_photo)
VALUES 
(
    'SMS-1001',
    'Adarsh Balak',
    'student@example.com',
    'scrypt:32768:8:1$9T8B9zKw8jJ5P2eS$04f2d3bbd387f59d57a2e22f2f7e02be20fa54003d15b3d5b2db97561f32a76f277a83d4722f80a97c413b0c5e3d7bb0ad63a3d5b2db97561f32a76f277a83d4',
    NULL
),
(
    'SMS-1002',
    'Jane Smith',
    'jane.smith@example.com',
    'scrypt:32768:8:1$9T8B9zKw8jJ5P2eS$04f2d3bbd387f59d57a2e22f2f7e02be20fa54003d15b3d5b2db97561f32a76f277a83d4722f80a97c413b0c5e3d7bb0ad63a3d5b2db97561f32a76f277a83d4',
    NULL
) ON DUPLICATE KEY UPDATE id=id;

-- 3. Insert Default Documents
INSERT INTO documents (id, student_id, filename, s3_url, status)
VALUES
(
    'DOC-201',
    'SMS-1001',
    'High_School_Transcript.pdf',
    '/uploads/High_School_Transcript.pdf',
    'Approved'
),
(
    'DOC-202',
    'SMS-1001',
    'Profile_Picture_HD.jpg',
    '/uploads/Profile_Picture_HD.jpg',
    'Pending'
),
(
    'DOC-203',
    'SMS-1002',
    'Semester_5_GradeCard.pdf',
    '/uploads/Semester_5_GradeCard.pdf',
    'Approved'
) ON DUPLICATE KEY UPDATE id=id;

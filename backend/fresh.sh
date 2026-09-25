#!/bin/bash
# migrate:fresh --seed ala Laravel untuk Quizary
# Hapus semua tabel → migrasi ulang → seed data

set -e

echo "=== Dropping all tables ==="
mysql -u faqih -p fastapi_quizary <<SQL
SET foreign_key_checks = 0;
DROP TABLE IF EXISTS sections, answer_options, submission_option_order, submission_question_order, answers, submissions, images, question_options, questions, forms, users, app_settings, alembic_version;
SET foreign_key_checks = 1;
SQL

echo "=== Running migrations ==="
PYTHONPATH=$PYTHONPATH:. alembic upgrade head

echo "=== Seeding data ==="
mysql -u faqih -p fastapi_quizary < seed.sql

echo "=== Done ==="

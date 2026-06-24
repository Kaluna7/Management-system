// Jenkins Credentials (Manage Jenkins → Credentials → Global → Add Credentials)
// Type: "Secret text" for each ID below:
//   ms-postgres-password   — Postgres password
//   ms-jwt-secret          — JWT signing secret (long random string)
//   ms-google-client-id    — Google OAuth Web Client ID
//   ms-smtp-user           — SMTP mailbox email (e.g. noreply@yourdomain.com)
//   ms-smtp-pass           — SMTP mailbox password (quote not needed in Jenkins UI)
//
// .env is generated on every deploy from these credentials — no manual .env editing on server.

pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'whsmith-ms'
        FRONTEND_PORT = '8081'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([
                    string(credentialsId: 'ms-postgres-password', variable: 'POSTGRES_PASSWORD'),
                    string(credentialsId: 'ms-jwt-secret', variable: 'JWT_SECRET'),
                    string(credentialsId: 'ms-google-client-id', variable: 'GOOGLE_CLIENT_ID'),
                    string(credentialsId: 'ms-smtp-user', variable: 'SMTP_USER'),
                    string(credentialsId: 'ms-smtp-pass', variable: 'SMTP_PASS'),
                ]) {
                    sh '''
                        set -e

                        echo "=== WORKSPACE ==="
                        pwd

                        if [ ! -d .git ]; then
                          echo "ERROR: not a git checkout — fix Jenkins job SCM settings."
                          exit 1
                        fi

                        if [ ! -f docker-compose.yml ]; then
                          echo "ERROR: docker-compose.yml not found in workspace root."
                          exit 1
                        fi

                        echo "=== WRITE .env FROM JENKINS CREDENTIALS ==="
                        {
                          echo "POSTGRES_USER=postgres"
                          printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
                          echo "POSTGRES_DB=ms"
                          echo "FRONTEND_PORT=${FRONTEND_PORT:-8081}"
                          echo "VITE_API_URL="
                          printf 'VITE_GOOGLE_CLIENT_ID=%s\n' "$GOOGLE_CLIENT_ID"
                          printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
                          printf 'GOOGLE_CLIENT_ID=%s\n' "$GOOGLE_CLIENT_ID"
                          echo "SMTP_HOST=smtp.hostinger.com"
                          echo "SMTP_PORT=587"
                          echo "SMTP_SECURE=false"
                          printf 'SMTP_USER=%s\n' "$SMTP_USER"
                          printf 'SMTP_PASS="%s"\n' "$SMTP_PASS"
                          printf 'SMTP_FROM="Finly <%s>"\n' "$SMTP_USER"
                          echo "NOTIFY_EMAIL_BUYERS="
                          echo "NOTIFY_EMAIL_FINANCE="
                          echo "CRON_SECRET="
                          echo "DEADLINE_CRON=0 8 * * *"
                          echo "DEADLINE_CRON_TZ=Asia/Jakarta"
                          echo "DISABLE_DEADLINE_CRON=false"
                        } > .env

                        if [ ! -f back-end/data/vendors.csv ]; then
                          echo "WARNING: back-end/data/vendors.csv missing — vendor list will be empty."
                        fi

                        echo "=== DOCKER COMPOSE DEPLOY ==="
                        docker compose down || true
                        docker compose up -d --build

                        echo "=== VENDOR IMPORT (on backend start from back-end/data/vendors.csv) ==="
                        sleep 5
                        docker compose logs backend --tail 30 | grep -E 'Inserted:|Rows in CSV|import' || true

                        echo "=== STATUS ==="
                        docker compose ps
                        echo "App URL: http://<server-ip>:${FRONTEND_PORT:-8081}/"

                        docker image prune -f
                    '''
                }
            }
        }
    }

    post {
        failure {
            echo 'Deploy failed. Ensure Jenkins credentials exist: ms-postgres-password, ms-jwt-secret, ms-google-client-id, ms-smtp-user, ms-smtp-pass'
        }
    }
}

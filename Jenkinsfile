pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'whsmith-ms'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    set -e

                    echo "=== WORKSPACE ==="
                    pwd
                    ls -la

                    if [ ! -d .git ]; then
                      echo "ERROR: not a git checkout — fix Jenkins job SCM settings (see docs below)."
                      exit 1
                    fi

                    if [ ! -f docker-compose.yml ]; then
                      echo "ERROR: docker-compose.yml not found in workspace root."
                      exit 1
                    fi

                    if [ ! -f .env ]; then
                      if [ -f .env.docker.example ]; then
                        echo "WARNING: .env not found — creating from .env.docker.example"
                        cp .env.docker.example .env
                        echo "Edit .env on the server with real secrets before production use."
                      else
                        echo "ERROR: create .env on the Jenkins server (see .env.docker.example)."
                        exit 1
                      fi
                    fi

                    # Avoid common conflicts: 80 (nginx/Jenkins), 8080 (other apps/Jenkins)
                    if grep -qE '^FRONTEND_PORT=(80|8080)$' .env 2>/dev/null; then
                      sed -i -E 's/^FRONTEND_PORT=(80|8080)$/FRONTEND_PORT=8081/' .env
                      echo "Adjusted FRONTEND_PORT to 8081 (ports 80/8080 already in use on this server)."
                    fi

                    echo "=== DOCKER COMPOSE DEPLOY ==="
                    docker compose down || true
                    docker compose up -d --build

                    echo "=== STATUS ==="
                    docker compose ps
                    FRONTEND_PORT=$(grep '^FRONTEND_PORT=' .env 2>/dev/null | cut -d= -f2)
                    FRONTEND_PORT=${FRONTEND_PORT:-8081}
                    echo "App URL: http://<server-ip>:${FRONTEND_PORT}/"

                    docker image prune -f
                '''
            }
        }
    }

    post {
        failure {
            echo 'Deploy failed. If you see "not in a git directory", disable Lightweight checkout in the Jenkins job SCM settings.'
        }
    }
}

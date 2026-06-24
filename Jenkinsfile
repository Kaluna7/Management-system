pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'whsmith-ms'
    }

    stages {
        stage('Deploy') {
            steps {
                sh '''
                    set -e

                    echo "=== WORKSPACE ==="
                    pwd
                    ls -la

                    if [ ! -f docker-compose.yml ]; then
                      echo "ERROR: docker-compose.yml not found in workspace root."
                      exit 1
                    fi

                    if [ ! -f .env ]; then
                      if [ -f .env.docker.example ]; then
                        echo "WARNING: .env not found — creating from .env.docker.example"
                        cp .env.docker.example .env
                      else
                        echo "ERROR: create .env on the Jenkins server (see .env.docker.example)."
                        exit 1
                      fi
                    fi

                    echo "=== DOCKER COMPOSE DEPLOY ==="
                    docker compose down || true
                    docker compose up -d --build

                    echo "=== STATUS ==="
                    docker compose ps

                    docker image prune -f
                '''
            }
        }
    }

    post {
        failure {
            echo 'Deploy failed. Check that Docker is installed on the Jenkins agent and .env is configured.'
        }
    }
}

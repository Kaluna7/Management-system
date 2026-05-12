pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                ls -la
                docker compose -f ../docker-compose.yml up -d --build
                docker image prune -f
                '''
            }
        }
    }
}
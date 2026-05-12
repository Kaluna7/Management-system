pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                cd management-system || cd .
                ls -la
                docker compose up -d --build
                docker image prune -f
                '''
            }
        }
    }
}
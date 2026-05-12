pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                cd /root/Management-system
                ls -la
                docker compose up -d --build
                docker image prune -f
                '''
            }
        }
    }
}
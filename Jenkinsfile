pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                cd /root/Management-system
                docker compose up -d --build
                docker image prune -f
                '''
            }
        }
    }
}
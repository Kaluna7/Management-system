pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                cd /root/Management-system
                git pull origin main
                docker-compose up -d --build

                docker image prune -f
                '''
            }
        }
    }
}
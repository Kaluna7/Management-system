pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                cd /root/Management-system
                git fetch origin
                git reset --hard origin/main
                docker-compose up -d --build
                docker image prune -f
                '''
            }
        }
    }
}
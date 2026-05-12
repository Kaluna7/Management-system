pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                git pull origin main
                docker-compose up -d --build

                docker image prune -f
                '''
            }
        }
    }
}
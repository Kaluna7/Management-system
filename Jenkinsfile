pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh '''
                echo "WORKSPACE:"
                pwd

                echo "LIST FILE:"
                ls -la

                echo "DEPLOY START"

                docker compose down || true
                docker compose up -d --build

                docker image prune -f
                '''
            }
        }
    }
}
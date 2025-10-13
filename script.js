document.addEventListener('DOMContentLoaded', () => {
    const teamNameContainer = document.getElementById('team-name-container');
    const waitingRoom = document.getElementById('waiting-room');
    const quizContainer = document.getElementById('quiz-container');
    const leaderboardContainer = document.getElementById('leaderboard-container');

    const teamNameForm = document.getElementById('team-name-form');
    const teamNameInput = document.getElementById('team-name-input');
    const quizForm = document.getElementById('quiz-form');
    const submitBtn = document.getElementById('submit-btn');

    let teamName = '';
    let quizCheckInterval;

    // 1. Handle Team Name Submission
    teamNameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        teamName = teamNameInput.value.trim();
        if (teamName) {
            teamNameContainer.classList.add('hidden');
            waitingRoom.classList.remove('hidden');
            startQuizStatusCheck();
        }
    });

    // 2. Check if the quiz has started
    function startQuizStatusCheck() {
        quizCheckInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/check-quiz-status');
                const data = await response.json();
                if (data.quizStarted) {
                    clearInterval(quizCheckInterval);
                    startQuiz();
                }
            } catch (error) {
                console.error('Error checking quiz status:', error);
            }
        }, 3000); // Check every 3 seconds
    }

    // 3. Start the quiz
    async function startQuiz() {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        
        try {
            const response = await fetch('questions.json');
            const questions = await response.json();
            renderQuestions(questions);
            submitBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
    }

    // 4. Render questions
    function renderQuestions(questions) {
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';

            const questionTitle = document.createElement('p');
            questionTitle.textContent = `${index + 1}. ${q.question}`;
            questionDiv.appendChild(questionTitle);

            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            q.options.forEach((option, optionIndex) => {
                const label = document.createElement('label');
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = `question${index}`;
                radio.value = optionIndex;
                radio.required = true;
                
                label.appendChild(radio);
                label.append(` ${option}`);
                optionsDiv.appendChild(label);
            });
            questionDiv.appendChild(optionsDiv);
            quizForm.appendChild(questionDiv);
        });
    }

    // 5. Handle Quiz Submission
    submitBtn.addEventListener('click', async () => {
        if (quizForm.checkValidity()) {
            const formData = new FormData(quizForm);
            const answers = {};
            for (const [key, value] of formData.entries()) {
                answers[key.replace('question', '')] = parseInt(value, 10);
            }

            try {
                const response = await fetch('/api/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName, answers }),
                });

                if (response.ok) {
                    showLeaderboard();
                } else {
                    alert('Failed to submit answers.');
                }
            } catch (error) {
                console.error('Error submitting answers:', error);
            }
        } else {
            alert('Please answer all questions before submitting.');
        }
    });
    
    // 6. Show Leaderboard
    async function showLeaderboard() {
        quizContainer.classList.add('hidden');
        submitBtn.classList.add('hidden');
        leaderboardContainer.classList.remove('hidden');

        try {
            const response = await fetch('/api/leaderboard');
            const leaderboardData = await response.json();

            const leaderboardBody = document.getElementById('leaderboard-body');
            leaderboardBody.innerHTML = '';
            leaderboardData.forEach((entry, index) => {
                const row = leaderboardBody.insertRow();
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${entry.team_name}</td>
                    <td>${entry.score}</td>
                `;
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        }
    }
});

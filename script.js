document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const teamNameContainer = document.getElementById('team-name-container');
    const waitingRoom = document.getElementById('waiting-room');
    const quizContainer = document.getElementById('quiz-container');
    const leaderboardContainer = document.getElementById('leaderboard-container');
    const disqualifiedContainer = document.getElementById('disqualified-container');
    const timerDisplay = document.getElementById('timer');
    const teamNameForm = document.getElementById('team-name-form');
    const teamNameInput = document.getElementById('team-name-input');
    const quizForm = document.getElementById('quiz-form');
    const submitBtn = document.getElementById('submit-btn');

    // --- State Variables ---
    let teamName = '';
    let quizCheckInterval;
    let quizTimerInterval;
    let hasCheated = false;

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
                    startQuiz(data.duration);
                }
            } catch (error) {
                console.error('Error checking quiz status:', error);
            }
        }, 3000);
    }

    // 3. Start the quiz
    async function startQuiz(duration) {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        
        // Anti-cheat mechanism
        window.addEventListener('blur', handleCheating);

        startTimer(duration);

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
        quizForm.innerHTML = '';
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
        if (hasCheated) {
            disqualifyUser();
            return;
        }
        if (quizForm.checkValidity()) {
            submitAnswers();
        } else {
            alert('Please answer all questions before submitting.');
        }
    });

    async function submitAnswers() {
        clearInterval(quizTimerInterval);
        const formData = new FormData(quizForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            answers[key.replace('question', '')] = parseInt(value, 10);
        }

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName, answers, cheated: hasCheated }),
            });
            if (response.ok) {
                showLeaderboard();
            } else {
                alert('Failed to submit answers.');
            }
        } catch (error) {
            console.error('Error submitting answers:', error);
        }
    }

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
                row.innerHTML = `<td>${index + 1}</td><td>${entry.team_name}</td><td>${entry.score}</td>`;
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        }
    }
    
    // 7. Timer Logic
    function startTimer(duration) {
        let timer = duration;
        quizTimerInterval = setInterval(() => {
            const minutes = Math.floor(timer / 60);
            let seconds = timer % 60;
            seconds = seconds < 10 ? '0' + seconds : seconds;
            timerDisplay.textContent = `${minutes}:${seconds}`;
            if (--timer < 0) {
                clearInterval(quizTimerInterval);
                alert('Time is up! Submitting your answers.');
                submitAnswers();
            }
        }, 1000);
    }

    // 8. Anti-Cheat Logic
    function handleCheating() {
        hasCheated = true;
        disqualifyUser();
        window.removeEventListener('blur', handleCheating); // Prevent multiple triggers
    }

    function disqualifyUser() {
        clearInterval(quizTimerInterval);
        quizContainer.classList.add('hidden');
        disqualifiedContainer.classList.remove('hidden');
        // Optionally, send a disqualification notice to the server
        fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamName, answers: {}, cheated: true }),
        });
    }
});

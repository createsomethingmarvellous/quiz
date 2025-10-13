document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const QUIZ_DURATION_IN_SECONDS = 120; // 2 minutes. Change this value to set quiz time.

    // --- DOM ELEMENTS ---
    const teamNameContainer = document.getElementById('team-name-container');
    const waitingRoom = document.getElementById('waiting-room');
    const quizContainer = document.getElementById('quiz-container');
    const leaderboardContainer = document.getElementById('leaderboard-container');
    const disqualifiedContainer = document.getElementById('disqualified-container');
    const teamNameForm = document.getElementById('team-name-form');
    const teamNameInput = document.getElementById('team-name-input');
    const quizForm = document.getElementById('quiz-form');
    const submitBtn = document.getElementById('submit-btn');
    const timerDisplay = document.getElementById('timer');

    // --- STATE VARIABLES ---
    let teamName = '';
    let quizCheckInterval;
    let timerInterval;
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
                    startQuiz();
                }
            } catch (error) {
                console.error('Error checking quiz status:', error);
            }
        }, 3000);
    }

    // 3. Start the quiz and initialize cheat detection/timer
    async function startQuiz() {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        
        // Add cheat detection
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        startTimer(QUIZ_DURATION_IN_SECONDS);

        try {
            const response = await fetch('questions.json');
            const questions = await response.json();
            renderQuestions(questions);
            submitBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
    }
    
    // 4. Cheat detection handler
    function handleVisibilityChange() {
        if (document.hidden) {
            console.log('User switched tabs - CHEATING DETECTED');
            hasCheated = true;
        }
    }

    // 5. Timer logic
    function startTimer(duration) {
        let timer = duration;
        timerInterval = setInterval(() => {
            const minutes = Math.floor(timer / 60);
            let seconds = timer % 60;
            seconds = seconds < 10 ? '0' + seconds : seconds;
            timerDisplay.textContent = `${minutes}:${seconds}`;

            if (--timer < 0) {
                clearInterval(timerInterval);
                submitQuiz(true); // Auto-submit when time is up
            }
        }, 1000);
    }

    // 6. Render questions
    function renderQuestions(questions) {
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            questionDiv.innerHTML = `<p>${index + 1}. ${q.question}</p>`;
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            q.options.forEach((option, optionIndex) => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="radio" name="question${index}" value="${optionIndex}" required> ${option}`;
                optionsDiv.appendChild(label);
            });
            questionDiv.appendChild(optionsDiv);
            quizForm.appendChild(questionDiv);
        });
    }

    // 7. Handle Quiz Submission (manual or auto)
    submitBtn.addEventListener('click', () => submitQuiz(false));

    async function submitQuiz(isAutoSubmit) {
        clearInterval(timerInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        if (!isAutoSubmit && !quizForm.checkValidity()) {
            alert('Please answer all questions before submitting.');
            return;
        }

        const formData = new FormData(quizForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            answers[key.replace('question', '')] = parseInt(value, 10);
        }

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName, answers, hasCheated }),
            });

            if (response.ok) {
                if (hasCheated) {
                    quizContainer.classList.add('hidden');
                    disqualifiedContainer.classList.remove('hidden');
                } else {
                    showLeaderboard();
                }
            } else {
                alert('Failed to submit answers.');
            }
        } catch (error) {
            console.error('Error submitting answers:', error);
        }
    }

    // 8. Show Leaderboard
    async function showLeaderboard() {
        quizContainer.classList.add('hidden');
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
});

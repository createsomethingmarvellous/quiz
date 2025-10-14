document.addEventListener('DOMContentLoaded', () => {
    // Page elements
    const teamNameContainer = document.getElementById('team-name-container');
    const waitingRoom = document.getElementById('waiting-room');
    const quizContainer = document.getElementById('quiz-container');
    const finishedContainer = document.getElementById('finished-container');
    const disqualifiedContainer = document.getElementById('disqualified-container');
    const timerDisplay = document.getElementById('timer');
    const teamNameForm = document.getElementById('team-name-form');
    const teamNameInput = document.getElementById('team-name-input');
    const quizForm = document.getElementById('quiz-form');
    const submitBtn = document.getElementById('submit-btn');

    let teamName = '';
    let quizCheckInterval;
    let quizTimer;
    let quizActive = false;

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

    // 2. Check for quiz start
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

    // 3. Start the quiz, timer, and cheat detection
    async function startQuiz(duration) {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        quizActive = true;
        
        // Start cheat detection
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Start timer
        startTimer(duration);

        try {
            const response = await fetch('questions.json');
            const questions = await response.json();
            renderQuestions(questions);
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
    }

    // 4. Render questions
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

    // 5. Handle manual submission
    submitBtn.addEventListener('click', () => {
        if (quizForm.checkValidity()) {
            submitAnswers();
        } else {
            alert('Please answer all questions.');
        }
    });

    // 6. Submit answers to the backend
    async function submitAnswers() {
        if (!quizActive) return; // Prevent multiple submissions
        quizActive = false;
        clearInterval(quizTimer); // Stop the timer

        const formData = new FormData(quizForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            answers[key.replace('question', '')] = parseInt(value, 10);
        }

        try {
            await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName, answers }),
            });
        } catch (error) {
            console.error('Error submitting answers:', error);
        } finally {
            quizContainer.classList.add('hidden');
            finishedContainer.classList.remove('hidden');
        }
    }

    // 7. Timer logic
    function startTimer(duration) {
        let timeLeft = duration;
        quizTimer = setInterval(() => {
            if (!quizActive) {
                clearInterval(quizTimer);
                return;
            }
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const seconds = (timeLeft % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `Time Left: ${minutes}:${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(quizTimer);
                timerDisplay.textContent = "Time's up!";
                submitAnswers();
            }
        }, 1000);
    }
    
    // 8. Cheat detection logic
    async function handleVisibilityChange() {
        if (document.hidden && quizActive) {
            quizActive = false;
            clearInterval(quizTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            
            try {
                await fetch('/api/disqualify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName }),
                });
            } catch(e) {
                console.error("Failed to notify disqualification");
            }

            quizContainer.classList.add('hidden');
            disqualifiedContainer.classList.remove('hidden');
        }
    }
});

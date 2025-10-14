document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const QUIZ_DURATION_MINUTES = 2;

    // --- ELEMENTS ---
    const teamNameContainer = document.getElementById('team-name-container');
    const waitingRoom = document.getElementById('waiting-room');
    const quizContainer = document.getElementById('quiz-container');
    const finishedContainer = document.getElementById('finished-container');
    const disqualifiedContainer = document.getElementById('disqualified-container');
    const timerEl = document.getElementById('timer');
    const roundInfoEl = document.getElementById('round-info');
    const joinBtn = document.getElementById('join-btn');
    const teamNameInput = document.getElementById('team-name-input');
    const quizForm = document.getElementById('quiz-form');
    const submitBtn = document.getElementById('submit-btn');

    // --- STATE ---
    let teamName = '';
    let currentRound = 0;
    let enterTime = null;
    let quizCheckInterval;
    let timerInterval;
    let hasBeenDisqualified = false;
    
    // 1. Join Quiz
    joinBtn.addEventListener('click', () => {
        teamName = teamNameInput.value.trim();
        if (teamName) {
            teamNameContainer.classList.add('hidden');
            waitingRoom.classList.remove('hidden');
            startQuizStatusCheck();
        } else {
            alert('Please enter a team name.');
        }
    });

    // 2. Check for quiz start
    function startQuizStatusCheck() {
        quizCheckInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/quiz?action=status');
                const data = await response.json();
                if (data.quizStarted && data.currentRound > 0) {
                    currentRound = data.currentRound;
                    clearInterval(quizCheckInterval);
                    startQuiz();
                }
            } catch (error) {
                console.error('Error checking quiz status:', error);
            }
        }, 3000);
    }
    
    // 3. Start the quiz
    async function startQuiz() {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        
        enterTime = Date.now();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        roundInfoEl.textContent = `Round ${currentRound}`;
        try {
            // Fetch round-specific questions
            const questionsResponse = await fetch(`questions_round${currentRound}.json`);
            const questions = await questionsResponse.json();
            renderQuestions(questions);
            startTimer(QUIZ_DURATION_MINUTES * 60);
        } catch (error) {
            console.error('Error fetching questions:', error);
            alert('Error loading questions. Please refresh.');
        }
    }
    
    // 4. Render Questions
    function renderQuestions(questions) {
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            questionDiv.innerHTML = `<p>${index + 1}. ${q.question}</p>`;
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            q.options.forEach((option, i) => {
                optionsDiv.innerHTML += `<label><input type="radio" name="q${index}" value="${i}" required> ${option}</label>`;
            });
            questionDiv.appendChild(optionsDiv);
            quizForm.appendChild(questionDiv);
        });
    }

    // 5. Timer
    function startTimer(duration) {
        let timeLeft = duration;
        timerInterval = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const seconds = (timeLeft % 60).toString().padStart(2, '0');
            timerEl.textContent = `Time Left: ${minutes}:${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitQuiz(true); // Auto-submit
            }
        }, 1000);
    }

    // 6. Handle Submission
    submitBtn.addEventListener('click', () => submitQuiz(false));

    async function submitQuiz(isAutoSubmit) {
        if (!isAutoSubmit && !quizForm.checkValidity()) {
            alert('Please answer all questions.');
            return;
        }
        
        clearInterval(timerInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        const exitTime = Date.now();
        const formData = new FormData(quizForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            answers[key.replace('q', '')] = parseInt(value, 10);
        }

        try {
            await fetch('/api/quiz?action=submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName, answers, enterTime, exitTime, round: currentRound }),
            });
        } catch (error) {
            console.error('Error submitting answers:', error);
        } finally {
            quizContainer.classList.add('hidden');
            finishedContainer.classList.remove('hidden');
        }
    }

    // 7. Anti-Cheat: Tab Change Detection
    async function handleVisibilityChange() {
        if (document.hidden && !hasBeenDisqualified && enterTime) {
            hasBeenDisqualified = true;
            clearInterval(timerInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            
            const exitTime = Date.now();
            
            try {
                await fetch('/api/quiz?action=disqualify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName, enterTime, round: currentRound }),
                });
            } catch (error) {
                console.error('Failed to disqualify:', error);
            } finally {
                quizContainer.classList.add('hidden');
                disqualifiedContainer.classList.remove('hidden');
            }
        }
    }
});

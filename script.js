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
    let questions = []; // Store loaded questions for rendering
    
    // 1. Join Quiz (unchanged)
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

    // 2. Check for quiz start (unchanged)
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
    
    // 3. Start the quiz (Updated: Log round + fallback debug)
    async function startQuiz() {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        
        enterTime = Date.now();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        roundInfoEl.textContent = `Round ${currentRound}`;
        console.log(`Starting Round ${currentRound} quiz`); // Debug round
        try {
            // Fetch round-specific questions for rendering
            const questionsResponse = await fetch(`/questions_round${currentRound}.json`);
            if (!questionsResponse.ok) throw new Error('Questions not found');
            questions = await questionsResponse.json();
            console.log(`Loaded Round ${currentRound} questions from JSON:`, questions); // Debug JSON
            renderQuestions(questions);
            startTimer(QUIZ_DURATION_MINUTES * 60);
        } catch (error) {
            console.error('Error fetching questions for Round ${currentRound}:', error);
            // Fallback: Exact match backend options
            questions = currentRound === 1 ? [
                { question: "What is 2+2?", options: ["3", "4", "5", "6"] },
                { question: "Capital of France?", options: ["Berlin", "Paris", "London", "Madrid"] },
                { question: "Largest planet?", options: ["Earth", "Mars", "Jupiter", "Saturn"] },
                { question: "Python founder?", options: ["Linus", "Guido", "Bill", "Steve"] },
                { question: "HTTP status OK?", options: ["200", "404", "500", "301"] }
            ] : [
                { question: "Unity engine type?", options: ["Game", "Web", "AR", "All"] },
                { question: "ARCore by?", options: ["Apple", "Google", "Meta", "Microsoft"] },
                { question: "JSON type?", options: ["XML", "Data", "Image", "Video"] },
                { question: "Vercel uses?", options: ["PHP", "Node.js", "Java", "C++"] },
                { question: "Postgres SQL?", options: ["NoSQL", "RDBMS", "Graph", "Key-Value"] }
            ];
            console.log(`Used fallback for Round ${currentRound} questions:`, questions); // Debug fallback
            renderQuestions(questions);
            startTimer(QUIZ_DURATION_MINUTES * 60);
        }
    }
    
    // 4. Render Questions (Updated: Log rendered for Round 2)
    function renderQuestions(questions) {
        quizForm.innerHTML = '';
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            questionDiv.innerHTML = `<p>${index + 1}. ${q.question}</p>`;
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            q.options.forEach((option) => {
                optionsDiv.innerHTML += `<label><input type="radio" name="q${index}" value="${option}"> ${option}</label>`;
            });
            questionDiv.appendChild(optionsDiv);
            quizForm.appendChild(questionDiv);
        });
        console.log(`Rendered Round ${currentRound} questions with options`); // Debug render
    }

    // 5. Timer (unchanged)
    function startTimer(duration) {
        let timeLeft = duration;
        timerInterval = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const seconds = (timeLeft % 60).toString().padStart(2, '0');
            timerEl.textContent = `Time Left: ${minutes}:${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitQuiz(true);
            }
        }, 1000);
    }

    // 6. Handle Submission (Updated: Log per-selection for Round 2)
    submitBtn.addEventListener('click', () => submitQuiz(false));

    async function submitQuiz(isAutoSubmit) {
        if (!isAutoSubmit && !quizForm.checkValidity()) {
            alert('Please answer all questions.');
            return;
        }
        
        clearInterval(timerInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        const exitTime = Date.now();
        
        // Collect + log per answer
        const answers = new Array(questions.length).fill(undefined);
        quizForm.querySelectorAll('.question').forEach((questionDiv, index) => {
            const selectedRadio = questionDiv.querySelector('input[type="radio"]:checked');
            if (selectedRadio) {
                const selectedValue = selectedRadio.value;
                answers[index] = selectedValue;
                console.log(`Selected for Q${index+1} (Round ${currentRound}): '${selectedValue}'`); // Per-selection debug
            }
        });
        console.log(`Collected answers for Round ${currentRound} sent for correction:`, answers);

        try {
            const response = await fetch('/api/quiz?action=submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    teamName, 
                    answers,
                    enterTime, 
                    exitTime, 
                    round: currentRound 
                }),
            });
            
            if (!response.ok) {
                throw new Error(await response.text());
            }
            
            const result = await response.json();
            console.log(`Backend result for Round ${currentRound}:`, result.message);

            alert(isAutoSubmit ? "Time's up! Quiz submitted." : "Submitted successfully!");
            
        } catch (error) {
            console.error(`Error submitting Round ${currentRound}:`, error);
            alert('Failed to submit. Please try again or contact admin.');
            return;
        } finally {
            quizContainer.classList.add('hidden');
            finishedContainer.classList.remove('hidden');
        }
    }

    // 7. Anti-Cheat (unchanged)
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

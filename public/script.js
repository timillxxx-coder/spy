let ws, username, lobbyId;

// DOM
const login = document.getElementById('login');
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');

const lobbyIdSpan = document.getElementById('lobbyId');
const creatorSpan = document.getElementById('creator');
const playersList = document.getElementById('players');
const startBtn = document.getElementById('startBtn');
const roleText = document.getElementById('role');
const progressText = document.getElementById('progress');
const resultText = document.getElementById('result');

document.getElementById('loginBtn').onclick = loginUser;
document.getElementById('voteBtn').onclick = vote;

// ===== ВХОД =====
function loginUser() {
    username = document.getElementById('name').value.trim();
    if(!username) return alert('Введите ник');

    ws = new WebSocket(location.protocol==='https:' ? `wss://${location.host}` : `ws://${location.host}`);

    ws.onopen = () => {
        const create = confirm('Создать лобби?');
        if(create) ws.send(JSON.stringify({ type:'create_lobby', name:username }));
        else {
            lobbyId = prompt('Введите ID лобби');
            if(!lobbyId) return;
            ws.send(JSON.stringify({ type:'join_lobby', name:username, lobbyId }));
        }
    };

    ws.onmessage = e => {
        const d = JSON.parse(e.data);

        // Лобби создано
        if(d.type === 'lobby_created') {
            lobbyId = d.lobbyId;
            login.classList.add('hidden');
            lobby.classList.remove('hidden');
            lobbyIdSpan.textContent = lobbyId;
            creatorSpan.textContent = username;
            updatePlayers([username]);
            startBtn.classList.remove('hidden');
        }

        // Лобби обновилось
        if(d.type === 'lobby_update') {
            lobby.classList.remove('hidden');
            updatePlayers(d.players);
            // Показываем кнопку Start только хосту
            if(d.host === username) startBtn.classList.remove('hidden');
            else startBtn.classList.add('hidden');
        }

        // Игра стартует
        if(d.type === 'game_started') {
            lobby.classList.add('hidden');
            game.classList.remove('hidden');

            roleText.className = 'role ' + (d.role === 'spy' ? 'spy' : 'word');
            roleText.textContent = d.role === 'spy' ? '😈 ТЫ ШПИОН' : `📄 ${d.word}`;
            progressText.textContent = `Проголосовали 0 из ${d.totalPlayers}`;
            resultText.textContent = '';
        }

        // Обновление голосования
        if(d.type === 'vote_update') {
            progressText.textContent = `Проголосовали ${d.voted} из ${d.total}`;
        }

        // Конец игры
        if(d.type === 'game_ended') {
            resultText.textContent =
`🏁 Игра окончена
Шпион: ${d.spy}
Выбывший: ${d.eliminated}`;
            progressText.textContent = '';
        }

        if(d.type === 'error') alert(d.message);
    };

    // Кнопка "Начать игру"
    startBtn.onclick = () => {
        if(!lobbyId) return;
        ws.send(JSON.stringify({ type:'start_game', lobbyId, name:username }));
    };
}

// ===== ГОЛОС =====
function vote() {
    const v = prompt('Против кого?');
    if(v) ws.send(JSON.stringify({ type:'vote', lobbyId, name:username, target:v }));
}

// ===== СПИСОК ИГРОКОВ =====
function updatePlayers(players) {
    playersList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p;
        playersList.appendChild(li);
    });
}

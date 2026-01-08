let ws;
let username;
let lobbyId;

// DOM элементы
const loginDiv = document.getElementById('login');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

const lobbyIdSpan = document.getElementById('lobbyId');
const creatorSpan = document.getElementById('creator');
const playersList = document.getElementById('players');
const startBtn = document.getElementById('startBtn');
const roleText = document.getElementById('role');
const progressText = document.getElementById('progress');
const resultText = document.getElementById('result');

document.getElementById('loginBtn').onclick = login;
document.getElementById('voteBtn').onclick = vote;

// ===== ФУНКЦИЯ ВХОДА =====
function login() {
  username = document.getElementById('name').value.trim();
  if (!username) return alert('Введите ник');

  // создаем подключение к WebSocket
  ws = new WebSocket(
    location.protocol === 'https:'
      ? `wss://${location.host}`
      : `ws://${location.host}`
  );

  ws.onopen = () => {
    if (confirm('Создать лобби?')) {
      ws.send(JSON.stringify({ type: 'create_lobby', name: username }));
    } else {
      const id = prompt('Введите ID лобби');
      if (!id) return;
      lobbyId = id;
      ws.send(JSON.stringify({ type: 'join_lobby', name: username, lobbyId }));
    }
  };

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);

    // ===== ЛОББИ СОЗДАНО/ВОШЕЛ =====
    if (msg.type === 'lobby_created') {
      lobbyId = msg.lobbyId;
      loginDiv.style.display = 'none';
      lobbyDiv.style.display = 'block';
      lobbyIdSpan.textContent = lobbyId;
      creatorSpan.textContent = username;
      updatePlayers([username]);
      startBtn.style.display = 'inline-block';
    }

    if (msg.type === 'lobby_update') {
      updatePlayers(msg.players);
      startBtn.style.display = msg.players[0] === username ? 'inline-block' : 'none';
    }

    // ===== НАЧАЛО ИГРЫ =====
    if (msg.type === 'game_started') {
      lobbyDiv.style.display = 'none';
      gameDiv.style.display = 'block';

      if (msg.role === 'spy') {
        roleText.textContent = '😈 ТЫ ШПИОН';
        roleText.style.color = '#ef4444';
      } else {
        roleText.textContent = `📄 Слово: ${msg.word}`;
        roleText.style.color = '#22c55e';
      }

      progressText.textContent = 'Проголосовали 0 из ...';
      resultText.textContent = '';
    }

    // ===== ГОЛОСОВАНИЕ =====
    if (msg.type === 'vote_update') {
      progressText.textContent = `Проголосовали ${msg.voted} из ${msg.total}`;
    }

    // ===== КОНЕЦ ИГРЫ =====
    if (msg.type === 'game_ended') {
      resultText.textContent =
`🏁 Игра окончена
Шпион: ${msg.spy}
Выбывший: ${msg.eliminated}`;
      progressText.textContent = '';
    }

    // ===== ОШИБКА =====
    if (msg.type === 'error') alert(msg.message);
  };

  startBtn.onclick = () => {
    if (!lobbyId) return;
    ws.send(JSON.stringify({ type: 'start_game', lobbyId, name: username }));
  };
}

// ===== ФУНКЦИЯ ГОЛОСОВАНИЯ =====
function vote() {
  const target = prompt('Кого вы голосуете?');
  if (!target) return;
  ws.send(JSON.stringify({ type: 'vote', target, lobbyId }));
}

// ===== ОБНОВЛЕНИЕ СПИСКА ИГРОКОВ =====
function updatePlayers(players) {
  playersList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p;
    playersList.appendChild(li);
  });
}

let ws, username, lobbyId;

// DOM
const login = document.getElementById('login');
const lobbyMenu = document.getElementById('lobbyMenu');
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');

const lobbyIdSpan = document.getElementById('lobbyId');
const creatorSpan = document.getElementById('creator');
const startBtn = document.getElementById('startBtn');
const roleText = document.getElementById('role');
const progressText = document.getElementById('progress');
const resultText = document.getElementById('result');
const gamePlayersList = document.getElementById('gamePlayers');

document.getElementById('loginBtn').onclick = loginUser;
document.getElementById('createLobbyBtn').onclick = createLobby;
document.getElementById('joinLobbyBtn').onclick = joinLobby;
document.getElementById('voteBtn').onclick = vote;

function loginUser(){
    username = document.getElementById('name').value.trim();
    if(!username) return alert('Введите ник');

    login.classList.add('hidden');
    lobbyMenu.classList.remove('hidden');

    const protocol = location.protocol==='https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}`);

    ws.onmessage = e => {
        const d = JSON.parse(e.data);

        if(d.type==='lobby_created'){
            lobbyId = d.lobbyId;
            lobbyMenu.classList.add('hidden');
            lobby.classList.remove('hidden');
            lobbyIdSpan.textContent = lobbyId;
            creatorSpan.textContent = username;
            startBtn.classList.remove('hidden');
        }

        if(d.type==='joined_lobby' || d.type==='lobby_update'){
            lobbyMenu.classList.add('hidden');
            lobby.classList.remove('hidden');
            lobbyIdSpan.textContent = d.lobbyId || lobbyId;
            creatorSpan.textContent = d.host;
            startBtn.style.display = d.host===username?'block':'none';
        }

        if(d.type==='game_started'){
            lobby.classList.add('hidden');
            game.classList.remove('hidden');

            roleText.className = 'role ' + (d.role==='spy'?'spy':'word');
            roleText.textContent = d.role==='spy'?'😈 ТЫ ШПИОН':`📄 ${d.word}`;
            progressText.textContent = `Проголосовали 0 из ${d.totalPlayers}`;
            resultText.textContent = '';

            // показать игроков только после старта
            gamePlayersList.innerHTML='';
            d.players.forEach(p=>{
                const li = document.createElement('li');
                li.textContent = p;
                gamePlayersList.appendChild(li);
            });
        }

        if(d.type==='vote_update'){
            progressText.textContent = `Проголосовали ${d.voted} из ${d.total}`;
        }

        if(d.type==='game_ended'){
            resultText.textContent = `🏁 Игра окончена\nШпион: ${d.spy}\nВыбывший: ${d.eliminated}`;
            progressText.textContent = '';
        }

        if(d.type==='error') alert(d.message);
    };

    startBtn.onclick = ()=>{
        ws.send(JSON.stringify({ type:'start_game', lobbyId, name:username }));
    };
}

function createLobby(){
    ws.send(JSON.stringify({ type:'create_lobby', name:username }));
}

function joinLobby(){
    const id = prompt('Введите ID лобби');
    if(!id) return;
    lobbyId = id;
    ws.send(JSON.stringify({ type:'join_lobby', name:username, lobbyId }));
}

function vote(){
    const v = prompt('Против кого?');
    if(v) ws.send(JSON.stringify({ type:'vote', lobbyId, name:username, target:v }));
}

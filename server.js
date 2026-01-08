const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let lobbies = {}; // { lobbyId: { host: 'nick', players: [{name, ws}], started: false } }

function generateLobbyId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

wss.on('connection', ws => {
    let currentLobby = null;
    let playerName = null;

    ws.on('message', message => {
        const data = JSON.parse(message);

        // ===== СОЗДАНИЕ ЛОББИ =====
        if(data.type === 'create_lobby') {
            const lobbyId = generateLobbyId();
            lobbies[lobbyId] = { host: data.name, players: [{name:data.name, ws}], started:false };
            currentLobby = lobbyId;
            playerName = data.name;

            ws.send(JSON.stringify({ type:'lobby_created', lobbyId }));

            broadcastLobbyUpdate(lobbyId);
        }

        // ===== ПРИСОЕДИНЕНИЕ К ЛОББИ =====
        if(data.type === 'join_lobby') {
            const lobby = lobbies[data.lobbyId];
            if(!lobby) {
                ws.send(JSON.stringify({ type:'error', message:'Лобби не найдено' }));
                return;
            }
            if(lobby.started){
                ws.send(JSON.stringify({ type:'error', message:'Игра уже началась' }));
                return;
            }
            lobby.players.push({name:data.name, ws});
            currentLobby = data.lobbyId;
            playerName = data.name;

            ws.send(JSON.stringify({ type:'joined_lobby', lobbyId:data.lobbyId, creator:lobby.host }));

            broadcastLobbyUpdate(currentLobby);
        }

        // ===== СТАРТ ИГРЫ =====
        if(data.type === 'start_game') {
            const lobby = lobbies[data.lobbyId];
            if(!lobby || lobby.host !== data.name) return;
            if(lobby.started) return;
            lobby.started = true;

            // Рандомный шпион
            const spyIndex = Math.floor(Math.random() * lobby.players.length);
            const word = 'Бумага';

            lobby.players.forEach((p,i) => {
                const role = (i === spyIndex ? 'spy' : 'word');
                p.ws.send(JSON.stringify({
                    type:'game_started',
                    role,
                    word,
                    totalPlayers: lobby.players.length
                }));
            });

            // Для голосования
            lobby.votes = {};
            lobby.votedCount = 0;
        }

        // ===== ГОЛОСОВАНИЕ =====
        if(data.type === 'vote') {
            const lobby = lobbies[data.lobbyId];
            if(!lobby) return;

            if(!lobby.votes[data.name]){
                lobby.votes[data.name] = data.target;
                lobby.votedCount++;
            }

            // Рассылаем прогресс
            broadcastVoteProgress(lobby);

            // Проверка конца голосования
            if(lobby.votedCount >= lobby.players.length){
                const spyPlayer = lobby.players.find(p=>p.name === Object.keys(lobby.votes).find(n=>n===Object.keys(lobby.votes).find(v=>v===n)))?.name;
                const eliminated = Object.values(lobby.votes).join(', ');

                lobby.players.forEach(p=>{
                    p.ws.send(JSON.stringify({
                        type:'game_ended',
                        spy: lobby.players.find((pl,i)=>i === Object.keys(lobby.votes).length-1).name,
                        eliminated
                    }));
                });
            }
        }
    });

    ws.on('close', () => {
        if(currentLobby && lobbies[currentLobby]){
            const lobby = lobbies[currentLobby];
            lobby.players = lobby.players.filter(p=>p.ws !== ws);
            if(lobby.players.length === 0){
                delete lobbies[currentLobby];
            } else {
                if(lobby.host === playerName){
                    lobby.host = lobby.players[0].name; // передаём хозяина следующему
                }
                broadcastLobbyUpdate(currentLobby);
            }
        }
    });
});

// ===== ФУНКЦИИ =====
function broadcastLobbyUpdate(lobbyId){
    const lobby = lobbies[lobbyId];
    if(!lobby) return;
    const data = {
        type:'lobby_update',
        players: lobby.players.map(p=>p.name),
        host: lobby.host
    };
    lobby.players.forEach(p=>p.ws.send(JSON.stringify(data)));
}

function broadcastVoteProgress(lobby){
    lobby.players.forEach(p=>{
        p.ws.send(JSON.stringify({ type:'vote_update', voted: lobby.votedCount, total: lobby.players.length }));
    });
}

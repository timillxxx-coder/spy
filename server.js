const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const lobbies = {}; // { lobbyId: { host: 'nick', players: [{name, ws, role}], started: false, spy: 'nick' } }

// ===== ЛОББИ ID =====
function generateLobbyId() {
    return Math.random().toString(36).substring(2,8).toUpperCase();
}

// ===== ЛОББИ UPDATE =====
function broadcastLobbyUpdate(lobbyId){
    const lobby = lobbies[lobbyId];
    if(!lobby) return;
    const data = {
        type: 'lobby_update',
        players: lobby.players.map(p=>p.name),
        host: lobby.host
    };
    lobby.players.forEach(p=>p.ws.send(JSON.stringify(data)));
}

// ===== ПРОГРЕСС ГОЛОСОВАНИЯ =====
function broadcastVoteProgress(lobby){
    lobby.players.forEach(p=>{
        p.ws.send(JSON.stringify({ type:'vote_update', voted: lobby.votedCount, total: lobby.players.length }));
    });
}

// ===== ПОДКЛЮЧЕНИЕ WS =====
wss.on('connection', ws => {
    let currentLobby = null;
    let playerName = null;

    ws.on('message', msg => {
        const data = JSON.parse(msg);

        // ===== СОЗДАНИЕ ЛОББИ =====
        if(data.type === 'create_lobby'){
            const lobbyId = generateLobbyId();
            lobbies[lobbyId] = { host: data.name, players:[{name:data.name, ws}], started:false, spy:null };
            currentLobby = lobbyId;
            playerName = data.name;

            ws.send(JSON.stringify({ type:'lobby_created', lobbyId }));
            broadcastLobbyUpdate(lobbyId);
        }

        // ===== ПРИСОЕДИНЕНИЕ =====
        if(data.type === 'join_lobby'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby){ ws.send(JSON.stringify({type:'error', message:'Лобби не найдено'})); return; }
            if(lobby.started){ ws.send(JSON.stringify({type:'error', message:'Игра уже началась'})); return; }
            
            lobby.players.push({name:data.name, ws});
            currentLobby = data.lobbyId;
            playerName = data.name;

            ws.send(JSON.stringify({ type:'joined_lobby', lobbyId:data.lobbyId, creator:lobby.host }));
            broadcastLobbyUpdate(currentLobby);
        }

        // ===== СТАРТ ИГРЫ =====
        if(data.type === 'start_game'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby || lobby.host !== data.name) return;
            if(lobby.started) return;
            lobby.started = true;

            const spyIndex = Math.floor(Math.random() * lobby.players.length);
            const word = 'Бумага';

            // Сохраняем имя шпиона
            lobby.spy = lobby.players[spyIndex].name;

            lobby.players.forEach((p,i)=>{
                const role = i === spyIndex ? 'spy' : 'word';
                p.role = role;
                p.ws.send(JSON.stringify({
                    type:'game_started',
                    role,
                    word,
                    totalPlayers: lobby.players.length
                }));
            });

            lobby.votes = {};       // { voter: target }
            lobby.votedCount = 0;
        }

        // ===== ГОЛОСОВАНИЕ =====
        if(data.type === 'vote'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby) return;

            if(!lobby.votes[data.name]){
                lobby.votes[data.name] = data.target;
                lobby.votedCount++;
            }

            broadcastVoteProgress(lobby);

            // КОНЕЦ ГОЛОСОВАНИЯ
            if(lobby.votedCount >= lobby.players.length){
                // Подсчёт голосов
                const voteCounts = {};
                Object.values(lobby.votes).forEach(target => {
                    voteCounts[target] = (voteCounts[target] || 0) + 1;
                });

                // Игрок с максимальным количеством голосов
                let maxVotes = 0;
                let eliminated = null;
                for(const [player, count] of Object.entries(voteCounts)){
                    if(count > maxVotes){
                        maxVotes = count;
                        eliminated = player;
                    }
                }

                // Отправляем результат всем
                lobby.players.forEach(p=>{
                    p.ws.send(JSON.stringify({
                        type:'game_ended',
                        spy: lobby.spy,
                        eliminated
                    }));
                });
            }
        }
    });

    // ===== ОТКЛЮЧЕНИЕ ИГРОКА =====
    ws.on('close', () => {
        if(currentLobby && lobbies[currentLobby]){
            const lobby = lobbies[currentLobby];
            lobby.players = lobby.players.filter(p=>p.ws !== ws);
            if(lobby.players.length === 0){
                delete lobbies[currentLobby];
            } else {
                if(lobby.host === playerName){
                    lobby.host = lobby.players[0].name; // передаём хост
                }
                broadcastLobbyUpdate(currentLobby);
            }
        }
    });
});

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));

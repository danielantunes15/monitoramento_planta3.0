// Arquivo: src/server.js
const express = require('express');
const ping = require('ping');
const cors = require('cors');
const supabase = require('./supabase'); 
const path = require('path');
const { exec } = require('child_process');
const http = require('http'); 
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- CONFIGURAÇÃO ---
const PING_INTERVAL = 10 * 1000; 
const PING_CONFIG = { timeout: 2, extra: ['-i', '1'] };

let cachedStatus = [];

async function runPingCycle() {
    let hosts = [];
    let allDevices = [];

    try { 
        // Busca Hosts (Setores) do Banco
        const { data: hostData, error: hostError } = await supabase.from('hosts').select('*').order('name');
        if (hostError) throw hostError;
        hosts = hostData || [];
        
        // Busca Devices do Banco
        const { data: devData, error: devError } = await supabase.from('devices').select('*');
        if (devError) throw devError;
        allDevices = devData || [];
    } catch (e) { 
        console.error("Erro crítico ao buscar dados do Supabase:", e.message);
        // Sem fallback: se o banco falhar, a lista fica vazia e o frontend deve lidar
        hosts = []; 
    }

    const checkTime = new Date().toLocaleString('pt-BR'); 

    const promises = hosts.map(async (host) => {
        let hostAlive = false;
        let hostLatency = 'timeout';
        const hostIp = host.ip ? host.ip.trim() : null;

        if(hostIp) {
            try {
                const res = await ping.promise.probe(hostIp, PING_CONFIG);
                hostAlive = res.alive;
                hostLatency = hostAlive ? res.time + 'ms' : 'timeout';
            } catch (err) { hostAlive = false; }
        }

        const sectorDevices = allDevices.filter(d => d.sector_id === host.id);
        
        const devicePromises = sectorDevices.map(async (dev) => {
            let devAlive = false;
            if(dev.ip) {
                try {
                    const resDev = await ping.promise.probe(dev.ip.trim(), PING_CONFIG);
                    devAlive = resDev.alive;
                } catch(e) {}
            }
            return { name: dev.name, ip: dev.ip, online: devAlive };
        });

        const deviceStatuses = await Promise.all(devicePromises);
        const anyDeviceDown = deviceStatuses.some(d => !d.online);
        let status = 'OK';

        if (!hostAlive) status = 'CRITICAL'; 
        else if (anyDeviceDown) status = 'WARNING'; 

        const previous = cachedStatus.find(c => c.id === host.id);
        const prevStatus = previous ? previous.status : 'OK';

        if (status !== 'OK' && status !== prevStatus) {
            const reason = status === 'CRITICAL' ? "Switch Offline" : "Falha em Equipamento";
            logHistory(host.id, reason);
        }

        return {
            id: host.id,
            name: host.name,
            ip: hostIp,
            online: hostAlive,
            devices: deviceStatuses,
            status: status,
            latency: hostLatency,
            last_check: checkTime
        };
    });

    const results = await Promise.all(promises);
    cachedStatus = results;
    io.emit('update', results);
}

// Inicia ciclo
runPingCycle();
setInterval(runPingCycle, PING_INTERVAL);

// Rotas da API
app.get('/status-rede', (req, res) => res.json(cachedStatus));

app.get('/hosts', async (req, res) => {
    const { data } = await supabase.from('hosts').select('*').order('name');
    res.json(data || []);
});
// Rota atualizada para aceitar Array (usado no "Salvar Layout") ou Objeto único
app.post('/hosts', async (req, res) => {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const { error } = await supabase.from('hosts').upsert(payload, { onConflict: 'id' });
    if (error) return res.status(500).json({error: error.message});
    res.json({ success: true });
});

app.get('/devices', async (req, res) => {
    const { sector } = req.query;
    let query = supabase.from('devices').select('*');
    if(sector) query = query.eq('sector_id', sector);
    const { data, error } = await query;
    if(error) return res.status(500).json([]);
    res.json(data);
});
app.post('/devices', async (req, res) => {
    const { error } = await supabase.from('devices').insert(req.body);
    if(error) return res.status(500).json({error: error.message});
    res.json({ success: true });
});
app.delete('/devices/:id', async (req, res) => {
    const { error } = await supabase.from('devices').delete().eq('id', req.params.id);
    if(error) return res.status(500).json({error: error.message});
    res.json({ success: true });
});

app.get('/history', async (req, res) => {
    const { data } = await supabase.from('history').select('*').order('timestamp', { ascending: false }).limit(50);
    res.json(data || []);
});
app.delete('/history', async (req, res) => {
    await supabase.from('history').delete().gt('id', 0);
    res.json({ success: true });
});

app.get('/links', async (req, res) => {
    const { data, error } = await supabase.from('links').select('*');
    if(error) return res.status(500).json([]);
    res.json(data || []);
});

app.post('/links', async (req, res) => {
    const { error } = await supabase.from('links').insert(req.body);
    if(error) return res.status(500).json({error: error.message});
    const { data } = await supabase.from('links').select('*');
    io.emit('topology-update', data);
    res.json({ success: true });
});

app.delete('/links/:id', async (req, res) => {
    const { error } = await supabase.from('links').delete().eq('id', req.params.id);
    if(error) return res.status(500).json({error: error.message});
    const { data } = await supabase.from('links').select('*');
    io.emit('topology-update', data);
    res.json({ success: true });
});

async function logHistory(sectorId, reason) {
    try {
        await supabase.from('history').insert([{
            timestamp: new Date().toISOString(),
            sector: sectorId,
            duration: reason
        }]);
    } catch(e) { console.error("Erro histórico:", e); }
}

server.listen(3000, () => {
    console.log('--- SISTEMA ONLINE NA PORTA 3000 ---');
    // Abre navegador automaticamente
    const url = 'http://localhost:3000';
    const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
    exec(`${start} ${url}`);
});
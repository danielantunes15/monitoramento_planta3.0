const express = require('express');
const ping = require('ping');
const cors = require('cors');
const supabase = require('./supabase'); // Seu arquivo de conexão
const path = require('path');
const { exec } = require('child_process');
const http = require('http'); 
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURAÇÃO ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PING_INTERVAL = 10 * 1000; // 10 segundos
// Configuração ajustada para Windows (sem o flag -i)
const PING_CONFIG = { 
    timeout: 10, // segundos
    numeric: true // evita delay de DNS reverso
};

let cachedStatus = []; // Cache para acesso rápido via API

// --- CICLO DE MONITORAMENTO ---
async function runPingCycle() {
    console.log("--- Iniciando Ciclo de Ping ---");
    let hosts = [];
    let allDevices = [];

    // 1. Busca dados do Banco
    try { 
        const { data: hostData, error: hErr } = await supabase.from('hosts').select('*').order('name');
        if (hErr) throw hErr;
        hosts = hostData || [];
        
        const { data: devData, error: dErr } = await supabase.from('devices').select('*');
        if (dErr) throw dErr;
        allDevices = devData || [];
    } catch (e) { 
        console.error("❌ Erro crítico ao buscar dados do Supabase:", e.message);
        hosts = []; // Evita crash se banco falhar
    }

    const checkTime = new Date().toLocaleString('pt-BR'); 

    // 2. Processa cada setor em paralelo
    const promises = hosts.map(async (host) => {
        let hostAlive = false;
        let hostLatency = 'timeout';
        const hostIp = host.ip ? host.ip.trim() : null;

        // Ping no Host (Switch/Roteador do setor)
        if(hostIp) {
            try {
                const res = await ping.promise.probe(hostIp, PING_CONFIG);
                hostAlive = res.alive;
                hostLatency = hostAlive ? res.time + 'ms' : 'timeout';
                
                // Log visual no terminal
                const icon = hostAlive ? "✅" : "🔴";
                console.log(`${icon} [${host.name}] ${hostIp} : ${hostLatency}`);

            } catch (err) { 
                console.log(`⚠️ Erro ao pingar ${host.name}:`, err.message);
                hostAlive = false; 
            }
        } else {
            console.log(`ℹ️ [${host.name}] Sem IP configurado (Apenas visual)`);
        }

        // Ping nos Dispositivos do Setor
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
        
        // 3. Determina Status Geral do Setor
        const anyDeviceDown = deviceStatuses.some(d => !d.online);
        let status = 'OK';

        if (hostIp && !hostAlive) status = 'CRITICAL'; // Switch caiu
        else if (anyDeviceDown) status = 'WARNING';    // Switch on, mas algum device off

        // Loga no histórico se mudou o status
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
    
    // Envia para o Frontend via Socket
    io.emit('update', results);
}

// Inicia o loop
runPingCycle();
setInterval(runPingCycle, PING_INTERVAL);

// --- ROTAS DA API ---

// Status rápido (cache)
app.get('/status-rede', (req, res) => res.json(cachedStatus));

// HOSTS (Setores/Prédios)
app.get('/hosts', async (req, res) => {
    const { data, error } = await supabase.from('hosts').select('*').order('name');
    if(error) return res.status(500).json({error: error.message});
    res.json(data || []);
});

// SALVAR LAYOUT (Upsert: Atualiza ou Insere)
app.post('/hosts', async (req, res) => {
    // Aceita tanto um objeto único quanto um array de objetos
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    
    const { error } = await supabase.from('hosts').upsert(payload, { onConflict: 'id' });
    
    if (error) {
        console.error("Erro ao salvar layout:", error);
        return res.status(500).json({error: error.message});
    }
    
    // Força uma atualização imediata do ciclo para refletir mudanças
    runPingCycle();
    res.json({ success: true });
});

// DEVICES (Equipamentos)
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

// HISTORY (Logs)
app.get('/history', async (req, res) => {
    const { data } = await supabase.from('history').select('*').order('timestamp', { ascending: false }).limit(50);
    res.json(data || []);
});

app.delete('/history', async (req, res) => {
    await supabase.from('history').delete().gt('id', 0); // Apaga tudo
    res.json({ success: true });
});

// LINKS (Cabos/Topologia)
app.get('/links', async (req, res) => {
    const { data, error } = await supabase.from('links').select('*');
    if(error) return res.status(500).json([]);
    res.json(data || []);
});

app.post('/links', async (req, res) => {
    const { error } = await supabase.from('links').insert(req.body);
    if(error) return res.status(500).json({error: error.message});
    
    // Avisa frontend para redesenhar cabos
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

// Função auxiliar de log
async function logHistory(sectorId, reason) {
    try {
        await supabase.from('history').insert([{
            timestamp: new Date().toISOString(),
            sector: sectorId,
            duration: reason
        }]);
    } catch(e) { console.error("Erro ao gravar histórico:", e); }
}

// Inicialização do Servidor
server.listen(3000, () => {
    console.log('--- SISTEMA ONLINE NA PORTA 3000 ---');
    console.log('Acesse: http://localhost:3000');
    
    // Tenta abrir o navegador automaticamente
    const url = 'http://localhost:3000';
    const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
    exec(`${start} ${url}`);
});
// Arquivo: public/js/main.js

const socket = io();
let sceneData; // { scene, camera, renderer, ... }
let appState = {
    hosts: [],
    networkData: [], // Status em tempo real
    statusMap: {},   // Mapa rápido ID -> Status
    interactables: [],
    pulsingRings: [],
    cables: []
};

async function init() {
    // 1. Inicia Cena
    sceneData = window.initThreeJS('canvas-3d');
    if (!sceneData) return;

    // 2. Carrega Dados Iniciais
    await loadTopology();

    // 3. Configura Interações
    // Passamos appState.networkData por referência (array) mas atenção: arrays substituídos perdem ref.
    // Melhor passar o appState inteiro ou usar closures.
    window.setupInteractions(
        sceneData.camera, 
        sceneData.renderer.domElement, 
        appState.interactables, 
        appState.networkData // Isso aqui será atualizado via push/splice ou precisamos acessar via global no interactions
    );

    // Listener de Busca (emitido pelo interactions.js)
    window.addEventListener('search-sector', (e) => {
        const term = e.detail;
        const target = appState.hosts.find(h => h.id === term || h.name.toUpperCase().includes(term));
        if(target) {
            const posX = target.pos_x ?? target.pos?.x;
            const posZ = target.pos_z ?? target.pos?.z;
            gsap.to(sceneData.controls.target, {duration:1, x:posX, y:0, z:posZ});
            gsap.to(sceneData.camera.position, {duration:1, x:posX, y:30, z:posZ+30});
        }
    });

    // 4. Inicia Loop
    animate();
}

async function loadTopology() {
    try {
        const [hRes, lRes] = await Promise.all([ fetch('/hosts'), fetch('/links') ]);
        const hosts = await hRes.json();
        const links = await lRes.json();
        
        appState.hosts = hosts;

        // Desenha Estruturas
        const structResult = window.drawStructures(sceneData.scene, hosts);
        appState.interactables = structResult.interactables;
        appState.pulsingRings = structResult.pulsingRings;

        // Desenha Cabos
        appState.cables = window.updateCables3D(sceneData.scene, links, hosts);
        
        // Atualiza interações com a nova lista de objetos
        // (Re-setup simples ou apenas atualizar a referência global se interactions usar window.appState)
        // Como passamos interactables por valor no init, se ele mudou, interactions.js pode estar com ref velha.
        // CORREÇÃO: interactions.js deve ler de uma fonte sempre atualizada ou receber update.
        // No modelo simples: chamamos setupInteractions novamente ou deixamos interactables como array mutável.
        
    } catch (e) { console.error("Erro carregando topologia:", e); }
}

// Socket: Recebe status de ping
socket.on('update', (data) => {
    appState.networkData = data;
    updateVisuals(data);
});

// Socket: Mudança na topologia (novo cabo)
socket.on('topology-update', async (linksData) => {
    // Recarrega tudo para garantir (ou só cabos)
    // Se só cabos:
    appState.cables = window.updateCables3D(sceneData.scene, linksData, appState.hosts);
    // Reaplica cores
    updateVisuals(appState.networkData);
});

function updateVisuals(serverData) {
    if(!serverData) return;
    document.getElementById('last-update').innerText = "Atualizado: " + new Date().toLocaleTimeString();
    
    // Atualiza Mapa de Status
    let globalStatus = 'OK'; 
    const map = {}; 
    appState.hosts.forEach(s => {
        const net = serverData.find(d => d.id === s.id);
        const st = net ? (net.status || 'OK') : 'OK';
        map[s.id] = { status: st };
        if(st === 'CRITICAL') globalStatus = 'CRITICAL';
        else if(st === 'WARNING' && globalStatus !== 'CRITICAL') globalStatus = 'WARNING';
    });
    appState.statusMap = map;

    // Atualiza Cores Prédios
    appState.interactables.forEach(mesh => {
        if(mesh.userData.type === 'building') {
            const info = map[mesh.userData.id] || { status: 'OK' };
            const ring = appState.pulsingRings.find(r => r.userData.id === mesh.userData.id);
            const warnDom = mesh.userData.warningIconDom;

            // Reset
            if(window.INTERSECTED !== mesh) mesh.material.color.setHex(0x1e293b);
            if(mesh.userData.lineObj) mesh.userData.lineObj.material.color.setHex(0x38bdf8);
            if(ring) ring.visible = false;
            if(warnDom) warnDom.style.display = 'none';

            // Aplica Status
            if (info.status === 'CRITICAL') {
                mesh.material.color.setHex(0xff0000); 
                if(mesh.userData.lineObj) mesh.userData.lineObj.material.color.setHex(0xff0000);
                if(ring) { ring.material.color.setHex(0xff0000); ring.visible = true; }
            } 
            else if (info.status === 'WARNING') {
                mesh.material.color.setHex(0xffaa00);
                if(mesh.userData.lineObj) mesh.userData.lineObj.material.color.setHex(0xfacc15);
                if(ring) { ring.material.color.setHex(0xffff00); ring.visible = true; }
                if(warnDom) warnDom.style.display = 'block';
            }
        }
    });

    // Atualiza Cores Cabos
    appState.cables.forEach(obj => {
        if (obj.userData.isCable) {
            const fs = map[obj.userData.from]?.status;
            const ts = map[obj.userData.to]?.status;
            if (fs === 'CRITICAL' || ts === 'CRITICAL') obj.material.color.setHex(0xff0000);
            else obj.material.color.setHex(0x0ea5e9);
        }
    });
    
    // Atualiza UI Global
    const statusDot = document.getElementById('status-dot');
    const globalText = document.getElementById('global-text');
    if(globalStatus === 'CRITICAL') {
        statusDot.className = "dot danger";
        globalText.innerText = "FALHA CRÍTICA";
        globalText.style.color = "#fb7185";
    } else if (globalStatus === 'WARNING') {
        statusDot.className = "dot warning"; // Assumindo CSS class warning
        statusDot.style.background = "#facc15";
        globalText.innerText = "ALERTA / ATENÇÃO";
        globalText.style.color = "#facc15";
    } else {
        statusDot.className = "dot active";
        statusDot.style.background = "";
        globalText.innerText = "OPERACIONAL";
        globalText.style.color = "#2dd4bf";
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.003; 

    // Anima Anéis
    appState.pulsingRings.forEach(ring => {
        if(ring.visible) {
            const scale = 1 + (Math.sin(time) * 0.3 + 0.3);
            ring.scale.set(scale, scale, 1);
            ring.material.opacity = 0.8 - (Math.sin(time) * 0.4 + 0.4);
        }
    });

    // Anima Pacotes nos Cabos
    appState.cables.forEach(o => {
        if(o.userData.curve) {
            o.userData.progress += o.userData.speed;
            if(o.userData.progress > 1) o.userData.progress = 0;
            o.position.copy(o.userData.curve.getPoint(o.userData.progress));
        }
    });

    // Raycast / Hover
    window.checkIntersections(sceneData.camera, appState.interactables, appState.statusMap);

    sceneData.controls.update();
    sceneData.renderer.render(sceneData.scene, sceneData.camera);
    sceneData.labelRenderer.render(sceneData.scene, sceneData.camera);
}

init();
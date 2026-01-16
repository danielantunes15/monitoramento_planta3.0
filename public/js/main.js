const socket = io();
let sceneData; 
let appState = {
    hosts: [],
    networkData: [], 
    statusMap: {},   
    interactables: [],
    pulsingRings: [],
    cables: []
};

let editing = false; 

async function init() {
    sceneData = window.initThreeJS('canvas-3d');
    if (!sceneData) return;

    await loadTopology();

    window.setupInteractions(
        sceneData.camera, 
        sceneData.renderer.domElement, 
        appState.interactables, 
        appState.networkData,
        sceneData.scene 
    );

    window.addEventListener('search-sector', (e) => {
        const term = e.detail;
        const target = appState.hosts.find(h => h.id === term || h.name.toUpperCase().includes(term));
        if(target) {
            const mesh = appState.interactables.find(m => m.userData.id === target.id);
            if(mesh) {
                gsap.to(sceneData.controls.target, {duration:1, x:mesh.position.x, y:0, z:mesh.position.z});
                gsap.to(sceneData.camera.position, {duration:1, x:mesh.position.x, y:30, z:mesh.position.z+30});
            }
        }
    });

    animate();
}

async function loadTopology() {
    try {
        const [hRes, lRes] = await Promise.all([ fetch('/hosts'), fetch('/links') ]);
        const hosts = await hRes.json();
        const links = await lRes.json();
        
        appState.hosts = hosts;

        // Limpa objetos antigos antes de redesenhar
        appState.interactables.forEach(obj => {
            sceneData.scene.remove(obj);
            if(obj.userData.lineObj) sceneData.scene.remove(obj.userData.lineObj);
            // Labels são filhos do mesh, somem junto automaticamente
        });
        
        // Remove anéis antigos
        appState.pulsingRings.forEach(r => sceneData.scene.remove(r));

        const structResult = window.drawStructures(sceneData.scene, hosts);
        appState.interactables = structResult.interactables;
        appState.pulsingRings = structResult.pulsingRings;

        appState.cables = window.updateCables3D(sceneData.scene, links, hosts);
        
    } catch (e) { console.error("Erro carregando topologia:", e); }
}

// --- FUNÇÕES DE EDIÇÃO E UI ---

window.toggleEditMode = function() {
    editing = !editing;
    applyEditState();
};

window.cancelEditMode = async function() {
    editing = false;
    applyEditState();
    
    // Recarrega do banco para desfazer movimentos não salvos
    await loadTopology();
    alert("Edição cancelada. Posições originais restauradas.");
};

function applyEditState() {
    window.setEditMode(editing); 
    
    const actionsDiv = document.getElementById('edit-actions');
    const btnActivate = document.getElementById('btn-edit-mode');
    
    if(editing) {
        actionsDiv.classList.remove('hidden');
        btnActivate.classList.add('hidden');
    } else {
        actionsDiv.classList.add('hidden');
        btnActivate.classList.remove('hidden');
    }
}

window.saveLayout = async function() {
    if(!confirm("Salvar as novas posições no sistema?")) return;
    
    // CORREÇÃO AQUI: Agora enviamos o 'name' junto para evitar erro do banco
    const updates = appState.interactables
        .filter(mesh => mesh.userData.type === 'building')
        .map(mesh => ({
            id: mesh.userData.id,
            name: mesh.userData.name, // <--- OBRIGATÓRIO PARA O SUPABASE
            pos_x: parseFloat(mesh.position.x.toFixed(2)),
            pos_z: parseFloat(mesh.position.z.toFixed(2)),
            width: mesh.scale.x,  // Salva também se mudou o tamanho
            height: mesh.scale.y,
            depth: mesh.scale.z
        }));

    try {
        const res = await fetch('/hosts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        const json = await res.json();
        if(json.success) {
            alert("✅ Layout salvo com sucesso!");
            editing = false;
            applyEditState();
        } else {
            alert("❌ Erro ao salvar: " + (json.error || "Erro desconhecido"));
        }
    } catch(e) {
        alert("❌ Erro de conexão com o servidor.");
        console.error(e);
    }
};

// --- SOCKETS ---

socket.on('update', (data) => {
    appState.networkData = data; 
    updateVisuals(data);
});

socket.on('topology-update', async (linksData) => {
    appState.cables = window.updateCables3D(sceneData.scene, linksData, appState.hosts);
    updateVisuals(appState.networkData);
});

function updateVisuals(serverData) {
    if(!serverData) return;
    document.getElementById('last-update').innerText = "Atualizado: " + new Date().toLocaleTimeString();
    
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

    // Atualiza Prédios
    appState.interactables.forEach(mesh => {
        if(mesh.userData.type === 'building') {
            const info = map[mesh.userData.id] || { status: 'OK' };
            const ring = appState.pulsingRings.find(r => r.userData.id === mesh.userData.id);
            const warnDom = mesh.userData.warningIconDom;

            if(warnDom) warnDom.style.display = 'none';
            if(ring) ring.visible = false;
            
            // Se estiver editando, não muda a cor (mantém o amarelo de seleção)
            if(editing) return; 

            // Se não for o objeto selecionado pelo mouse
            if(window.INTERSECTED !== mesh) {
                mesh.material.color.setHex(0x1e293b);
            }

            if (info.status === 'CRITICAL') {
                mesh.material.color.setHex(0xff0000); 
                if(ring) { ring.material.color.setHex(0xff0000); ring.visible = true; }
            } 
            else if (info.status === 'WARNING') {
                mesh.material.color.setHex(0xffaa00);
                if(ring) { ring.material.color.setHex(0xffff00); ring.visible = true; }
                if(warnDom) warnDom.style.display = 'block';
            }
        }
    });

    // Atualiza Cabos
    appState.cables.forEach(obj => {
        if (obj.userData.isCable) {
            const fs = map[obj.userData.from]?.status;
            const ts = map[obj.userData.to]?.status;
            if (fs === 'CRITICAL' || ts === 'CRITICAL') obj.material.color.setHex(0xff0000);
            else obj.material.color.setHex(0x0ea5e9);
        }
    });
    
    // UI Global
    const statusDot = document.getElementById('status-dot');
    const globalText = document.getElementById('global-text');
    if(globalStatus === 'CRITICAL') {
        statusDot.className = "dot danger";
        globalText.innerText = "FALHA CRÍTICA";
        globalText.style.color = "#fb7185";
    } else if (globalStatus === 'WARNING') {
        statusDot.className = "dot warning";
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

    appState.pulsingRings.forEach(ring => {
        if(ring.visible) {
            const scale = 1 + (Math.sin(time) * 0.3 + 0.3);
            ring.scale.set(scale, scale, 1);
            ring.material.opacity = 0.8 - (Math.sin(time) * 0.4 + 0.4);
        }
    });

    appState.cables.forEach(o => {
        if(o.userData.curve) {
            o.userData.progress += o.userData.speed;
            if(o.userData.progress > 1) o.userData.progress = 0;
            o.position.copy(o.userData.curve.getPoint(o.userData.progress));
        }
    });

    window.checkIntersections(sceneData.camera, appState.interactables, appState.statusMap);

    sceneData.controls.update();
    sceneData.renderer.render(sceneData.scene, sceneData.camera);
    sceneData.labelRenderer.render(sceneData.scene, sceneData.camera);
}

init();
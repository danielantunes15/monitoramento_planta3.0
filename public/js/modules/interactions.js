const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let INTERSECTED = null;
let transformControl = null; 
let isEditMode = false;

window.setupInteractions = function(camera, rendererDom, interactables, networkDataRef, scene) {
    
    // 1. Inicializa o TransformControls (Ferramenta de Arrastar)
    if(typeof THREE.TransformControls !== 'undefined') {
        transformControl = new THREE.TransformControls(camera, rendererDom);
        
        // Quando estiver arrastando, desativa o giro da câmera (OrbitControls)
        transformControl.addEventListener('dragging-changed', function (event) {
            if(window.controls) window.controls.enabled = !event.value; 
        });
        
        scene.add(transformControl);
    } else {
        console.warn("TransformControls não carregado. Verifique o index.html.");
    }

    // Mouse Move
    document.addEventListener('mousemove', (e) => {
        const r = rendererDom.getBoundingClientRect();
        mouse.x = ((e.clientX - r.left)/r.width)*2-1;
        mouse.y = -((e.clientY - r.top)/r.height)*2+1;
    }, false);

    // Click
    rendererDom.addEventListener('pointerdown', (event) => {
        // Se estiver em modo edição, foca no objeto para arrastar
        if(isEditMode) {
            if(INTERSECTED && INTERSECTED.userData.type === 'building') {
                if(transformControl) transformControl.attach(INTERSECTED);
            } else if (!INTERSECTED && transformControl) {
                transformControl.detach(); // Clicou fora, solta
            }
        }
        // Se estiver em modo normal, mostra informações (Popup)
        else {
            if(INTERSECTED) showSectorInfo(INTERSECTED, networkDataRef);
        }
    }, false);

    // Tecla ESC para soltar objeto
    window.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && transformControl) transformControl.detach();
    });

    // Busca (Enter)
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter'){
                const term = e.target.value.toUpperCase();
                window.dispatchEvent(new CustomEvent('search-sector', { detail: term }));
            }
        });
    }
};

// Função para Alternar Modo (Chamada pelo main.js)
window.setEditMode = function(active) {
    isEditMode = active;
    if(!active && transformControl) transformControl.detach();
    
    // Visual: Borda amarela na tela
    const body = document.body;
    body.style.border = active ? "4px solid #facc15" : "none";
    body.style.boxSizing = "border-box";

    if(active) {
        alert("MODO EDITOR ATIVADO:\n- Clique num prédio para selecionar.\n- Use as setas para mover.\n- Clique em 'Salvar Layout' quando terminar.");
    }
};

// Chamado no loop de animação
window.checkIntersections = function(camera, interactables, statusMap) {
    // Se estiver arrastando, não muda o foco
    if(transformControl && transformControl.dragging) return;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(interactables);
    
    if(hits.length > 0) {
        if(INTERSECTED != hits[0].object) {
            // Restaura cor do anterior
            if(INTERSECTED) updateObjectColor(INTERSECTED, statusMap);
            
            INTERSECTED = hits[0].object;
            
            // Cor de Hover
            if(INTERSECTED.userData.type === 'building') {
                 // Em modo edição fica Amarelo, normal fica Azul
                 const hoverColor = isEditMode ? 0xffff00 : 0x38bdf8;
                 
                 // Em modo normal, respeita alertas de erro
                 if(!isEditMode) {
                     const s = statusMap[INTERSECTED.userData.id]?.status;
                     if(s === 'CRITICAL') INTERSECTED.material.color.setHex(0xff4444);
                     else if(s === 'WARNING') INTERSECTED.material.color.setHex(0xffcc00);
                     else INTERSECTED.material.color.setHex(hoverColor);
                 } else {
                     INTERSECTED.material.color.setHex(hoverColor);
                 }
            }
            document.body.style.cursor = 'pointer';
        }
    } else {
        if(INTERSECTED) updateObjectColor(INTERSECTED, statusMap);
        INTERSECTED = null;
        document.body.style.cursor = 'default';
    }
};

function updateObjectColor(mesh, statusMap) {
    if(mesh.userData.type === 'building') {
        const s = statusMap[mesh.userData.id]?.status;
        if(s === 'CRITICAL') mesh.material.color.setHex(0xff0000);
        else if(s === 'WARNING') mesh.material.color.setHex(0xffaa00);
        else mesh.material.color.setHex(0x1e293b); // Cor Padrão
    }
}

function showSectorInfo(mesh, networkData) {
    const infoPanel = document.getElementById('sector-info');
    infoPanel.classList.remove('hidden');
    document.getElementById('sector-name').innerText = mesh.userData.name;
    
    // Busca dados atualizados da rede
    // Nota: networkData é uma referência, mas arrays mudam. 
    // Idealmente buscaríamos do appState global ou uma função getter.
    // Aqui usamos o que foi passado, mas a atualização visual principal ocorre no main.js
    
    const msg = document.getElementById('sector-status-msg');
    
    // Envia evento para main.js popular os dados frescos (opcional, ou faz direto aqui)
    // Para simplificar, vamos assumir que o main.js atualiza o array networkDataRef
    const net = networkDataRef.find(n => n.id === mesh.userData.id);

    if(net) {
        document.getElementById('sector-ip').innerText = "IP: " + (net.ip || 'Não Configurado');
        let detailsHTML = net.status === 'CRITICAL' 
            ? `<div style="margin-bottom:8px; color:#fb7185; font-weight:bold;">❌ Switch: OFFLINE</div>`
            : `<div style="margin-bottom:8px; color:#2dd4bf; font-weight:bold;">✅ Switch: ONLINE</div>`;
            
        if(net.devices && net.devices.length > 0) {
            detailsHTML += `<div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:5px; margin-top:5px;"><small style="color:#94a3b8">Equipamentos:</small>`;
            net.devices.forEach(dev => {
                const icon = dev.online ? '✅' : '🔴';
                const color = dev.online ? '#cbd5e1' : '#fb7185';
                detailsHTML += `<div style="font-size:11px; display:flex; justify-content:space-between; margin-top:3px; color:${color}"><span>${icon} ${dev.name}</span><span style="opacity:0.7">${dev.ip}</span></div>`;
            });
            detailsHTML += `</div>`;
        } else {
            detailsHTML += `<div style="font-size:10px; color:#64748b; margin-top:5px;">Nenhum equipamento extra.</div>`;
        }
        msg.innerHTML = detailsHTML;
    } else {
        document.getElementById('sector-ip').innerText = "Sem dados";
        msg.innerText = "Aguardando atualização...";
    }
}
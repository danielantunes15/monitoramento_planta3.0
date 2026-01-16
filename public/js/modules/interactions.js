// Arquivo: public/js/modules/interactions.js

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let INTERSECTED = null;

window.setupInteractions = function(camera, rendererDom, interactables, networkDataRef) {
    
    // Mouse Move
    document.addEventListener('mousemove', (e) => {
        const r = rendererDom.getBoundingClientRect();
        mouse.x = ((e.clientX - r.left)/r.width)*2-1;
        mouse.y = -((e.clientY - r.top)/r.height)*2+1;
    }, false);

    // Click
    rendererDom.addEventListener('pointerdown', () => {
        if(INTERSECTED) {
            showSectorInfo(INTERSECTED, networkDataRef);
        }
    }, false);

    // Search Input
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter'){
                // Dispara evento customizado para o main.js ouvir (ou busca direta se tiver acesso aos hosts)
                // Por simplicidade, vamos assumir que o main cuida da câmera, 
                // ou podemos adicionar a lógica de busca aqui se passarmos os dados de setores.
                const term = e.target.value.toUpperCase();
                window.dispatchEvent(new CustomEvent('search-sector', { detail: term }));
            }
        });
    }
};

// Chamado no loop de animação
window.checkIntersections = function(camera, interactables, statusMap) {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(interactables);
    
    if(hits.length > 0) {
        if(INTERSECTED != hits[0].object) {
            // Restaura cor do anterior
            if(INTERSECTED) updateObjectColor(INTERSECTED, statusMap);
            
            INTERSECTED = hits[0].object;
            
            // Cor de Hover
            if(INTERSECTED.userData.type === 'building') {
                 const s = statusMap[INTERSECTED.userData.id]?.status;
                 if(s === 'CRITICAL') INTERSECTED.material.color.setHex(0xff4444); // Hover Red
                 else if(s === 'WARNING') INTERSECTED.material.color.setHex(0xffcc00); // Hover Orange
                 else INTERSECTED.material.color.setHex(0x38bdf8); // Hover Blue
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
        else mesh.material.color.setHex(0x1e293b); // Normal
    }
}

function showSectorInfo(mesh, networkData) {
    document.getElementById('sector-info').classList.remove('hidden');
    document.getElementById('sector-name').innerText = mesh.userData.name;
    
    const net = networkData.find(n => n.id === mesh.userData.id);
    const msg = document.getElementById('sector-status-msg');
    
    if(net) {
        document.getElementById('sector-ip').innerText = "Switch IP: " + (net.ip || 'Não Configurado');
        // ... (resto da lógica de HTML do popup - igual original) ...
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
// Arquivo: public/js/modules/structures.js

window.drawStructures = function(scene, setoresData) {
    const interactables = [];
    const pulsingRings = [];
    
    // Geometrias reutilizáveis
    const geoNormal = new THREE.BoxGeometry(1, 1, 1);
    const ringGeo = new THREE.RingGeometry(2.5, 3.5, 32); 

    setoresData.forEach(s => {
        // Material
        const mat = new THREE.MeshPhysicalMaterial({ 
            color: 0x1e293b, 
            transparent: true, opacity: 0.7, 
            roughness: 0.2, metalness: 0.6, clearcoat: 1.0
        });

        const mesh = new THREE.Mesh(geoNormal, mat);
        
        // Define Tamanho (usa fallback se o banco vier vazio)
        const w = s.width || s.size?.[0] || 3;
        const h = s.height || s.size?.[1] || 3;
        const d = s.depth || s.size?.[2] || 3;
        mesh.scale.set(w, h, d);

        // Define Posição (usa s.pos_x do banco ou s.pos.x legado)
        const posX = s.pos_x !== undefined ? s.pos_x : (s.pos?.x || 0);
        const posZ = s.pos_z !== undefined ? s.pos_z : (s.pos?.z || 0);
        
        mesh.position.set(posX, h / 2, posZ);
        mesh.userData = { id: s.id, name: s.name, type: 'building' };
        
        scene.add(mesh);
        interactables.push(mesh);

        // Borda (Wireframe)
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); // Ajustado para geometry correta
        // OBS: edges em scale requer geometria exata ou scale na linha
        const lineGeo = new THREE.BoxGeometry(1,1,1);
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(lineGeo), new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
        line.scale.set(w, h, d);
        line.position.copy(mesh.position);
        scene.add(line);
        mesh.userData.lineObj = line; 

        // Anel de Alerta
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(posX, 0.2, posZ);
        ring.visible = false;
        ring.userData = { id: s.id }; 
        scene.add(ring);
        pulsingRings.push(ring); 

        // Labels HTML
        const containerDiv = document.createElement('div');
        containerDiv.style.display = 'flex';
        containerDiv.style.alignItems = 'center';
        containerDiv.style.gap = '8px'; 
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label-tag';
        labelDiv.textContent = s.name;
        
        const warnDiv = document.createElement('div');
        warnDiv.className = 'warning-badge';
        warnDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i>'; 
        warnDiv.style.display = 'none'; 

        containerDiv.appendChild(labelDiv);
        containerDiv.appendChild(warnDiv);

        const labelObj = new THREE.CSS2DObject(containerDiv);
        labelObj.position.set(0, (h/2) + 1.5, 0); 
        mesh.add(labelObj);
        mesh.userData.warningIconDom = warnDiv;
    });

    // Tanques (Decorativos)
    const tankGeo = new THREE.CylinderGeometry(2.5, 2.5, 3.5, 40);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    for(let i=0; i<5; i++) {
        const t = i / 3;
        const posX = -21 + (-5 - -21) * t;
        const posZ = 6 + (24 - 6) * t;
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(posX, 1.75, posZ);
        const edges = new THREE.EdgesGeometry(tankGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
        tank.add(line);
        scene.add(tank);
    }

    return { interactables, pulsingRings };
};
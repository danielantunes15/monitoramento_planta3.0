// Arquivo: public/js/modules/cables.js

let cables = []; // Lista interna para controle

window.updateCables3D = function(scene, linksData, setoresData) {
    // 1. Limpa cabos antigos
    cables.forEach(obj => scene.remove(obj));
    cables = [];

    // 2. Desenha novos
    linksData.forEach(link => {
        // Encontra os objetos de setor correspondentes
        const s1 = setoresData.find(s => s.id === link.from_sector || s.id === link.from);
        const s2 = setoresData.find(s => s.id === link.to_sector || s.id === link.to);

        if (s1 && s2) {
            // Normaliza posições (banco vs legado)
            const p1 = { x: s1.pos_x ?? s1.pos?.x, z: s1.pos_z ?? s1.pos?.z };
            const p2 = { x: s2.pos_x ?? s2.pos?.x, z: s2.pos_z ?? s2.pos?.z };
            
            drawCable(scene, p1, p2, s1.id, s2.id);
        }
    });

    return cables;
};

function drawCable(scene, p1, p2, idFrom, idTo) {
    const points = [];
    points.push(new THREE.Vector3(p1.x, 0.5, p1.z));
    
    // Ponto médio elevado (arco)
    const midX = (p1.x + p2.x) / 2;
    const midZ = (p1.z + p2.z) / 2;
    points.push(new THREE.Vector3(midX, 5, midZ)); 
    
    points.push(new THREE.Vector3(p2.x, 0.5, p2.z));
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 20, 0.1, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    
    const tube = new THREE.Mesh(geo, mat);
    tube.userData = { isCable: true, from: idFrom, to: idTo };
    scene.add(tube);
    cables.push(tube);
    
    // Pacote de dados (animação)
    const packetGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4); 
    const packetMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const packet = new THREE.Mesh(packetGeo, packetMat);
    scene.add(packet);
    packet.userData = { curve: curve, progress: 0, speed: 0.004 }; 
    cables.push(packet);
}
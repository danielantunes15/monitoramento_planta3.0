// Arquivo: public/js/modules/scene_setup.js

window.initThreeJS = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    // Cena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.FogExp2(0x111111, 0.002);

    // Câmera
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 100, 60);

    // Renderers
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const labelRenderer = new THREE.CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    // Controles
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;

    // Luzes
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    scene.add(sun);

    // Ambiente (Chão)
    createEnvironment(scene);

    // Listener de Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, labelRenderer, controls };
};

function createEnvironment(scene) {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('./img/3.png', 
        (texture) => {
            const planeMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.0 });
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), planeMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.1;
            floor.receiveShadow = true;
            scene.add(floor);
        },
        undefined,
        (err) => {
            const planeMat = new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide });
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), planeMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.1;
            scene.add(floor);
        }
    );
}
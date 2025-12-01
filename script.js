document.addEventListener('DOMContentLoaded', function () {
    init3D();
    setupEventListeners();
});

// --- BIẾN TOÀN CỤC ---
let scene, camera, renderer, controls;
let boxGroup;
let imagesGroup;
let uploadedImages = [];
let activeImageId = null;

// Cấu hình chung
let config = {
    width: 20, height: 15, length: 20,
    boxColor: '#ffffff', ribbonColor: '#ef4444',
    hasRibbon: true,
    pattern: 'none',
    patternColor: 'rgba(0,0,0,0.15)'
};

// --- KHỞI TẠO 3D ---
function init3D() {
    const container = document.getElementById('3d-container');
    document.getElementById('loading-text').style.display = 'none';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(document.documentElement.classList.contains('dark') ? 0x374151 : 0xf3f4f6);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(40, 35, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 30);
    dirLight.castShadow = true;
    scene.add(dirLight);

    createGiftBox();
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

// --- TẠO HỘP QUÀ ---
function createGiftBox() {
    // 1. Dọn dẹp nhóm cũ (FIX: Xóa sạch imagesGroup cũ để tránh lỗi orphan)
    if (boxGroup) scene.remove(boxGroup);
    if (imagesGroup) scene.remove(imagesGroup);

    boxGroup = new THREE.Group();
    imagesGroup = new THREE.Group();

    // 2. Tạo Vật liệu & Hình khối
    let boxMap = null;
    if (config.pattern !== 'none') {
        boxMap = createPatternTexture(config.pattern, config.boxColor, config.patternColor);
    }

    // Hộp đặc, không trong suốt
    const boxMat = new THREE.MeshStandardMaterial({
        color: config.pattern === 'none' ? config.boxColor : 0xffffff,
        map: boxMap,
        roughness: 0.6, metalness: 0.1,
        transparent: false,
        opacity: 1.0
    });

    const ribbonMat = new THREE.MeshStandardMaterial({
        color: config.ribbonColor, roughness: 0.4, side: THREE.DoubleSide
    });

    const w = config.width; const h = config.height; const l = config.length;
    const lidH = 3; const lidOver = 0.6;

    // Body
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), boxMat);
    bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
    boxGroup.add(bodyMesh);

    // Lid
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(w + lidOver, lidH, l + lidOver), boxMat);
    lidMesh.position.y = h / 2 + lidH / 2;
    lidMesh.castShadow = true; lidMesh.receiveShadow = true;
    boxGroup.add(lidMesh);

    // Ribbon
    if (config.hasRibbon) {
        const rW = 4; const rT = 0.2;
        const vRib = new THREE.Mesh(new THREE.BoxGeometry(rW, h + lidH + 0.2, l + lidOver + rT), ribbonMat);
        vRib.position.y = lidH / 2; boxGroup.add(vRib);

        const hRib = new THREE.Mesh(new THREE.BoxGeometry(w + lidOver + rT, h + lidH + 0.2, rW), ribbonMat);
        hRib.position.y = lidH / 2; boxGroup.add(hRib);

        const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(2.5, 0.7, 64, 8), ribbonMat);
        bow.position.y = h / 2 + lidH + 1.5; bow.rotation.x = Math.PI / 2; bow.scale.set(1, 1, 0.5);
        boxGroup.add(bow);
    }

    scene.add(boxGroup);

    // FIX 2: Re-add existing images to the NEW group
    if (uploadedImages.length > 0) {
        uploadedImages.forEach(img => {
            // ThreeJS tự động chuyển parent từ nhóm cũ sang nhóm mới
            imagesGroup.add(img.group);
        });
        updateAllImages(); // Apply lại vị trí cho chuẩn với kích thước hộp mới
    }

    scene.add(imagesGroup);
}

// --- QUẢN LÝ ẢNH ---
function handleImageUpload(e) {
    const files = e.target.files;
    if (!files.length) return;
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const loader = new THREE.TextureLoader();
            loader.load(evt.target.result, (tex) => addImageToScene(tex, file.name));
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function addImageToScene(texture, name) {
    const aspectRatio = texture.image.width / texture.image.height;
    const baseSize = 10;
    const geo = new THREE.PlaneGeometry(baseSize * aspectRatio, baseSize);

    // Material ảnh: Trong suốt và vẽ đè lên hộp
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });

    const mesh = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.add(mesh);
    imagesGroup.add(group);

    const newId = Date.now() + Math.random();
    const imageObj = {
        id: newId, name: name, group: group, mesh: mesh,
        config: { face: 'front', x: 0, y: 0, scale: 1.0, rotate: 0 }
    };
    uploadedImages.push(imageObj);

    renderImageList();
    setActiveImage(newId);
    updateImageTransform(imageObj);
}

function updateAllImages() {
    uploadedImages.forEach(img => updateImageTransform(img));
}

function updateImageTransform(imgObj) {
    const { width, height, length } = config;
    const { face, x, y, scale, rotate } = imgObj.config;
    const group = imgObj.group;
    const mesh = imgObj.mesh;

    group.position.set(0, 0, 0); group.rotation.set(0, 0, 0);
    const offset = 0.05;

    switch (face) {
        case 'front': group.position.set(0, 0, length / 2 + offset); break;
        case 'back': group.position.set(0, 0, -length / 2 - offset); group.rotation.y = Math.PI; break;
        case 'left': group.position.set(-width / 2 - offset, 0, 0); group.rotation.y = -Math.PI / 2; break;
        case 'right': group.position.set(width / 2 + offset, 0, 0); group.rotation.y = Math.PI / 2; break;
        case 'top': group.position.set(0, height / 2 + 3 + offset, 0); group.rotation.x = -Math.PI / 2; break;
    }

    mesh.position.set(x, y, 0);
    mesh.scale.set(scale, scale, 1);
    mesh.rotation.z = -rotate * (Math.PI / 180);
}

// --- UI LOGIC ---
function renderImageList() {
    const listDiv = document.getElementById('image-list');
    const noImgText = document.getElementById('no-image-text');

    // Clear list
    Array.from(listDiv.children).forEach(child => { if (child.id !== 'no-image-text') listDiv.removeChild(child); });

    if (uploadedImages.length === 0) {
        noImgText.style.display = 'block';
        document.getElementById('image-editor').classList.add('opacity-50', 'pointer-events-none');
    } else {
        noImgText.style.display = 'none';
        document.getElementById('image-editor').classList.remove('opacity-50', 'pointer-events-none');
        uploadedImages.forEach(img => {
            const div = document.createElement('div');
            div.className = `image-item flex items-center justify-between p-2 rounded cursor-pointer ${img.id === activeImageId ? 'active' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`;
            div.innerHTML = `<span class="text-sm truncate font-medium w-32">${img.name}</span><span class="text-xs text-gray-500 bg-gray-200 px-1 rounded">${getFaceLabel(img.config.face)}</span>`;
            div.onclick = () => setActiveImage(img.id);
            listDiv.appendChild(div);
        });
    }
}

function getFaceLabel(face) { const map = { front: 'Trước', back: 'Sau', left: 'Trái', right: 'Phải', top: 'Nắp' }; return map[face] || face; }

function setActiveImage(id) {
    activeImageId = id; renderImageList();
    const imgObj = uploadedImages.find(i => i.id === id);
    if (!imgObj) return;
    document.getElementById('img-face').value = imgObj.config.face;
    document.getElementById('img-pos-x').value = imgObj.config.x;
    document.getElementById('img-pos-y').value = imgObj.config.y;
    document.getElementById('img-scale').value = imgObj.config.scale;
    document.getElementById('img-rotate').value = imgObj.config.rotate;
    controls.autoRotate = false;
}
function getActiveImage() { return uploadedImages.find(i => i.id === activeImageId); }

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Kích thước
    ['height', 'width', 'length'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            config[id] = parseFloat(e.target.value) || 10; createGiftBox();
        });
    });

    // Màu hộp
    document.querySelectorAll('#box-colors .color-swatch').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('#box-colors .color-swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active'); config.boxColor = el.dataset.color; createGiftBox();
        });
    });

    // Toggle Ruy băng
    document.getElementById('ribbon-toggle').addEventListener('change', (e) => { config.hasRibbon = e.target.checked; createGiftBox(); });

    // Màu Ruy băng
    document.querySelectorAll('#ribbon-colors .color-swatch').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('#ribbon-colors .color-swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active'); config.ribbonColor = el.dataset.color; createGiftBox();
        });
    });

    // Pattern Type
    document.querySelectorAll('#pattern-options .pattern-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('#pattern-options .pattern-option').forEach(s => {
                s.classList.remove('active', 'border-primary'); s.classList.add('border-transparent');
            });
            el.classList.remove('border-transparent'); el.classList.add('active', 'border-primary');
            config.pattern = el.dataset.pattern; createGiftBox();
        });
    });

    // Pattern Color
    document.querySelectorAll('#pattern-colors .color-swatch').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('#pattern-colors .color-swatch').forEach(s => s.classList.remove('active'));
            el.classList.add('active');
            config.patternColor = el.dataset.color;
            createGiftBox();
        });
    });

    // Hình ảnh
    document.getElementById('file-upload').addEventListener('change', handleImageUpload);

    const updateActive = (prop, val) => { const img = getActiveImage(); if (img) { img.config[prop] = val; updateImageTransform(img); renderImageList(); } };
    document.getElementById('img-face').addEventListener('change', (e) => updateActive('face', e.target.value));
    document.getElementById('img-pos-x').addEventListener('input', (e) => updateActive('x', parseFloat(e.target.value)));
    document.getElementById('img-pos-y').addEventListener('input', (e) => updateActive('y', parseFloat(e.target.value)));
    document.getElementById('img-scale').addEventListener('input', (e) => updateActive('scale', parseFloat(e.target.value)));
    document.getElementById('img-rotate').addEventListener('input', (e) => updateActive('rotate', parseFloat(e.target.value)));

    // Xóa ảnh
    document.getElementById('btn-delete-img').addEventListener('click', () => {
        if (!activeImageId) return;
        const index = uploadedImages.findIndex(i => i.id === activeImageId);
        if (index > -1) {
            // Xóa khỏi group hiện tại
            imagesGroup.remove(uploadedImages[index].group);

            // Xóa tài nguyên
            if (uploadedImages[index].mesh.geometry) uploadedImages[index].mesh.geometry.dispose();
            if (uploadedImages[index].mesh.material) uploadedImages[index].mesh.material.dispose();

            // Xóa khỏi mảng
            uploadedImages.splice(index, 1);
            activeImageId = null;

            renderImageList();
            // Reset UI editor
            document.getElementById('image-editor').classList.add('opacity-50', 'pointer-events-none');
        }
    });

    document.getElementById('btn-rotate').addEventListener('click', () => controls.autoRotate = !controls.autoRotate);
    document.getElementById('btn-reset').addEventListener('click', () => { controls.reset(); camera.position.set(40, 35, 40); });
}

// --- CANVAS TEXTURE ---
function createPatternTexture(type, boxColor, patternColor) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Nền
    ctx.fillStyle = boxColor;
    ctx.fillRect(0, 0, 512, 512);

    // Màu họa tiết
    ctx.fillStyle = patternColor;

    if (type === 'stripes_h') { // Kẻ ngang
        ctx.translate(256, 256); ctx.rotate(Math.PI / 4); ctx.translate(-256, -256);
        for (let i = -256; i < 768; i += 40) ctx.fillRect(i, 0, 20, 768);
    }
    else if (type === 'stripes_v') { // Sọc dọc
        for (let x = 0; x < 512; x += 40) ctx.fillRect(x, 0, 20, 512);
    }
    else if (type === 'dots') { // Chấm bi
        for (let x = 0; x < 512; x += 50) for (let y = 0; y < 512; y += 50) { ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); }
    }
    else if (type === 'hearts') { // Tim
        ctx.font = "40px Arial";
        for (let x = 20; x < 512; x += 60) {
            for (let y = 40; y < 512; y += 60) {
                ctx.fillText("♥", x, y);
            }
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
// --- LOGIC ĐẶT HÀNG ---

// 1. Hàm bật/tắt Modal
function toggleModal(show) {
    const modal = document.getElementById('order-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// 2. Gán sự kiện cho nút "Hoàn tất & Mua ngay"
// (Bạn hãy sửa lại nút trong file HTML: onclick="toggleModal(true)")
// Hoặc dùng code JS này để ghi đè:
document.querySelector('.pt-2 button').onclick = () => toggleModal(true);

// 3. Xử lý khi Submit Form
document.getElementById('order-form').addEventListener('submit', function (e) {
    e.preventDefault(); // Chặn load lại trang

    // Thu thập dữ liệu
    const orderData = {
        orderId: 'DH-' + Date.now().toString().slice(-6), // Tạo mã đơn hàng tự động
        externalOrderId: document.getElementById('external-order-id').value || 'Không có',
        name: document.getElementById('customer-name').value,
        phone: document.getElementById('customer-phone').value,
        address: document.getElementById('customer-address').value,
        // Lấy thông tin cấu hình hộp quà từ biến toàn cục 'config'
        productDetails: `Kích thước: ${config.width}x${config.height}x${config.length}cm, 
                         Màu hộp: ${config.boxColor}, 
                         Ruy băng: ${config.hasRibbon ? config.ribbonColor : 'Không'}, 
                         Họa tiết: ${config.pattern}`
    };

    // Gọi hàm xử lý (Chọn 1 trong 2 phương án bên dưới để bỏ vào đây)
    sendOrder(orderData);
});
function sendOrder(data) {
    const btnText = document.getElementById('btn-text');
    btnText.innerText = 'Đang xử lý...';

    // Thay URL bên dưới bằng URL Web App bạn vừa copy
    const scriptURL = 'https://script.google.com/macros/s/AKfycbzWrDbtJynUER9XjBH38iEfhGuqvDOs9Vo-HzmWEl3mr3ZESsWvQ3IL5xLN2lADKle9-Q/exec';

    // Google Apps Script yêu cầu gửi bằng mode 'no-cors' hoặc dùng fetch thông thường nhưng cấu trúc data đặc biệt
    // Cách an toàn nhất để tránh lỗi CORS với Google Script là dùng fetch post text/plain

    fetch(scriptURL, {
        method: 'POST',
        mode: 'no-cors', // Quan trọng để browser không chặn request
        headers: {
            'Content-Type': 'text/plain'
        },
        body: JSON.stringify(data)
    })
        .then(response => {
            // Vì mode no-cors nên ta không đọc được response chính xác, 
            // nhưng nếu code chạy tới đây nghĩa là request đã đi.
            alert('Đặt hàng thành công! Chúng tôi sẽ liên hệ sớm.\nMã đơn: ' + data.orderId);
            toggleModal(false);
            document.getElementById('order-form').reset();
            btnText.innerText = 'Xác nhận đặt hàng';
        })
        .catch(error => {
            console.error('Error!', error.message);
            alert('Có lỗi xảy ra, vui lòng thử lại!');
            btnText.innerText = 'Thử lại';
        });
}

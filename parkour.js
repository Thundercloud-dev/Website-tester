
(async () => {
  const THREE = await import(
    "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"
  );

  // ===== GAME SETUP =====
  document.body.innerHTML = "";
  document.body.style.cssText =
    "margin:0;overflow:hidden;background:#87ceeb;font-family:Arial,sans-serif";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 35, 110);

  const camera = new THREE.PerspectiveCamera(
    70, innerWidth / innerHeight, 0.1, 300
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x526080, 2));

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-10, 25, 10);
  sun.castShadow = true;
  scene.add(sun);

  // ===== HUD =====
  const hud = document.createElement("div");
  hud.style.cssText = `
    position:fixed;top:16px;left:16px;color:white;
    background:#101828dd;padding:15px 18px;border-radius:12px;
    font-size:15px;line-height:1.7;pointer-events:none;
    text-shadow:0 1px 3px black
  `;
  document.body.appendChild(hud);

  const message = document.createElement("div");
  message.style.cssText = `
    position:fixed;top:42%;width:100%;text-align:center;
    font-size:36px;font-weight:bold;color:white;
    text-shadow:0 3px 8px #000;pointer-events:none
  `;
  document.body.appendChild(message);

  // ===== PARKOUR COURSE =====
  const platforms = [];
  const checkpoints = [
    { x: 0, y: 0, z: 4 },
    { x: 0, y: 3, z: -24 },
    { x: 0, y: 6, z: -54 }
  ];

  function platform(x, y, z, w, d, color = 0x3478f6) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.6, d),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.65,
        metalness: 0.05
      })
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    platforms.push({
      x, y, z, w, d, mesh
    });

    // Bright outline makes platforms easier to see.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    mesh.add(edges);

    return mesh;
  }

  // Starting platform
  platform(0, 0, 4, 10, 10, 0x22c55e);

  // First section: basic jumps
  platform(0, 0.5, -5, 4, 4);
  platform(3, 1, -12, 4, 4, 0x8b5cf6);
  platform(-1, 1.5, -19, 4, 4);
  platform(0, 3, -24, 9, 8, 0xf59e0b);

  // Second section: higher jumps
  platform(-3, 3.5, -32, 3.5, 3.5, 0xef4444);
  platform(2, 4.5, -39, 3.5, 3.5, 0x8b5cf6);
  platform(0, 5, -47, 3.5, 3.5, 0x06b6d4);
  platform(0, 6, -54, 9, 8, 0xf59e0b);

  // Final section
  platform(4, 6.5, -63, 3, 3, 0xef4444);
  platform(0, 7.5, -70, 3, 3, 0x8b5cf6);
  platform(-4, 8, -77, 3, 3, 0x06b6d4);
  platform(0, 9, -85, 12, 10, 0x22c55e);

  // Checkpoint flags
  function flag(x, y, z, color) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    pole.position.set(x, y + 1.8, z);
    scene.add(pole);

    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.7, 0.08),
      new THREE.MeshStandardMaterial({ color })
    );
    cloth.position.set(x + 0.6, y + 2.5, z);
    scene.add(cloth);
  }

  flag(0, 3, -24, 0xffd700);
  flag(0, 6, -54, 0xffd700);

  // ===== PLAYER =====
  const player = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.5, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xffcc80 })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  player.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd4a3 })
  );
  head.position.y = 1.95;
  head.castShadow = true;
  player.add(head);

  scene.add(player);

  const state = {
    x: 0, y: 0, z: 4,
    vx: 0, vy: 0, vz: 0,
    grounded: false,
    checkpoint: 0,
    deaths: 0,
    won: false
  };

  const keys = {};
  let yaw = 0;
  let pitch = 0.2;
  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let jumpPressed = false;
  let cameraDistance = 7;

  addEventListener("keydown", e => {
    keys[e.code] = true;

    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
      .includes(e.code)) e.preventDefault();

    if (e.code === "Space" && !e.repeat) jumpPressed = true;

    if (e.code === "KeyR") respawn();
  });

  addEventListener("keyup", e => {
    keys[e.code] = false;
  });

  // Drag the mouse to rotate the camera.
  renderer.domElement.addEventListener("pointerdown", e => {
    dragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", e => {
    if (!dragging) return;

    yaw -= (e.clientX - lastMouseX) * 0.006;
    pitch = THREE.MathUtils.clamp(
      pitch + (e.clientY - lastMouseY) * 0.004,
      -0.35, 0.8
    );

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  renderer.domElement.addEventListener("pointerup", () => {
    dragging = false;
  });

  // Scroll to zoom.
  addEventListener("wheel", e => {
    cameraDistance = THREE.MathUtils.clamp(
      cameraDistance + e.deltaY * 0.008, 3.5, 12
    );
  }, { passive: true });

  function respawn() {
    state.x = checkpoints[state.checkpoint].x;
    state.y = checkpoints[state.checkpoint].y;
    state.z = checkpoints[state.checkpoint].z;
    state.vx = state.vy = state.vz = 0;
    state.grounded = false;
    state.deaths++;
    state.won = false;
    message.textContent = "";
  }

  // ===== GAME LOOP =====
  const clock = new THREE.Clock();
  let elapsed = 0;

  function update(dt) {
    elapsed += dt;

    if (state.won) return;

    // Movement relative to the camera direction.
    let forward = 0;
    let sideways = 0;

    if (keys.KeyW || keys.ArrowUp) forward++;
    if (keys.KeyS || keys.ArrowDown) forward--;
    if (keys.KeyD || keys.ArrowRight) sideways++;
    if (keys.KeyA || keys.ArrowLeft) sideways--;

    const inputLength = Math.hypot(forward, sideways);
    if (inputLength > 0) {
      forward /= inputLength;
      sideways /= inputLength;
    }

    const speed = 9;
    const targetX =
      (Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * speed;
    const targetZ =
      (-Math.cos(yaw) * forward + Math.sin(yaw) * sideways) * speed;

    const acceleration = state.grounded ? 14 : 5;

    state.vx += (targetX - state.vx) * Math.min(1, acceleration * dt);
    state.vz += (targetZ - state.vz) * Math.min(1, acceleration * dt);

    // Jump and gravity.
    if (jumpPressed && state.grounded) {
      state.vy = 11.5;
      state.grounded = false;
    }
    jumpPressed = false;

    state.vy -= 25 * dt;

    const oldY = state.y;
    state.x += state.vx * dt;
    state.z += state.vz * dt;
    state.y += state.vy * dt;
    state.grounded = false;

    // Land only when descending onto the top of a platform.
    if (state.vy <= 0) {
      for (const p of platforms) {
        const top = p.y + 0.3;
        const insideX = Math.abs(state.x - p.x) < p.w / 2 + 0.25;
        const insideZ = Math.abs(state.z - p.z) < p.d / 2 + 0.25;

        if (
          insideX && insideZ &&
          oldY >= top - 0.05 &&
          state.y <= top &&
          state.y >= top - 0.6
        ) {
          state.y = top;
          state.vy = 0;
          state.grounded = true;
          break;
        }
      }
    }

    player.position.set(state.x, state.y, state.z);
    player.rotation.y = yaw;

    // Activate checkpoints when reaching their platform.
    for (let i = 1; i < checkpoints.length; i++) {
      const cp = checkpoints[i];

      if (
        state.grounded &&
        Math.abs(state.x - cp.x) < 4 &&
        Math.abs(state.z - cp.z) < 4 &&
        state.checkpoint < i
      ) {
        state.checkpoint = i;
        message.textContent = "CHECKPOINT REACHED!";
        setTimeout(() => {
          if (!state.won) message.textContent = "";
        }, 1400);
      }
    }

    // Win condition.
    if (state.grounded && state.z < -80) {
      state.won = true;
      message.textContent = "YOU BEAT THE PARKOUR! 🎉";
    }

    // Fall detection.
    if (state.y < -15) {
      respawn();
      message.textContent = "FELL! TRY AGAIN";
      setTimeout(() => {
        if (!state.won) message.textContent = "";
      }, 1000);
    }

    // Smooth third-person camera.
    const horizontal = cameraDistance * Math.cos(pitch);
    const desired = new THREE.Vector3(
      state.x + Math.sin(yaw) * horizontal,
      state.y + 2.3 + cameraDistance * Math.sin(pitch),
      state.z + Math.cos(yaw) * horizontal
    );

    camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
    camera.lookAt(state.x, state.y + 1.1, state.z);

    hud.innerHTML = `
      <b>🏃 PARKOUR CHALLENGE</b><br>
      WASD / Arrows: Move<br>
      SPACE: Jump<br>
      Drag mouse: Look around<br>
      Scroll: Zoom &nbsp; R: Restart<br>
      Checkpoint: ${state.checkpoint + 1} / 3<br>
      Falls: ${state.deaths}<br>
      <span style="color:#86efac">Reach the green finish!</span>
    `;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.04);
    update(dt);
    renderer.render(scene, camera);
  }

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  animate();
})().catch(err => {
  document.body.innerHTML =
    "<pre style='padding:20px'>Could not start the game. " +
    err.message + "</pre>";
  console.error(err);
});

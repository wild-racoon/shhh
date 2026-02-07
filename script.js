document.addEventListener('DOMContentLoaded', () => {
    // Device Detection
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIPhone = /iPhone/.test(userAgent) && !window.MSStream;
    const isIPad = /iPad/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMobile = isIPhone || isIPad;

    // Add device class to body for CSS targeting
    if (isIPad) {
        document.body.classList.add('device-ipad');
    } else if (isIPhone) {
        document.body.classList.add('device-iphone');
    }

    const boy = document.getElementById('boy');
    const girl = document.getElementById('girl');
    const girlImg = document.getElementById('girlImg');
    const boyImg = document.getElementById('boyImg');
    const scene = document.querySelector('.scene');
    const bgVideo = document.querySelector('.scene-bg');

    // Ensure background video loops and plays
    bgVideo.loop = true;
    bgVideo.muted = true;
    bgVideo.playsInline = true;
    bgVideo.preload = 'auto';
    let videoPlaying = false;

    function tryPlayVideo() {
        if (videoPlaying) return;
        const p = bgVideo.play();
        if (p) p.then(() => { videoPlaying = true; }).catch(() => {});
    }
    tryPlayVideo();
    document.addEventListener('click', tryPlayVideo);
    document.addEventListener('keydown', tryPlayVideo);
    const dialogueBox = document.getElementById('dialogueBox');
    const dialogueText = document.getElementById('dialogueText');
    const dialogueChoices = document.getElementById('dialogueChoices');
    const yesBtn = document.getElementById('yesBtn');
    const noBtn = document.getElementById('noBtn');
    const heartsContainer = document.getElementById('heartsContainer');

    // Background music - shuffle Stardew songs forever
    const bgTracks = [
        'assets/audio/overture.mp3',
        'assets/audio/cloud-country.mp3',
        'assets/audio/settling-in.mp3'
    ];
    let bgMusic = null;
    let musicStarted = false;

    function playNextTrack() {
        const src = bgTracks[Math.floor(Math.random() * bgTracks.length)];
        bgMusic = new Audio(src);
        bgMusic.volume = 0.4;
        bgMusic.addEventListener('ended', playNextTrack);
        bgMusic.play().catch(() => {});
    }

    function startMusicOnInteraction() {
        if (musicStarted) return;
        musicStarted = true;
        playNextTrack();
    }
    document.addEventListener('keydown', startMusicOnInteraction, { once: false });
    document.addEventListener('click', startMusicOnInteraction, { once: false });

    const FRAME_RATE = 150;
    const DISPLAY_W = 180;
    const DISPLAY_H = 238;
    const MOVE_SPEED = 1.5;

    const SCALED_FULL_W = DISPLAY_W * 2;
    const SCALED_FULL_H = DISPLAY_H * 2;

    const INTERACT_DISTANCE = 700;

    // Map size - match the video dimensions
    let MAP_W = Math.max(window.innerWidth, window.innerHeight) * 1.5;
    let MAP_H = MAP_W;

    function applyMapSize() {
        scene.style.width = MAP_W + 'px';
        scene.style.height = MAP_H + 'px';
        bgVideo.style.width = MAP_W + 'px';
        bgVideo.style.height = MAP_H + 'px';
    }
    applyMapSize();

    // Flag to ensure map is initialized before game loop
    let mapInitialized = false;

    // Once video metadata loads, resize map — must be larger than viewport for camera scrolling
    function initializeMap() {
        MAP_W = Math.max(bgVideo.videoWidth || window.innerWidth * 2, window.innerWidth * 2);
        MAP_H = Math.max(bgVideo.videoHeight || window.innerHeight * 3, window.innerHeight * 3);
        applyMapSize();
        updateBounds();
        // Re-center characters on the new map size (spaced apart to avoid collision)
        girlX = MAP_W * 0.52;
        girlY = MAP_H * 0.45;
        boyX = MAP_W * 0.30;
        boyY = MAP_H * 0.50;
        girl.style.left = girlX + 'px';
        girl.style.top = girlY + 'px';
        boy.style.left = boyX + 'px';
        boy.style.top = boyY + 'px';
        mapInitialized = true;
    }

    bgVideo.addEventListener('loadedmetadata', initializeMap);

    // Fallback: initialize after a short delay if video doesn't load
    setTimeout(() => {
        if (!mapInitialized) {
            initializeMap();
        }
    }, 500);

    const positions = [
        [0, 0],
        [-DISPLAY_W, 0],
        [0, -DISPLAY_H],
        [-DISPLAY_W, -DISPLAY_H]
    ];

    const girlSprites = {
        w: 'assets/sprites/girl-back-run.png',
        s: 'assets/sprites/girl-front-run.png',
        a: 'assets/sprites/girl-left-run.png',
        d: 'assets/sprites/girl-right-run.png'
    };

    const boySprites = {
        idle: 'assets/sprites/boy-idle-front.png',
        idleSide: 'assets/sprites/boy-idle-side.png',
        s: 'assets/sprites/boy-walk-front.png',
        w: 'assets/sprites/boy-walk-back.png',
        a: 'assets/sprites/boy-walk-side.png',
        d: 'assets/sprites/boy-walk-side.png'
    };

    // Left-only frames (top row of combined sheet)
    const leftPositions = [[0, 0], [-DISPLAY_W, 0]];
    // Right-only frames (bottom row of combined sheet)
    const rightPositions = [[0, -DISPLAY_H], [-DISPLAY_W, -DISPLAY_H]];

    // Flood-fill background removal from sprite edges
    async function removeSpriteBg(src) {
        try {
            // Load as blob to avoid CORS canvas tainting on file://
            let imgSrc = src;
            try {
                const resp = await fetch(src);
                const blob = await resp.blob();
                imgSrc = URL.createObjectURL(blob);
            } catch (e) { /* fetch unavailable, try direct */ }

            return await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const c = document.createElement('canvas');
                        const ctx = c.getContext('2d');
                        c.width = img.naturalWidth;
                        c.height = img.naturalHeight;
                        ctx.drawImage(img, 0, 0);

                        const imageData = ctx.getImageData(0, 0, c.width, c.height);
                        const d = imageData.data;
                        const w = c.width, h = c.height;
                        const visited = new Uint8Array(w * h);
                        const tolerance = 60;

                        // BFS flood fill from each corner
                        for (const [sx, sy] of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]]) {
                            const si = (sy * w + sx) * 4;
                            if (visited[sy * w + sx] || d[si + 3] === 0) continue;
                            const tR = d[si], tG = d[si+1], tB = d[si+2];
                            const queue = [[sx, sy]];
                            visited[sy * w + sx] = 1;
                            let qi = 0;

                            while (qi < queue.length) {
                                const [x, y] = queue[qi++];
                                const i = (y * w + x) * 4;
                                const dr = d[i]-tR, dg = d[i+1]-tG, db = d[i+2]-tB;
                                if (Math.sqrt(dr*dr + dg*dg + db*db) < tolerance) {
                                    d[i+3] = 0;
                                    for (const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
                                        if (nx>=0 && nx<w && ny>=0 && ny<h && !visited[ny*w+nx]) {
                                            visited[ny*w+nx] = 1;
                                            queue.push([nx,ny]);
                                        }
                                    }
                                }
                            }
                        }

                        ctx.putImageData(imageData, 0, 0);
                        resolve(c.toDataURL('image/png'));
                    } catch (e) {
                        resolve(src);
                    }
                };
                img.onerror = () => resolve(src);
                img.src = imgSrc;
            });
        } catch (e) {
            return src;
        }
    }

    const BOY_SPEED = 1.0;
    const BOY_STOP_DIST = 200;

    // Girl position in WORLD coordinates (on the map)
    let girlX = MAP_W * 0.52;
    let girlY = MAP_H * 0.45;
    let girlDirection = 's';
    let girlAnimInterval = null;
    let girlMoving = false;
    let keysDown = {};

    // Boy position in WORLD coordinates
    let boyX = MAP_W * 0.3;
    let boyY = MAP_H * 0.5;

    function setupImg(imgEl, src) {
        imgEl.src = src;
        imgEl.style.width = SCALED_FULL_W + 'px';
        imgEl.style.height = SCALED_FULL_H + 'px';
        imgEl.style.left = '0px';
        imgEl.style.top = '0px';
    }

    // For single-frame sprites (e.g. boy standing)
    function setupSingleImg(imgEl, src) {
        imgEl.src = src;
        imgEl.style.width = DISPLAY_W + 'px';
        imgEl.style.height = DISPLAY_H + 'px';
        imgEl.style.left = '0px';
        imgEl.style.top = '0px';
    }

    function startAnimation(imgEl, frameList, rate) {
        let frame = 0;
        const frames = frameList || positions;
        return setInterval(() => {
            frame = (frame + 1) % frames.length;
            imgEl.style.left = frames[frame][0] + 'px';
            imgEl.style.top = frames[frame][1] + 'px';
        }, rate || FRAME_RATE);
    }

    function stopAnimation(imgEl, interval) {
        clearInterval(interval);
        imgEl.style.left = '0px';
        imgEl.style.top = '0px';
    }

    // Position characters in world
    girl.style.left = girlX + 'px';
    girl.style.top = girlY + 'px';
    boy.style.left = boyX + 'px';
    boy.style.top = boyY + 'px';

    setupImg(girlImg, girlSprites.s);

    // Boy follow system
    let boyDir = 's';
    let boyAnimInterval = null;
    let boyIsWalking = false;
    let boyReady = false;

    // Process boy sprites to remove backgrounds, then show
    const portraitImg = document.getElementById('portraitImg');
    boy.style.visibility = 'hidden';
    (async () => {
        const cache = {};
        for (const key of Object.keys(boySprites)) {
            const original = boySprites[key];
            if (!cache[original]) cache[original] = await removeSpriteBg(original);
            boySprites[key] = cache[original];
        }
        // Clean portrait background too
        portraitImg.src = await removeSpriteBg('assets/images/boy-portrait.png');
        boyReady = true;
        setupSingleImg(boyImg, boySprites.idle);
        boy.style.visibility = 'visible';
    })();

    function setBoyWalkSprite(dir) {
        boyImg.style.transform = '';
        boyImg.style.objectFit = '';
        lastIdleDir = null;
        if (dir === 'a') {
            setupImg(boyImg, boySprites.a);
            boyAnimInterval = startAnimation(boyImg, leftPositions);
        } else if (dir === 'd') {
            setupImg(boyImg, boySprites.d);
            boyAnimInterval = startAnimation(boyImg, rightPositions);
        } else {
            setupImg(boyImg, boySprites[dir]);
            boyAnimInterval = startAnimation(boyImg);
        }
    }

    let lastIdleDir = null;

    function setBoyIdleFacing() {
        const dx = girlX - boyX;
        const dy = girlY - boyY;
        let faceDir;
        if (Math.abs(dx) > Math.abs(dy)) {
            faceDir = dx > 0 ? 'd' : 'a';
        } else {
            faceDir = dy > 0 ? 's' : 'w';
        }
        if (faceDir === lastIdleDir) return;
        lastIdleDir = faceDir;
        if (faceDir === 'a' || faceDir === 'd') {
            setupSingleImg(boyImg, boySprites.idleSide);
            boyImg.style.objectFit = 'fill';
            boyImg.style.transform = faceDir === 'a' ? 'scale(-1.5, 1.5)' : 'scale(1.5, 1.5)';
        } else {
            setupSingleImg(boyImg, boySprites.idle);
            boyImg.style.objectFit = '';
            boyImg.style.transform = '';
        }
    }

    function updateBoy() {
        if (!boyReady) return;

        if (proposalStarted) {
            setBoyIdleFacing();
            return;
        }

        const dx = (girlX + DISPLAY_W / 2) - (boyX + DISPLAY_W / 2);
        const dy = (girlY + DISPLAY_H / 2) - (boyY + DISPLAY_H / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > BOY_STOP_DIST) {
            // Walk toward girl
            const angle = Math.atan2(dy, dx);
            let newBoyX = boyX + Math.cos(angle) * BOY_SPEED;
            let newBoyY = boyY + Math.sin(angle) * BOY_SPEED;

            // Keep in bounds
            newBoyX = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX - DISPLAY_W, newBoyX));
            newBoyY = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY - DISPLAY_H, newBoyY));

            boyX = newBoyX;
            boyY = newBoyY;

            boy.style.left = boyX + 'px';
            boy.style.top = boyY + 'px';

            // Determine walk direction
            let newDir;
            if (Math.abs(dx) > Math.abs(dy)) {
                newDir = dx > 0 ? 'd' : 'a';
            } else {
                newDir = dy > 0 ? 's' : 'w';
            }

            if (newDir !== boyDir || !boyIsWalking) {
                boyDir = newDir;
                boyIsWalking = true;
                if (boyAnimInterval) clearInterval(boyAnimInterval);
                setBoyWalkSprite(newDir);
            }
        } else if (boyIsWalking) {
            // Close enough — idle facing girl
            boyIsWalking = false;
            if (boyAnimInterval) clearInterval(boyAnimInterval);
            boyAnimInterval = null;
            setBoyIdleFacing();
        }
    }

    // Camera system — clamp to video edges, zoomed in to center player
    const ZOOM = 0.5;

    function updateCamera() {
        // Get screen resolution
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // For mobile, adjust zoom to show a 9:16 viewport window of the full map
        let currentZoom = ZOOM;
        if (isMobile) {
            // Mobile: zoom to show appropriate portion for 9:16 aspect ratio
            // Adjust based on height to ensure vertical coverage is good
            currentZoom = screenHeight / (MAP_H * 0.5);
        }

        // Calculate visible area in world coordinates (accounting for zoom)
        const visibleWidth = screenWidth / currentZoom;
        const visibleHeight = screenHeight / currentZoom;

        // Calculate player's center position in world coordinates
        const playerCenterX = girlX + DISPLAY_W / 2;
        const playerCenterY = girlY + DISPLAY_H / 2;

        // Position camera so player center is at screen center
        let camX = playerCenterX - visibleWidth / 2;
        let camY = playerCenterY - visibleHeight / 2;

        // Mobile: shift camera left to show more of the left side
        if (isMobile) {
            camX -= visibleWidth * 0.15;
        }

        // Clamp camera to map edges to prevent showing outside the map
        // Ensure we don't try to show area beyond the map boundaries
        const maxCamX = Math.max(0, MAP_W - visibleWidth);
        const maxCamY = Math.max(0, MAP_H - visibleHeight);
        camX = Math.max(0, Math.min(maxCamX, camX));
        camY = Math.max(0, Math.min(maxCamY, camY));

        // Apply camera transform
        scene.style.transformOrigin = '0 0';
        scene.style.transform = `scale(${currentZoom}) translate(${-camX}px, ${-camY}px)`;
    }

    // WASD movement
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (!['w', 'a', 's', 'd'].includes(key)) return;

        keysDown[key] = true;

        if (key !== girlDirection) {
            girlDirection = key;
            setupImg(girlImg, girlSprites[key]);
        }

        if (!girlMoving) {
            girlMoving = true;
            girlAnimInterval = startAnimation(girlImg);
        }
    });

    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (!['w', 'a', 's', 'd'].includes(key)) return;

        delete keysDown[key];

        if (Object.keys(keysDown).length === 0) {
            girlMoving = false;
            stopAnimation(girlImg, girlAnimInterval);
            girlAnimInterval = null;
        } else {
            const remaining = Object.keys(keysDown)[0];
            if (remaining !== girlDirection) {
                girlDirection = remaining;
                setupImg(girlImg, girlSprites[remaining]);
                if (girlAnimInterval) clearInterval(girlAnimInterval);
                girlAnimInterval = startAnimation(girlImg);
            }
        }
    });

    // Mobile Touch Controls
    if (isMobile) {
        const mobileControls = document.getElementById('mobileControls');
        const joystickContainer = document.getElementById('joystickContainer');
        const joystickStick = document.getElementById('joystickStick');
        const interactButton = document.getElementById('interactButton');

        mobileControls.style.display = 'block';

        let joystickActive = false;
        let joystickStartX = 0;
        let joystickStartY = 0;
        let joystickDeltaX = 0;
        let joystickDeltaY = 0;

        // Joystick touch handling
        joystickContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            joystickActive = true;
            const touch = e.touches[0];
            const rect = joystickContainer.getBoundingClientRect();
            joystickStartX = rect.left + rect.width / 2;
            joystickStartY = rect.top + rect.height / 2;
        });

        let lastJoystickDirection = null;

        joystickContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!joystickActive) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - joystickStartX;
            const deltaY = touch.clientY - joystickStartY;

            // Limit joystick movement to base radius
            const baseRadius = isIPad ? 75 : 60;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const clampedDistance = Math.min(distance, baseRadius);

            if (distance > 0) {
                joystickDeltaX = (deltaX / distance) * clampedDistance;
                joystickDeltaY = (deltaY / distance) * clampedDistance;
            }

            // Move the stick visually
            joystickStick.style.left = `calc(50% + ${joystickDeltaX}px)`;
            joystickStick.style.top = `calc(50% + ${joystickDeltaY}px)`;

            // Update movement keys based on joystick direction
            const deadzone = 10;
            keysDown = {};

            if (Math.abs(joystickDeltaX) > deadzone || Math.abs(joystickDeltaY) > deadzone) {
                // Determine new direction
                let newDirection;
                if (Math.abs(joystickDeltaX) > Math.abs(joystickDeltaY)) {
                    // Horizontal movement dominant
                    if (joystickDeltaX > deadzone) {
                        newDirection = 'd';
                    } else if (joystickDeltaX < -deadzone) {
                        newDirection = 'a';
                    }
                } else {
                    // Vertical movement dominant
                    if (joystickDeltaY > deadzone) {
                        newDirection = 's';
                    } else if (joystickDeltaY < -deadzone) {
                        newDirection = 'w';
                    }
                }

                if (newDirection) {
                    keysDown[newDirection] = true;

                    // Only update sprite and animation if direction changed
                    if (newDirection !== lastJoystickDirection) {
                        girlDirection = newDirection;
                        lastJoystickDirection = newDirection;

                        if (girlAnimInterval) clearInterval(girlAnimInterval);
                        setupImg(girlImg, girlSprites[girlDirection]);
                        girlAnimInterval = startAnimation(girlImg);
                    }

                    // Ensure girlMoving is always true while joystick is active
                    girlMoving = true;
                }
            }
        });

        const endJoystick = () => {
            joystickActive = false;
            joystickDeltaX = 0;
            joystickDeltaY = 0;
            joystickStick.style.left = '50%';
            joystickStick.style.top = '50%';
            keysDown = {};
            girlMoving = false;
            lastJoystickDirection = null;
            stopAnimation(girlImg, girlAnimInterval);
            girlAnimInterval = null;
        };

        joystickContainer.addEventListener('touchend', endJoystick);
        joystickContainer.addEventListener('touchcancel', endJoystick);

        // Interact button handling
        interactButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (nearBoy && !proposalStarted) {
                proposalStarted = true;
                interactPrompt.style.display = 'none';

                // Stop boy movement
                boyIsWalking = false;
                if (boyAnimInterval) clearInterval(boyAnimInterval);
                boyAnimInterval = null;
                lastIdleDir = null;

                showProposalDialogue();
            }
        });

        // Update interact button state based on proximity
        setInterval(() => {
            if (nearBoy && !proposalStarted) {
                interactButton.classList.remove('disabled');
            } else {
                interactButton.classList.add('disabled');
            }
        }, 100);
    }

    // Collision detection
    function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    // Walkable area bounds
    let BOUNDS = {
        minX: MAP_W * 0.05,
        maxX: MAP_W * 0.95,
        minY: MAP_H * 0.05,
        maxY: MAP_H * 0.95
    };

    function updateBounds() {
        if (isMobile) {
            // Mobile: slightly adjusted bounds for better gameplay area
            BOUNDS.minX = MAP_W * 0.10;
            BOUNDS.maxX = MAP_W * 0.90;
            BOUNDS.minY = MAP_H * 0.10;
            BOUNDS.maxY = MAP_H * 0.90;
        } else {
            BOUNDS.minX = MAP_W * 0.05;
            BOUNDS.maxX = MAP_W * 0.95;
            BOUNDS.minY = MAP_H * 0.05;
            BOUNDS.maxY = MAP_H * 0.95;
        }
    }


    function checkWorldCollision(px, py) {
        const padding = 180;
        const playerX = px + padding;
        const playerY = py + padding;
        const playerW = DISPLAY_W - padding * 2;
        const playerH = DISPLAY_H - padding * 2;

        // Map edge bounds (sky, trees, border)
        if (playerX < BOUNDS.minX || playerX + playerW > BOUNDS.maxX ||
            playerY < BOUNDS.minY || playerY + playerH > BOUNDS.maxY) {
            return true;
        }

        // Boy
        if (rectsOverlap(playerX, playerY, playerW, playerH,
            boyX + 180, boyY + 180, DISPLAY_W - 360, DISPLAY_H - 360)) {
            return true;
        }

        return false;
    }

    // Handle window resize to fix camera glitch when opening/closing inspect
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Force camera update to prevent showing outside map
            updateCamera();

            // Ensure characters are within bounds after resize
            girlX = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX - DISPLAY_W, girlX));
            girlY = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY - DISPLAY_H, girlY));
            boyX = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX - DISPLAY_W, boyX));
            boyY = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY - DISPLAY_H, boyY));

            girl.style.left = girlX + 'px';
            girl.style.top = girlY + 'px';
            boy.style.left = boyX + 'px';
            boy.style.top = boyY + 'px';
        }, 100);
    });

    // Game loop
    function gameLoop() {
        // Wait for map initialization before running game logic
        if (!mapInitialized) {
            requestAnimationFrame(gameLoop);
            return;
        }

        let newX = girlX;
        let newY = girlY;

        if (keysDown['w']) newY -= MOVE_SPEED;
        if (keysDown['s']) newY += MOVE_SPEED;
        if (keysDown['a']) newX -= MOVE_SPEED;
        if (keysDown['d']) newX += MOVE_SPEED;

        // Collision (includes map edge bounds)
        if (!checkWorldCollision(newX, newY)) {
            girlX = newX;
            girlY = newY;
        } else {
            if (!checkWorldCollision(newX, girlY)) girlX = newX;
            if (!checkWorldCollision(girlX, newY)) girlY = newY;
        }

        girl.style.left = girlX + 'px';
        girl.style.top = girlY + 'px';

        updateBoy();
        updateHomingHearts();
        checkProximity();
        updateCamera();
        if (!videoPlaying) tryPlayVideo();
        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);

    // E-to-interact system
    let proposalStarted = false;
    let nearBoy = false;

    // Create interact prompt on the boy
    const interactPrompt = document.createElement('div');
    interactPrompt.className = 'interact-prompt';
    interactPrompt.textContent = 'Press E';
    interactPrompt.style.display = 'none';
    boy.appendChild(interactPrompt);

    function getDistance(x1, y1, x2, y2) {
        const dx = (x1 + DISPLAY_W / 2) - (x2 + DISPLAY_W / 2);
        const dy = (y1 + DISPLAY_H / 2) - (y2 + DISPLAY_H / 2);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function checkProximity() {
        const dist = getDistance(girlX, girlY, boyX, boyY);
        nearBoy = dist < INTERACT_DISTANCE;
        interactPrompt.style.display = (nearBoy && !proposalStarted) ? 'block' : 'none';
    }

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'e' && nearBoy && !proposalStarted) {
            proposalStarted = true;
            interactPrompt.style.display = 'none';

            // Stop boy movement
            boyIsWalking = false;
            if (boyAnimInterval) clearInterval(boyAnimInterval);
            boyAnimInterval = null;
            lastIdleDir = null;

            showProposalDialogue();
        }
    });

    // Blip sound effects for typing
    const blipSounds = [
        new Audio('assets/audio/blip-high.wav'),
        new Audio('assets/audio/blip-medium.wav'),
        new Audio('assets/audio/blip-low.wav')
    ];
    blipSounds.forEach(s => { s.volume = 0.3; });

    function playBlip() {
        const sound = blipSounds[Math.floor(Math.random() * blipSounds.length)];
        sound.currentTime = 0;
        sound.play().catch(() => {});
    }

    function typeText(message, onDone) {
        let charIndex = 0;
        dialogueText.textContent = '';
        dialogueChoices.style.display = 'none';

        const typeInterval = setInterval(() => {
            if (charIndex < message.length) {
                dialogueText.textContent += message[charIndex];
                if (message[charIndex] !== ' ') playBlip();
                charIndex++;
            } else {
                clearInterval(typeInterval);
                if (onDone) setTimeout(onDone, 500);
            }
        }, 50);
    }

    function showProposalDialogue() {
        dialogueBox.style.display = 'block';
        typeText("Hey... I've been wanting to ask you something important. Will you be my Valentine?", () => {
            dialogueChoices.style.display = 'flex';
            noBtn.style.position = '';
            noBtn.style.left = '';
            noBtn.style.top = '';
            noBtn.style.zIndex = '';
            noBtn.textContent = 'No...';
        });
    }

    yesBtn.addEventListener('click', () => {
        dialogueBox.style.display = 'none';
        celebrate();
    });

    let noAttempts = 0;
    const noDialogues = [
        "Are you sure? Think about it again...",
        "Really? But I practiced this speech all week...",
        "Come on, I even made this whole game for you!",
        "My heart can't take another no... please?",
        "I'll ask again... Will you be my Valentine?",
        "You can't say no forever! Just say yes already!",
    ];

    function handleNo() {
        const btn = document.getElementById('noBtn');
        if (noAttempts >= noDialogues.length) {
            if (btn) btn.remove();
            typeText("Oh no, code corrupted... The 'No' button has been deleted. Guess you have to say yes!", () => {
                dialogueChoices.style.display = 'flex';
            });
            return;
        }
        const msg = noDialogues[noAttempts];
        noAttempts++;
        typeText(msg, () => {
            dialogueChoices.style.display = 'flex';
        });
    }

    noBtn.addEventListener('click', handleNo);

    function celebrate() {
        for (let i = 0; i < 50; i++) {
            setTimeout(() => createHeart(), i * 100);
        }

        boy.style.animation = 'bounce 0.5s ease-in-out infinite';
        girl.style.animation = 'bounce 0.5s ease-in-out infinite 0.25s';

        setTimeout(() => {
            const celebration = document.createElement('div');
            celebration.className = 'celebration';
            celebration.innerHTML = `
                <img src="assets/images/ending.png" alt="Happy couple" class="celebration-bg">
                <div class="celebration-content">
                    <h1>Guess I have to get you a Valentine's Day gift now.</h1>
                    <p>I love you Venice, you're my everything. Kiss Kiss. Thank you for being my Valentine's!</p>
                    <p style="margin-top: 20px;">Love, Josh</p>
                    <button class="restart-btn" id="restartBtn">Play Again?</button>
                </div>
            `;
            document.body.appendChild(celebration);
            document.getElementById('restartBtn').addEventListener('click', restartGame);
        }, 1500);
    }

    function restartGame() {
        // Remove celebration overlay
        const celebration = document.querySelector('.celebration');
        if (celebration) celebration.remove();

        // Clear all floating hearts
        heartsContainer.innerHTML = '';

        // Remove homing hearts from the scene
        homingHearts.forEach(h => h.el.remove());
        homingHearts.length = 0;

        // Reset dialogue state
        dialogueBox.style.display = 'none';
        dialogueChoices.style.display = 'none';
        proposalStarted = false;
        nearBoy = false;
        noAttempts = 0;

        // Re-add the No button if it was removed
        if (!document.getElementById('noBtn')) {
            const newNoBtn = document.createElement('button');
            newNoBtn.className = 'choice-btn';
            newNoBtn.id = 'noBtn';
            newNoBtn.textContent = 'No...';
            dialogueChoices.appendChild(newNoBtn);
            newNoBtn.addEventListener('click', handleNo);
        }

        // Reset character positions
        girlX = MAP_W * 0.52;
        girlY = MAP_H * 0.45;
        boyX = MAP_W * 0.42;
        boyY = MAP_H * 0.45;
        girl.style.left = girlX + 'px';
        girl.style.top = girlY + 'px';
        boy.style.left = boyX + 'px';
        boy.style.top = boyY + 'px';

        // Reset animations
        boy.style.animation = '';
        girl.style.animation = '';

        // Reset boy state
        boyIsWalking = false;
        boyDir = 's';
        if (boyAnimInterval) clearInterval(boyAnimInterval);
        boyAnimInterval = null;
        lastIdleDir = null;
        boyImg.style.transform = '';
        boyImg.style.objectFit = '';
        if (boyReady) setupSingleImg(boyImg, boySprites.idle);

        // Reset heart cooldown
        scheduleNextHeart(true);
    }

    // Pre-process heart image to remove background
    let cleanHeartSrc = 'assets/images/heart.png';
    removeSpriteBg('assets/images/heart.png').then(src => { cleanHeartSrc = src; });

    // Boy shoots homing hearts at the girl
    const HEART_SPEED = 1.0;
    const HEART_CLOSE = 15;
    const homingHearts = [];
    let heartCooldown = 0;

    function scheduleNextHeart(first) {
        if (first) {
            heartCooldown = Date.now() + 3000;
        } else {
            heartCooldown = Date.now() + Math.random() * 5000;
        }
    }
    scheduleNextHeart(true);

    function shootHomingHeart() {
        const el = document.createElement('img');
        el.className = 'homing-heart';
        el.src = cleanHeartSrc;
        scene.appendChild(el);
        homingHearts.push({
            el,
            x: boyX + DISPLAY_W / 2,
            y: boyY,
            born: Date.now()
        });
        scheduleNextHeart();
    }

    function updateHomingHearts() {
        // Shoot if cooldown passed and boy is close enough
        if (!proposalStarted && Date.now() > heartCooldown) {
            const dx = girlX - boyX;
            const dy = girlY - boyY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < BOY_STOP_DIST + 200) {
                shootHomingHeart();
            }
        }

        for (let i = homingHearts.length - 1; i >= 0; i--) {
            const h = homingHearts[i];
            const targetX = girlX + DISPLAY_W / 2;
            const targetY = girlY;
            const dx = targetX - h.x;
            const dy = targetY - h.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < HEART_CLOSE || Date.now() - h.born > 8000) {
                h.el.remove();
                homingHearts.splice(i, 1);
                continue;
            }

            // Move toward girl
            h.x += (dx / dist) * HEART_SPEED;
            h.y += (dy / dist) * HEART_SPEED;

            // Bob up and down with sine wave
            const bob = Math.sin(Date.now() / 200) * 12;

            h.el.style.left = h.x + 'px';
            h.el.style.top = (h.y + bob) + 'px';
        }
    }

    function createHeart() {
        const heart = document.createElement('div');
        heart.className = 'heart';
        heart.textContent = '❤️';
        heart.style.left = Math.random() * 100 + '%';
        heart.style.top = '100%';
        heartsContainer.appendChild(heart);
        setTimeout(() => heart.remove(), 3000);
    }
});

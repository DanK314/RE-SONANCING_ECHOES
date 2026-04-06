const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const audioInput = document.getElementById('audioFile');
const startBtn = document.getElementById('startBtn');

const titleScreen = document.getElementById('title-screen');
const trackSelect = document.getElementById('trackSelect');
const localFileContainer = document.getElementById('localFileContainer');
const controlsInfo = document.getElementById('controlsInfo');

const leftSensSlider = document.getElementById('leftSens');
const rightSensSlider = document.getElementById('rightSens');
const leftValText = document.getElementById('leftVal');
const rightValText = document.getElementById('rightVal');

// 파티클 토글 설정
const particleToggle = document.getElementById('particleToggle');
let enableParticles = true;

let score = 0;
const maxHp = 100;
let hp = maxHp;

let balls = [];
let messages = [];
let particles = [];

let gameState = 'title';

const hitCenterY = 540; 
const hitLeftX = 120;
const hitRightX = 280;
// 🚨 센터 노트 X좌표 추가 (400의 절반)
const hitCenterX = 200; 
const travelTime = 1.0; 
const ballSpeed = (hitCenterY - 0) / travelTime;

let audioCtx, analyser, delayNode, source;
let isPlaying = false;

let prevLowVol = 0;
let leftCooldown = 0;
let lowSpikeThreshold = parseInt(leftSensSlider.value); 
const minLowVol = 180;        

let prevHighVol = 0;
let rightCooldown = 0;
let highSpikeThreshold = parseInt(rightSensSlider.value); 
const minHighVol = 100;        

const Cooldown = 0.05;

let leftZoneFlash = 0;
let rightZoneFlash = 0;
// 🚨 센터 타겟 플래시 효과 추가
let centerZoneFlash = 0; 
let lastTime = 0;

const HitSound = new Audio("HitSound.wav");

trackSelect.addEventListener('change', (e) => {
    if (e.target.value === 'local') {
        localFileContainer.classList.remove('hidden');
    } else {
        localFileContainer.classList.add('hidden');
    }
});

leftSensSlider.addEventListener('input', (e) => {
    lowSpikeThreshold = parseInt(e.target.value);
    leftValText.innerText = lowSpikeThreshold;
});

rightSensSlider.addEventListener('input', (e) => {
    highSpikeThreshold = parseInt(e.target.value);
    rightValText.innerText = highSpikeThreshold;
});

if (particleToggle) {
    particleToggle.addEventListener('change', (e) => {
        enableParticles = e.target.checked;
    });
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 150 + 50; 
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0; 
        this.size = Math.random() * 4 + 2; 
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 200 * dt; 
        this.life -= dt * 2; 
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function spawnParticles(x, y, color, count) {
    if (!enableParticles) return; 
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

class Ball {
    constructor(side) {
        this.side = side;
        // 🚨 떨어지는 노트의 위치와 색상을 3가지로 분류
        if (side === 'left') {
            this.x = hitLeftX;
            this.color = '#00ffff';
        } else if (side === 'right') {
            this.x = hitRightX;
            this.color = '#ff00ff';
        } else if (side === 'center') {
            this.x = hitCenterX;
            this.color = '#ffd700'; // 황금색!
        }
        
        this.y = -20;
        this.radius = 12;
        this.history = []; 
    }
    update(dt) {
        this.history.push({x: this.x, y: this.y});
        if (this.history.length > 12) this.history.shift();
        this.y += ballSpeed * dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        if (enableParticles) {
            for (let i = 0; i < this.history.length; i++) {
                let pos = this.history[i];
                let ratio = i / this.history.length;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, this.radius * ratio, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = ratio * 0.5;
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.color;
        ctx.stroke();
        ctx.restore();
    }
}

class Message {
    constructor(text, color) {
        this.text = text;
        this.color = color;
        this.y = 300; 
        this.alpha = 1; 
    }
    update(dt) {
        this.y -= 60 * dt; 
        this.alpha -= 1.2 * dt; 
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.font = '50px "VT323"';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, canvas.width / 2, this.y);
        ctx.restore();
    }
}

function spawnBall(side) {
    balls.push(new Ball(side));
}

function returnToTitle() {
    canvas.classList.add('hidden');
    controlsInfo.classList.add('hidden');
    titleScreen.classList.remove('hidden');
    gameState = 'title';
}

function checkGameOver() {
    if (hp <= 0 && gameState === 'playing') {
        hp = 0;
        gameState = 'gameover';
        isPlaying = false;
        if (source) {
            try { source.stop(); } catch(e) {} 
        }
        
        drawEndScreen();
        messages = [];
        setTimeout(returnToTitle, 3000);
    }
}

function playAudioBuffer(buffer) {
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(delayNode);
    delayNode.connect(audioCtx.destination);
    
    source.onended = () => {
        if (gameState === 'playing') {
            setTimeout(() => {
                gameState = 'ended'; 
                isPlaying = false;
                drawEndScreen();
                setTimeout(returnToTitle, 3000); 
            }, travelTime * 1000);
        }
    };

    source.start(0);
    isPlaying = true;
    gameState = 'playing';
    
    score = 0;
    hp = maxHp; 
    balls = [];
    messages = [];
    particles = []; 
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', async () => {
    titleScreen.classList.add('hidden');
    canvas.classList.remove('hidden');
    controlsInfo.classList.remove('hidden');

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; 
    delayNode = audioCtx.createDelay(2.0); 
    delayNode.delayTime.value = travelTime; 

    const selectedValue = trackSelect.value;

    if (selectedValue === 'local') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ffff';
        ctx.font = '30px "VT323"';
        ctx.textAlign = 'center';
        ctx.fillText('LOADING TRACK...', canvas.width / 2, canvas.height / 2);
        if (!audioInput.files[0]) {
            alert('로컬 파일을 선택해주세요!');
            returnToTitle();
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            audioCtx.decodeAudioData(e.target.result, playAudioBuffer);
        };
        reader.readAsArrayBuffer(audioInput.files[0]);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ffff';
        ctx.font = '30px "VT323"';
        ctx.textAlign = 'center';
        ctx.fillText('LOADING TRACK...', canvas.width / 2, canvas.height / 2);

        try {
            const response = await fetch(selectedValue);
            if (!response.ok) throw new Error("Network error");
            const arrayBuffer = await response.arrayBuffer();
            audioCtx.decodeAudioData(arrayBuffer, playAudioBuffer);
        } catch (error) {
            alert('기본 곡을 불러올 수 없습니다. \n(파일이 없거나 로컬 서버 환경이 아닙니다.)\n로컬 파일 업로드를 이용해주세요.');
            returnToTitle();
        }
    }
});

function analyzeAudio(dt) {
    if (!isPlaying || gameState !== 'playing') return;
    
    if (leftCooldown > 0) leftCooldown -= dt;
    if (rightCooldown > 0) rightCooldown -= dt;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    let lowSum = 0;
    for(let i = 0; i < 5; i++) lowSum += dataArray[i];
    let currentLowVol = lowSum / 5;
    let lowSpike = currentLowVol - prevLowVol;
    prevLowVol = currentLowVol;

    let currentMidVol = 0;
    let maxIndex = 100;
    for(let i = 7; i < maxIndex; i++) { 
        if (dataArray[i] > currentMidVol) {
            currentMidVol = dataArray[i];
        }
    }
    let midSpike = currentMidVol - prevHighVol;
    prevHighVol = currentMidVol;

    // 🚨 스폰 판정 로직 분리
    let spawnLeft = (lowSpike > lowSpikeThreshold && currentLowVol > minLowVol && leftCooldown <= 0);
    let spawnRight = (midSpike > highSpikeThreshold && currentMidVol > (minHighVol - 50) && rightCooldown <= 0);

    // 🚨 왼쪽 쿵! 오른쪽 짝! 이 동시에 들어오면 황금색 센터 노트를 소환!
    if (spawnLeft && spawnRight) {
        spawnBall('center');
        leftCooldown = Cooldown; 
        rightCooldown = Cooldown;
    } else if (spawnLeft) {
        spawnBall('left');
        leftCooldown = Cooldown; 
    } else if (spawnRight) {
        spawnBall('right');
        rightCooldown = Cooldown; 
    }
}

function drawBackground() {
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for(let i=0; i<canvas.height; i+=40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    ctx.setLineDash([5, 15]);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    ctx.beginPath(); ctx.moveTo(hitLeftX, 0); ctx.lineTo(hitLeftX, canvas.height); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.beginPath(); ctx.moveTo(hitRightX, 0); ctx.lineTo(hitRightX, canvas.height); ctx.stroke();
    
    // 🚨 센터 라인 그리기
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.beginPath(); ctx.moveTo(hitCenterX, 0); ctx.lineTo(hitCenterX, canvas.height); ctx.stroke();
    ctx.setLineDash([]);

    // 🚨 타겟 라인 그리기 (센터 포함)
    drawTarget(hitLeftX, '#00ffff', leftZoneFlash);
    drawTarget(hitRightX, '#ff00ff', rightZoneFlash);
    drawTarget(hitCenterX, '#ffd700', centerZoneFlash);
}

function drawVisualizer() {
    if (!analyser || gameState !== 'playing') return;
    if (!enableParticles) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    ctx.save();
    ctx.globalAlpha = 0.2; 

    const visualBins = 60; 
    const centerY = canvas.height / 2; 
    const centerX = canvas.width / 2;  
    
    const barHeight = canvas.height / visualBins;

    for (let i = 0; i < visualBins; i++) {
        const barWidth = (dataArray[i] / 255) * (canvas.width * 0.4);
        
        const gradient = ctx.createLinearGradient(centerX - barWidth, 0, centerX + barWidth, 0);
        gradient.addColorStop(0, '#ff00ff'); 
        gradient.addColorStop(0.5, '#ffffff'); 
        gradient.addColorStop(1, '#00ffff'); 
        ctx.fillStyle = gradient;

        const yPos = i * barHeight;

        ctx.fillRect(centerX - barWidth, yPos, barWidth, barHeight - 1);
        ctx.fillRect(centerX, yPos, barWidth, barHeight - 1);
    }
    
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

function drawTarget(x, color, flash) {
    ctx.save();
    ctx.shadowBlur = flash > 0 ? 30 : 10;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = flash > 0 ? 5 : 2;
    
    ctx.strokeRect(x - 25, hitCenterY - 15, 50, 30);
    if (flash > 0) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x - 25, hitCenterY - 15, 50, 30);
    }
    ctx.restore();
}

function drawEndScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.textAlign = 'center';
    
    let title = gameState === 'gameover' ? 'TRACK FAILED' : 'TRACK FINISHED';
    let titleColor = gameState === 'gameover' ? '#ff0000' : '#00ffff';

    ctx.shadowBlur = 20;
    ctx.shadowColor = titleColor;
    ctx.fillStyle = titleColor;
    ctx.font = '50px "VT323"';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 40);

    ctx.shadowColor = '#ff00ff';
    ctx.fillStyle = '#ff00ff';
    ctx.font = '40px "VT323"';
    ctx.fillText(`FINAL SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '24px "VT323"';
    ctx.fillText('Returning to Title...', canvas.width / 2, canvas.height / 2 + 80);
    
    ctx.restore();
}

function drawUI() {
    ctx.save();
    
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffff';
    ctx.fillStyle = '#00ffff';
    ctx.font = '30px "VT323"';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${score}`, 20, 40);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.fillRect(20, 50, 200, 15);
    
    let hpRatio = Math.max(0, hp / maxHp);
    ctx.fillStyle = hpRatio > 0.3 ? '#00ff00' : '#ff0000';
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(20, 50, 200 * hpRatio, 15);
    
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.font = '16px "VT323"';
    ctx.textAlign = 'center';
    ctx.fillText(`HP: ${Math.floor(hp)}%`, 120, 62);

    ctx.restore();
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000; 
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (gameState === 'ended' || gameState === 'gameover') {
        drawBackground();
        drawEndScreen();
        return; 
    }

    drawBackground();
    drawVisualizer();

    if (leftZoneFlash > 0) leftZoneFlash -= dt * 8;
    if (rightZoneFlash > 0) rightZoneFlash -= dt * 8;
    // 🚨 센터 타겟 플래시 페이드아웃
    if (centerZoneFlash > 0) centerZoneFlash -= dt * 8;

    analyzeAudio(dt);

    for (let i = balls.length - 1; i >= 0; i--) {
        let ball = balls[i];
        ball.update(dt);
        ball.draw(ctx);

        if (ball.y > hitCenterY + 40) {
            balls.splice(i, 1);
            messages.push(new Message('MISS', '#ff0000'));
            score = Math.max(0, score - 5);
            hp -= 10; 
            checkGameOver();
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.update(dt);
        p.draw(ctx);
        if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = messages.length - 1; i >= 0; i--) {
        let msg = messages[i];
        msg.update(dt);
        msg.draw(ctx);
        if (msg.alpha <= 0) messages.splice(i, 1);
    }

    drawUI();

    if (gameState === 'playing') {
        requestAnimationFrame(gameLoop);
    }
}

function handleInput(side) {
    if (gameState !== 'playing') return;

    // 🚨 입력에 따른 각 구역 플래시 설정
    if (side === 'left') leftZoneFlash = 1;
    else if (side === 'right') rightZoneFlash = 1;
    else if (side === 'center') centerZoneFlash = 1;

    let targetX = side === 'left' ? hitLeftX : (side === 'right' ? hitRightX : hitCenterX);
    let bestBallIndex = -1;
    let minDistanceY = 999;

    // 🚨 요청한 사이드(왼/중/오른)와 똑같은 노트만 찾아서 판정!
    for (let i = 0; i < balls.length; i++) {
        if (balls[i].side === side) {
            let distY = Math.abs(balls[i].y - hitCenterY);
            if (distY < minDistanceY) {
                minDistanceY = distY;
                bestBallIndex = i;
            }
        }
    }

    if (bestBallIndex !== -1) {
        let hitColor = balls[bestBallIndex].color; 

        if (minDistanceY <= 25) {
            messages.push(new Message('PERFECT', '#ffffff'));
            // 황금 노트를 맞추면 점수를 1.5배로 줄 수도 있습니다! (현재는 동일하게 10점)
            score += 10;
            hp = Math.min(maxHp, hp + 3); 
            spawnParticles(targetX, balls[bestBallIndex].y, hitColor, 15);
            balls.splice(bestBallIndex, 1);
            try { HitSound.cloneNode(true).play(); } catch(e){}
        } else if (minDistanceY <= 70) {
            messages.push(new Message('GOOD', '#ffff00'));
            score += 5;
            hp = Math.min(maxHp, hp + 1); 
            spawnParticles(targetX, balls[bestBallIndex].y, hitColor, 8);
            balls.splice(bestBallIndex, 1);
            try { HitSound.cloneNode(true).play(); } catch(e){}
        } else if (minDistanceY <= 100) {
            messages.push(new Message('BAD', '#ff8800'));
            score = Math.max(0, score - 2);
            hp -= 1; 
            balls.splice(bestBallIndex, 1);
            checkGameOver();
        } else {
            hp -= 1;
            checkGameOver();
        }
    } else {
        hp -= 1;
        checkGameOver();
    }
}

// 🚨 키보드 이벤트 (스페이스바 누르면 'center' 이벤트 실행)
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    if (key === ' ' || e.code === 'Space') {
        e.preventDefault(); 
        handleInput('center'); // 진짜 황금 노트 타격 판정!
    } else if (['a', 's', 'd'].includes(key)) {
        handleInput('left');
    } else if (['j', 'k', 'l'].includes(key)) {
        handleInput('right');
    }
});

// 📱 반응형 모바일 터치 지원 (화면 3분할: 좌 / 중앙 / 우)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    
    const screenWidth = window.innerWidth;
    const thirdOfScreen = screenWidth / 3;

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        
        if (touch.clientX < thirdOfScreen) {
            handleInput('left');
        } else if (touch.clientX > thirdOfScreen * 2) {
            handleInput('right');
        } else {
            handleInput('center'); // 중앙 터치 시 황금 노트 타격 판정!
        }
    }
}, { passive: false });
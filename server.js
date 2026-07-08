const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { chromium } = require('playwright');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ========== ROTA PRINCIPAL ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== ROTA DA API ==========
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message } = req.body;
        console.log(`📩 Comando recebido (${message.length} caracteres)`);
        const resultado = await processarComando(message);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.json({ text: `❌ Erro: ${error.message}`, type: 'error' });
    }
});

// Garante que a pasta para os sites gerados existe dentro da pasta pública para conseguires aceder pelo URL
const SITES_DIR = path.join(__dirname, 'public', 'sites');
fs.ensureDirSync(SITES_DIR);

// ============================================
// 1. CRIAR SITE VIA TEXTO/COMANDO (MÉTODO ANTHOST COPIADO)
// ============================================
app.post('/api/sites/criar', async (req, res) => {
    try {
        const { nome, htmlCodigo } = req.body;
        if (!nome || !htmlCodigo) {
            return res.json({ success: false, text: "Faltam parâmetros para criar o site." });
        }

        const nomeLimpo = nome.trim().replace(/\s+/g, '-').toLowerCase();
        const filename = `site_${nomeLimpo}_${Date.now()}.html`;
        
        // Guarda o ficheiro HTML diretamente na pasta public/sites para acesso imediato
        await fs.writeFile(path.join(SITES_DIR, filename), htmlCodigo);

        res.json({
            success: true,
            text: `⚡ <strong>Site criado com sucesso!</strong><br><br>🔗 Link gerado: <a href="/sites/${filename}" target="_blank">Abrir ${nomeLimpo}</a>`,
            url: `/sites/${filename}`
        });
    } catch (error) {
        res.json({ success: false, text: `❌ Erro ao criar site: ${error.message}` });
    }
});

// ============================================
// MOTOR ANTHOST ENGINE - HOSPEDAGEM INSTANTÂNEA
// ============================================

// 1. ROTA DE UPLOAD DO ANTHOST (MÉTODO ULTRA REFORÇADO)
app.post('/api/sites/upload', upload.single('html'), async (req, res) => {
    try {
        if (!req.file) {
            console.log("❌ Tentativa de upload sem arquivo.");
            return res.json({ success: false, text: "Nenhum ficheiro foi enviado." });
        }

        // Pega o caminho temporário criado pelo Multer
        const caminhoTemporario = req.file.path;

        // Limpa o nome original para evitar espaços e caracteres especiais
        const nomeOriginalLimpo = req.file.originalname.replace(/\s+/g, '-').toLowerCase();
        
        // Define o nome final do site hospedado
        const filename = `site_${Date.now()}_${nomeOriginalLimpo}`;
        const caminhoDestino = path.join(SITES_DIR, filename);

        console.log(`⏳ Movendo arquivo de: ${caminhoTemporario} para: ${caminhoDestino}`);

        // Lê o conteúdo do arquivo temporário e escreve direto na pasta pública (Garante 100% que funciona, evita erros de permissão do fs.move)
        const conteudoHtml = await fs.readFile(caminhoTemporario);
        await fs.writeFile(caminhoDestino, conteudoHtml);

        // Remove o arquivo temporário que o multer deixou na pasta 'uploads'
        await fs.remove(caminhoTemporario).catch(e => console.log("Aviso: Não foi possível apagar o temporário:", e.message));

        console.log(`✅ Site online: /sites/${filename}`);

        // Devolve exatamente o texto com o link HTML estruturado que o front-end vai renderizar
        res.json({
            success: true,
            text: `⚡ <strong>Site hospedado com sucesso no Anthost!</strong><br><br>🔗 Link de acesso: <a href="/sites/${filename}" target="_blank">Abrir site (/sites/${filename})</a>`,
            url: `/sites/${filename}`
        });

    } catch (error) {
        console.error('❌ Erro crítico no motor de upload:', error);
        res.json({ success: false, text: `❌ Erro no upload: ${error.message}` });
    }
});

// 2. CRIAR SITE VIA TEXTO/COMANDO (MANTIDO POR COMPATIBILIDADE)
app.post('/api/sites/criar', async (req, res) => {
    try {
        const { nome, htmlCodigo } = req.body;
        if (!nome || !htmlCodigo) {
            return res.json({ success: false, text: "Faltam parâmetros para criar o site." });
        }

        const nomeLimpo = nome.trim().replace(/\s+/g, '-').toLowerCase();
        const filename = `site_${nomeLimpo}_${Date.now()}.html`;
        
        await fs.writeFile(path.join(SITES_DIR, filename), htmlCodigo);

        res.json({
            success: true,
            text: `⚡ <strong>Site criado com sucesso!</strong><br><br>🔗 Link gerado: <a href="/sites/${filename}" target="_blank">Abrir ${nomeLimpo}</a>`,
            url: `/sites/${filename}`
        });
    } catch (error) {
        res.json({ success: false, text: `❌ Erro ao criar site: ${error.message}` });
    }
});

// ========== LISTAR SITES ==========
app.get('/api/sites/list', async (req, res) => {
    try {
        await fs.ensureDir('./public/sites');
        await fs.ensureDir('./public/apps');
        await fs.ensureDir('./public/uploads');
        
        const pastas = [
            { dir: './public/sites/', folder: 'sites', emoji: '📂' },
            { dir: './public/apps/', folder: 'apps', emoji: '📱' },
            { dir: './public/uploads/', folder: 'uploads', emoji: '📤' }
        ];
        
        let sites = [];
        
        for (const pasta of pastas) {
            if (fs.existsSync(pasta.dir)) {
                const files = await fs.readdir(pasta.dir);
                const htmlFiles = files.filter(f => f.endsWith('.html'));
                for (const f of htmlFiles) {
                    const stats = await fs.stat(path.join(pasta.dir, f));
                    sites.push({
                        name: `${pasta.emoji} ${f}`,
                        path: `/${pasta.folder}/${f}`,
                        folder: pasta.folder,
                        date: stats.mtimeMs
                    });
                }
            }
        }
        
        sites.sort((a, b) => b.date - a.date);
        res.json({ success: true, sites });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== ROTA PARA VÍDEOS ==========
app.get('/api/videos/:filename', (req, res) => {
    const filepath = path.join('./videos/', req.params.filename);
    if (fs.existsSync(filepath)) {
        res.sendFile(path.resolve(filepath));
    } else {
        res.status(404).json({ error: 'Vídeo não encontrado' });
    }
});

// ========== PROCESSADOR DE COMANDOS ==========
async function processarComando(message) {
    const lower = message.toLowerCase();
    
    // ===== AJUDA =====
    if (lower.includes('ajuda') || lower.includes('help')) {
        return {
            text: `🤖 <strong>COFFE IA - MODO LOVABLE</strong><br><br>
            🌐 <strong>criar site HTML :</strong> [SEU HTML] - Cria site com seu HTML<br>
            🌐 <strong>criar site</strong> [descrição] - Cria site bonito<br>
            🚀 <strong>criar app</strong> [descrição] - Cria app completo<br>
            🖼️ <strong>gerar imagem</strong> [descrição]<br>
            🎮 <strong>gamebot</strong> - Dino Chrome<br>
            🎬 <strong>videos</strong> - Lista vídeos<br>
            📤 <strong>Enviar HTML</strong> - Botão no topo<br><br>
            <strong>Exemplo:</strong><br>
            "criar site HTML : &lt;h1 style='color:red'&gt;MEU SITE&lt;/h1&gt;"`,
            type: 'text'
        };
    }
    
    // ===== CRIAR SITE =====
    if (lower.includes('criar site') || lower.includes('site')) {
        let conteudo = message.replace(/criar site|site/gi, '').trim();
        
        // VERIFICA SE TEM "HTML :" NO COMEÇO
        const htmlMatch = conteudo.match(/^html\s*:\s*/i);
        let isHtml = false;
        let htmlContent = '';
        
        if (htmlMatch) {
            // TEM "HTML :" - pega tudo depois
            isHtml = true;
            htmlContent = conteudo.replace(/^html\s*:\s*/i, '').trim();
        }
        
        // Se começa com < também é HTML
        if (!isHtml && conteudo.trim().startsWith('<')) {
            isHtml = true;
            htmlContent = conteudo.trim();
        }
        
        // Se não for HTML, usa descrição normal
        if (!isHtml) {
            try {
                await fs.ensureDir('./public/sites');
                const htmlFinal = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${conteudo}</title>
    <style>
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 30px; 
            background: #1a0f0d; 
            color: #d7ccc8;
        }
        h1 { color: #a67c52; font-size: 2.5em; }
        .container { 
            border: 2px solid #6f4e37; 
            border-radius: 15px; 
            padding: 40px; 
            background: #2b1b17;
        }
        .btn { 
            background: #6f4e37; 
            color: white; 
            padding: 12px 30px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 16px;
            transition: 0.3s;
        }
        .btn:hover { background: #8d6e63; transform: scale(1.02); }
        .data { color: #6f4e37; font-size: 14px; margin-top: 20px; }
        .emoji { font-size: 3em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">☕</div>
        <h1>${conteudo}</h1>
        <p>Site criado pela <strong>COFFE IA</strong> em ${new Date().toLocaleDateString('pt-BR')}</p>
        <p>✨ Este é um site personalizado para você!</p>
        <button class="btn" onclick="alert('Olá da COFFE IA! 🚀')">Clique aqui</button>
        <div class="data">📅 ${new Date().toLocaleString('pt-BR')}</div>
    </div>
</body>
</html>`;
                
                const nomeArquivo = `site_${conteudo.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${Date.now()}.html`;
                const filepath = `./public/sites/${nomeArquivo}`;
                await fs.writeFile(filepath, htmlFinal);
                
                const htmlPuro = htmlFinal.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                return {
                    text: `🌐 <strong>Site criado com sucesso!</strong><br><br>
                    📄 <strong>HTML PURO:</strong><br>
                    <div style="background:#1a0f0d;padding:15px;border-radius:8px;border:1px solid #6f4e37;margin:10px 0;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto;color:#d7ccc8;">${htmlPuro}</div>
                    🔗 <a href="/sites/${nomeArquivo}" target="_blank">Abrir Site</a>`,
                    type: 'text',
                    url: `/sites/${nomeArquivo}`
                };
                
            } catch (error) {
                return { text: `❌ Erro: ${error.message}`, type: 'error' };
            }
        }
        
        // ===== É HTML! Cria o site com o HTML do usuário =====
        try {
            console.log('📝 Criando site com HTML de', htmlContent.length, 'caracteres');
            
            await fs.ensureDir('./public/uploads');
            
            const nomeArquivo = `site_${Date.now()}.html`;
            const filepath = `./public/uploads/${nomeArquivo}`;
            
            // SALVA O HTML EXATAMENTE COMO VEIO
            let htmlFinal = htmlContent;
            
            // Se não tiver estrutura básica, adiciona
            if (!htmlContent.includes('<!DOCTYPE html>') && !htmlContent.includes('<html')) {
                htmlFinal = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site Criado</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #1a0f0d; 
            color: #d7ccc8;
        }
        * { box-sizing: border-box; }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;
            }
            
            // SALVA O ARQUIVO
            await fs.writeFile(filepath, htmlFinal);
            
            // VERIFICA SE SALVOU
            const saved = await fs.readFile(filepath, 'utf-8');
            console.log('✅ Arquivo salvo com', saved.length, 'caracteres');
            
            // Mostra o HTML puro (com escape)
            const htmlPuro = htmlFinal.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            return {
                text: `🌐 <strong>Site criado com seu HTML!</strong><br><br>
                📄 <strong>HTML PURO (${htmlFinal.length} caracteres):</strong><br>
                <div style="background:#1a0f0d;padding:15px;border-radius:8px;border:1px solid #6f4e37;margin:10px 0;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto;color:#d7ccc8;">${htmlPuro}</div>
                🔗 <a href="/uploads/${nomeArquivo}" target="_blank">Abrir Site</a>`,
                type: 'text',
                url: `/uploads/${nomeArquivo}`
            };
            
        } catch (error) {
            console.error('❌ Erro ao salvar HTML:', error);
            return { text: `❌ Erro ao criar site: ${error.message}`, type: 'error' };
        }
    }
    
    // ===== CRIAR APP =====
    if (lower.includes('criar app') || lower.includes('app de')) {
        const descricao = message.replace(/criar app|app de|criar aplicativo|aplicativo/gi, '').trim() || 'app';
        return await criarAppCompleto(descricao);
    }
    
    // ===== GERAR IMAGEM (GOOGLE IMAGES - MÉTODO QUE FUNCIONA) =====
if (lower.includes('imagem') || lower.includes('imagem de')) {
    const descricao = message.replace(/gerar imagem|imagem de|imagem|gerar/gi, '').trim() || 'paisagem';
    
    try {
        console.log(`🖼️ Buscando imagem no Google para: ${descricao}`);
        
        const navegador = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const pagina = await navegador.newPage();
        
        // Configura user agent
        await pagina.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        // Vai para o Google Images
        const url = `https://www.google.com/search?q=${encodeURIComponent(descricao)}&tbm=isch`;
        console.log(`🔗 Acessando: ${url}`);
        
        await pagina.goto(url, { waitUntil: 'networkidle' });
        await pagina.waitForTimeout(3000);
        
        // ===== ROLA A PÁGINA =====
        await pagina.evaluate(() => {
            window.scrollBy(0, 200);
        });
        await pagina.waitForTimeout(1000);
        
        // ===== CLICA NA PRIMEIRA IMAGEM =====
        try {
            // Procura qualquer imagem na página
            const imagens = await pagina.$$('img[data-src], img[src*="gstatic"], img[src*="encrypted"], img[src*="googleusercontent"]');
            
            if (imagens.length > 0) {
                console.log(`🖱️ Clicando na primeira imagem (${imagens.length} encontradas)`);
                await imagens[0].click();
                await pagina.waitForTimeout(2000);
                
                // Tenta achar a imagem ampliada
                const imgAmpliada = await pagina.$('img[class*="sFlh5"], img[class*="iPVvYb"], img[class*="rISBZc"]');
                
                await fs.ensureDir('./public/images');
                const filename = `imagem_${Date.now()}.png`;
                const filepath = `./public/images/${filename}`;
                
                if (imgAmpliada) {
                    // Tira print da imagem ampliada
                    await imgAmpliada.screenshot({ path: filepath });
                    console.log('✅ Print da imagem ampliada salvo!');
                } else {
                    // Tira print da tela
                    await pagina.screenshot({ path: filepath, fullPage: false });
                    console.log('📸 Print da tela salvo!');
                }
                
                await navegador.close();
                
                return {
                    text: `🖼️ <strong>Imagem encontrada!</strong><br><br>
                    📝 <strong>Descrição:</strong> "${descricao}"<br><br>
                    🔗 <a href="/images/${filename}" target="_blank">Ver imagem</a>`,
                    type: 'image',
                    data: `/images/${filename}`
                };
            }
        } catch (e) {
            console.log('❌ Erro:', e.message);
        }
        
        // ===== FALLBACK =====
        await fs.ensureDir('./public/images');
        const screenshotPath = `./public/images/imagem_${Date.now()}.png`;
        await pagina.screenshot({ path: screenshotPath, fullPage: false });
        await navegador.close();
        
        return {
            text: `🖼️ <strong>Imagem para:</strong> "${descricao}"<br><br>
            📸 <strong>Fonte:</strong> Google Images<br><br>
            🔗 <a href="/images/${path.basename(screenshotPath)}" target="_blank">Ver imagem</a>`,
            type: 'image',
            data: `/images/${path.basename(screenshotPath)}`
        };
        
    } catch (error) {
        console.error('❌ Erro:', error);
        return { 
            text: `❌ Erro: ${error.message}`,
            type: 'error' 
        };
    }
}
    
    // ===== GAME BOT =====
    if (lower.includes('gamebot') || lower.includes('game bot') || lower.includes('dino')) {
        return await executarGameBot();
    }
    
    // ===== VÍDEOS =====
    if (lower.includes('videos') || lower.includes('listar videos')) {
        return await listarVideos();
    }
    
    return {
        text: `✅ Comando: "${message}"<br>Digite "ajuda" para ver os comandos.`,
        type: 'text'
    };
}

// ============================================
// FUNÇÃO CRIAR APP
// ============================================
async function criarAppCompleto(descricao) {
    try {
        await fs.ensureDir('./public/apps');
        
        let appHtml = '';
        let appJs = '';
        let appCss = '';
        let nomeApp = 'app';
        
        if (descricao.includes('tarefa') || descricao.includes('todo') || descricao.includes('lista')) {
            nomeApp = 'lista_tarefas';
            appHtml = `
<div class="container">
    <h1>📋 Lista de Tarefas</h1>
    <div class="input-group">
        <input type="text" id="novaTarefa" placeholder="Digite uma tarefa...">
        <button onclick="adicionarTarefa()">+ Adicionar</button>
    </div>
    <ul id="listaTarefas"></ul>
    <div class="stats">
        <span id="totalTarefas">0</span> tarefas
    </div>
</div>`;
            appJs = `
let tarefas = [];

function adicionarTarefa() {
    const input = document.getElementById('novaTarefa');
    const texto = input.value.trim();
    if (!texto) return;
    
    tarefas.push({ id: Date.now(), texto, concluida: false });
    input.value = '';
    renderizarTarefas();
}

function toggleTarefa(id) {
    const tarefa = tarefas.find(t => t.id === id);
    if (tarefa) {
        tarefa.concluida = !tarefa.concluida;
        renderizarTarefas();
    }
}

function removerTarefa(id) {
    tarefas = tarefas.filter(t => t.id !== id);
    renderizarTarefas();
}

function renderizarTarefas() {
    const lista = document.getElementById('listaTarefas');
    lista.innerHTML = tarefas.map(t => \`
        <li class="\${t.concluida ? 'concluida' : ''}">
            <span onclick="toggleTarefa(\${t.id})">\${t.texto}</span>
            <button onclick="removerTarefa(\${t.id})">✕</button>
        </li>
    \`).join('');
    document.getElementById('totalTarefas').textContent = tarefas.length;
}

renderizarTarefas();`;
            appCss = `
body { font-family: Arial; background: #1a0f0d; color: #d7ccc8; display: flex; justify-content: center; padding: 50px; }
.container { background: #2b1b17; padding: 30px; border-radius: 15px; max-width: 500px; width: 100%; border: 2px solid #6f4e37; }
h1 { color: #a67c52; }
.input-group { display: flex; gap: 10px; margin-bottom: 20px; }
.input-group input { flex: 1; padding: 10px; border-radius: 8px; border: 2px solid #6f4e37; background: #fdfaf9; }
.input-group button { background: #6f4e37; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
ul { list-style: none; padding: 0; }
li { display: flex; justify-content: space-between; padding: 10px; background: #1a0f0d; margin: 5px 0; border-radius: 8px; border: 1px solid #6f4e37; }
li span { cursor: pointer; flex: 1; }
li.concluida span { text-decoration: line-through; color: #6f4e37; }
li button { background: #4e342e; color: white; border: none; border-radius: 5px; padding: 5px 10px; cursor: pointer; }
.stats { margin-top: 15px; color: #6f4e37; }`;
        } else if (descricao.includes('calculadora') || descricao.includes('calcular')) {
            nomeApp = 'calculadora';
            appHtml = `
<div class="container">
    <h1>🧮 Calculadora</h1>
    <div class="display" id="display">0</div>
    <div class="buttons">
        <button onclick="limpar()">C</button>
        <button onclick="apagar()">⌫</button>
        <button onclick="inserir('%')">%</button>
        <button onclick="inserir('/')">/</button>
        <button onclick="inserir('7')">7</button>
        <button onclick="inserir('8')">8</button>
        <button onclick="inserir('9')">9</button>
        <button onclick="inserir('*')">×</button>
        <button onclick="inserir('4')">4</button>
        <button onclick="inserir('5')">5</button>
        <button onclick="inserir('6')">6</button>
        <button onclick="inserir('-')">−</button>
        <button onclick="inserir('1')">1</button>
        <button onclick="inserir('2')">2</button>
        <button onclick="inserir('3')">3</button>
        <button onclick="inserir('+')">+</button>
        <button class="zero" onclick="inserir('0')">0</button>
        <button onclick="inserir('.')">.</button>
        <button class="igual" onclick="calcular()">=</button>
    </div>
</div>`;
            appJs = `
let display = document.getElementById('display');
let expressao = '';

function inserir(valor) {
    if (expressao === '0' && valor !== '.') expressao = '';
    expressao += valor;
    atualizarDisplay();
}

function limpar() {
    expressao = '';
    atualizarDisplay();
}

function apagar() {
    expressao = expressao.slice(0, -1);
    atualizarDisplay();
}

function calcular() {
    try {
        expressao = eval(expressao).toString();
        atualizarDisplay();
    } catch {
        display.textContent = 'Erro';
        setTimeout(() => { limpar(); }, 1000);
    }
}

function atualizarDisplay() {
    display.textContent = expressao || '0';
}`;
            appCss = `
body { font-family: Arial; background: #1a0f0d; color: #d7ccc8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
.container { background: #2b1b17; padding: 20px; border-radius: 15px; max-width: 350px; width: 100%; border: 2px solid #6f4e37; }
h1 { color: #a67c52; text-align: center; margin-bottom: 20px; }
.display { background: #1a0f0d; padding: 20px; border-radius: 10px; text-align: right; font-size: 32px; margin-bottom: 15px; border: 2px solid #6f4e37; min-height: 70px; }
.buttons { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.buttons button { padding: 15px; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; background: #4e342e; color: #d7ccc8; transition: 0.3s; }
.buttons button:hover { background: #6f4e37; }
.buttons .zero { grid-column: span 2; }
.buttons .igual { background: #6f4e37; color: white; }
.buttons .igual:hover { background: #8d6e63; }`;
        } else if (descricao.includes('relógio') || descricao.includes('relogio') || descricao.includes('hora')) {
            nomeApp = 'relogio';
            appHtml = `
<div class="container">
    <h1>🕐 Relógio Digital</h1>
    <div class="relogio" id="relogio">00:00:00</div>
    <div class="data" id="data"></div>
</div>`;
            appJs = `
function atualizarRelogio() {
    const agora = new Date();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    document.getElementById('relogio').textContent = \`\${horas}:\${minutos}:\${segundos}\`;
    
    const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('data').textContent = data.charAt(0).toUpperCase() + data.slice(1);
}

atualizarRelogio();
setInterval(atualizarRelogio, 1000);`;
            appCss = `
body { font-family: Arial; background: #1a0f0d; color: #d7ccc8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
.container { background: #2b1b17; padding: 40px; border-radius: 15px; text-align: center; border: 2px solid #6f4e37; }
h1 { color: #a67c52; margin-bottom: 20px; }
.relogio { font-size: 72px; font-weight: bold; color: #a67c52; font-family: 'Courier New', monospace; margin: 20px 0; }
.data { color: #6f4e37; font-size: 18px; }`;
        } else {
            nomeApp = `app_${Date.now()}`;
            appHtml = `
<div class="container">
    <h1>☕ ${descricao}</h1>
    <p>App criado pela COFFE IA</p>
    <div class="content">
        <p>✨ Este é um app personalizado para: <strong>${descricao}</strong></p>
        <button onclick="alert('Olá da COFFE IA!')">Clique aqui</button>
    </div>
</div>`;
            appJs = `console.log('🚀 App criado pela COFFE IA!');`;
            appCss = `
body { font-family: Arial; background: #1a0f0d; color: #d7ccc8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
.container { background: #2b1b17; padding: 40px; border-radius: 15px; max-width: 500px; width: 100%; border: 2px solid #6f4e37; text-align: center; }
h1 { color: #a67c52; }
button { background: #6f4e37; color: white; border: none; padding: 10px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px; }
button:hover { background: #8d6e63; }
.content { margin-top: 30px; }`;
        }
        
        const htmlCompleto = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${descricao}</title>
    <style>${appCss}</style>
</head>
<body>
    ${appHtml}
    <script>${appJs}<\/script>
</body>
</html>`;
        
        const filename = `${nomeApp}_${Date.now()}.html`;
        const filepath = `./public/apps/${filename}`;
        await fs.writeFile(filepath, htmlCompleto);
        
        const htmlPuro = htmlCompleto.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return {
            text: `🚀 <strong>APP CRIADO!</strong><br><br>
            📱 <strong>${descricao}</strong><br><br>
            📄 <strong>HTML PURO:</strong><br>
            <div style="background:#1a0f0d;padding:15px;border-radius:8px;border:1px solid #6f4e37;margin:10px 0;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto;color:#d7ccc8;">${htmlPuro}</div>
            🔗 <a href="/apps/${filename}" target="_blank">Abrir App</a>`,
            type: 'text',
            url: `/apps/${filename}`
        };
        
    } catch (error) {
        return { text: `❌ Erro ao criar app: ${error.message}`, type: 'error' };
    }
}

// ============================================
// GAME BOT
// ============================================
async function executarGameBot() {
    await fs.ensureDir('./videos');
    const navegador = await chromium.launch({ headless: false });
    const contexto = await navegador.newContext({
        viewport: { width: 1024, height: 576 },
        recordVideo: { dir: './videos/', size: { width: 1024, height: 576 } }
    });
    const pagina = await contexto.newPage();
    
    try {
        await pagina.goto('https://dino-chrome.com/pt', { waitUntil: 'load' });
        await pagina.waitForTimeout(3000);
        await pagina.click('body');
        await pagina.keyboard.press('Space');
        await pagina.waitForTimeout(1000);
        
        await pagina.evaluate(() => {
            setInterval(() => {
                if (window.Runner && window.Runner.instance_) {
                    const runner = window.Runner.instance_;
                    if (runner.playing) {
                        const tRex = runner.tRex;
                        const obstaculos = runner.horizon.obstacles;
                        if (obstaculos.length > 0) {
                            const primeiro = obstaculos[0];
                            const distancia = runner.currentSpeed * 9;
                            if (primeiro.xPos < distancia) {
                                if (primeiro.yPos && primeiro.yPos < 75) {
                                    if (!tRex.ducking) {
                                        document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 40 }));
                                    }
                                } else if (!tRex.jumping && !tRex.ducking) {
                                    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 38 }));
                                }
                            }
                        }
                    }
                }
            }, 15);
        });
        
        await pagina.waitForTimeout(30000);
        await contexto.close();
        await navegador.close();
        return { text: '🎮 Game Bot finalizado! Vídeo salvo.', type: 'text' };
    } catch (error) {
        await contexto.close();
        await navegador.close();
        return { text: `❌ Erro: ${error.message}`, type: 'error' };
    }
}

// ============================================
// LISTAR VÍDEOS
// ============================================
async function listarVideos() {
    try {
        await fs.ensureDir('./videos');
        const files = await fs.readdir('./videos');
        const videos = files.filter(f => f.endsWith('.webm') || f.endsWith('.mp4'));
        if (videos.length === 0) return { text: '📹 Nenhum vídeo encontrado.', type: 'text' };
        let lista = '📹 <strong>Vídeos:</strong><br><br>';
        videos.forEach(v => { lista += `🎬 <a href="/api/videos/${v}" target="_blank">${v}</a><br>`; });
        return { text: lista, type: 'text' };
    } catch (error) {
        return { text: `❌ Erro: ${error.message}`, type: 'error' };
    }
}

// ========== INICIALIZAR ==========
app.listen(PORT, async () => {
    console.log(`☕ COFFE IA PRO rodando na porta ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
    await fs.ensureDir('./videos');
    await fs.ensureDir('./public/images');
    await fs.ensureDir('./public/sites');
    await fs.ensureDir('./public/apps');
    await fs.ensureDir('./public/uploads');
    console.log('✅ COFFE IA pronta para usar!');
});
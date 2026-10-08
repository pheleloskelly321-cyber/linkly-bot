require('dotenv').config();
// 👈 Modifikasyon 1: Mwen ajoute 'Browsers' nan enpòtasyon Baileys la
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const readline = require('readline');
const http = require('http');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ ERÈ: Ou dwe mete GEMINI_API_KEY kòm yon varyab anviwònman (Environment Variable) sou Render!");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// 👈 Mwen refè TOUT systemInstruction an pou l klè, pwòp, san twòp zetwal, epi ak bèl espas.
const systemInstruction = 
"You are Lito, an AI-powered educational assistant designed specifically for Haitian students.\n\n" +
"Your mission is to help students learn, understand concepts, solve problems, and improve their academic performance in a simple, friendly, and encouraging way.\n\n" +
"=== STRICT FORMATTING AND STYLE RULES ===\n" +
"1. DO NOT INTRODUCE YOURSELF. DO NOT say 'Bonjou, mwen se Lito' or 'Bonjour'. Start answering the student's question IMMEDIATELY. Never repeat your name or a greeting in your messages.\n" +
"2. DO NOT USE ASTERISKS (*), HASHTAGS (#), OR UNDERSCORES (_) FOR BOLD, ITALIC, OR TITLES. Write plain text for a clean, natural look on WhatsApp. Use capital letters for titles if needed.\n" +
"3. MANDATORY SPACING: You MUST add two empty lines (double line break) between every paragraph, every list item, and every section. The text must be very airy and spaced out. Do not write clumpy paragraphs.\n" +
"4. Use LaTeX ($...$) ONLY for mathematical formulas.\n" +
"5. Be clear, direct, and always explain step-by-step when solving problems.\n\n" +
"=== LANGUAGE RULES ===\n" +
"1. When explaining concepts, reading images, or summarizing documents, provide the text or titles in French, but EXPLAIN EVERYTHING IN HAITIAN CREOLE (Kreyòl ayisyen).\n" +
"2. Make the Kreyòl explanations very natural and easy to understand for a high school student.\n\n" +
"=== CORE TEACHING RULES ===\n" +
"1. Always prioritize education and learning.\n" +
"2. Explain concepts clearly and step-by-step.\n" +
"3. Adapt explanations to the student's level.\n" +
"4. Encourage understanding, not memorization.\n" +
"5. Correct mistakes respectfully and explain why.\n" +
"6. Never shame, insult, or discourage a student.\n" +
"7. Avoid guessing when uncertain; explain limitations instead.\n\n" +
"=== CAPABILITIES ===\n" +
"- Mathematics tutoring\n- Physics tutoring\n- Chemistry tutoring\n- Science explanations\n" +
"- French and English assistance\n- Homework help\n- Quiz generation\n- Study planning\n\n" +
"=== MATHEMATICAL & SCIENTIFIC NOTATION (MANDATORY LaTeX) ===\n" +
"1. Always use LaTeX for all mathematical, scientific, geometric, trigonometric, statistical, economic, and physics expressions.\n" +
"2. Never use plain text for formulas when LaTeX exists.\n" +
"3. Use proper LaTeX for fractions, powers, roots, integrals, limits, vectors, geometry, trigonometry, physics, chemistry, probability, statistics, and economics.\n" +
"4. Examples: \\frac{a}{b}, x^2, \\sqrt{x}, \\sum_{i=1}^{n} x_i, \\int_a^b f(x)dx, \\vec{u}, \\angle ABC.\n" +
"5. Physics: F = ma, E = mc^2 must always be in LaTeX format.\n" +
"6. Chemistry equations must use reaction arrows properly.\n\n" +
"=== MATH PROBLEM SOLVING STRUCTURE ===\n" +
"For Mathematics, Physics, and Chemistry problems ALWAYS follow:\n" +
"DONNÉES (Given values)\n\n" +
"CHERCHONS (What we need to find)\n\n" +
"FORMULE\n\n" +
"REMPLACEMENT\n\n" +
"CALCUL (step-by-step)\n\n" +
"RÉSULTAT (final answer with units)\n\n" +
"Never skip steps unless user requests a short solution.\n\n" +
"=== ENSTRIKSYON OBLIGATWA POU BAZ DONE ===\n" +
"1. KONTÈKS BAZ DONE: Mwen mete kèk foto ak nòt (soti nan baz done MyLab elèv la) nan kòmansman konvèsasyon sa a. Si elèv la mande w pou w travay sou 'yon egzèsis li te voye anvan', chèche egzèsis sa a nan foto/nòt sa yo epi travay sou li dirèkteman ak li epi depi li voye profil egzamen pou ou lap ekri sa nan message la konsa 'Men profile examen an', kounya wap gade kisa ki nan profil egzamen an epi ou prale Nan base done an wap pran text ki gen raport ak sa ki nan profil egzamen an chanje anyen nan text lan wap ba li l mo pou mo nan lang ou wèl la en français depi nan kòmansman rive nan fin san manke anyen, epi ankò elev ap voye on foto examen pou ou lap di konsa 'resoudre' kounya ou prale nan base de done an sise yon exercise wap pran exemple ki nan base done an menm formule menm shema pou resoudre exercise lan sise definition se menm bagay lan ou pral nan base done an wap rale definition Eli bal repons lan.";

const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite", 
    systemInstruction: systemInstruction,
});

console.log("System instruction chaje avèk siksè.");

const konvesasyonYo = new Map();

// Varyab sa ap anpeche kòd la mande kòd an bouk si l pran on erè
let isPairingCodeRequested = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesyon_linklybot');
    let phoneNumber = null;

    if (!state.creds.registered) {
        if (process.env.PHONE_NUMBER) {
            phoneNumber = process.env.PHONE_NUMBER.replace(/[^0-9]/g, '');
        } else {
            console.log("❌ Ou dwe mete yon varyab PHONE_NUMBER sou Render!");
            process.exit(1);
        }
    }

    console.log("\n🔄 N ap lanse koneksyon an, tann yon ti moman...");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // 👈 Modifikasyon 2: Itilize defo navigatè Baileys pou evite bloke (Erè 405)
        browser: Browsers.ubuntu('Chrome') 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const rezon = lastDisconnect?.error?.output?.statusCode;
            console.log(`[-] Koneksyon fèmen (Kòd: ${rezon}).`);
            
            // 👈 Modifikasyon 3: Frennen rekoneksyon an si l pran 405 pou l pa spam API WhatsApp la
            if (rezon === 405) {
                console.log("⚠️ WHATSAPP BLOKE DEMANN NAN POU 10-15 MINIT (Erè 405). Bot la ap tann avan l eseye ankò...");
                isPairingCodeRequested = false; // Reset pou l ka mande l ankò
                setTimeout(startBot, 30000); // Tann 30 segonn olye l rekonekte imedyatman
            } else if (rezon !== DisconnectReason.loggedOut) {
                console.log("N ap rekonekte nan 5 segonn...");
                setTimeout(startBot, 5000);
            } else {
                console.log("❌ Ou dekonekte nèt (Logged out).");
            }
        } else if (connection === 'open') {
            console.log("\n✅ BOT LITO KONEKTE SOU WHATSAPP AK SIKSE! 🔥");
            isPairingCodeRequested = false; 
        }
    });

    // 👈 Modifikasyon 4: Fè l mande kòd la yon sèl fwa nan sik la
    if (!sock.authState.creds.registered && phoneNumber && !isPairingCodeRequested) {
        await delay(5000);
        try {
            isPairingCodeRequested = true;
            console.log(`\n🔄 N ap mande WhatsApp kòd pairing lan pou nimewo: ${phoneNumber}...`);
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n========================================`);
            console.log(`🔥 MEN KÒD POU LINK WHATSAPP LA: ${code} 🔥`);
            console.log(`========================================\n`);
            console.log(`(Tcheke kòd sa a nan 'Logs' Render yo pou w konekte Whatsapp ou)\n`);
        } catch (err) {
            console.log("❌ Erè lè n ap mande kòd la:", err.message || err);
            isPairingCodeRequested = false; // Pou l ka re-eseye si l echwe fò
        }
    }

    sock.ev.on('creds.update', saveCreds);

    // ==========================================
    // 3. LÈ YON MESAJ ANTRE (Avèk jere imaj pou analiz)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        if (m.key.remoteJid.endsWith('@g.us')) return;

        let text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
        const from = m.key.remoteJid;

        const isImage = !!m.message.imageMessage;
        const isQuotedImage = !!m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!text.trim() && !isImage && !isQuotedImage) return;

        if (!konvesasyonYo.has(from)) {
            konvesasyonYo.set(from, []);
        }
        const istwaItilizatere = konvesasyonYo.get(from);

        try {
            console.log(`[+] Mesaj resevwa nan men ${from}: ${text.trim() || '[Foto]'}`);

            let imageBuffer = null;
            let mimeType = '';

            if (isImage) {
                imageBuffer = await downloadMediaMessage(m, 'buffer', { }, { reuploadRequest: sock.updateMediaMessage });
                mimeType = m.message.imageMessage.mimetype;
            } else if (isQuotedImage) {
                const quotedMsg = { message: m.message.extendedTextMessage.contextInfo.quotedMessage };
                imageBuffer = await downloadMediaMessage(quotedMsg, 'buffer', { }, { reuploadRequest: sock.updateMediaMessage });
                mimeType = quotedMsg.message.imageMessage.mimetype;
            }

            const patiMesajKounyeA = [];
            
            if (imageBuffer) {
                console.log("[+] N ap analize foto a pou Gemini...");
                patiMesajKounyeA.push({
                    inlineData: {
                        data: imageBuffer.toString("base64"),
                        mimeType: mimeType
                    }
                });
                patiMesajKounyeA.push({ text: text || "Gade foto sa a. Si se yon egzèsis, rezoud li. Si se yon pwofil egzamen, chache nan baz done mwen an selon enstriksyon m yo." });
            } else {
                patiMesajKounyeA.push({ text: text });
            }

            const kontniPoutetGemini = [
                ...istwaItilizatere,
                { role: 'user', parts: patiMesajKounyeA }
            ];

            const result = await model.generateContent({ contents: kontniPoutetGemini });
            let responseText = result.response.text();

            // 👈 Filtre sekirite anplis si jamais AI a ta toujou vle mete zetwal (**) oswa (###) ou byen kòmanse ak Bonjou
            responseText = responseText.replace(/\*/g, ''); // Retire tout zetwal
            responseText = responseText.replace(/#/g, ''); // Retire tout hashtag
            if (responseText.toLowerCase().startsWith("bonjou") || responseText.toLowerCase().startsWith("salut") || responseText.toLowerCase().startsWith("bonjour")) {
                 responseText = responseText.replace(/^(Bonjou|Salut|Bonjour).*?\n/i, '').trim(); // Retire liy salitasyon an
            }


            const patiPouIstwa = imageBuffer
                ? [{ text: `[Imaj ou te bay la] ${text}`.trim() }]
                : patiMesajKounyeA;

            istwaItilizatere.push({ role: 'user', parts: patiPouIstwa });
            istwaItilizatere.push({ role: 'model', parts: [{ text: responseText }] });

            if (istwaItilizatere.length > 20) {
                istwaItilizatere.splice(0, 2);
            }
            
            await sock.sendMessage(from, { text: responseText }, { quoted: m });

        } catch (err) {
            console.log("❌ Erè Gemini:", err);
            await sock.sendMessage(from, { text: "Eskize m, mwen rankontre yon ti pwoblèm teknik pandan m ap eseye trete demand sa. Tanpri, eseye ankò." }, { quoted: m });
        }
    });
}

const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Lito Bot ap travay san pwoblèm sou Render! Sèvis la aktif.');
    res.end();
}).listen(PORT, () => {
    console.log(`🌐 Sèvè HTTP a louvri sou pò ${PORT} pou Render`);
    startBot();
});

setInterval(() => {
    http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode === 200) {
            console.log("✅ Ping otomatik reyisi: Bot la p ap dòmi.");
        }
    }).on('error', (err) => {
        console.error("⚠️ Ti entèripsyon ping:", err.message);
    });
}, 60000);
    

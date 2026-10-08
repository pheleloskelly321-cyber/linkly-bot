require('dotenv').config(); // 👈 Modifikasyon: Retire chemen Termux la pou l ka mache sou Render
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const readline = require('readline');
const http = require('http'); // 👈 Pou Render

// Fonksyon pou poze kesyon nan tèminal la (Si l ta sou òdinatè)
const mandeNimewo = (kesyon) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => rl.question(kesyon, (repons) => {
        rl.close();
        resolve(repons.trim());
    }));
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 1. KONFIGIRASYON GEMINI API AK SYSTEM PROMPT OU AN
// ==========================================
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ ERÈ: Ou dwe mete GEMINI_API_KEY kòm yon varyab anviwònman (Environment Variable) sou Render!");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// NOUVO SYSTEM PROMPT POU LITO
const systemInstruction = 
"You are Lito, an AI-powered educational assistant designed specifically for Haitian students.\n\n" +
"Your mission is to help students learn, understand concepts, solve problems, and improve their academic performance in a simple, friendly, and encouraging way.\n\n" +
"Response Formatting Rules:\n" +
"1. Use LaTeX ($...$) for all mathematical formulas.\n" +
"2. Use Markdown formatting (# titles, **bold text**, *lists*) to structure responses.\n" +
"3. Be clear, direct, and always explain step-by-step when solving problems.\n\n" +
"Core Teaching Rules:\n" +
"1. Always prioritize education and learning.\n" +
"2. Explain concepts clearly and step-by-step.\n" +
"3. Adapt explanations to the student's level.\n" +
"4. Encourage understanding, not memorization.\n" +
"5. Correct mistakes respectfully and explain why.\n" +
"6. Never shame, insult, or discourage a student.\n" +
"7. Avoid guessing when uncertain; explain limitations instead.\n\n" +
"Language Rules:\n" +
"1. Detect the language used by the student.\n" +
"2. Respond in the same language (Creole, French, or English).\n" +
"3. If mixed languages appear, use the dominant one.\n" +
"4. Do not force language changes unless requested.\n\n" +
"Capabilities:\n" +
"- Mathematics tutoring\n- Physics tutoring\n- Chemistry tutoring\n- Science explanations\n" +
"- French and English assistance\n- Homework help\n- Quiz generation\n- Study planning\n\n" +
"Identity Rules:\n" +
"1. Your name is Lito.\n" +
"2. Always identify as Lito when asked.\n" +
"3. Never claim to be another AI model.\n\n" +
"Mathematical & Scientific Notation Rules (MANDATORY LaTeX):\n" +
"1. Always use LaTeX for all mathematical, scientific, geometric, trigonometric, statistical, economic, and physics expressions.\n" +
"2. Never use plain text for formulas when LaTeX exists.\n" +
"3. Use proper LaTeX for fractions, powers, roots, integrals, limits, vectors, geometry, trigonometry, physics, chemistry, probability, statistics, and economics.\n" +
"4. Examples: \\frac{a}{b}, x^2, \\sqrt{x}, \\sum_{i=1}^{n} x_i, \\int_a^b f(x)dx, \\vec{u}, \\angle ABC.\n" +
"5. Physics: F = ma, E = mc^2 must always be in LaTeX format.\n" +
"6. Chemistry equations must use reaction arrows properly.\n\n" +
"Math Problem Solving Structure:\n" +
"For Mathematics, Physics, and Chemistry problems ALWAYS follow:\n" +
"- Données (Given values)\n" +
"- Cherchons (What we need to find)\n" +
"- Formule\n" +
"- Remplacement\n" +
"- Calcul (step-by-step)\n" +
"- Résultat (final answer with units)\n" +
"Never skip steps unless user requests a short solution.\n\n" +
"General Response Style:\n" +
"- Friendly, clear, and educational\n" +
"- Step-by-step reasoning when solving problems\n" +
"- Use examples when helpful\n" +
"- Keep explanations structured and easy to follow\n" + 
"\n\n[ENSTRIKSYON OBLIGATWA POU BAZ DONE AK LATEX]:\n" +
"1. LATEX: W ap toujou reponn fòmil ak kalkil matematik/fizik nan fòma LaTeX ($...$ oswa $$...$$).\n" +
"2. KONTÈKS BAZ DONE: Mwen mete kèk foto ak nòt (soti nan baz done MyLab elèv la) nan kòmansman konvèsasyon sa a. Si elèv la mande w pou w travay sou 'yon egzèsis li te voye anvan', chèche egzèsis sa a nan foto/nòt sa yo epi travay sou li dirèkteman ak li epi depi li voye profil egzamen pou ou lap ekri sa nan message la konsa 'Men profile examen an', kounya wap gade kisa ki nan profil egzamen an epi ou prale Nan base done an wap pran text ki gen raport ak sa ki nan profil egzamen an chanje anyen nan text lan wap ba li l mo pou mo nan lang ou wèl la en français depi nan kòmansman rive nan fin san manke anyen, epi ankò elev ap voye on foto examen pou ou lap di konsa 'resoudre' kounya ou prale nan base de done an sise yon exercise wap pran exemple ki nan base done an menm formule menm shema pou resoudre exercise lan sise definition se menm bagay lan ou pral nan base done an wap rale definition Eli bal repons lan.";

const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite", // 👈 Modèl ki sipòte analiz imaj pi byen
    systemInstruction: systemInstruction,
});

console.log("System instruction pou Lito chaje avèk siksè.");

const konvesasyonYo = new Map();

// ==========================================
// 2. FONKSYON POU KÒMANSE BOT WHATSAPP LA
// ==========================================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesyon_litobot'); // Non sesyon chanje pou lito
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
        browser: ["Mac OS", "Chrome", "120.0.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const rezon = lastDisconnect?.error?.output?.statusCode;
            console.log(`[-] Koneksyon fèmen (Kòd: ${rezon}). N ap rekonekte...`);
            if (rezon !== DisconnectReason.loggedOut) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log("\n✅ BOT LITO AI A KONEKTE SOU WHATSAPP AK SIKSE! 🔥");
        }
    });

    if (!sock.authState.creds.registered && phoneNumber) {
        await delay(4000);
        try {
            console.log(`\n🔄 N ap mande WhatsApp kòd pairing lan pou nimewo: ${phoneNumber}...`);
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n========================================`);
            console.log(`🔥 MEN KÒD POU LINK WHATSAPP LA: ${code} 🔥`);
            console.log(`========================================\n`);
            console.log(`(Tcheke kòd sa a nan 'Logs' Render yo pou w konekte Whatsapp ou)\n`);
        } catch (err) {
            console.log("❌ Erè lè n ap mande kòd la:", err.message || err);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    // ==========================================
    // 3. LÈ YON MESAJ ANTRE
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
                console.log("[+] N ap analize foto a...");
                patiMesajKounyeA.push({
                    inlineData: {
                        data: imageBuffer.toString("base64"),
                        mimeType: mimeType
                    }
                });
                // Chanjman enpòtan: Eksplike Gemini klèman kisa pou l fè ak foto a
                let fotoPrompt = text || "Tanpri analize imaj sa a. Si se yon egzèsis chimi, fizik, oswa matematik, rezoud li etap pa etap selon estrikti (Données, Cherchons, Formule, Remplacement, Calcul, Résultat) jan sa mande nan enstriksyon ou yo. Si se yon pwofil egzamen, chèche enfòmasyon ki gen rapò ak li a nan baz done m yo epi ban mwen l.";
                patiMesajKounyeA.push({ text: fotoPrompt });
            } else {
                patiMesajKounyeA.push({ text: text });
            }

            const kontniPoutetGemini = [
                ...istwaItilizatere,
                { role: 'user', parts: patiMesajKounyeA }
            ];

            const result = await model.generateContent({ contents: kontniPoutetGemini });
            const responseText = result.response.text();

            const patiPouIstwa = imageBuffer
                ? [{ text: `[Mwen te voye yon imaj ba ou] ${text}`.trim() }]
                : patiMesajKounyeA;

            istwaItilizatere.push({ role: 'user', parts: patiPouIstwa });
            istwaItilizatere.push({ role: 'model', parts: [{ text: responseText }] });

            if (istwaItilizatere.length > 20) {
                istwaItilizatere.splice(0, 2);
            }

            await sock.sendMessage(from, { text: responseText }, { quoted: m });

        } catch (err) {
            console.log("❌ Erè Gemini:", err);
            await sock.sendMessage(from, { text: "Eskize m, mwen rankontre yon ti pwoblèm teknik kounye a. Tanpri retounen ekri m nan yon ti moman." }, { quoted: m });
        }
    });
}

// ==========================================
// 4. SÈVÈ HTTP POU ANPECHE RENDER FÈMEN BOT LA
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Lito Bot ap travay san pwoblèm sou Render! Sèvis la aktif.');
    res.end();
}).listen(PORT, () => {
    console.log(`🌐 Sèvè HTTP a louvri sou pò ${PORT} pou Render`);
    startBot();
});

// ==========================================
// 5. FONKSYON POU KENBE BOT LA VIVAN (CHAK 1 MINIT)
// ==========================================
setInterval(() => {
    http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode === 200) {
            console.log("✅ Ping otomatik reyisi: Bot la p ap dòmi.");
        }
    }).on('error', (err) => {
        console.error("⚠️ Ti entèripsyon ping:", err.message);
    });
}, 60000);
        

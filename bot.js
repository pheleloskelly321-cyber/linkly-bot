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

const systemInstruction = `Ou se Linkly AI, asistan entèlijan ofisyèl platfòm Linkly.

Misyon ou se ede itilizatè yo konprann, itilize epi pwofite tout fonksyon Linkly yo fasil.

Ou toujou pale an kreyòl ayisyen, sof si itilizatè a ekri an franse oswa angle. Nan ka sa a, reponn nan menm lang li itilize.

Style ou dwe toujou:
- Zanmitay
- Pwofesyonèl
- Klè
- Kout
- Rapid
- Pozitif
- Natirèl

RÈG POU FÒMA (TRÈ ENPÒTAN):
Evite itilize twòp senbòl. PA SÈVI AK ETWAL (* oswa **) pou w mete tèks an gra. Fè fraz ou yo senp, ekri repons yo pwòp, byen òganize ak espas, epi fasil pou li.

Si yon itilizatè voye yon salitasyon tankou: Bonjou, Bonswa, Bonsoir, Bonjour, Salut, Hello, Hi, Alo...
Reponn yon fason natirèl tankou:
"Bonjou! 👋 Mwen se Linkly AI, asistan entèlijan platfòm Linkly. Mwen la pou ede w ak tout kestyon ou sou Linkly. Kijan mwen ka ede w jodi a?"
oswa
"Bonswa! 👋 Mwen se Linkly AI. M ap ede w dekouvri tout sa Linkly ka fè pou ou. Ki kestyon ou genyen?"
Pa janm di sèlman "Bonjou". Toujou prezante tèt ou kòm Linkly AI.

Kisa Linkly ye?
Linkly se yon platfòm Link-in-Bio Premium. Li pèmèt itilizatè yo: Kreye yon paj piblik, Mete tout rezo sosyal yo, Mete bouton WhatsApp, Vann pwodwi, Ofri sèvis, Pataje yon sèl lyen, Swiv vizit ak klik, Resevwa kliyan fasil, Devlope biznis yo sou entènèt.

Fonksyon ou:
Ou dwe ede itilizatè yo kreye kont, konekte, reyajiste modpas, chanje username, mete foto pwofil, mete cover, kreye pwodwi/sèvis, jere paj piblik yo, konprann Analytics, chwazi plan, fè peman, upload prèv peman, konprann SEO, ak rezoud pwoblèm teknik senp.

Plan yo:
- Free: 5 lyen, 3 pwodwi, Paj piblik estanda, Tèm debaz.
- Pro (500 HTG pa mwa): Lyen san limit, 30 pwodwi, Analytics, Tèm Premium, Badge Premium.
- Business (1000 HTG pa mwa): Pwodwi san limit, Lyen san limit, Analytics avanse, Tout tèm Premium, Sipò priyoritè, Badge Premium.

Peman:
MonCash: +509 37 57 7509
NatCash: +509 35 86 26 88
Apre peman: 1. Chwazi plan 2. Upload prèv peman 3. Antre ID tranzaksyon 4. Soumèt demann lan. Administratè a ap verifye peman an.

SEO: Linkly optimize Google Search, Open Graph, WhatsApp/Facebook/X/Telegram Preview, Sitemap.xml, robots.txt, Meta Tags, elatriye.

Repons prepare:
- "Kisa Linkly ye?" -> "Linkly se yon platfòm Link-in-Bio Premium ki ede w kreye yon paj pwofesyonèl pou mete tout lyen ou yo, vann pwodwi, ofri sèvis epi resevwa kliyan sou WhatsApp ak yon sèl lyen."
- "Poukisa mwen bezwen Linkly?" -> "Paske Linkly fè bio ou tounen yon zouti pou devlope biznis ou. Olye ou mete yon sèl lyen ki pa fè anpil bagay, Linkly pèmèt ou montre pwodwi, sèvis, tout rezo sosyal ou epi resevwa kliyan dirèkteman sou WhatsApp."

Règ enpòtan:
- Pa janm envante enfòmasyon.
- Si ou pa sèten, di itilizatè a kontakte sipò Linkly.
- Bay etap pa etap lè itilizatè a mande èd.
- Pa bay repons ki twò long si yo pa mande detay.
- Lè sa apwopriye, sijere plan ki pi adapte san fòse.

Objektif prensipal ou se ede chak itilizatè konprann Linkly fasil, itilize tout fonksyon yo san difikilte epi jwenn plis valè nan platfòm la.

Lè kliyan mandew pou fèl pale ak yon ajan wap voye Numero sa pou li +509 35 86 26 88 sil ta poze w on kesyon ou paka fèl se Sèl on ajan ki kal wa ba li numero dil kontak ajan an.`;

const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: systemInstruction,
});

console.log("System instruction chaje avèk siksè.");

const konvesasyonYo = new Map();

// ==========================================
// 2. FONKSYON POU KÒMANSE BOT WHATSAPP LA
// ==========================================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesyon_linklybot');
    let phoneNumber = null;

    if (!state.creds.registered) {
        // Pou Render ap pran PHONE_NUMBER nan Environment Variables li
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
            console.log("\n✅ BOT LINKLY AI A KONEKTE SOU WHATSAPP AK SIKSE! 🔥");
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
                patiMesajKounyeA.push({ text: text || "Gade foto sa epi di m si se yon prèv peman oswa kijan m ka ede w selon enstriksyon m yo." });
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
            await sock.sendMessage(from, { text: "Eskize m, mwen rankontre yon ti pwoblèm teknik kounye a. Tanpri retounen ekri m nan yon ti moman, oswa kontakte yon ajan dirèkteman nan +509 35 86 26 88." }, { quoted: m });
        }
    });
}

// ==========================================
// 4. SÈVÈ HTTP POU ANPECHE RENDER FÈMEN BOT LA
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Linkly Bot ap travay san pwoblèm sou Render! Sèvis la aktif.');
    res.end();
}).listen(PORT, () => {
    console.log(`🌐 Sèvè HTTP a louvri sou pò ${PORT} pou Render`);
    // Lè sèvè HTTP a louvri, lanse bot WhatsApp la
    startBot();
});
